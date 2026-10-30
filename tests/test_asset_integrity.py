"""Regression checks for the live GAC catalogue and versioned PWA assets."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AssetIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.sw = (ROOT / "sw.js").read_text(encoding="utf-8")
        cls.blue_html = (ROOT / "blue-gac" / "index.html").read_text(encoding="utf-8")
        cls.blue_js = (ROOT / "blue-gac" / "blue-gac.js").read_text(encoding="utf-8")
        cls.blue_css = (ROOT / "blue-gac" / "blue-gac.css").read_text(encoding="utf-8")
        cls.catalog = (ROOT / "blue-gac" / "gac-catalog.json").read_text(encoding="utf-8")
        section = cls.sw.split("const STATIC_ASSETS = [", 1)[1].split("];", 1)[0]
        cls.cached_assets = {
            value.removeprefix("./")
            for value in re.findall(r"""['"]([^'"]+)['"]""", section)
        }

    def test_local_stylesheets_and_scripts_are_pre_cached_at_exact_versions(self):
        refs = re.findall(r'<link\\b[^>]*\\brel=["\\']stylesheet["\\'][^>]*\\bhref=["\\']([^"\\']+)', self.html, re.I)
        refs += re.findall(r'<script\\b[^>]*\\bsrc=["\\']([^"\\']+)', self.html, re.I)
        refs += ["blue-gac/" + ref for ref in re.findall(r'<link\\b[^>]*\\brel=["\\']stylesheet["\\'][^>]*\\bhref=["\\']([^"\\']+)', self.blue_html, re.I)]
        refs += ["blue-gac/" + ref for ref in re.findall(r'<script\\b[^>]*\\bsrc=["\\']([^"\\']+)', self.blue_html, re.I)]
        local_refs = [ref.removeprefix("./") for ref in refs if "://" not in ref]
        missing = sorted(set(local_refs) - self.cached_assets)
        self.assertEqual(missing, [], f"Local assets absent or version-mismatched in sw.js: {missing}")

    def test_catalogue_is_versioned_and_network_first_in_pwa(self):
        self.assertIn("holocron-static-v4.1.0-live-gac", self.sw)
        self.assertIn("blue-gac/gac-catalog.json?v=4.1.0", self.sw)
        self.assertIn("url.pathname.endsWith('/blue-gac/gac-catalog.json')", self.sw)
        self.assertIn("fetch(request).then(response =>", self.sw)
        self.assertIn('"schemaVersion": 1', self.catalog)

    def test_blue_gac_loads_dynamic_catalogue_and_keeps_padawan_constraints(self):
        for value in ('data-mode="3v3"', 'data-mode="5v5"',
                      'data-access="Padawan"', 'data-access="Maître Jedi"',
                      'data-tier="Kyber"', 'data-tier="Aurodium"',
                      'data-tier="Chromium"', 'data-tier="Bronzium"',
                      'data-tier="Carbonite"'):
            self.assertIn(value, self.blue_html)
        self.assertIn("fetch('gac-catalog.json?v=4.1.0'", self.blue_js)
        self.assertIn("t.league===state.tier", self.blue_js)
        self.assertIn("t.members.map(canonicalName)", self.blue_js)
        self.assertIn("members.some(function(m){return used.has(m);})", self.blue_js)
        self.assertIn("Number(b.battles||0)-Number(a.battles||0)", self.blue_js)
        self.assertNotIn("var publicTeams=[", self.blue_js)
        self.assertNotIn("sourceLeague:(Number(t.season)", self.blue_js)
        self.assertIn("font-size:max(13px", self.blue_css)
        self.assertIn("V4.1.0", self.blue_html)

    def test_catalogue_source_is_not_silently_replaced_with_static_teams(self):
        self.assertIn("gac-catalog.json", self.blue_js)
        self.assertIn("aucune ancienne composition", self.blue_js.lower())
        self.assertIn("gac-catalog.json", self.blue_html)


if __name__ == "__main__":
    unittest.main()
