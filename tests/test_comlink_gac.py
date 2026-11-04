import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "collect_comlink_gac",
    Path(__file__).resolve().parents[1] / "scripts" / "collect_comlink_gac.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ComlinkGacCollectorTests(unittest.TestCase):
    def test_coverage_is_25_league_division_combinations(self):
        with patch.object(MODULE, "request_json", side_effect=[
            {"player": [{"playerId": "test-player"}]}
            for _ in range(25)
        ] + [{"rosterUnit": []}, {"gameEvent": []}]), patch.object(MODULE.time, "sleep"):
            snapshot = MODULE.build()
        self.assertEqual(snapshot["coverage"]["top50BoardsExpected"], 25)
        self.assertEqual(snapshot["coverage"]["top50BoardsCollected"], 25)
        self.assertEqual(len(snapshot["top50Boards"]), 25)
        self.assertFalse(snapshot["coverage"]["activeGacEventFound"])

    def test_all_empty_leaderboards_are_rejected_before_publication(self):
        with patch.object(MODULE, "request_json", side_effect=[
            *[{"player": []} for _ in range(25)],
            {"gameEvent": []},
        ]), patch.object(MODULE.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "zero players"):
                MODULE.build()

    def test_empty_leaderboard_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Empty GAC leaderboard"):
            MODULE.validate_board({}, "kyber", "division_1")

    def test_unexpected_leaderboard_schema_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unexpected GAC leaderboard schema"):
            MODULE.validate_board({"entries": []}, "kyber", "division_1")

    def test_error_envelope_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Comlink rejected"):
            MODULE.validate_board({"error": "unavailable"}, "kyber", "division_1")

    def test_current_gac_event_is_extracted(self):
        result = MODULE.current_gac_event({
            "gameEvent": [{
                "type": 10,
                "id": "CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_99",
                "instance": [{"id": "O1770000000000"}],
            }]
        })
        self.assertEqual(
            result["eventInstanceId"],
            "CHAMPIONSHIPS_GRAND_ARENA_GA2_EVENT_SEASON_99:O1770000000000",
        )

    def test_no_current_gac_event_is_explicit(self):
        self.assertIsNone(MODULE.current_gac_event({"gameEvent": [{"type": 1}]}))

    def test_scheduled_but_not_active_gac_event_is_not_selected(self):
        event = {
            "type": 10,
            "id": "FUTURE_SEASON",
            "startTime": "1893456000000",
            "endTime": "1893542400000",
            "instance": [{"id": "O1893456000000"}],
        }
        with patch.object(MODULE.time, "time", return_value=1800000000):
            self.assertIsNone(MODULE.current_gac_event({"gameEvent": [event]}))

    def test_future_instance_timestamp_is_not_scanned_without_event_times(self):
        event = {
            "type": 10,
            "id": "FUTURE_SEASON",
            "instance": [{"id": "O1893456000000"}],
        }
        with patch.object(MODULE.time, "time", return_value=1800000000):
            self.assertIsNone(MODULE.current_gac_event({"gameEvent": [event]}))

    def test_bracket_boundary_uses_exponential_then_binary_probe(self):
        def fake_fetch(event_id, league, index):
            return {"players": [{"name": "player"}] if index <= 5 else []}
        with patch.object(MODULE, "fetch_bracket", side_effect=fake_fetch):
            self.assertEqual(MODULE.find_last_bracket("event:instance", "KYBER"), 5)

    def test_dataset_disclaims_battle_usage_statistics(self):
        with patch.object(MODULE, "request_json", side_effect=[
            {"player": [{"playerId": "test-player"}]}
            for _ in range(25)
        ] + [{"rosterUnit": []}, {"gameEvent": []}]), patch.object(MODULE.time, "sleep"):
            snapshot = MODULE.build()
        self.assertTrue(any("do not expose battle history" in item for item in snapshot["limitations"]))
        self.assertEqual(snapshot["dataset"], "official_gac_leaderboards_and_brackets")

    def test_roster_meta_aggregates_without_publishing_player_identity(self):
        board = {
            "league": "kyber",
            "division": "division_1",
            "response": {"player": [{"playerId": "private-player-id"}]},
        }
        profile = {
            "playerId": "private-player-id",
            "name": "Private Name",
            "allyCode": "123456789",
            "rosterUnit": [
                {
                    "definitionId": "UNIT_A",
                    "currentTier": 13,
                    "currentRarity": 7,
                    "relic": {"currentTier": 7},
                    "equippedStatMod": [{"id": "mod1"}],
                }
            ],
        }
        with patch.object(MODULE, "request_json", return_value=profile):
            result = MODULE.collect_competitive_roster_meta([board])
        self.assertEqual(result["uniqueProfilesFetched"], 1)
        cohort = result["cohorts"][0]
        self.assertEqual(cohort["status"], "complete")
        self.assertEqual(cohort["units"][0]["definitionId"], "UNIT_A")
        self.assertEqual(cohort["units"][0]["prevalencePercent"], 100.0)
        serialized = __import__("json").dumps(result)
        self.assertNotIn("private-player-id", serialized)
        self.assertNotIn("Private Name", serialized)
        self.assertNotIn("123456789", serialized)


if __name__ == "__main__":
    unittest.main()
