"""Regression checks for the new guided Visionnaire module."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class VisionnaireContractTests(unittest.TestCase):
    def test_old_sithari_runtime_is_removed(self):
        for path in ("modules/sithari.js", "modules/sithari-strategy.js",
                     "sithari.css", "sithari-strategy.css"):
            self.assertFalse((ROOT / path).exists(), path)
        for path in ("index.html", "modules/runtime.js", "sw.js"):
            content = (ROOT / path).read_text(encoding="utf-8").lower()
            self.assertNotIn("sithari", content, path)

    def test_visionnaire_is_the_active_page_and_asset(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        sw = (ROOT / "sw.js").read_text(encoding="utf-8")
        self.assertIn('id="visionnaire"', html)
        self.assertIn('data-page="visionnaire"', html)
        self.assertIn("modules/visionnaire.js?v=4.1.39-audit-on-entry", html)
        self.assertIn("./modules/visionnaire.js?v=4.1.39-audit-on-entry", sw)
        self.assertIn("visionnaire.css?v=4.1.39-visionnaire-filters", html)

    def test_full_roster_and_explicit_slot_selection_are_used(self):
        js = (ROOT / "modules" / "visionnaire.js").read_text(encoding="utf-8")
        self.assertIn("rosterCharacters", js)
        self.assertIn("Math.min(4,roster.length)", js)
        self.assertIn("document.body.dataset.page==='visionnaire'", js)
        self.assertIn('data-mode="sets"', js)
        self.assertIn('data-mode="primaries"', js)
        self.assertIn('data-mode="both"', js)
        self.assertIn("modeCount('both')", js)
        self.assertIn("const criteria=activeIssues(row)", js)
        self.assertIn("data-slot", js)
        self.assertNotIn("slice(0,50)", js)
        self.assertNotIn("transferMod", js)
        self.assertNotIn("moveMod", js)

    def test_incomplete_kyber_data_is_not_counted_as_a_mismatch(self):
        js = (ROOT / "modules" / "visionnaire.js").read_text(encoding="utf-8")
        self.assertIn("setVerifiable:false", js)
        self.assertIn("primaryVerifiable:false", js)
        self.assertIn("x.hasPrimaryReference&&x.mod&&!x.primaryOk", js)
        self.assertIn("x.hasSetReference&&x.mod&&!x.setOk", js)


if __name__ == "__main__":
    unittest.main()
