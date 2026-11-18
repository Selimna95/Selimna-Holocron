"""Runtime-facing asset coherence and observed GAC catalogue data checks."""
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AssetIntegrityTests(unittest.TestCase):
    def test_local_assets_have_one_coherent_version_between_html_and_service_worker(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        blue_html = (ROOT / "blue-gac" / "index.html").read_text(encoding="utf-8")
        sw = (ROOT / "sw.js").read_text(encoding="utf-8")

        refs = re.findall(
            r"""<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)""",
            html, re.I,
        )
        refs += re.findall(r"""<script\b[^>]*\bsrc=["']([^"']+)""", html, re.I)
        refs += [
            "blue-gac/" + ref
            for ref in re.findall(
            r"""<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)""",
                blue_html, re.I,
            )
        ]
        refs += [
            "blue-gac/" + ref
        refs += re.findall(r"""<script\b[^>]*\bsrc=["']([^"']+)""", html, re.I)
        ]
        local_refs = sorted({
            ref.removeprefix("./")
            for ref in refs
            if "://" not in ref and not ref.startswith("data:")
        })

        static_section = sw.split("const STATIC_ASSETS = [", 1)[1].split("];", 1)[0]
        cached_assets = {
            value.removeprefix("./")
            for value in re.findall(r"""['"]([^'"]+)['"]""", static_section)
        }
        missing_from_cache = sorted(set(local_refs) - cached_assets)
        missing_files = sorted(
            ref for ref in local_refs
            if not (ROOT / ref.split("?", 1)[0]).is_file()
        )

        self.assertEqual(
            missing_from_cache, [],
            "Every local HTML asset must be cached under its exact versioned URL in the service worker.",
        )
        self.assertEqual(missing_files, [], "Every referenced local asset must exist on disk.")

    def test_catalogue_contains_only_observed_partial_real_team_data(self):
        data = json.loads((ROOT / "blue-gac" / "gac-catalog.json").read_text(encoding="utf-8"))
        self.assertTrue(data["updatedAt"])
        self.assertEqual(data["collectionStatus"], "partial")
        self.assertEqual(data["currentSeasons"], {"5v5": 84, "3v3": 83})
        self.assertEqual(len(data["teams"]), 60)

        expected = {
            "5v5": {"kyber": 8, "aurodium": 4, "chromium": 0, "bronzium": 8, "carbonite": 3},
            "3v3": {"kyber": 12, "aurodium": 0, "chromium": 10, "bronzium": 7, "carbonite": 8},
        }
        leagues = {"Kyber", "Aurodium", "Chromium", "Bronzium", "Carbonite"}
        for fmt, size in (("5v5", 5), ("3v3", 3)):
            self.assertEqual(set(data["seasons"][fmt]), {league.lower() for league in leagues})
            for league in leagues:
                key = league.lower()
                entries = [
                    team for team in data["teams"]
                    if team["format"] == fmt and team["league"] == league
                ]
                self.assertEqual(len(entries), expected[fmt][key])
                self.assertEqual(data["coverage"][fmt][key], len(entries))
                self.assertEqual(data["seasons"][fmt][key], [] if not entries else ([84] if fmt == "5v5" else [83]))
                for team in entries:
                    self.assertEqual(len(team["members"]), size)
                    self.assertIn("swgoh.gg", team["source"])
                    self.assertGreater(team["battles"], 0)
                    self.assertGreaterEqual(team["hold"], 0)
                    self.assertLessEqual(team["hold"], 100)
        self.assertIn("Cloudflare", data["collectionNote"])
