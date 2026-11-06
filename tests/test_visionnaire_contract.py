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
        self.assertIn("modules/visionnaire.js?v=4.1.48-custom-faction-dropdown", html)
        self.assertIn("./modules/visionnaire.js?v=4.1.48-custom-faction-dropdown", sw)
        self.assertIn("visionnaire.css?v=4.1.48-custom-faction-dropdown", html)

    def test_full_roster_and_explicit_slot_selection_are_used(self):
        js = (ROOT / "modules" / "visionnaire.js").read_text(encoding="utf-8")
        self.assertIn("rosterCharacters", js)
        self.assertIn("Math.min(4,roster.length)", js)
        self.assertIn("state.progress.done", js)
        self.assertIn("résultats apparaissent progressivement", js)
        self.assertIn("state.progress.profiles", js)
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
        self.assertIn("Set hors de la configuration Kyber la plus proche", js)
        self.assertIn("Primaire non observée en Kyber", js)
        self.assertIn("data-slot", js)
        self.assertNotIn("slice(0,50)", js)
        self.assertNotIn("transferMod", js)
        self.assertNotIn("moveMod", js)

    def test_faction_filter_uses_persistent_interaction(self):
        js = (ROOT / "modules" / "visionnaire.js").read_text(encoding="utf-8")
        css = (ROOT / "visionnaire.css").read_text(encoding="utf-8")
        self.assertIn("root.dataset.factionFilterBound!=='true'", js)
        self.assertIn("root.addEventListener('click'", js)
        self.assertIn("[data-faction-toggle]", js)
        self.assertIn("[data-faction-option]", js)
        self.assertIn("state.faction=option.dataset.factionOption||'ALL'", js)
        self.assertNotIn("id=\"visionnaireFaction\"", js)
        self.assertIn(".visionnaire-faction-menu{", css)
        self.assertIn("z-index:1000", css)
        self.assertIn("pointer-events:auto!important", css)

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
        self.assertIn("function kyberPercentageEntries", core)
        self.assertIn("kyberPercentageEntries(normalized,i+1,j>=0?j:normalized.length)", core)
        self.assertIn("secondary_sets", core)
        self.assertIn("sample_size", core)
        self.assertIn("updated_label", core)
        self.assertIn("kyberProfileHasFullDistribution", core)
        self.assertIn("AbortSignal.timeout(12000)", core)
        self.assertIn("kyberProfileHasFullDistribution", js)
        self.assertIn("if(!/kyber|swgoh", core)
        self.assertIn("Array.isArray(p.specific_sets)&&p.specific_sets.length>0", core)
        self.assertIn("const directCandidate=slug(display)", core)
        self.assertIn("Tentative avec le slug du personnage", core)
        self.assertIn("if(fallback)return fallback", core)
        self.assertIn("window.__kyberLastParseDiagnostic", core)
        self.assertIn("ranked.some(config=>config.exact&&config.distance===0)", js)
        self.assertIn("profils Kyber exploitables", js)


if __name__ == "__main__":
    unittest.main()
