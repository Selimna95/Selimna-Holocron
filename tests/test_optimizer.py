import json
import unittest
from pathlib import Path

from python.optimizer import (
    normalize_slot, normalize_set, mod_slot_value, optimize_kyber,
    _partial_matches_set_plan, build_score,
)


class OptimizerNormalizationTests(unittest.TestCase):
    def test_numeric_and_named_slots(self):
        expected = {
            "1": "Square", "2": "Square", "3": "Arrow", "4": "Diamond",
            "5": "Triangle", "6": "Circle", "7": "Cross",
            "slot_7": "Cross", " arrow ": "Arrow",
        }
        for raw, normalized in expected.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_slot(raw), normalized)

    def test_invalid_and_boolean_slots(self):
        self.assertIsNone(normalize_slot(None))
        self.assertIsNone(normalize_slot(True))
        self.assertEqual(normalize_slot("unknown-slot"), "unknown-slot")

    def test_set_aliases_and_numeric_ids(self):
        self.assertEqual(normalize_set("speed"), "Speed")
        self.assertEqual(normalize_set("Crit Damage"), "Critical Damage")
        self.assertEqual(normalize_set("4"), "Speed")
        self.assertIsNone(normalize_set(""))

    def test_slot_field_aliases(self):
        self.assertEqual(mod_slot_value({"slotId": 3}), 3)
        self.assertEqual(mod_slot_value({"mod_slot": "Cross"}), "Cross")
        self.assertIsNone(mod_slot_value("not a mod"))

    def test_empty_mod_list_has_clear_error(self):
        with self.assertRaisesRegex(RuntimeError, "Aucun mod disponible"):
            optimize_kyber([])

    def test_missing_slot_has_diagnostic_error(self):
        one_mod = [{"id": "only", "slot": "Square", "set": "Speed", "primary_stat": "Speed", "primary_value": 10}]
        with self.assertRaisesRegex(RuntimeError, "slot"):
            optimize_kyber(one_mod, kyber={}, base_stats={})

    def test_nominal_six_slot_build(self):
        mods = []
        for slot in ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross"):
            mods.append({
                "id": slot, "slot": slot, "set": "Speed",
                "primary_stat": "Speed", "primary_value": 10,
                "secondary_1_stat": "Speed", "secondary_1_value": 5,
                "level": 15, "rarity": 5,
            })
        builds = optimize_kyber(
            mods, base_stats={"Speed": 100, "Health": 10000, "Protection": 10000},
            kyber={}, number_of_builds=1, limit_per_slot=1,
        )
        self.assertEqual(len(builds), 1)
        self.assertEqual(len(builds[0]["build"]), 6)

    def test_incremental_beam_returns_builds_with_exact_final_scores(self):
        mods = []
        for slot in ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross"):
            for variant in range(2):
                mods.append({
                    "id": f"{slot}-{variant}", "slot": slot, "set": "Speed",
                    "primary_stat": "Speed", "primary_value": 10 + variant,
                    "secondary_1_stat": "Speed", "secondary_1_value": 5 + variant,
                    "secondary_2_stat": "Health %", "secondary_2_value": 3 + variant,
                    "level": 15, "rarity": 5,
                })
        base_stats = {"Speed": 100, "Health": 10000, "Protection": 10000}
        weights = {"Speed": 1.0, "Health": 0.01, "Protection": 0.01, "Offense": 0.5,
                   "Defense": 0.1, "Potency": 0.1, "Tenacity": 0.1}
        builds = optimize_kyber(
            mods, base_stats=base_stats, kyber={}, weights=weights,
            number_of_builds=4, limit_per_slot=2, beam_width=24,
        )
        scores = [item["score"] for item in builds]
        self.assertEqual(scores, sorted(scores, reverse=True))
        for item in builds:
            self.assertAlmostEqual(item["score"], build_score(item["build"], {}, weights, base_stats))

    def test_partial_set_plan_rejects_excess_sets(self):
        build = [{"set": "Health"}, {"set": "Health"}]
        self.assertFalse(_partial_matches_set_plan(build, {"Speed": 6}))
        self.assertTrue(_partial_matches_set_plan(build[:1], {"Health": 2, "Speed": 4}))


class OptimizerProfileIndexTests(unittest.TestCase):
    def test_split_profile_index_points_to_valid_character_files(self):
        root = Path(__file__).resolve().parents[1] / "python" / "optimizer_profiles"
        index = json.loads((root / "index.json").read_text(encoding="utf-8"))
        self.assertGreater(len(index), 300)
        for base_id, entry in index.items():
            with self.subTest(base_id=base_id):
                profile_path = root / entry["file"]
                self.assertTrue(profile_path.is_file())
                profile = json.loads(profile_path.read_text(encoding="utf-8"))
                self.assertEqual(str(profile.get("base_id", "")).upper(), base_id.upper())
                self.assertIsInstance(profile.get("base_stats"), dict)
        self.assertFalse((root.parent / "optimizer_profiles.json").exists())


if __name__ == "__main__":
    unittest.main()
