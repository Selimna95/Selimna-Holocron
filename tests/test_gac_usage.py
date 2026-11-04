import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "update_gac_usage", Path(__file__).resolve().parents[1] / "scripts" / "update_gac_usage.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GacUsageParserTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
