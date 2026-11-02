#!/usr/bin/env python3
"""Build a public GAC counter snapshot from SWGOH.GG.

Counter pages are keyed by defensive leader. Each counter row is an attacking
squad with its own first-attempt win rate, battle count and average banners.
The page does not identify the exact opposing lineup, so the exported schema
keeps the scope explicit: leader-level matchup statistics.
"""
from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse

from scripts.update_gac_catalog import TreeParser, fetch, number_value

ROOT = Path(__file__).resolve().parents[1]
DEFENSE_CATALOG = ROOT / "blue-gac" / "gac-catalog.json"
OUTPUT = ROOT / "blue-gac" / "gac-counters.json"
INDEX_URL = "https://swgoh.gg/gac/counters/"
FORMATS = {"5v5": 5, "3v3": 3}
MIN_COUNTER_ROWS = 1
MAX_WORKERS = 5


def node_text(node) -> str:
    return re.sub(r"\s+", " ", node.text()).strip()


def normalized(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def season_pages(html: str) -> dict[str, list[dict]]:
    """Find the real season selectors exposed by SWGOH.GG; do not guess IDs."""
    parser = TreeParser()
    parser.feed(html)
    found = {"5v5": {}, "3v3": {}}
    for node in parser.root.walk():
        href = node.attrs.get("href", "").strip()
        value = node.attrs.get("value", "").strip()
        target = href or value
        label = node_text(node)
        season_match = re.search(r"season\s*(\d+)", label, re.I)
        if not season_match:
            season_match = re.search(r"SEASON_(\d+)", target, re.I)
        if not season_match:
            continue
        season = int(season_match.group(1))
        fmt_match = re.search(r"(5v5|3v3)", label, re.I)
        fmt = fmt_match.group(1) if fmt_match else ("5v5" if season % 2 == 0 else "3v3")

        if "/gac/counters/season/" in target:
            season_url = urljoin(INDEX_URL, target)
        else:
            season_id = re.search(r"(CHAMPIONSHIPS_[A-Z0-9_]*SEASON_\d+)", target, re.I)
            if not season_id:
                continue
            season_url = urljoin(INDEX_URL, "season/" + season_id.group(1) + "/")
        found[fmt][season] = {"season": season, "url": season_url}

    # Some Reader projections strip the select/anchor attributes but retain the
    # season IDs in the page payload. Recover only IDs actually present in source.
    for season_id in set(re.findall(r"(CHAMPIONSHIPS_[A-Z0-9_]*SEASON_\d+)", html, re.I)):
        match = re.search(r"SEASON_(\d+)", season_id, re.I)
        if not match:
            continue
        season = int(match.group(1))
        fmt = "5v5" if season % 2 == 0 else "3v3"
        found[fmt].setdefault(season, {
            "season": season,
            "url": urljoin(INDEX_URL, "season/" + season_id + "/"),
        })
    return {fmt: sorted(rows.values(), key=lambda x: x["season"], reverse=True) for fmt, rows in found.items()}


def leader_links(html: str, page_url: str) -> list[dict]:
    parser = TreeParser()
    parser.feed(html)
    result, seen = [], set()
    for node in parser.root.walk():
        href = node.attrs.get("href", "")
        parsed = urlparse(href)
        match = re.match(r"^/gac/counters/([^/]+)/?$", parsed.path)
        if not match:
            continue
        slug = match.group(1)
        if slug.lower() in {"season", "ship-counters"}:
            continue
        query = parse_qs(parsed.query)
        season_id = (query.get("season_id") or [""])[0]
        if not season_id:
            continue
        label = node_text(node) or node.attrs.get("aria-label", "") or node.attrs.get("title", "")
        label = re.sub(r"^Image:\s*", "", label, flags=re.I).strip()
        label = re.sub(r"\s*counters?\s*$", "", label, flags=re.I).strip()
        if not label:
            label = slug
        url = urljoin(page_url, href)
        key = (slug.lower(), season_id)
        if key not in seen:
            seen.add(key)
            result.append({"slug": slug, "name": label, "url": url, "season_id": season_id})
    return result


def next_page_url(html: str, page_url: str) -> str | None:
    parser = TreeParser()
    parser.feed(html)
    for node in parser.root.walk():
        if node.tag != "a":
            continue
        label = (node_text(node) + " " + node.attrs.get("aria-label", "")).lower()
        if "next" in label or "suivant" in label:
            href = node.attrs.get("href", "")
            if href:
                return urljoin(page_url, href)
    return None


def is_character_image(node) -> bool:
    if node.tag != "img":
        return False
    alt = node.attrs.get("alt", "").strip()
    src = node.attrs.get("src", "") + " " + node.attrs.get("data-src", "")
    return bool(alt) and (alt.startswith("Image:") or "game-assets.swgoh.gg" in src)


def image_name(node) -> str:
    name = node.attrs.get("alt", "").strip()
    return re.sub(r"^Image:\s*", "", name, flags=re.I).strip()


def parse_counter_page(html: str, fmt: str, leader: dict, season: int) -> list[dict]:
    """Extract attacker compositions and their own matchup metrics."""
    parser = TreeParser()
    parser.feed(html)
    size = FORMATS[fmt]
    rows, seen_signatures = [], set()
    for image in (n for n in parser.root.walk() if is_character_image(n)):
        candidate = image.parent
        chosen = None
        for _ in range(14):
            if candidate is None:
                break
            images = [n for n in candidate.walk() if is_character_image(n)]
            text = node_text(candidate)
            if (len(images) == size and re.search(r"\bSeen\s+[\d,.]+\s*[KMB]?", text, re.I)
                    and re.search(r"\bWin\s*%\s*[\d.,]+\s*%", text, re.I)):
                chosen = (images, text)
                break
            candidate = candidate.parent
        if not chosen:
            continue
        images, text = chosen
        members = [image_name(n) for n in images]
        if len(members) != size or not all(members):
            continue
        signature = tuple(normalized(x) for x in members)
        if signature in seen_signatures:
            continue
        seen = re.search(r"\bSeen\s+([\d,.]+\s*[KMB]?)", text, re.I)
        win = re.search(r"\bWin\s*%\s*([\d.,]+)\s*%", text, re.I)
        avg = re.search(r"\bAvg(?:\s+Banners?)?\s+([\d.,]+)", text, re.I)
        if not (seen and win):
            continue
        try:
            battles = number_value(seen.group(1))
            win_rate = float(win.group(1).replace(",", "."))
            banners = float(avg.group(1).replace(",", ".")) if avg else None
        except (ValueError, TypeError):
            continue
        if battles <= 0 or not 0 <= win_rate <= 100 or (banners is not None and not 0 <= banners <= 100):
            continue
        seen_signatures.add(signature)
        rows.append({
            "format": fmt,
            "season": season,
            "defenseLeader": leader["name"],
            "defenseLeaderSlug": leader["slug"],
            "attackMembers": members,
            "battles": battles,
            "winRate": win_rate,
            "averageBanners": banners,
            "source": leader["url"],
            "scope": "leader",
        })
    rows.sort(key=lambda row: (-row["battles"], -row["winRate"], -(row["averageBanners"] or 0)))
    return rows


def scrape_leader(item: tuple[str, int, dict]) -> tuple[str, int, dict, list[dict], str | None]:
    fmt, season, leader = item
    try:
        page_url = leader["url"]
        visited, rows, signatures = set(), [], set()
        while page_url and page_url not in visited:
            visited.add(page_url)
            html = fetch(page_url)
            for row in parse_counter_page(html, fmt, leader, season):
                signature = tuple(normalized(x) for x in row["attackMembers"])
                if signature not in signatures:
                    signatures.add(signature)
                    rows.append(row)
            page_url = next_page_url(html, page_url)
        if len(rows) < MIN_COUNTER_ROWS:
            return fmt, season, leader, [], f"{leader['name']}: no counter rows parsed"
        return fmt, season, leader, rows, None
    except Exception as exc:  # keep individual upstream failures from erasing valid rows
        return fmt, season, leader, [], f"{leader['name']}: {exc}"


def refresh() -> dict:
    if not DEFENSE_CATALOG.exists():
        raise RuntimeError("The defensive catalogue is missing; cannot scope counter collection.")
    defense = json.loads(DEFENSE_CATALOG.read_text(encoding="utf-8"))
    if not isinstance(defense.get("teams"), list):
        raise RuntimeError("The defensive catalogue has no teams array.")

    index_html = fetch(INDEX_URL)
    available = season_pages(index_html)
    if not any(available.values()):
        print("Counter index HTML preview (first 5000 chars):")
        print(index_html[:5000])
        print("Counter index season ID candidates:", sorted(set(re.findall(r"CHAMPIONSHIPS_[A-Z0-9_]*SEASON_\d+", index_html, re.I))))
    selected = {fmt: rows[:2] for fmt, rows in available.items()}
    for fmt in FORMATS:
        if not selected[fmt]:
            raise RuntimeError(f"No public {fmt} counter season was found.")

    tasks, season_meta = [], {}
    for fmt, seasons in selected.items():
        season_meta[fmt] = [item["season"] for item in seasons]
        for season_info in seasons:
            season, season_url = season_info["season"], season_info["url"]
            html = fetch(season_url)
            links = leader_links(html, season_url)
            # Follow all public pages of leader links; the site exposes the real
            # season_id in each URL and may paginate the leader index.
            page_url = next_page_url(html, season_url)
            visited = {season_url}
            while page_url and page_url not in visited:
                visited.add(page_url)
                page_html = fetch(page_url)
                links.extend(leader_links(page_html, page_url))
                page_url = next_page_url(page_html, page_url)
            unique = {}
            for link in links:
                unique[(link["slug"].lower(), link["season_id"])] = link
            # Only collect counters for leaders actually present in the defensive
            # catalogue, so the attack planner can always map a counter to a
            # selectable enemy defense. Fall back to all leaders if names cannot
            # be reconciled, rather than silently publishing an empty snapshot.
            wanted = {
                normalized(team["members"][0])
                for team in defense["teams"]
                if team.get("format") == fmt and int(team.get("season", 0)) == season
                and isinstance(team.get("members"), list) and team["members"]
            }
            matching = [link for link in unique.values()
                        if normalized(link["name"]) in wanted]
            chosen = matching or list(unique.values())
            tasks.extend((fmt, season, link) for link in chosen)

    results, errors, requested = [], [], len(tasks)
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(scrape_leader, task) for task in tasks]
        for future in as_completed(futures):
            fmt, season, leader, rows, error = future.result()
            if rows:
                results.extend(rows)
            if error:
                errors.append(error)

    if not results:
        raise RuntimeError("No counter rows were parsed; preserving the previous snapshot.")
    coverage = {
        fmt: {
            str(season): {
                "leadersWithCounters": len({r["defenseLeaderSlug"] for r in results if r["format"] == fmt and r["season"] == season}),
                "counterRows": sum(1 for r in results if r["format"] == fmt and r["season"] == season),
            }
            for season in season_meta[fmt]
        }
        for fmt in FORMATS
    }
    for fmt in FORMATS:
        if not any(coverage[fmt][str(s)]["counterRows"] for s in season_meta[fmt]):
            raise RuntimeError(f"No usable {fmt} counter data; preserving the previous snapshot.")

    results.sort(key=lambda row: (row["format"], -row["season"], normalized(row["defenseLeader"]), -row["battles"]))
    return {
        "schemaVersion": 1,
        "source": "SWGOH.GG GAC counters · first-attempt squad matchups",
        "scope": "leader",
        "leagueScope": "global",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seasons": season_meta,
        "coverage": coverage,
        "requestedLeaderPages": requested,
        "failedLeaderPages": errors,
        "counters": results,
    }


def main():
    catalog = refresh()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temp.replace(OUTPUT)
    print(f"Published {len(catalog['counters'])} counter rows across {catalog['requestedLeaderPages']} leader pages.")


if __name__ == "__main__":
    main()
