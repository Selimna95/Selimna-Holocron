import unittest

from python.optimizer import resolve_character_profile


class OptimizerProfileCoverageTests(unittest.TestCase):
    def setUp(self):
        self.profiles = {
            "TEST_UNIT": {
                "name": "Test Unit",
                "base_id": "TEST_UNIT",
                "level": 85,
                "rarity": 7,
                "gear_level": 13,
                "relic_tier": 8,
                "base_stats": {"Speed": 153},
            }
        }

    def test_exact_original_snapshot_is_resolved(self):
        profile = resolve_character_profile(
            self.profiles, "TEST_UNIT", character_metadata={
                "level": 85, "rarity": 7, "gear_level": 13, "relic_tier": 8,
            },
        )
        self.assertEqual(profile["relic_tier"], 8)

    def test_uncovered_relic_progression_has_explicit_code(self):
        with self.assertRaisesRegex(RuntimeError, r"profile_progression_uncovered:13:7"):
            resolve_character_profile(
                self.profiles, "TEST_UNIT", character_metadata={
                    "level": 85, "rarity": 7, "gear_level": 13, "relic_tier": 7,
                },
            )

    def test_uncovered_gear_progression_has_explicit_code(self):
        with self.assertRaisesRegex(RuntimeError, r"profile_progression_uncovered:12:8"):
            resolve_character_profile(
                self.profiles, "TEST_UNIT", character_metadata={
                    "level": 85, "rarity": 7, "gear_level": 12, "relic_tier": 8,
                },
            )


if __name__ == "__main__":
    unittest.main()
