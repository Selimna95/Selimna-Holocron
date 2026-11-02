#!/usr/bin/env python3
"""Read-only connectivity probe for SWGOH.GG GAC counters and the existing relay."""
from __future__ import annotations
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

WORKER = "https://swgoh-optimizer-relay.lorg75017.workers.dev"
SEASON84 = "https://swgoh.gg/gac/counters/season/CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_84/"
GRIEVOUS84 = "https://swgoh.gg/gac/counters/GRIEVOUS/?season_id=CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_84"
URLS = [
    ("worker-root-with-pages-origin", WORKER + "/"),
    ("worker-characters-index-with-pages-origin", WORKER + "/?path=characters-index"),
    ("worker-known-best-mods-route-with-pages-origin", WORKER + "/?path=best-mods&slug=general-grievous"),
    ("swgoh-counters-index-direct", "https://swgoh.gg/gac/counters/"),
    ("swgoh-season84-direct", SEASON84),
    ("swgoh-grievous84-direct", GRIEVOUS84),
    ("jina-counters-index", "https://r.jina.ai/https://swgoh.gg/gac/counters/"),
    ("jina-season84", "https://r.jina.ai/" + SEASON84),
    ("jina-grievous84", "https://r.jina.ai/" + GRIEVOUS84),
]

def probe(name: str, url: str) -> dict:
    request = Request(url, headers={
        "User-Agent": "Selimnas-Holocron-GAC-Probe/1.0",
        "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
        "Origin": "https://selimna95.github.io",
        "Referer": "https://selimna95.github.io/Selimna-Holocron/",
    })
    started = time.monotonic()
    try:
        with urlopen(request, timeout=35) as response:
            body = response.read(2_000_000).decode("utf-8", "replace")
            status = response.status
            content_type = response.headers.get("Content-Type", "")
        low = body.lower()
        blocked = any(x in low for x in (
            "attention required! | cloudflare",
            "sorry, you have been blocked",
            "cf-error-details",
            "error 1020",
        ))
        markers = {
            "counter": "counter" in low,
            "seen": bool(re.search(r"\bseen\b", low)),
            "win_percent": bool(re.search(r"win\s*%", low)),
            "avg_banners": bool(re.search(r"\bavg\b", low)),
            "best_mods": "best mods" in low,
            "character_index": "/units/" in low,
            "cloudflare_block_page": blocked,
        }
        return {
            "name": name, "status": status, "content_type": content_type,
            "bytes": len(body.encode("utf-8")), "seconds": round(time.monotonic()-started, 2),
            "markers": markers,
            "sample": re.sub(r"\s+", " ", body[:220]).strip(),
        }
    except HTTPError as exc:
        try:
            error_body = exc.read(3000).decode("utf-8", "replace")
        except Exception:
            error_body = ""
        return {"name": name, "status": exc.code, "error": str(exc.reason), "body": re.sub(r"\\s+", " ", error_body[:1200]).strip()}
    except (URLError, TimeoutError, OSError) as exc:
        return {"name": name, "error": str(exc)}

def main() -> None:
    results = [probe(name, url) for name, url in URLS]
    print(json.dumps(results, ensure_ascii=False, indent=2))
    with open("gac-access-probe.json", "w", encoding="utf-8") as out:
        json.dump(results, out, ensure_ascii=False, indent=2)
    good = sum(1 for row in results if row.get("status") == 200)
    print(f"\nProbe complete: {good}/{len(results)} endpoints returned HTTP 200.")

if __name__ == "__main__":
    main()
