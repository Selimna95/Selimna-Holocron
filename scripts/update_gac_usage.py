#!/usr/bin/env python3
"""Build the Holocron GAC usage database from public SWGOH.GG tier lists.

Counts are observations from first-attempt, full-squad GAC battles. Missing
units are not assigned zero: only units present in a successfully parsed view
are written. A failed/partial refresh never replaces the last good snapshot.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
JSON_OUTPUT = ROOT / "gac-usage.json"
JS_OUTPUT = ROOT / "gac-usage.js"
BROWSER_EXPORT = ROOT / "gac-browser-export.json"
BASE = "https://swgoh.gg/tier-list/units/"
FLEET_BASE = "https://swgoh.gg/tier-list/fleet/"
LEAGUES = ("kyber", "aurodium", "chromium", "bronzium", "carbonite")
SIDES = ("offense", "defense")
FORMATS = ("5v5", "3v3")
USER_AGENT = "SelimnasHolocron-GAC-Usage/1.0 (+https://github.com/Selimna95/Selimna-Holocron)"
MIN_UNITS_PER_VIEW = 8
# Current SWGOH.GG tier-list snapshot seasons. Update at each game-season rollover
# if Reader omits the season label from its text projection.
FALLBACK_SEASONS = {"5v5": 84, "3v3": 83, "fleet": 84}

def number_value(value: str) -> int:
    value = value.strip().replace(",", "").replace(" ", "")
    match = re.fullmatch(r"(\d+(?:\.\d+)?)([KMB]?)", value, re.I)
    if not match:
        raise ValueError(f"Invalid battle count: {value!r}")
    return round(float(match.group(1)) * {"": 1, "K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[match.group(2).upper()])

def fetch(url: str) -> str:
    request = Request("https://r.jina.ai/" + url, headers={
        "User-Agent": USER_AGENT, "Accept": "text/plain",
        "X-Return-Format": "markdown",
    })
    last_error = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=45) as response:
                if response.status != 200:
                    raise ValueError(f"Reader HTTP {response.status}")
                body = response.read().decode("utf-8", errors="replace")
                lowered = body[:12000].lower()
                if (not body.strip() or "target url returned error 403" in lowered
                        or "attention required! | cloudflare" in lowered
                        or "sorry, you have been blocked" in lowered
                        or "just a moment..." in lowered):
                    raise RuntimeError(f"SWGOH.GG/Reader returned a block or challenge page for {url}")
                if len(body) < 500:
                    raise RuntimeError(f"Reader response is unexpectedly short ({len(body)} chars) for {url}")
                return body
        except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError) as exc:
            last_error = exc
            if isinstance(exc, HTTPError) and exc.code in (401, 403):
                break
            if attempt < 3:
                delay = 2 ** attempt
                print(f"Fetch attempt {attempt + 1}/4 failed for {url}: {exc}; retrying in {delay}s")
                time.sleep(delay)
    raise RuntimeError(f"Cannot fetch {url}: {last_error}")

def page_season(text: str, fmt: str | None = None) -> int:
    match = re.search(r"Season\s+(\d+)", text, re.I)
    if not match and fmt in ("5v5", "3v3"):
        token = "5s" if fmt == "5v5" else "3s"
        match = re.search(rf"{token}\s*\(S(\d+)\)", text, re.I)
    if match:
        return int(match.group(1))
    if fmt in FALLBACK_SEASONS:
        print(f"Source omitted season label; using configured {fmt} S{FALLBACK_SEASONS[fmt]}")
        return FALLBACK_SEASONS[fmt]
    if fmt is None:
        print(f"Source omitted fleet season label; using configured S{FALLBACK_SEASONS['fleet']}")
        return FALLBACK_SEASONS["fleet"]
    raise ValueError("Season number absent from source page")

def clean_name(raw: str) -> str:
    name = re.sub(r"^\s*#?\d+\s*(?:[▲▼—]\s*\d+|NEW)?\s*", "", raw).strip()
    # Tier movement badges (A→S, S→A, B→A, etc.) are not part of unit names.
    name = re.sub(r"^[SABCD]\s*→\s*[SABCD]\s+", "", name, flags=re.I).strip()
    name = re.sub(r"\s+(?:Datacron dependent|NEW)$", "", name, flags=re.I).strip()
    return name

UNIT_ROW = re.compile(
    r"(?P<name>.+?)\s+(?P<fmt>[35]s)\s+(?P<side>Offense|Defense)"
    r"\s+\d+\s+Rating\s+(?P<battles>[\d,.]+\s*[KMB]?)\s+battles",
    re.I,
)

def parse_unit_page(text: str, fmt: str, side: str) -> dict[str, dict]:
    rows = {}
    section = "unknown"
    for line in text.splitlines():
        stripped = line.strip()
        if re.search(r"^#{1,4}\s*Leaders\b", stripped, re.I):
            section = "leader"
        elif re.search(r"^#{1,4}\s*Members\b", stripped, re.I):
            section = "member"
        match = UNIT_ROW.search(stripped)
        if not match:
            continue
        if match.group("fmt").lower() != ("5s" if fmt == "5v5" else "3s"):
            continue
        if match.group("side").lower() != side:
            continue
        name = clean_name(match.group("name"))
        # Some Reader projections put rank arrows before the name.
        name = re.sub(r"^\d+\s*(?:▲\s*\d+|▼\s*\d+|—|NEW)?\s*", "", name).strip()
        if not name or name.lower() in {"leaders", "members"}:
            continue
        battles = number_value(match.group("battles"))
        item = rows.setdefault(name, {"uses": 0, "byFormat": {}, "bySide": {}, "roles": {}})
        item["uses"] += battles
        item["byFormat"][fmt] = item["byFormat"].get(fmt, 0) + battles
        item["bySide"][side] = item["bySide"].get(side, 0) + battles
        if section != "unknown":
            item["roles"][section] = item["roles"].get(section, 0) + battles
    return rows

def merge_counts(target: dict, incoming: dict) -> None:
    for name, record in incoming.items():
        current = target.setdefault(name, {"uses": 0, "byFormat": {}, "bySide": {}, "roles": {}})
        current["uses"] += record["uses"]
        for field in ("byFormat", "bySide", "roles"):
            for key, count in record[field].items():
                current[field][key] = current[field].get(key, 0) + count

def parse_fleet_page(text: str, side: str) -> list[dict]:
    """Read ship names grouped around each ranked fleet's battle-count line."""
    pending = []
    pending_battles = None
    fleets = []
    for line in text.splitlines():
        for name in re.findall(r"(?:Image:\s*|!\[(?:Image:\s*)?)([^\]\n]+)", line):
            name = name.strip()
            if name and name not in pending:
                pending.append(name)
        stats = re.search(r"Battles\s+([\d,.]+\s*[KMB]?)", line, re.I)
        if stats:
            pending_battles = number_value(stats.group(1))
        rank = re.search(r"#\s*(\d+)", line)
        if rank and pending_battles is not None and 3 <= len(pending) <= 8:
            fleets.append({
                "rank": int(rank.group(1)), "side": side,
                "uses": pending_battles, "ships": pending[:],
            })
            pending = []
            pending_battles = None
    return fleets


def build_from_browser_export() -> dict:
    """Normalize a browser-session export collected on SWGOH.GG itself."""
    raw = json.loads(BROWSER_EXPORT.read_text(encoding="utf-8"))
    if raw.get("schemaVersion") != 1 or raw.get("source") != "SWGOH.GG browser session":
        raise ValueError("Unsupported browser export schema/source")
    views = raw.get("views")
    fleet_views = raw.get("fleetViews")
    if not isinstance(views, list) or not isinstance(fleet_views, list):
        raise ValueError("Browser export must contain views and fleetViews arrays")
    expected = {(fmt, side, league) for fmt in FORMATS for side in SIDES for league in LEAGUES}
    seen = set()
    season_by_format: dict[str, int] = {}
    seasons: dict[int, dict] = {}
    coverage = []
    for view in views:
        fmt, side, league = view.get("format"), view.get("side"), view.get("league")
        key = (fmt, side, league)
        if key not in expected or key in seen:
            raise ValueError(f"Unexpected or duplicate character view: {key}")
        seen.add(key)
        rows = view.get("rows")
        if not isinstance(rows, list) or len(rows) < MIN_UNITS_PER_VIEW:
            raise ValueError(f"Incomplete character view {key}: fewer than {MIN_UNITS_PER_VIEW} rows")
        season = int(view.get("season") or 0)
        if season <= 0:
            raise ValueError(f"Invalid season for {key}")
        previous_season = season_by_format.setdefault(fmt, season)
        if previous_season != season:
            raise ValueError(f"Inconsistent {fmt} seasons in browser export: {previous_season} and {season}")
        record = seasons.setdefault(season, {
            "season": season, "characters": {}, "ships": {},
            "fleets": [], "coverage": [],
        })
        for row in rows:
            name = str(row.get("name") or "").strip()
            battles = int(row.get("battles") or 0)
            if not name or battles <= 0:
                raise ValueError(f"Invalid character row in {key}: {row!r}")
            role = row.get("role") if row.get("role") in ("leader", "member") else "unknown"
            incoming = {
                "uses": battles,
                "byFormat": {fmt: battles},
                "bySide": {side: battles},
                "roles": ({role: battles} if role != "unknown" else {}),
            }
            merge_counts(record["characters"], {name: incoming})
        record["coverage"].append({
            "format": fmt, "side": side, "league": league,
            "units": len(rows), "source": view.get("url", ""),
        })
        coverage.append({
            "season": season, "format": fmt, "side": side,
            "league": league, "units": len(rows),
        })
    if seen != expected:
        missing = sorted(expected - seen)
        raise ValueError(f"Browser export is missing {len(missing)} character views: {missing}")
    expected_fleets = {(side, league) for side in SIDES for league in LEAGUES}
    seen_fleets = set()
    fleet_seasons = set()
    for view in fleet_views:
        side, league = view.get("side"), view.get("league")
        key = (side, league)
        if key not in expected_fleets or key in seen_fleets:
            raise ValueError(f"Unexpected or duplicate fleet view: {key}")
        seen_fleets.add(key)
        season = int(view.get("season") or 0)
        if season <= 0:
            raise ValueError(f"Invalid fleet season for {key}")
        fleet_seasons.add(season)
        if len(fleet_seasons) > 1:
            raise ValueError(f"Inconsistent fleet seasons in browser export: {sorted(fleet_seasons)}")
        record = seasons.setdefault(season, {
            "season": season, "characters": {}, "ships": {},
            "fleets": [], "coverage": [],
        })
        for fleet in view.get("fleets", []):
            ships = list(dict.fromkeys(str(ship).strip() for ship in fleet.get("ships", []) if str(ship).strip()))
            battles = int(fleet.get("battles") or 0)
            if not (3 <= len(ships) <= 8) or battles <= 0:
                raise ValueError(f"Invalid fleet composition in {key}: {fleet!r}")
            normalized = {
                "rank": int(fleet.get("rank") or 0), "side": side,
                "uses": battles, "ships": ships, "league": league,
                "source": view.get("url", ""),
            }
            record["fleets"].append(normalized)
            for ship in ships:
                item = record["ships"].setdefault(ship, {"uses": 0, "bySide": {}})
                item["uses"] += battles
                item["bySide"][side] = item["bySide"].get(side, 0) + battles
        record["coverage"].append({
            "format": "fleet", "side": side, "league": league,
            "fleets": len(view.get("fleets", [])), "source": view.get("url", ""),
        })
    if seen_fleets != expected_fleets:
        raise ValueError(f"Browser export is missing {len(expected_fleets - seen_fleets)} fleet views")
    if not seasons or not any(item["characters"] for item in seasons.values()):
        raise ValueError("Browser export contains no character observations")
    return {
        "schemaVersion": 1,
        "source": "SWGOH.GG browser session",
        "method": "First-attempt full-squad battles aggregated from 20 browser-collected views (format, side, league). Fleet ship uses are positive observations from published top fleet compositions only; absent units/ships remain unknown.",
        "updatedAt": raw.get("collectedAt") or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "currentSeasons": {**season_by_format, **({"fleet": next(iter(fleet_seasons))} if fleet_seasons else {})},
        "coverage": coverage,
        "seasons": sorted(seasons.values(), key=lambda item: item["season"], reverse=True),
    }

def build_live() -> dict:
    seasons: dict[int, dict] = {}
    coverage = []
    for fmt in FORMATS:
        for side in SIDES:
            for league in LEAGUES:
                url = BASE + "?" + urlencode({"fmt": fmt, "side": side, "league": league})
                text = fetch(url)
                season = page_season(text, fmt)
                units = parse_unit_page(text, fmt, side)
                if len(units) < MIN_UNITS_PER_VIEW:
                    raise ValueError(f"{fmt}/{side}/{league}/S{season}: only {len(units)} units parsed; source excerpt={text[:1800]!r}")
                record = seasons.setdefault(season, {
                    "season": season, "characters": {}, "ships": {},
                    "fleets": [], "coverage": [],
                })
                merge_counts(record["characters"], units)
                record["coverage"].append({
                    "format": fmt, "side": side, "league": league,
                    "units": len(units), "source": url,
                })
                coverage.append({"season": season, "format": fmt, "side": side, "league": league, "units": len(units)})
                print(f"Units {fmt} {side} {league} S{season}: {len(units)}")

    # Fleet tier lists are not a complete ship census. Only positively observed
    # ship appearances are recorded; unlisted ships remain unknown, never zero.
    for side in SIDES:
        for league in LEAGUES:
            url = FLEET_BASE + "?" + urlencode({"side": side, "league": league})
            text = fetch(url)
            season = page_season(text)
            fleets = parse_fleet_page(text, side)
            if not fleets:
                print(f"Fleet {side} {league} S{season}: no compositions parsed (coverage marked unavailable)")
                continue
            record = seasons.setdefault(season, {
                "season": season, "characters": {}, "ships": {},
                "fleets": [], "coverage": [],
            })
            for fleet in fleets:
                record["fleets"].append({**fleet, "league": league, "source": url})
                for ship in fleet["ships"]:
                    ship_record = record["ships"].setdefault(ship, {"uses": 0, "bySide": {}})
                    ship_record["uses"] += fleet["uses"]
                    ship_record["bySide"][side] = ship_record["bySide"].get(side, 0) + fleet["uses"]
            record["coverage"].append({"format": "fleet", "side": side, "league": league, "fleets": len(fleets), "source": url})
            print(f"Fleets {side} {league} S{season}: {len(fleets)} compositions")

    if not seasons or not any(s["characters"] for s in seasons.values()):
        raise ValueError("No character usage data collected; refusing to publish")
    result = {
        "schemaVersion": 1,
        "source": "SWGOH.GG public GAC tier lists via Jina Reader",
        "method": "First-attempt full-squad battle counts aggregated by character across format, side and league; fleet ship appearances counted only when observed in published fleet compositions.",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage": coverage,
        "seasons": sorted(seasons.values(), key=lambda item: item["season"], reverse=True),
    }
    result["sourceStatus"] = "observed"
    result["evidenceType"] = "unit-usage"
    result["currentSeasons"] = {
        fmt: max((int(item["season"]) for item in result["seasons"]
                  if any(c.get("format") == fmt for c in item.get("coverage", []))), default=0)
        for fmt in FORMATS
    }
    return result


FRESHNESS_DAYS = 35


def snapshot_age_days(data: dict) -> float | None:
    raw = data.get("updatedAt")
    if not raw:
        return None
    try:
        stamp = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - stamp.astimezone(timezone.utc)).total_seconds() / 86400)
    except (TypeError, ValueError):
        return None


def has_usage_records(data: dict) -> bool:
    return isinstance(data.get("seasons"), list) and any(
        isinstance(season, dict) and isinstance(season.get("characters"), dict)
        and bool(season["characters"])
        for season in data["seasons"]
    )


def build() -> dict:
    """Prefer a fresh live scrape; fall back to a browser export, then last-good data."""
    live_error = None
    try:
        result = build_live()
        result["fallbackReason"] = None
        return result
    except Exception as exc:
        live_error = str(exc)
        print(f"Live SWGOH.GG collection unavailable: {live_error}")

    if BROWSER_EXPORT.exists():
        print(f"Using browser-collected SWGOH.GG export: {BROWSER_EXPORT.name}")
        result = build_from_browser_export()
        age = snapshot_age_days(result)
        result["sourceStatus"] = "stale" if age is None or age > FRESHNESS_DAYS else "observed"
        result["evidenceType"] = "unit-usage"
        result["fallbackReason"] = live_error
        if result["sourceStatus"] == "stale":
            print(f"Browser export is older than {FRESHNESS_DAYS} days or has no valid timestamp; observations will not be used for donor priority.")
        return result

    if JSON_OUTPUT.exists():
        try:
            previous = json.loads(JSON_OUTPUT.read_text(encoding="utf-8"))
            if has_usage_records(previous):
                age = snapshot_age_days(previous)
                previous["sourceStatus"] = "stale" if age is None or age > FRESHNESS_DAYS else previous.get("sourceStatus", "observed")
                previous["lastRefreshError"] = live_error
                print(f"Keeping last-known-good GAC snapshot ({previous.get('updatedAt')}); status={previous['sourceStatus']}.")
                return previous
        except (OSError, json.JSONDecodeError):
            pass

    raise RuntimeError(
        "No usable GAC usage snapshot. Live SWGOH.GG collection failed and no valid browser export or previous snapshot exists. "
        f"Last source error: {live_error}"
    )


def main():
    try:
        data = build()
    except RuntimeError as exc:
        print(f"::warning::{exc}")
        print("No files were changed; the empty or last-known-good database was preserved.")
        return
    json_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    public_fields = ("schemaVersion", "source", "sourceStatus", "evidenceType", "updatedAt",
                     "currentSeasons", "coverage", "seasons", "fallbackReason", "lastRefreshError")
    public_data = {key: data[key] for key in public_fields if key in data}
    js_text = "/* Generated by scripts/update_gac_usage.py. Do not edit manually. */\nwindow.__SWGOH_GAC_USAGE__ = " + json.dumps(public_data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    JSON_OUTPUT.write_text(json_text, encoding="utf-8")
    JS_OUTPUT.write_text(js_text, encoding="utf-8")
    total_chars = sum(len(s["characters"]) for s in data["seasons"])
    total_ships = sum(len(s["ships"]) for s in data["seasons"])
    print(f"Published {len(data['seasons'])} seasons · {total_chars} character records · {total_ships} observed ship records · status={data.get('sourceStatus','unknown')}")


if __name__ == "__main__":
    main()
