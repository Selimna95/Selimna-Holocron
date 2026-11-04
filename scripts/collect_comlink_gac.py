#!/usr/bin/env python3
"""Collect official SWGOH GAC league leaderboards through a local Comlink service.

This dataset is deliberately separate from SWGOH.GG battle-usage statistics:
Comlink exposes official leaderboard/bracket data, not squad usage or counter
win rates. Never convert this snapshot into team-usage metrics.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
JSON_OUTPUT = ROOT / "gac-official-leaderboards.json"
JS_OUTPUT = ROOT / "gac-official-leaderboards.js"
COMLINK_URL = os.environ.get("COMLINK_URL", "http://127.0.0.1:3000").rstrip("/")
LEAGUES = {"carbonite": 20, "bronzium": 40, "chromium": 60, "aurodium": 80, "kyber": 100}
DIVISIONS = {"division_5": 5, "division_4": 10, "division_3": 15, "division_2": 20, "division_1": 25}


def request_json(path: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    request = Request(
        f"{COMLINK_URL}/{path.lstrip('/')}", data=data,
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        method="GET" if data is None else "POST",
    )
    last_error = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=60) as response:
                if response.status != 200:
                    raise RuntimeError(f"Comlink HTTP {response.status} on /{path}")
                result = json.loads(response.read().decode("utf-8"))
                if not isinstance(result, dict):
                    raise ValueError(f"Comlink /{path} returned a non-object response")
                return result
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, RuntimeError, ValueError) as exc:
            last_error = exc
            if attempt < 3:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"Comlink request /{path} failed: {last_error}")


def validate_board(response: dict, league: str, division: str) -> None:
    if not response:
        raise ValueError(f"Empty GAC leaderboard: {league}/{division}")
    if response.get("error") or response.get("errorMessage"):
        raise ValueError(f"Comlink rejected {league}/{division}: {response}")


def build() -> dict:
    boards = []
    for league, league_id in LEAGUES.items():
        for division, division_id in DIVISIONS.items():
            payload = {"payload": {"leaderboardType": 6, "league": league_id, "division": division_id}, "enums": False}
            response = request_json("getLeaderboard", payload)
            validate_board(response, league, division)
            boards.append({"league": league, "leagueId": league_id, "division": division,
                           "divisionId": division_id, "response": response})
            print(f"Collected official GAC leaderboard: {league}/{division}")
            time.sleep(0.6)
    return {
        "schemaVersion": 1,
        "status": "collected",
        "source": "Capital Games public API via SWGOH Comlink",
        "dataset": "official_gac_league_leaderboards",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage": {"leagues": list(LEAGUES), "divisions": list(DIVISIONS),
                     "boardsCollected": len(boards), "boardsExpected": len(LEAGUES) * len(DIVISIONS)},
        "limitations": [
            "This dataset contains official GAC league leaderboard responses only.",
            "It does not contain squad usage counts, defensive team placements, battle outcomes, or counter win rates.",
            "It must never be used as a substitute for SWGOH.GG GAC battle statistics."
        ],
        "boards": boards
    }


def publish(data: dict) -> None:
    JSON_OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    JS_OUTPUT.write_text(
        "/* Generated from official Capital Games GAC leaderboard data via Comlink. */\n"
        "window.GAC_OFFICIAL_LEADERBOARDS = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8"
    )


if __name__ == "__main__":
    snapshot = build()
    if snapshot["coverage"]["boardsCollected"] != snapshot["coverage"]["boardsExpected"]:
        raise RuntimeError("Incomplete GAC leaderboard collection; refusing to publish")
    publish(snapshot)
    print(f"Published {snapshot['coverage']['boardsCollected']} official leaderboard boards.")
