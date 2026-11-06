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
        self.assertIn("modules/visionnaire.js?v=4.1.43-kyber-full-distributions", html)
        self.assertIn("./modules/visionnaire.js?v=4.1.43-kyber-full-distributions", sw)
        self.assertIn("visionnaire.css?v=4.1.43-kyber-full-distributions", html)

    def test_full_roster_and_explicit_slot_selection_are_used(self):
        js = (ROOT / "modules" / "visionnaire.js").read_text(encoding="utf-8")
        self.assertIn("rosterCharacters", js)
        self.assertIn("Math.min(4,roster.length)", js)
        self.assertIn("document.body.dataset.page==='visionnaire'", js)
        self.assertIn('data-mode="sets"', js)
        self.assertIn('data-mode="primaries"', js)
        self.assertIn('data-mode="both"', js)
        self.assertIn("modeCount('both')", js)
        self.assertIn("faction:'ALL'", js)
        self.assertIn("Toutes les factions", js)
        self.assertIn("ÉTAPE 2 · FILTRER PAR FACTION", js)
        self.assertIn("factionsOf(row).includes(state.faction)", js)
        self.assertNotIn("visionnaireSearch", js)
        self.assertIn("const criteria=activeIssues(row)", js)
        self.assertIn("Set incorrect", js)
        self.assertIn("Primaire incorrecte", js)
        self.assertIn("data-slot", js)
        self.assertNotIn("slice(0,50)", js)
        self.assertNotIn("transferMod", js)
        self.assertNotIn("moveMod", js)

    def test_incomplete_kyber_data_is_not_counted_as_a_mismatch(self):
        js = (ROOT / "modules" / "visionnaire.js").read_text(encoding="utf-8")
        self.assertIn("setVerifiable:false", js)
        self.assertIn("primaryVerifiable:false", js)
        self.assertIn("x.hasPrimaryReference&&x.mod&&!x.primaryOk", js)
        self.assertIn("differingSets.includes", js)
        self.assertIn("equippedMods.length===6", js)
        self.assertIn("rankedSetConfigurations", js)
        self.assertIn("primaryDistribution", js)
        self.assertIn("primaryShare>0", js)
        self.assertIn("setCoverage", js)
        self.assertIn("exactMatch", js)
        self.assertIn("currentCounts[name]<2", js)
        self.assertNotIn("dominantPrimary", js)
        self.assertNotIn("entries[0].weight<0.5", js)
        core = (ROOT / "modules" / "core.js").read_text(encoding="utf-8")
        self.assertIn("kyberSetComposition", core)
        self.assertIn("secondary_sets", core)
        self.assertIn("sample_size", core)
        self.assertIn("updated_label", core)
        self.assertIn("kyberProfileHasFullDistribution", core)
        self.assertIn("kyberProfileHasFullDistribution", js)
        self.assertIn("if(!/kyber|swgoh", core)


if __name__ == "__main__":
    unittest.main()
