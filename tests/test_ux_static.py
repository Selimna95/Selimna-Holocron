"""Static UX regression checks for the Holocron shell.

These tests protect navigation and empty-state clarity without requiring a browser.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class HolocronUxRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.runtime = (ROOT / "modules" / "runtime.js").read_text(encoding="utf-8")
        cls.adapter = (ROOT / "interface-adapter.js").read_text(encoding="utf-8")
        cls.styles = (ROOT / "holocron-system.css").read_text(encoding="utf-8")

    def test_codex_navigation_points_to_real_page(self):
        self.assertIn('data-page="data"', self.html)
        self.assertRegex(self.html, r'<section\s+id="data"\s+class="page"')
        self.assertNotIn("if(page==='data') page='dashboard';", self.runtime)

    def test_codex_is_not_globally_hidden(self):
        self.assertNotRegex(
            self.styles,
            r'\.roster-codex-ui\s*,\s*#data\.page\s*\{\s*display:\s*none\s*!important',
        )

    def test_profile_absence_is_not_presented_as_zero(self):
        self.assertIn("const hasRoster=chars.length>0 || ships.length>0 || allMods.length>0;", self.adapter)
        self.assertIn("const emptyLabel=hasRoster ? '0' : '—';", self.adapter)
        self.assertIn("Synchronise ton profil pour afficher la répartition du roster.", self.adapter)

    def test_navigation_announces_current_page(self):
        self.assertIn("x.setAttribute('aria-current','page')", self.runtime)
        self.assertIn("x.removeAttribute('aria-current')", self.runtime)

    def test_network_requests_have_timeout(self):
        core = (ROOT / "modules" / "core.js").read_text(encoding="utf-8")
        self.assertIn("timeoutMs=20000", core)
        self.assertIn("Délai dépassé après", core)


if __name__ == "__main__":
    unittest.main()
