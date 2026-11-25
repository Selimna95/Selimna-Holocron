import unittest

from python.optimizer import resolve_character_profile, validate_profile_compatibility


class OptimizerProfileVariantTests(unittest.TestCase):
    def setUp(self):
        self.profiles = {
            "schemaVersion": 2,
            "profiles": {
                "TEST_UNIT": {
                    "name": "Test Unit",
                    "base_id": "TEST_UNIT",
                    "variants": {
                        "13:7": {
                            "level": 85,
                            "rarity": 7,
                            "gear_level": 13,
                            "relic_tier": 7,
                            "base_stats": {"Speed": 153},
                            "stat_components": {
                                "source": "Crinolo.stats.base+stats.gear",
                                "base": {"Speed": 153},
                                "gear": {},
                            },
                        },
                        "13:8": {
                            "level": 85,
                            "rarity": 7,
                            "gear_level": 13,
                            "relic_tier": 8,
                            "base_stats": {"Speed": 153},
                            "stat_components": {
                                "source": "Crinolo.stats.base+stats.gear",
                                "base": {"Speed": 153},
                                "gear": {},
                            },
                        },
                    },
                }
            },
        }

    def test_resolves_exact_requested_progression(self):
        profile = resolve_character_profile(
            self.profiles, "TEST_UNIT", character_metadata={
                "level": 85, "rarity": 7, "gear_level": 13, "relic_tier": 7,
            },
        )
        self.assertEqual(profile["relic_tier"], 7)
        self.assertEqual(profile["stat_components"]["source"], "Crinolo.stats.base+stats.gear")
        self.assertTrue(validate_profile_compatibility(profile, {
            "level": 85, "rarity": 7, "gear_level": 13, "relic_tier": 7,
        }))

    def test_does_not_fall_back_to_nearest_relic_tier(self):
        with self.assertRaisesRegex(RuntimeError, r"profile_progression_uncovered:13:9"):
            resolve_character_profile(
                self.profiles, "TEST_UNIT", character_metadata={
                    "level": 85, "rarity": 7, "gear_level": 13, "relic_tier": 9,
                },
            )

    def test_legacy_single_snapshot_remains_supported(self):
        legacy = {
            "TEST_UNIT": {
                "base_id": "TEST_UNIT",
                "level": 85,
                "rarity": 7,
                "gear_level": 13,
                "relic_tier": 8,
                "base_stats": {"Speed": 153},
            }
        }
        profile = resolve_character_profile(
            legacy, "TEST_UNIT", character_metadata={
                "level": 85, "rarity": 7, "gear_level": 13, "relic_tier": 8,
            },
        )
        self.assertEqual(profile["relic_tier"], 8)


if __name__ == "__main__":
    unittest.main()
