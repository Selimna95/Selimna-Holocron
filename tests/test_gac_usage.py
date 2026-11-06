import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "update_gac_usage", Path(__file__).resolve().parents[1] / "scripts" / "update_gac_usage.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GacUsageParserTests(unittest.TestCase):
    def test_clean_name_removes_tier_movement_badges(self):
        self.assertEqual(MODULE.clean_name("6▲3 A→S Rey"), "Rey")
        self.assertEqual(MODULE.clean_name("15▼2 S→A Darth Bane"), "Darth Bane")
        self.assertEqual(MODULE.clean_name("— Lord Vader"), "Lord Vader")

    def test_reader_http_200_cloudflare_block_is_rejected(self):
        from unittest.mock import patch

        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return b"Target URL returned error 403: Forbidden"

        with patch.object(MODULE, "urlopen", return_value=Response()), patch.object(MODULE.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "Cannot fetch"):
                MODULE.fetch("https://swgoh.gg/tier-list/units/")

    def test_build_keeps_last_good_snapshot_when_live_source_is_blocked(self):
        import json
        import tempfile
        from datetime import datetime, timedelta, timezone
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory) / "gac-usage.json"
            export = Path(directory) / "missing-export.json"
            previous = {
                "schemaVersion": 1, "source": "SWGOH.GG browser session",
                "sourceStatus": "observed", "evidenceType": "unit-usage",
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "seasons": [{"season": 84, "characters": {"Rey": {"uses": 120, "byFormat": {"5v5": 120}}}, "ships": {}, "fleets": []}]
            }
            snapshot.write_text(json.dumps(previous), encoding="utf-8")
            with patch.object(MODULE, "JSON_OUTPUT", snapshot), patch.object(MODULE, "BROWSER_EXPORT", export), patch.object(MODULE, "build_live", side_effect=RuntimeError("HTTP 403")):
                result = MODULE.build()
            self.assertEqual(result["sourceStatus"], "observed")
            self.assertEqual(result["seasons"][0]["characters"]["Rey"]["uses"], 120)
            self.assertIn("403", result["lastRefreshError"])

    def test_stale_last_good_snapshot_is_retained_but_marked_stale(self):
        import json
        import tempfile
        from datetime import datetime, timedelta, timezone
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory) / "gac-usage.json"
            export = Path(directory) / "missing-export.json"
            old_date = (datetime.now(timezone.utc) - timedelta(days=MODULE.FRESHNESS_DAYS + 1)).isoformat()
            snapshot.write_text(json.dumps({
                "schemaVersion": 1, "updatedAt": old_date,
                "seasons": [{"season": 84, "characters": {"Rey": {"uses": 120}}, "ships": {}, "fleets": []}]
            }), encoding="utf-8")
            with patch.object(MODULE, "JSON_OUTPUT", snapshot), patch.object(MODULE, "BROWSER_EXPORT", export), patch.object(MODULE, "build_live", side_effect=RuntimeError("HTTP 403")):
                result = MODULE.build()
            self.assertEqual(result["sourceStatus"], "stale")
            self.assertEqual(result["seasons"][0]["characters"]["Rey"]["uses"], 120)

    def test_unit_rows_keep_name_and_split_counts_by_role(self):
        text = """
# Leaders — best squad anchors
1▲2 Supreme Leader Kylo Ren 5s Offense 1496 Rating 238K battles
# Members — best squad pieces
1— Rey (Dark Side Vision) 5s Defense 1821 Rating 483K battles
"""
        parsed = MODULE.parse_unit_page(text, "5v5", "offense")
        self.assertEqual(parsed["Supreme Leader Kylo Ren"]["uses"], 238000)
        self.assertEqual(parsed["Supreme Leader Kylo Ren"]["roles"], {"leader": 238000})
        self.assertNotIn("Rey (Dark Side Vision)", parsed)

    def test_unit_parser_preserves_member_and_side_dimension(self):
        text = """
## Members — best squad pieces
11▲1 CC-1119 "Appo" 3s Offense 1543 Rating 451K battles
"""
        parsed = MODULE.parse_unit_page(text, "3v3", "offense")
        self.assertEqual(parsed['CC-1119 "Appo"']["uses"], 451000)
        self.assertEqual(parsed['CC-1119 "Appo"']["byFormat"], {"3v3": 451000})
        self.assertEqual(parsed['CC-1119 "Appo"']["bySide"], {"offense": 451000})
        self.assertEqual(parsed['CC-1119 "Appo"']["roles"], {"member": 451000})

    def test_fleet_parser_counts_only_observed_ships(self):
        text = """
Image: Executor
Image: Hound's Tooth
Image: Razor Crest
Image: IG-2000
Image: Slave I
Image: TIE Dagger
Battles 12.4K
#1
"""
        fleets = MODULE.parse_fleet_page(text, "offense")
        self.assertEqual(len(fleets), 1)
        self.assertEqual(fleets[0]["uses"], 12400)
        self.assertEqual(fleets[0]["ships"], ["Executor", "Hound's Tooth", "Razor Crest", "IG-2000", "Slave I", "TIE Dagger"])

    def test_browser_export_import_aggregates_only_observed_records(self):
        import json
        import tempfile
        from unittest.mock import patch

        views = []
        for fmt in ("5v5", "3v3"):
            for side in ("offense", "defense"):
                for league in MODULE.LEAGUES:
                    views.append({
                        "format": fmt, "side": side, "league": league,
                        "season": 84 if fmt == "5v5" else 83,
                        "url": "https://swgoh.gg/tier-list/units/",
                        "rows": [
                            {"name": f"Character {i}", "battles": 100 + i, "role": "member"}
                            for i in range(8)
                        ],
                    })
        fleet_views = [
            {"side": side, "league": league, "season": 84, "url": "https://swgoh.gg/tier-list/fleet/", "fleets": []}
            for side in MODULE.SIDES for league in MODULE.LEAGUES
        ]
        fleet_views[0]["fleets"] = [{
            "rank": 1, "battles": 250, "ships": ["Executor", "Hound's Tooth", "Razor Crest", "Punishing One"]
        }]
        payload = {
            "schemaVersion": 1, "source": "SWGOH.GG browser session",
            "collectedAt": "2026-11-04T10:00:00Z",
            "views": views, "fleetViews": fleet_views,
        }
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as handle:
            json.dump(payload, handle)
            handle.flush()
            with patch.object(MODULE, "BROWSER_EXPORT", Path(handle.name)):
                result = MODULE.build_from_browser_export()

        season_5v5 = next(item for item in result["seasons"] if item["season"] == 84)
        self.assertEqual(season_5v5["characters"]["Character 0"]["uses"], 10 * 100)
        self.assertEqual(season_5v5["ships"]["Executor"]["uses"], 250)
        self.assertNotIn("Unobserved Ship", season_5v5["ships"])
        self.assertEqual(len(result["coverage"]), 20)

    def test_build_uses_fresh_browser_export_after_live_403(self):
        import json
        import tempfile
        from datetime import datetime, timezone
        from unittest.mock import patch

        views = []
        for fmt in ("5v5", "3v3"):
            for side in MODULE.SIDES:
                for league in MODULE.LEAGUES:
                    views.append({
                        "format": fmt, "side": side, "league": league,
                        "season": 84 if fmt == "5v5" else 83,
                        "url": "https://swgoh.gg/tier-list/units/",
                        "rows": [{"name": f"Character {i}", "battles": 100 + i, "role": "member"} for i in range(8)]
                    })
        fleet_views = [
            {"side": side, "league": league, "season": 84, "url": "https://swgoh.gg/tier-list/fleet/", "fleets": []}
            for side in MODULE.SIDES for league in MODULE.LEAGUES
        ]
        payload = {
            "schemaVersion": 1, "source": "SWGOH.GG browser session",
            "collectedAt": datetime.now(timezone.utc).isoformat(),
            "views": views, "fleetViews": fleet_views,
        }
        with tempfile.TemporaryDirectory() as directory:
            export = Path(directory) / "gac-browser-export.json"
            output = Path(directory) / "gac-usage.json"
            export.write_text(json.dumps(payload), encoding="utf-8")
            with patch.object(MODULE, "BROWSER_EXPORT", export), patch.object(MODULE, "JSON_OUTPUT", output), patch.object(MODULE, "build_live", side_effect=RuntimeError("HTTP 403")):
                result = MODULE.build()
        self.assertEqual(result["sourceStatus"], "observed")
        self.assertEqual(result["evidenceType"], "unit-usage")
        self.assertEqual(result["currentSeasons"], {"5v5": 84, "3v3": 83, "fleet": 84})
        self.assertIn("403", result["fallbackReason"])
        self.assertGreater(len(result["seasons"][0]["characters"]), 0)

    def test_browser_export_rejects_mixed_seasons_within_format(self):
        import json
        import tempfile
        from unittest.mock import patch

        views = []
        for fmt in ("5v5", "3v3"):
            for side in MODULE.SIDES:
                for league in MODULE.LEAGUES:
                    views.append({
                        "format": fmt, "side": side, "league": league,
                        "season": 84 if fmt == "5v5" else 83,
                        "url": "https://swgoh.gg/tier-list/units/",
                        "rows": [{"name": f"Character {i}", "battles": 100 + i} for i in range(8)]
                    })
        views[1]["season"] = 82
        fleet_views = [
            {"side": side, "league": league, "season": 84, "url": "https://swgoh.gg/tier-list/fleet/", "fleets": []}
            for side in MODULE.SIDES for league in MODULE.LEAGUES
        ]
        payload = {"schemaVersion": 1, "source": "SWGOH.GG browser session", "views": views, "fleetViews": fleet_views}
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as handle:
            json.dump(payload, handle)
            handle.flush()
            with patch.object(MODULE, "BROWSER_EXPORT", Path(handle.name)):
                with self.assertRaisesRegex(ValueError, "Inconsistent 5v5 seasons"):
                    MODULE.build_from_browser_export()

    def test_browser_export_rejects_missing_views(self):
        import json
        import tempfile
        from unittest.mock import patch

        payload = {
            "schemaVersion": 1, "source": "SWGOH.GG browser session",
            "views": [], "fleetViews": [],
        }
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as handle:
            json.dump(payload, handle)
            handle.flush()
            with patch.object(MODULE, "BROWSER_EXPORT", Path(handle.name)):
                with self.assertRaisesRegex(ValueError, "missing 20 character views"):
                    MODULE.build_from_browser_export()


    def test_browser_export_accepts_character_only_collection_and_marks_fleets_missing(self):
        import json
        import tempfile
        from unittest.mock import patch

        views = []
        for fmt in ("5v5", "3v3"):
            for side in MODULE.SIDES:
                for league in MODULE.LEAGUES:
                    views.append({
                        "format": fmt, "side": side, "league": league,
                        "season": 84 if fmt == "5v5" else 83,
                        "url": "https://swgoh.gg/tier-list/units/",
                        "rows": [
                            {"name": "— Lord Vader" if i == 0 else f"Character {i}",
                             "battles": 100 + i, "role": "leader" if i == 0 else "member"}
                            for i in range(8)
                        ],
                    })
        payload = {
            "schemaVersion": 1, "source": "SWGOH.GG browser session",
            "collectedAt": "2026-11-06T12:15:23.516Z",
            "seasons": {"5v5": 84, "3v3": 83, "fleet": 84},
            "views": views,
        }
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json") as handle:
            json.dump(payload, handle)
            handle.flush()
            with patch.object(MODULE, "BROWSER_EXPORT", Path(handle.name)):
                result = MODULE.build_from_browser_export()

        season_5v5 = next(item for item in result["seasons"] if item["season"] == 84)
        self.assertIn("Lord Vader", season_5v5["characters"])
        self.assertNotIn("— Lord Vader", season_5v5["characters"])
        self.assertEqual(result["currentSeasons"], {"5v5": 84, "3v3": 83, "fleet": 84})
        self.assertEqual(result["fleetCoverageStatus"], "not-collected")
        self.assertFalse(season_5v5["ships"])
        self.assertTrue(any(item.get("format") == "fleet" and item.get("status") == "not-collected"
                            for item in result["coverage"]))


if __name__ == "__main__":
    unittest.main()
