#!/usr/bin/env python3
"""Collect official SWGOH GAC leaderboards and active-season brackets via Comlink.

This is official competition metadata, NOT battle-history or team-usage data.
Never derive defense placements, counters, or win rates from these responses.
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
JSON_OUTPUT = ROOT / "gac-official-leaderboards.json"
JS_OUTPUT = ROOT / "gac-official-leaderboards.js"
COMLINK_URL = os.environ.get("COMLINK_URL", "http://127.0.0.1:3000").rstrip("/")
LEAGUES = {
    "carbonite": 20,
    "bronzium": 40,
    "chromium": 60,
    "aurodium": 80,
    "kyber": 100,
}
DIVISIONS = {
    "division_5": 5,
    "division_4": 10,
    "division_3": 15,
    "division_2": 20,
    "division_1": 25,
}
BRACKET_LEAGUES = {name: name.upper() for name in LEAGUES}
BRACKET_INITIAL_PROBE = 1024
BRACKET_MAX_INDEX = 131072
BRACKET_FETCH_WORKERS = 8


def request_json(path: str, payload: dict | None = None) -> dict:
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode()
    request = Request(
        f"{COMLINK_URL}/{path.lstrip('/')}",
        data=data,
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
    if not isinstance(response.get("player"), list):
        raise ValueError(f"Unexpected GAC leaderboard schema: {league}/{division}")


def current_gac_event(events_response: dict) -> dict | None:
    events = events_response.get("gameEvent", [])
    if not isinstance(events, list):
        raise ValueError("Comlink getEvents response has no gameEvent list")
    active = [event for event in events if isinstance(event, dict) and event.get("type") == 10]
    if not active:
        return None
    event = active[0]
    instances = event.get("instance", [])
    if not isinstance(instances, list) or not instances or not isinstance(instances[0], dict):
        raise ValueError("GAC event has no usable instance identifier")
    instance_id = instances[0].get("id")
    event_id = event.get("id")
    if not event_id or not instance_id:
        raise ValueError("GAC event is missing its event or instance id")
    return {
        "id": event_id,
        "instanceId": instance_id,
        "eventInstanceId": f"{event_id}:{instance_id}",
        "nameKey": event.get("nameKey"),
        "startTime": event.get("startTime"),
        "endTime": event.get("endTime"),
    }


def fetch_bracket(event_instance_id: str, league: str, index: int) -> dict:
    group_id = f"{event_instance_id}:{league}:{index}"
    response = request_json("getLeaderboard", {
        "payload": {
            "leaderboardType": 4,
            "eventInstanceId": event_instance_id,
            "groupId": group_id,
        },
        "enums": False,
    })
    if response.get("error") or response.get("errorMessage"):
        raise RuntimeError(f"Comlink rejected bracket {group_id}: {response}")
    players = response.get("player", [])
    if not isinstance(players, list):
        raise ValueError(f"Unexpected bracket response for {group_id}")
    return {"index": index, "groupId": group_id, "players": players}


def find_last_bracket(event_instance_id: str, league: str) -> int:
    """Use Comlink's documented exponential probe + binary boundary search."""
    if not fetch_bracket(event_instance_id, league, 0)["players"]:
        return -1
    low = 0
    high = BRACKET_INITIAL_PROBE
    while high <= BRACKET_MAX_INDEX and fetch_bracket(event_instance_id, league, high)["players"]:
        low = high
        high *= 2
    if high > BRACKET_MAX_INDEX:
        raise RuntimeError(
            f"Bracket scan exceeded safety ceiling ({BRACKET_MAX_INDEX}) for {league}; refusing partial publication"
        )
    while low < high - 1:
        middle = (low + high) // 2
        if fetch_bracket(event_instance_id, league, middle)["players"]:
            low = middle
        else:
            high = middle
    return low


def collect_brackets(event_instance_id: str, league: str) -> dict:
    last_index = find_last_bracket(event_instance_id, league)
    if last_index < 0:
        return {"league": league.lower(), "status": "no_brackets_returned", "lastBracketIndex": None, "brackets": []}

    brackets = []
    indexes = range(last_index + 1)
    with ThreadPoolExecutor(max_workers=BRACKET_FETCH_WORKERS) as pool:
        futures = {pool.submit(fetch_bracket, event_instance_id, league, index): index for index in indexes}
        for future in as_completed(futures):
            brackets.append(future.result())
    brackets.sort(key=lambda item: item["index"])
    player_count = sum(len(item["players"]) for item in brackets)
    return {
        "league": league.lower(),
        "status": "collected",
        "lastBracketIndex": last_index,
        "bracketCount": len(brackets),
        "playerCount": player_count,
        "brackets": brackets,
    }


def build() -> dict:
    boards = []
    for league, league_id in LEAGUES.items():
        for division, division_id in DIVISIONS.items():
            payload = {"payload": {"leaderboardType": 6, "league": league_id, "division": division_id}, "enums": False}
            response = request_json("getLeaderboard", payload)
            validate_board(response, league, division)
            boards.append({
                "league": league,
                "leagueId": league_id,
                "division": division,
                "divisionId": division_id,
                "response": response,
            })
            print(f"Collected official GAC top-50: {league}/{division}")
            time.sleep(0.2)

    events_response = request_json("getEvents", {"enums": False})
    event = current_gac_event(events_response)
    brackets = []
    if event:
        for league in BRACKET_LEAGUES.values():
            print(f"Scanning active GAC brackets: {league}")
            brackets.append(collect_brackets(event["eventInstanceId"], league))
    else:
        print("No active GAC season found; bracket collection skipped.")

    bracket_players = sum(item.get("playerCount", 0) for item in brackets)
    return {
        "schemaVersion": 2,
        "status": "collected",
        "source": "Capital Games public API via SWGOH Comlink",
        "dataset": "official_gac_leaderboards_and_brackets",
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "coverage": {
            "leagues": list(LEAGUES),
            "divisions": list(DIVISIONS),
            "top50BoardsCollected": len(boards),
            "top50BoardsExpected": len(LEAGUES) * len(DIVISIONS),
            "activeGacEventFound": event is not None,
            "bracketLeaguesCollected": len(brackets),
            "bracketPlayersCollected": bracket_players,
        },
        "activeEvent": event,
        "limitations": [
            "Type 6 contains the official top-50 leaderboard for each league and division.",
            "Type 4 contains active-season bracket membership and leaderboard fields only.",
            "These endpoints do not expose battle history, defensive squad placements, counter usage, or win rates.",
            "Bracket data is available only while a GAC event is active and can populate progressively.",
            "This dataset must never be treated as a substitute for SWGOH.GG battle statistics.",
        ],
        "top50Boards": boards,
        "activeBrackets": brackets,
    }


def publish(data: dict) -> None:
    JSON_OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    JS_OUTPUT.write_text(
        "/* Generated from official Capital Games GAC leaderboard and bracket data via Comlink. */\n"
        "window.GAC_OFFICIAL_LEADERBOARDS = "
        + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    snapshot = build()
    if snapshot["coverage"]["top50BoardsCollected"] != snapshot["coverage"]["top50BoardsExpected"]:
        raise RuntimeError("Incomplete official top-50 collection; refusing to publish")
    publish(snapshot)
    print(
        "Published "
        f"{snapshot['coverage']['top50BoardsCollected']} top-50 boards and "
        f"{snapshot['coverage']['bracketPlayersCollected']} active bracket players."
    )
