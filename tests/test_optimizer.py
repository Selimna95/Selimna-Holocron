import unittest
import json
import python.optimizer as optimizer_module

# This lightweight bridge isolates Python search behavior only; the real
# JavaScript/Pyodide bridge and formulas are exercised in mod_engine_pyodide.test.mjs.

def _test_engine_bridge(base_json, mods_json, level):
    source = json.loads(base_json)
    base = source.get("base_stats", source) if isinstance(source, dict) else {}
    result = dict(base)
    mods = json.loads(mods_json)
    totals = {}
    sets = {}
    levels = {}
    missing = []
    for mod in mods:
        set_name = optimizer_module.mod_set(mod)
        if not set_name:
            missing.append("set:unknown")
        else:
            sets[set_name] = sets.get(set_name, 0) + 1
            levels.setdefault(set_name, []).append(int(mod.get("level") or 0))
        if mod.get("level") is None:
            missing.append("mod:level_unknown")
        if not mod.get("primary_stat") or mod.get("primary_value") is None:
            missing.append("mod:primary_incomplete")
        entries = [(mod.get("primary_stat"), mod.get("primary_value"))]
        entries += [(mod.get(f"secondary_{i}_stat"), mod.get(f"secondary_{i}_value")) for i in range(1, 5)]
        for name, value in entries:
            if not name or value is None:
                continue
            key = str(name).strip()
            totals[key] = totals.get(key, 0.0) + float(value)
    base_speed = float(base.get("Speed", 0))
    result["Speed"] = base_speed + totals.get("Speed", 0)
    result["Speed"] += base_speed * totals.get("Speed %", 0) / 100
    if sets.get("Speed", 0) >= 4:
        result["Speed"] += int(base_speed * (0.10 if all(x >= 15 for x in sorted(levels["Speed"], reverse=True)[:4]) else 0.05))
    if "Critical Damage" in result and sets.get("Critical Damage", 0) >= 4:
        result["Critical Damage"] += 0.30 if all(x >= 15 for x in sorted(levels["Critical Damage"], reverse=True)[:4]) else 0.15
    return json.dumps({"complete": not missing, "stats": result, "missing": sorted(set(missing))})

def _test_normalize_bridge(mod_json):
    mod = json.loads(mod_json)
    raw_set = mod.get("set_name", mod.get("set", mod.get("setId")))
    set_names = {
        "1": "Health", "2": "Offense", "3": "Defense", "4": "Speed",
        "5": "Critical Chance", "6": "Critical Damage", "7": "Potency", "8": "Tenacity",
        "health": "Health", "offense": "Offense", "defense": "Defense", "speed": "Speed",
        "crit chance": "Critical Chance", "critical chance": "Critical Chance",
        "crit damage": "Critical Damage", "critical damage": "Critical Damage",
        "potency": "Potency", "tenacity": "Tenacity",
    }
    set_value = set_names.get(str(raw_set or "").casefold(), set_names.get(str(raw_set or "")))
    def stat(name, value):
        if not name:
            return None
        text = str(name).strip()
        is_percent = text.endswith("%")
        clean = text[:-1].strip() if is_percent else text
        key = clean.replace(" ", "").casefold()
        aliases = {"critchance": "criticalChance", "critdamage": "criticalDamage"}
        key = aliases.get(key, key)
        flat_keys = {"health", "protection", "speed", "offense", "defense"}
        unit = "percentagePoints" if is_percent else ("flat" if key in flat_keys else "unknown")
        return {
            "key": key, "name": clean, "unit": unit,
            "value": float(value) if value is not None else None
        }
    primary = stat(mod.get("primary_stat"), mod.get("primary_value"))
    secondaries = []
    for i in range(1, 5):
        item = stat(mod.get(f"secondary_{i}_stat"), mod.get(f"secondary_{i}_value"))
        if item:
            secondaries.append(item)
    raw_slot = mod.get("slot", mod.get("slot_id", mod.get("slotId")))
    slot_names = {
        "1": "Square", "2": "Arrow", "3": "Diamond", "4": "Triangle", "5": "Circle", "6": "Cross",
        "7": "Square", "8": "Arrow", "9": "Diamond", "10": "Triangle", "11": "Circle", "12": "Cross",
        "square": "Square", "arrow": "Arrow", "diamond": "Diamond",
        "triangle": "Triangle", "circle": "Circle", "cross": "Cross"
    }
    slot_text = str(raw_slot or "").strip()
    slot_key = slot_text.casefold().removeprefix("slot_")
    slot_value = slot_names.get(slot_key, slot_text or None)
    complete = bool(
        set_value and mod.get("level") is not None and primary
        and primary.get("value") is not None and primary.get("unit") in {"flat", "percentagePoints"}
        and all(item.get("value") is not None and item.get("unit") in {"flat", "percentagePoints"} for item in secondaries)
    )
    return json.dumps({"set": set_value, "setName": set_value, "slot": slot_value,
                       "primary": primary, "secondaries": secondaries, "level": mod.get("level"),
                       "complete": complete})

optimizer_module.set_mod_engine_bridge(_test_engine_bridge, _test_normalize_bridge)

from python.optimizer import (
    normalize_slot, normalize_set, mod_slot_value, optimize_kyber, final_stats,
    _partial_matches_set_plan, _mod_score, build_score,
    resolve_character_base_stats,
)


class OptimizerProfileResolutionTests(unittest.TestCase):
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
            resolve_character_base_stats(profiles, "unknown_id", "Chirrut-Imwe"),
            {"Speed": 120},
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
            "1": "Square", "2": "Arrow", "3": "Diamond", "4": "Triangle",
            "5": "Circle", "6": "Cross", "7": "Square", "8": "Arrow",
            "9": "Diamond", "10": "Triangle", "11": "Circle", "12": "Cross",
            "slot_7": "Square", " arrow ": "Arrow",
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
        self.assertIsNone(normalize_set("9"))
        self.assertIsNone(normalize_set("10"))
        self.assertIsNone(normalize_set("11"))
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

    def test_impossible_kyber_set_plan_falls_back_to_best_available_build(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        sets = ("Health", "Offense", "Defense", "Potency", "Tenacity", "Speed")
        mods = [
            {"id": slot, "slot": slot, "set": set_name, "primary_stat": "Speed",
             "primary_value": 10, "secondary_1_stat": "Speed", "secondary_1_value": 5,
             "level": 15, "rarity": 5}
            for slot, set_name in zip(slots, sets)
        ]
        kyber = {"specific_sets": [{"name": "Health x6", "counts": {"Health": 6}, "weight": 1.0}]}
        builds = optimize_kyber(mods, base_stats={"Speed": 100, "Health": 1000}, kyber=kyber, number_of_builds=1, limit_per_slot=1)
        self.assertEqual(len(builds), 1)
        self.assertEqual(len(builds[0]["build"]), 6)
        self.assertEqual(builds[0]["set_plan"], {})

    def test_available_kyber_set_plan_is_kept_as_hard_constraint(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        mods = [
            {"id": slot, "slot": slot, "set": "Speed", "primary_stat": "Speed",
             "primary_value": 10, "secondary_1_stat": "Speed", "secondary_1_value": 5,
             "level": 15, "rarity": 5}
            for slot in slots
        ]
        kyber = {"specific_sets": [{"name": "Speed x6", "counts": {"Speed": 6}, "weight": 1.0}]}
        builds = optimize_kyber(mods, base_stats={"Speed": 100}, kyber=kyber, number_of_builds=1, limit_per_slot=1)
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0]["set_plan"], {"Speed": 6})

    def test_lower_gac_usage_donor_is_preferred_after_mod_fit(self):
        low_use = {
            "id": "low-use", "slot": "Square", "set": "Speed", "level": 15,
            "primary_stat": "Offense", "primary_value": 5.88,
            "secondary_1_stat": "Speed", "secondary_1_value": 10,
            "_source_usage": 5,
        }
        high_use = {**low_use, "id": "high-use", "_source_usage": 900}
        weights = {"Speed": 1.0}
        self.assertGreater(
            _mod_score(low_use, {}, weights),
            _mod_score(high_use, {}, weights),
            "A less-used GAC donor should rank ahead when mod fit is otherwise equal",
        )
        build_low = [low_use]
        build_high = [high_use]
        self.assertGreater(
            build_score(build_low, {}, weights, {"Speed": 100, "Physical Damage": 500, "Special Damage": 500}),
            build_score(build_high, {}, weights, {"Speed": 100, "Physical Damage": 500, "Special Damage": 500}),
        )

    def test_seigneur_speed_floor_filters_builds_and_retries_without_kyber_set_plan(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        mods = []
        for slot in slots:
            mods.append({
                "id": f"slow-{slot}", "slot": slot, "set": "Health",
                "primary_stat": "Speed", "primary_value": 0,
                "secondary_1_stat": "Speed", "secondary_1_value": 0,
                "level": 15, "rarity": 5,
            })
            mods.append({
                "id": f"fast-{slot}", "slot": slot, "set": "Speed",
                "primary_stat": "Speed", "primary_value": 0,
                "secondary_1_stat": "Speed", "secondary_1_value": 10,
                "level": 15, "rarity": 5,
            })
        kyber = {"sets": {"Health": 1.0},
                 "specific_sets": [{"name": "Health x6", "counts": {"Health": 6}, "weight": 1.0}]}
        builds = optimize_kyber(
            mods, base_stats={"Speed": 100}, kyber=kyber,
            number_of_builds=3, limit_per_slot=2, minimum_speed=160,
        )
        self.assertTrue(builds)
        self.assertTrue(all(item["stats"]["Speed"] >= 160 for item in builds))
        self.assertTrue(all(item["set_plan"] == {} for item in builds))

    def test_seigneur_speed_floor_reports_when_no_safe_build_exists(self):
        slots = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")
        mods = [{
            "id": slot, "slot": slot, "set": "Health",
            "primary_stat": "Speed", "primary_value": 0,
            "secondary_1_stat": "Speed", "secondary_1_value": 2,
            "level": 15, "rarity": 5,
        } for slot in slots]
        with self.assertRaisesRegex(RuntimeError, "Vitesse actuelle : 200.0"):
            optimize_kyber(
                mods, base_stats={"Speed": 100, "Health": 1000}, kyber={},
                number_of_builds=3, limit_per_slot=1, minimum_speed=200,
            )

    def test_speed_set_bonus_is_ten_percent_of_base_speed(self):
        build = [{"set": "Speed", "level": 15, "primary_stat": "Speed", "primary_value": 0} for _ in range(4)]
        stats = final_stats(build, {"Speed": 200})
        self.assertAlmostEqual(stats["Speed"], 220.0)

    def test_critical_damage_set_bonus_is_thirty_percentage_points(self):
        build = [{"set": "Critical Damage", "level": 15, "primary_stat": "Critical Damage %", "primary_value": 0} for _ in range(4)]
        stats = final_stats(build, {"Critical Damage": 1.50})
        self.assertAlmostEqual(stats["Critical Damage"], 1.80)

    def test_partial_set_plan_rejects_excess_sets(self):
        build = [{"set": "Health"}, {"set": "Health"}]
        self.assertFalse(_partial_matches_set_plan(build, {"Speed": 6}))
        self.assertTrue(_partial_matches_set_plan(build[:1], {"Health": 2, "Speed": 4}))


if __name__ == "__main__":
    unittest.main()
