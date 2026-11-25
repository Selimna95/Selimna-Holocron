import unittest
from unittest import mock
import json
import os
from pathlib import Path
import python.optimizer as optimizer_module
from python.optimizer import (
    normalize_slot, normalize_set, mod_slot_value, optimize_kyber, final_stats,
    _partial_matches_set_plan, _mod_score, build_score, _mod_metadata, _prepare_scoring_context,
    resolve_character_base_stats,
)

def load_tests(loader, tests, pattern):
    """Run optimizer tests only inside Pyodide with the shared JavaScript engine."""
    if os.environ.get("HOLOCRON_PYODIDE") != "1":
        return unittest.TestSuite()
    return tests


TEST_BASE_PROFILE = {
    "level": 85,
    "gear_level": 13,
    "base_stats": {
        "Health": 10000, "Protection": 8000, "Speed": 100,
        "Physical Damage": 500, "Special Damage": 500,
        "Armor": 50, "Resistance": 50, "Potency": 0.1, "Tenacity": 0.1,
        "Critical Damage": 1.5,
        "Physical Critical Chance": 40, "Special Critical Chance": 40,
        "Physical Critical Avoidance": 0, "Special Critical Avoidance": 0,
    },
}


# Valid SWGOH primary-stat choices for each slot, represented in Comlink's
# UnitStatId + unscaledDecimalValue shape and with four real secondaries.
_SLOT_PRIMARY = {
    "Square": (41, 4_000_000_000),       # Offense flat
    "Arrow": (5, 3_000_000_000),         # Speed flat
    "Diamond": (42, 4_000_000_000),      # Defense flat
    "Triangle": (16, 30_000_000),        # Critical Damage %
    "Circle": (55, 5_880_000),           # Health %
    "Cross": (17, 10_000_000),            # Potency %
}


def _realistic_mod(slot, set_name="Health", game_id=None, speed=4, source_usage=None):
    stat_id, primary_value = _SLOT_PRIMARY[slot]
    mod = {
        "slot": slot,
        "level": 15,
        "pips": 5,
        "rarity": 5,
        "set_name": set_name,
        "primary_stat": {"unitStatId": stat_id, "unscaledDecimalValue": primary_value},
        "secondary_stats": [
            {"unitStatId": 5, "unscaledDecimalValue": int(speed * 100_000_000)},
            {"unitStatId": 48, "unscaledDecimalValue": 5_000_000},
            {"unitStatId": 17, "unscaledDecimalValue": 2_000_000},
            {"unitStatId": 18, "unscaledDecimalValue": 2_000_000},
        ],
    }
    if game_id is not None:
        mod["game_id"] = game_id
    if source_usage is not None:
        mod["_source_usage"] = source_usage
    return mod


class OptimizerBeamRetentionTests(unittest.TestCase):
    def test_heap_top_k_matches_stable_full_sort_including_ties(self):
        candidates = [
            (10.0, "first"),
            (10.0, "second"),
            (12.0, "highest"),
            (10.0, "third"),
            (9.0, "last"),
            (11.0, "next"),
        ]
        expected = sorted(candidates, key=lambda item: item[0], reverse=True)[:4]
        actual = optimizer_module._retain_best_beam(candidates, 4)
        self.assertEqual(actual, expected)

    def test_beam_retention_keeps_full_sort_when_every_candidate_fits(self):
        candidates = [(2.0, "a"), (1.0, "b"), (3.0, "c")]
        expected = sorted(candidates, key=lambda item: item[0], reverse=True)
        self.assertEqual(optimizer_module._retain_best_beam(candidates, 5), expected)


class OptimizerScoringMetadataTests(unittest.TestCase):
    def test_precomputed_metadata_matches_existing_mod_helpers(self):
        mod = {
            "game_id": "metadata-check", "slot": "Arrow", "level": 15,
            "set_name": "Speed", "primary_stat": "Speed", "primary_value": 30,
            "secondary_1_stat": "Speed", "secondary_1_value": 12,
            "secondary_2_stat": "Offense %", "secondary_2_value": 5,
            "secondary_3_stat": "Potency %", "secondary_3_value": 3,
            "secondary_4_stat": "Tenacity %", "secondary_4_value": 4,
            "_source_usage": 17,
        }
        metadata = _mod_metadata(mod)
        from python.optimizer import normalize_slot, mod_set, primary_name, mod_stats
        self.assertEqual(metadata["slot"], normalize_slot(mod["slot"]))
        self.assertEqual(metadata["set"], mod_set(mod))
        self.assertEqual(metadata["primary"], primary_name(mod))
        self.assertEqual(metadata["stats"], mod_stats(mod))
        self.assertEqual(metadata["donor_uses"], 17.0)
        self.assertAlmostEqual(metadata["normalized_stats"]["Speed"], 12 / 31)
        self.assertAlmostEqual(metadata["normalized_stats"]["Offense %"], 5 / 8.5)
        self.assertEqual(metadata["normalized_scales"]["Speed"], 31.0)
        kyber = {
            "sets": {"Speed": 0.7},
            "slots": {"Arrow": {"primaries": {"Speed": 0.8, "Health": 0.2}}},
        }
        weights = {"Speed": 1.0, "Offense": 0.5, "Potency": 0.1}
        context = _prepare_scoring_context(kyber)
        self.assertAlmostEqual(
            _mod_score(mod, kyber, weights),
            _mod_score(mod, kyber, weights, metadata, context),
            places=12,
        )

    def test_python_mod_ranking_uses_shared_dot_normalized_secondary_values(self):
        health_mod = {
            "slot": "Square", "pips": 6, "level": 15, "set_name": "Health",
            "primary_stat": "Offense", "primary_value": 100,
            "secondary_1_stat": "Health", "secondary_1_value": 2700,
            "_source_usage": 1000,
        }
        offense_mod = {
            "slot": "Square", "pips": 6, "level": 15, "set_name": "Health",
            "primary_stat": "Offense", "primary_value": 100,
            "secondary_1_stat": "Offense %", "secondary_1_value": 8.5,
            "_source_usage": 1000,
        }
        weights = {"Health": 0.12, "Offense": 0.42}
        self.assertGreater(
            _mod_score(offense_mod, {}, weights),
            _mod_score(health_mod, {}, weights),
            "The Python candidate pre-ranker must consume shared normalized secondary quality",
        )

    def test_normalized_speed_secondary_preserves_priority_and_dot_equivalence(self):
        common = {
            "slot": "Square", "level": 15, "set_name": "Health",
            "primary_stat": "Offense", "primary_value": 100,
            "_source_usage": 1000,
        }
        without_speed = _mod_score(dict(common), {}, {"Speed": 1.0})
        speed_5_dot = _mod_score({
            **common, "pips": 5,
            "secondary_1_stat": "Speed", "secondary_1_value": 15,
        }, {}, {"Speed": 1.0})
        speed_6_dot = _mod_score({
            **common, "pips": 6,
            "secondary_1_stat": "Speed", "secondary_1_value": 15.5,
        }, {}, {"Speed": 1.0})
        self.assertAlmostEqual(speed_5_dot - without_speed, 139.5)
        self.assertAlmostEqual(speed_6_dot - without_speed, 139.5)

    def test_cached_build_score_matches_uncached_score(self):
        build = [
            {"game_id": "m1", "slot": "Square", "level": 15, "set_name": "Health",
             "primary_stat": "Health", "primary_value": 100,
             "secondary_1_stat": "Speed", "secondary_1_value": 10},
            {"game_id": "m2", "slot": "Arrow", "level": 15, "set_name": "Speed",
             "primary_stat": "Speed", "primary_value": 30,
             "secondary_1_stat": "Speed", "secondary_1_value": 12},
            {"game_id": "m3", "slot": "Diamond", "level": 15, "set_name": "Health",
             "primary_stat": "Health", "primary_value": 100,
             "secondary_1_stat": "Offense %", "secondary_1_value": 5},
            {"game_id": "m4", "slot": "Triangle", "level": 15, "set_name": "Offense",
             "primary_stat": "Offense %", "primary_value": 5,
             "secondary_1_stat": "Speed", "secondary_1_value": 8},
            {"game_id": "m5", "slot": "Circle", "level": 15, "set_name": "Health",
             "primary_stat": "Health", "primary_value": 100,
             "secondary_1_stat": "Potency %", "secondary_1_value": 3},
            {"game_id": "m6", "slot": "Cross", "level": 15, "set_name": "Tenacity",
             "primary_stat": "Tenacity %", "primary_value": 10,
             "secondary_1_stat": "Speed", "secondary_1_value": 9},
        ]
        kyber = {
            "sets": {"Health": 0.7, "Speed": 0.2},
            "slots": {"Arrow": {"primaries": {"Speed": 0.8, "Health": 0.2}}},
            "averages": {"Speed": 200, "Health": 10000, "Protection": 5000},
        }
        weights = {"Speed": 1.0, "Health": 0.01, "Offense": 0.5, "Potency": 0.1}
        projected = {"Speed": 220, "Health": 12000, "Protection": 6000}
        uncached = build_score(build, kyber, weights, {}, projected_stats=projected)
        metadata = {id(mod): _mod_metadata(mod) for mod in build}
        cached = build_score(build, kyber, weights, {}, projected_stats=projected,
                             mod_metadata=metadata, scoring_context=_prepare_scoring_context(kyber))
        self.assertAlmostEqual(cached, uncached, places=12)


class OptimizerScoringCalibrationTests(unittest.TestCase):
    def test_named_mod_set_share_weight_is_applied_to_fractional_distribution(self):
        mod = {
            "slot": "Square", "level": 15, "set_name": "Speed",
            "primary_stat": "Offense", "primary_value": 100,
            "_source_usage": 1000,
        }
        score = _mod_score(mod, {"sets": {"Speed": 1.0}}, {})
        self.assertEqual(score, optimizer_module.KYBER_MOD_SET_SHARE_WEIGHT)

    def test_dominant_set_missing_mod_penalty_uses_named_constant(self):
        build = [
            {"slot": slot, "level": 15, "set_name": "Health",
             "primary_stat": "Offense", "primary_value": 100,
             "_source_usage": 1000}
            for slot in ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        ]
        kyber = {"sets": {"Speed": 0.8}}
        score = build_score(build, kyber, {}, {}, projected_stats={})
        expected = -6 * 0.8 * optimizer_module.KYBER_BUILD_DOMINANT_SET_MISSING_MOD_PENALTY
        self.assertEqual(score, expected)

    def test_primary_mismatch_penalty_uses_named_constant(self):
        build = [{
            "slot": "Arrow", "level": 15, "set_name": "Health",
            "primary_stat": "Health", "primary_value": 5,
            "_source_usage": 1000,
        }]
        kyber = {"slots": {"Arrow": {"primaries": {"Speed": 0.8, "Offense": 0.2}}}}
        score = build_score(build, kyber, {}, {}, projected_stats={})
        self.assertEqual(score, -0.8 * optimizer_module.KYBER_BUILD_PRIMARY_MISMATCH_PENALTY)


class OptimizerProfileResolutionTests(unittest.TestCase):
    def test_profile_base_stats_equal_current_minus_mod_stat_diffs(self):
        path = Path(__file__).resolve().parents[1] / "python" / "optimizer_profiles.json"
        profiles = json.loads(path.read_text(encoding="utf-8"))
        checked = 0
        for base_id, profile in profiles.items():
            base = profile.get("base_stats") or {}
            current = profile.get("current_stats") or {}
            diffs = profile.get("mod_stat_diffs") or {}
            for stat, mod_delta in diffs.items():
                if stat not in base or stat not in current:
                    continue
                with self.subTest(base_id=base_id, stat=stat):
                    residual = float(current[stat]) - float(base[stat]) - float(mod_delta)
                    self.assertAlmostEqual(residual, 0.0, delta=1e-6)
                    checked += 1
        self.assertGreater(checked, 0, "profile dataset must contain comparable mod deltas")

    def test_resolves_profile_by_base_id_even_when_name_differs(self):
        profiles = {
            "APPO": {"base_id": "APPO", "name": 'CC-1119 "Appo"',
                     "base_stats": {"Speed": 150, "Health": 1000}}
        }
        self.assertEqual(
            resolve_character_base_stats(profiles, "appo", "Appo"),
            {"Speed": 150, "Health": 1000},
        )

    def test_resolves_name_after_unicode_and_punctuation_normalization(self):
        profiles = {
            "UNIT_A": {"base_id": "UNIT_A", "name": "Chirrut Îmwe",
                       "base_stats": {"Speed": 120}}
        }
        self.assertEqual(
            resolve_character_base_stats(profiles, "", "Chirrut-Imwe"),
            {"Speed": 120},
        )

    def test_explicit_unknown_base_id_never_falls_back_to_matching_name(self):
        profiles = {
            "UNIT_A": {"base_id": "UNIT_A", "name": "Chirrut Îmwe",
                       "base_stats": {"Speed": 120}}
        }
        self.assertEqual(
            resolve_character_base_stats(profiles, "WRONG_ID", "Chirrut-Imwe"),
            {},
        )

    def test_ignores_empty_profile_and_refuses_ambiguous_name(self):
        profiles = {
            "EMPTY": {"base_id": "EMPTY", "name": "No Stats", "base_stats": {}},
            "A": {"base_id": "A", "name": "Duplicate Hero", "base_stats": {"Speed": 100}},
            "B": {"base_id": "B", "name": "Duplicate-Hero", "base_stats": {"Speed": 110}},
        }
        self.assertEqual(resolve_character_base_stats(profiles, "EMPTY", "No Stats"), {})
        self.assertEqual(resolve_character_base_stats(profiles, "", "Duplicate Hero"), {})


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
        self.assertEqual(normalize_slot("8"), "8")
        self.assertEqual(normalize_slot("12"), "12")

    def test_set_aliases_and_numeric_ids(self):
        self.assertEqual(normalize_set("speed"), "Speed")
        self.assertEqual(normalize_set("Crit Damage"), "Critical Damage")
        self.assertEqual(normalize_set("4"), "Speed")
        self.assertIsNone(normalize_set("9"))
        self.assertIsNone(normalize_set("10"))
        self.assertIsNone(normalize_set("11"))
        self.assertIsNone(normalize_set(""))

    def test_slot_field_aliases(self):
        self.assertEqual(mod_slot_value({"slotId": 3}), 3)
        self.assertEqual(mod_slot_value({"mod_slot": "Cross"}), "Cross")
        self.assertIsNone(mod_slot_value("not a mod"))
        normalized = optimizer_module._normalized_mod({
            "definitionId": "111", "set": "Health", "level": 15,
            "primary_stat": "Speed", "primary_value": 10,
        })
        self.assertEqual(normalized["slot"], "Square")
        self.assertEqual(optimizer_module._normalized_mod({"definitionId": "112", "slot_id": 2})["slot"], "Arrow")
        self.assertEqual(optimizer_module._normalized_mod({"slot_id": 7})["slot"], "Cross")
        self.assertFalse(optimizer_module._normalized_mod({
            "set_name": "Health", "slot": "Square", "level": 16,
            "primary_stat": "Health", "primary_value": 10,
        })["complete"])

    def test_empty_mod_list_has_clear_error(self):
        with self.assertRaisesRegex(RuntimeError, "Aucun mod disponible"):
            optimize_kyber([])

    def test_missing_slot_has_diagnostic_error(self):
        one_mod = [{"id": "only", "slot": "Square", "set": "Speed", "primary_stat": "Speed", "primary_value": 10}]
        with self.assertRaisesRegex(RuntimeError, "données incomplètes"):
            optimize_kyber(one_mod, kyber={}, base_stats={})

    def test_six_slot_build_keeps_mods_without_explicit_source_ids_distinct(self):
        mods = [_realistic_mod(slot, "Speed") for slot in
                ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")]
        builds = optimize_kyber(
            mods, base_stats=TEST_BASE_PROFILE["base_stats"], base_profile=TEST_BASE_PROFILE,
            kyber={}, number_of_builds=1, limit_per_slot=1,
        )
        self.assertEqual(len(builds), 1)
        self.assertEqual(len(builds[0]["build"]), 6)
        self.assertEqual({mod["slot"] for mod in builds[0]["build"]},
                         {"Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross"})

    def test_nominal_six_slot_build(self):
        mods = [
            _realistic_mod(slot, "Speed", game_id=slot)
            for slot in ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        ]
        mods.append({
            **_realistic_mod("Square", "Speed", game_id="incomplete-duplicate"),
            "level": None,
        })
        builds = optimize_kyber(
            mods, base_stats=TEST_BASE_PROFILE["base_stats"], base_profile=TEST_BASE_PROFILE,
            kyber={}, number_of_builds=1, limit_per_slot=1,
        )
        self.assertEqual(len(builds), 1)
        self.assertEqual(len(builds[0]["build"]), 6)
        self.assertNotIn("incomplete-duplicate", {mod.get("id") for mod in builds[0]["build"]})

    def test_impossible_kyber_set_plan_falls_back_to_best_available_build(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        sets = ("Health", "Offense", "Defense", "Potency", "Tenacity", "Speed")
        mods = [_realistic_mod(slot, set_name, game_id=slot)
                for slot, set_name in zip(slots, sets)]
        kyber = {"specific_sets": [{"name": "Health x6", "counts": {"Health": 6}, "weight": 1.0}]}
        builds = optimize_kyber(
            mods, base_stats=TEST_BASE_PROFILE["base_stats"], base_profile=TEST_BASE_PROFILE,
            kyber=kyber, number_of_builds=1, limit_per_slot=1,
        )
        self.assertEqual(len(builds), 1)
        self.assertEqual(len(builds[0]["build"]), 6)
        self.assertEqual(builds[0]["set_plan"], {})

    def test_available_kyber_set_plan_is_kept_as_hard_constraint(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        mods = [_realistic_mod(slot, "Speed", game_id=slot) for slot in slots]
        kyber = {"specific_sets": [{"name": "Speed x6", "counts": {"Speed": 6}, "weight": 1.0}]}
        builds = optimize_kyber(
            mods, base_stats=TEST_BASE_PROFILE["base_stats"], base_profile=TEST_BASE_PROFILE,
            kyber=kyber, number_of_builds=1, limit_per_slot=1,
        )
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0]["set_plan"], {"Speed": 6})

    def test_realistic_high_gac_usage_counts_keep_distinct_logarithmic_ranks(self):
        counts = (34_000, 100_000, 800_000)
        preferences = [optimizer_module._donor_usage_preference(value) for value in counts]
        self.assertGreater(preferences[0], preferences[1])
        self.assertGreater(preferences[1], preferences[2])
        self.assertEqual(len(set(round(value, 6) for value in preferences)), 3)

        mods = [_realistic_mod("Square", "Speed", game_id=str(value),
                               speed=10, source_usage=value) for value in counts]
        scores = [_mod_score(mod, {}, {"Speed": 1.0}) for mod in mods]
        self.assertGreater(scores[0], scores[1])
        self.assertGreater(scores[1], scores[2])

    def test_lower_gac_usage_donor_is_preferred_after_mod_fit(self):
        low_use = _realistic_mod("Square", "Speed", game_id="low-use", speed=10, source_usage=5)
        high_use = _realistic_mod("Square", "Speed", game_id="high-use", speed=10, source_usage=900)
        weights = {"Speed": 1.0}
        self.assertGreater(
            _mod_score(low_use, {}, weights),
            _mod_score(high_use, {}, weights),
            "A less-used GAC donor should rank ahead when mod fit is otherwise equal",
        )
        build_low = [low_use]
        build_high = [high_use]
        base_stats = TEST_BASE_PROFILE["base_stats"]
        low_projection = final_stats(build_low, base_stats, TEST_BASE_PROFILE)
        high_projection = final_stats(build_high, base_stats, TEST_BASE_PROFILE)
        self.assertGreater(
            build_score(build_low, {}, weights, base_stats, TEST_BASE_PROFILE, projected_stats=low_projection),
            build_score(build_high, {}, weights, base_stats, TEST_BASE_PROFILE, projected_stats=high_projection),
        )

    def test_seigneur_speed_floor_filters_builds_and_retries_without_kyber_set_plan(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        mods = []
        for slot in slots:
            mods.append(_realistic_mod(slot, "Health", game_id=f"slow-{slot}", speed=2))
            mods.append(_realistic_mod(slot, "Speed", game_id=f"fast-{slot}", speed=10))
        kyber = {"sets": {"Health": 1.0},
                 "specific_sets": [{"name": "Health x6", "counts": {"Health": 6}, "weight": 1.0}]}
        builds = optimize_kyber(
            mods, base_stats=TEST_BASE_PROFILE["base_stats"], base_profile=TEST_BASE_PROFILE,
            kyber=kyber, number_of_builds=3, limit_per_slot=2, minimum_speed=160,
        )
        self.assertTrue(builds)
        self.assertTrue(all(item["stats"]["Speed"] >= 160 for item in builds))
        self.assertTrue(all(item["set_plan"] == {} for item in builds))

    def test_seigneur_speed_safe_build_is_not_pruned_by_higher_scoring_unsafe_builds(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        mods = []
        for slot in slots:
            mods.append(_realistic_mod(slot, "Health", game_id=f"unsafe-{slot}", speed=2))
            mods.append(_realistic_mod(slot, "Speed", game_id=f"safe-{slot}", speed=10))

        def controlled_projections(builds, base_stats, base_profile, required_stats=None):
            return [
                {"Speed": 170 if all(str(mod.get("game_id", "")).startswith("safe-") for mod in build) else 150}
                for build in builds
            ]

        def controlled_score(build, kyber, weights, base_stats, base_profile,
                             projected_stats=None, mod_metadata=None, scoring_context=None):
            return 1 if projected_stats["Speed"] >= 160 else 100

        with mock.patch.object(optimizer_module, "final_stats_many", side_effect=controlled_projections):
            with mock.patch.object(optimizer_module, "build_score", side_effect=controlled_score):
                builds = optimize_kyber(
                    mods, base_stats=TEST_BASE_PROFILE["base_stats"], base_profile=TEST_BASE_PROFILE,
                    kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=40, minimum_speed=160,
                )

        self.assertTrue(builds)
        self.assertEqual(builds[0]["stats"]["Speed"], 170)
        self.assertTrue(all(
            str(mod.get("game_id", "")).startswith("safe-")
            for mod in builds[0]["build"]
        ))

    def test_seigneur_speed_floor_reports_when_no_safe_build_exists(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        mods = [_realistic_mod(slot, "Health", game_id=slot, speed=2) for slot in slots]
        with self.assertRaisesRegex(RuntimeError, "Vitesse actuelle :"):
            optimize_kyber(
                mods, base_stats=TEST_BASE_PROFILE["base_stats"], base_profile=TEST_BASE_PROFILE,
                kyber={}, number_of_builds=3, limit_per_slot=1, minimum_speed=200,
            )

    def test_speed_set_bonus_is_ten_percent_of_base_speed(self):
        build = [
            _realistic_mod(slot, "Speed", game_id=f"speed-{slot}")
            for slot in ("Square", "Arrow", "Diamond", "Triangle")
        ]
        stats = final_stats(build, TEST_BASE_PROFILE["base_stats"], TEST_BASE_PROFILE)
        self.assertAlmostEqual(stats["Speed"], 100 + 30 + 4 * 4 + 10)

    def test_critical_damage_set_bonus_is_thirty_percentage_points(self):
        build = [
            _realistic_mod(slot, "Critical Damage", game_id=f"crit-{slot}")
            for slot in ("Square", "Arrow", "Diamond", "Circle")
        ]
        stats = final_stats(build, TEST_BASE_PROFILE["base_stats"], TEST_BASE_PROFILE)
        self.assertAlmostEqual(stats["Critical Damage"], 1.80)

    def test_partial_set_plan_rejects_excess_sets(self):
        build = [{"set": "Health"}, {"set": "Health"}]
        self.assertFalse(_partial_matches_set_plan(build, {"Speed": 6}))
        self.assertTrue(_partial_matches_set_plan(build[:1], {"Health": 2, "Speed": 4}))


    def test_set_plan_matching_reuses_pre_normalized_candidate_set_names(self):
        build = [
            {"set_name": "Speed", "set": "not-used-by-fast-path"},
            {"set_name": "Health", "set": "not-used-by-fast-path"},
        ]
        plan = {"Speed": 1, "Health": 1}
        with mock.patch.object(
            optimizer_module, "normalize_set",
            side_effect=AssertionError("set was normalized again during beam expansion"),
        ):
            self.assertTrue(optimizer_module._partial_matches_set_plan(build[:1], plan))
            self.assertTrue(optimizer_module._matches_set_plan(build, plan))
            self.assertFalse(optimizer_module._partial_matches_set_plan(
                build + [{"set_name": "Speed"}], plan
            ))

    def test_set_plan_matching_keeps_legacy_normalization_fallback(self):
        build = [{"set": "Speed"}, {"set": "Health"}]
        self.assertTrue(optimizer_module._matches_set_plan(
            build, {"Speed": 1, "Health": 1}
        ))

if __name__ == "__main__":
    unittest.main()
