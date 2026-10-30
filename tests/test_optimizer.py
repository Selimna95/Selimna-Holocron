import unittest

from python.optimizer import (
    normalize_slot, normalize_set, mod_slot_value, optimize_kyber,
    _partial_matches_set_plan,
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

    def test_partial_set_plan_rejects_excess_sets(self):
        build = [{"set": "Health"}, {"set": "Health"}]
        self.assertFalse(_partial_matches_set_plan(build, {"Speed": 6}))
        self.assertTrue(_partial_matches_set_plan(build[:1], {"Health": 2, "Speed": 4}))


if __name__ == "__main__":
    unittest.main()
