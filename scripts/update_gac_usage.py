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
JS_OUTPUT = ROOT / "gac-usage.js"\nBROWSER_EXPORT = ROOT / "gac-browser-export.json"
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
                    raise ValueError(f"HTTP {response.status}")
                return response.read().decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 ** attempt)
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

def build() -> dict:
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
    return result

def main():
    data = build()
    json_text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    js_text = "/* Generated by scripts/update_gac_usage.py. Do not edit manually. */\nwindow.__SWGOH_GAC_USAGE__ = " + json.dumps({"seasons": data["seasons"]}, ensure_ascii=False, separators=(",", ":")) + ";\n"
    JSON_OUTPUT.write_text(json_text, encoding="utf-8")
    JS_OUTPUT.write_text(js_text, encoding="utf-8")
    total_chars = sum(len(s["characters"]) for s in data["seasons"])
    total_ships = sum(len(s["ships"]) for s in data["seasons"])
    print(f"Published {len(data['seasons'])} seasons · {total_chars} character records · {total_ships} observed ship records")

if __name__ == "__main__":
    main()
