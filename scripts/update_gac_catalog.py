#!/usr/bin/env python3
"""Refresh the Padawan defense catalogue from SWGOH.GG tier-list pages.

The source is public and league/format/season filtered. We only publish a new
snapshot when all ten requested views parse successfully; a broken upstream
page never replaces the last known-good catalogue.
"""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "blue-gac" / "gac-catalog.json"
BASES = {
    "5v5": "https://swgoh.gg/tier-list/gac/",
    "3v3": "https://swgoh.gg/tier-list/3v3/",
}
LEAGUES = ("kyber", "aurodium", "chromium", "bronzium", "carbonite")
LEAGUE_LABELS = {x: x.capitalize() for x in LEAGUES}
USER_AGENT = "SelimnasHolocron-GAC-Catalog/1.0 (+https://github.com/Selimna95/Selimna-Holocron)"
MIN_TEAMS_PER_VIEW = 8


class Node:
    def __init__(self, tag: str, attrs: dict[str, str], parent: "Node | None"):
        self.tag, self.attrs, self.parent = tag, attrs, parent
        self.children: list[Node | str] = []

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()

    def text(self) -> str:
        return " ".join(
            [self.attrs.get("alt", "")] if self.tag == "img" else []
            + [child.text() if isinstance(child, Node) else child for child in self.children]
        )


class TreeParser(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("document", {}, None)
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs), self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        if data.strip():
            self.stack[-1].children.append(data.strip())


def number_value(value: str) -> int:
    value = value.strip().replace(",", "").replace(" ", "")
    match = re.fullmatch(r"(\d+(?:\.\d+)?)([KMB]?)", value, re.I)
    if not match:
        raise ValueError(f"Unsupported battle count: {value!r}")
    amount = float(match.group(1))
    multiplier = {"": 1, "K": 1_000, "M": 1_000_000, "B": 1_000_000_000}[match.group(2).upper()]
    return round(amount * multiplier)


def page_season(html: str) -> int:
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    if title:
        match = re.search(r"Season\s+(\d+)", title.group(1), re.I)
        if match:
            return int(match.group(1))
    reader_title = re.search(r"^Title:\s*.*?Season\s+(\d+)", html, re.I | re.M)
    if reader_title:
        return int(reader_title.group(1))
    match = re.search(r"Season\s+(\d+)", html, re.I)
    if not match:
        raise ValueError("SWGOH.GG page does not expose a season number")
    return int(match.group(1))


def discover_previous_season(html: str, current: int) -> int:
    parser = TreeParser()
    parser.feed(html)
    found = set()
    for node in parser.root.walk():
        href = node.attrs.get("href", "")
        query = parse_qs(urlparse(href).query)
        for value in query.get("season", []):
            if value.isdigit() and int(value) < current and int(value) % 2 == current % 2:
                found.add(int(value))
    found.update(
        int(value) for value in re.findall(r"[?&]season=(\d+)", html)
        if int(value) < current and int(value) % 2 == current % 2
    )
    return max(found) if found else current - 2


def discover_previous_season(html: str, current: int) -> int:
    parser = TreeParser()
    parser.feed(html)
    found = set()
    for node in parser.root.walk():
        href = node.attrs.get("href", "")
        query = parse_qs(urlparse(href).query)
        for value in query.get("season", []):
            if value.isdigit() and int(value) < current:
                found.add(int(value))
    found.update(int(value) for value in re.findall(r"[?&]season=(\d+)", html) if int(value) < current)
    # The game alternates 5v5 and 3v3 seasons; Reader can omit selector links.
    return max(found) if found else current - 2


def is_character_image(node: Node) -> bool:
    if node.tag != "img":
        return False
    alt = node.attrs.get("alt", "").strip()
    src = node.attrs.get("src", "") + " " + node.attrs.get("data-src", "")
    return bool(alt) and (alt.startswith("Image:") or "game-assets.swgoh.gg" in src)


def parse_markdown_page(text: str, fmt: str, league: str, expected_season: int, source_url: str, minimum_teams: int) -> list[dict]:
    """Parse Jina Reader's text projection when SWGOH.GG blocks direct server fetches."""
    size = 5 if fmt == "5v5" else 3
    teams = []
    pending = []
    pending_stats = None
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    for line in lines:
        image = re.search(r"Image:\s*(.+)$", line)
        if not image:
            image = re.search(r"!\[(?:Image:\s*)?([^\]]+)\]", line)
        if image:
            name = image.group(1).strip()
            if name and name not in pending:
                pending.append(name)
            continue
        stats = re.search(r"Hold\s*%\s*([\d.,]+)\s*%\s*Battles\s+([\d,.]+\s*[KMB]?)", line, re.I)
        if stats:
            pending_stats = (float(stats.group(1).replace(",", ".")), number_value(stats.group(2)))
            continue
        rank = re.search(r"#\s*(\d+)", line)
        if pending_stats and rank and len(pending) == size:
            hold, battles = pending_stats
            rank_value = int(rank.group(1))
            teams.append({
                "format": fmt, "league": LEAGUE_LABELS[league], "season": expected_season,
                "rank": rank_value, "name": " · ".join(pending), "members": pending[:],
                "hold": hold, "battles": battles, "source": source_url,
                "note": f"S{expected_season} · {LEAGUE_LABELS[league]} · rang #{rank_value} · {battles:,} combats observés".replace(",", " "),
            })
            pending = []
            pending_stats = None
        elif pending_stats and rank:
            pending = []
            pending_stats = None
    unique = []
    seen = set()
    for team in teams:
        key = tuple(team["members"])
        if key not in seen and 0 <= team["hold"] <= 100 and team["battles"] > 0:
            seen.add(key)
            unique.append(team)
    unique.sort(key=lambda t: (-t["battles"], -t["hold"], t["rank"]))
    if len(unique) < minimum_teams:
        raise ValueError(f"{fmt} {league} S{expected_season}: only {len(unique)} teams parsed (minimum {minimum_teams}); refusing to publish a partial scrape")
    return unique


def parse_page(html: str, fmt: str, league: str, expected_season: int, source_url: str, minimum_teams: int = MIN_TEAMS_PER_VIEW) -> list[dict]:
    if "<html" not in html.lower() and ("Image:" in html or "![" in html):
        return parse_markdown_page(html, fmt, league, expected_season, source_url, minimum_teams)
    size = 5 if fmt == "5v5" else 3
    parser = TreeParser()
    parser.feed(html)
    root = parser.root
    raw_images = [n for n in root.walk() if n.tag == "img"]
    character_images = [n for n in raw_images if is_character_image(n)]
    print(f"Image diagnostics {fmt} {league} S{expected_season}: {len(raw_images)} img tags, {len(character_images)} character candidates; samples={[(n.attrs.get('alt', ''), n.attrs.get('src', '')[:100]) for n in raw_images[:8]]}")
    seen: set[tuple[str, ...]] = set()
    teams = []

    for image in (n for n in root.walk() if is_character_image(n)):
        candidate = image.parent
        chosen = None
        for _ in range(12):
            if candidate is None:
                break
            images = [n for n in candidate.walk() if is_character_image(n)]
            text = re.sub(r"\s+", " ", candidate.text()).strip()
            if (len(images) == size and "Hold %" in text and "Battles" in text
                    and re.search(r"#\s*\d+", text)):
                chosen = (candidate, images, text)
                break
            candidate = candidate.parent
        if chosen is None:
            continue

        _, images, text = chosen
        members = []
        for img in images:
            name = img.attrs.get("alt", "").strip()
            if name.startswith("Image:"):
                name = name[6:].strip()
            if name and name not in members:
                members.append(name)
        if len(members) != size:
            continue
        signature = tuple(members)
        if signature in seen:
            continue

        stats = re.search(
            r"Hold\s*%\s*([\d.,]+)\s*%\s*Battles\s+([\d,.]+\s*[KMB]?)",
            text, re.I,
        )
        rank = re.search(r"#\s*(\d+)", text)
        if not stats or not rank:
            continue
        hold = float(stats.group(1).replace(",", "."))
        battles = number_value(stats.group(2))
        if not (0 <= hold <= 100 and battles > 0):
            continue

        seen.add(signature)
        rank_value = int(rank.group(1))
        teams.append({
            "format": fmt,
            "league": LEAGUE_LABELS[league],
            "season": expected_season,
            "rank": rank_value,
            "name": " · ".join(members),
            "members": members,
            "hold": hold,
            "battles": battles,
            "source": source_url,
            "note": f"S{expected_season} · {LEAGUE_LABELS[league]} · rang #{rank_value} · {battles:,} combats observés".replace(",", " "),
        })

    teams.sort(key=lambda t: (-t["battles"], -t["hold"], t["rank"]))
    print(f"Parsed {fmt} {league} S{expected_season}: {len(teams)} teams")
    if len(teams) < minimum_teams:
        raise ValueError(
            f"{fmt} {league} S{expected_season}: only {len(teams)} teams parsed "
            f"(minimum {minimum_teams}); refusing to publish a partial scrape"
        )
    return teams


def fetch(url: str, response_format: str = "html") -> str:
    # SWGOH.GG currently returns HTTP 403 to ordinary cloud/server requests.
    # Jina Reader fetches the public page and returns sanitized HTML for image alt-text parsing.
    reader_url = "https://r.jina.ai/" + url
    request = Request(reader_url, headers={"User-Agent": USER_AGENT, "Accept": "text/html" if response_format == "html" else "text/plain", "X-Return-Format": response_format})
    last_error = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=45) as response:
                if response.status != 200:
                    raise ValueError(f"HTTP {response.status} for {url}")
                body = response.read().decode("utf-8", errors="replace")
                print(f"Fetched SWGOH.GG projection for {url}")
                return body
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Unable to fetch public SWGOH.GG page through Reader: {url}: {last_error}")


def build_url(base: str, league: str, season: int | None = None) -> str:
    params = {"league": league, "side": "defense"}
    if season is not None:
        params["season"] = str(season)
    return base + "?" + urlencode(params)


def refresh() -> dict:
    all_teams = []
    seasons_by_format = {}

    for fmt, base in BASES.items():
        seasons_by_format[fmt] = {}
        for league in LEAGUES:
            discovery_url = build_url(base, league)
            discovery_html = fetch(discovery_url)
            try:
                current = page_season(discovery_html)
            except ValueError:
                current = page_season(fetch(discovery_url, "markdown"))
            previous = discover_previous_season(discovery_html, current)
            available_seasons = []
            candidates = []
            for candidate in (current, previous, previous - 2):
                if candidate not in candidates and candidate > 0:
                    candidates.append(candidate)
            for season in candidates:
                url = build_url(base, league, season if season != current else None)
                html = discovery_html if season == current else fetch(url)
                try:
                    actual = page_season(html)
                except ValueError:
                    try:
                        actual = page_season(fetch(url, "markdown"))
                    except ValueError:
                        actual = season
                if actual != season:
                    print(f"Skipping {fmt} {league} S{season}: source returned S{actual}")
                    continue
                try:
                    parsed = parse_page(html, fmt, league, season, url)
                except ValueError as exc:
                    print(f"Skipping {fmt} {league} S{season}: {exc}")
                    continue
                all_teams.extend(parsed)
                available_seasons.append(season)
                if len(available_seasons) >= 2:
                    break
            seasons_by_format[fmt][league] = available_seasons

    keys = set()
    unique = []
    for team in all_teams:
        key = (team["format"], team["league"], team["season"], tuple(team["members"]))
        if key not in keys:
            keys.add(key)
            unique.append(team)

    coverage = {
        fmt: {
            league: sum(1 for t in unique if t["format"] == fmt and t["league"] == LEAGUE_LABELS[league])
            for league in LEAGUES
        }
        for fmt in BASES
    }
    for fmt in BASES:
        for league in LEAGUES:
            if coverage[fmt][league] < MIN_TEAMS_PER_VIEW:
                raise ValueError(f"Missing current-season coverage for {fmt} {league}: {coverage[fmt][league]} teams")
    return {
        "schemaVersion": 1,
        "source": "SWGOH.GG GAC tier lists · defense · most played",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seasons": seasons_by_format,
        "coverage": coverage,
        "teams": unique,
    }


def main():
    catalog = refresh()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(OUTPUT)
    print(
        f"Published {len(catalog['teams'])} defensive teams; "
        f"5 leagues × 2 formats × 2 seasons; updated {catalog['updatedAt']}"
    )


if __name__ == "__main__":
    main()
