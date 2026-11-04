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
        with patch.object(MODULE, "request_json", return_value={"leaderboard": [{"playerId": "123"}]}), \
             patch.object(MODULE.time, "sleep"):
            snapshot = MODULE.build()
        self.assertEqual(snapshot["coverage"]["boardsExpected"], 25)
        self.assertEqual(snapshot["coverage"]["boardsCollected"], 25)
        self.assertEqual(len(snapshot["boards"]), 25)

    def test_empty_leaderboard_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Empty GAC leaderboard"):
            MODULE.validate_board({}, "kyber", "division_1")

    def test_error_envelope_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Comlink rejected"):
            MODULE.validate_board({"error": "unavailable"}, "kyber", "division_1")

    def test_dataset_explicitly_disclaims_usage_statistics(self):
        with patch.object(MODULE, "request_json", return_value={"leaderboard": [{"playerId": "123"}]}), \
             patch.object(MODULE.time, "sleep"):
            snapshot = MODULE.build()
        self.assertIn("It does not contain squad usage counts", snapshot["limitations"][1])
        self.assertEqual(snapshot["dataset"], "official_gac_league_leaderboards")


if __name__ == "__main__":
    unittest.main()
