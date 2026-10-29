"""Regression checks for versioned assets and the PWA service-worker cache."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AssetIntegrityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.sw = (ROOT / "sw.js").read_text(encoding="utf-8")
        cls.core = (ROOT / "modules" / "core.js").read_text(encoding="utf-8")
        cls.seigneur = (ROOT / "modules" / "seigneur.js").read_text(encoding="utf-8")
        cls.worker = (ROOT / "optimizer-worker.mjs").read_text(encoding="utf-8")
        section = cls.sw.split("const STATIC_ASSETS = [", 1)[1].split("];", 1)[0]
        cls.cached_assets = {
            value.removeprefix("./")
            for value in re.findall(r"""['"]([^'"]+)['"]""", section)
        }

    def test_local_stylesheets_and_scripts_are_pre_cached_at_exact_versions(self):
        refs = re.findall(r'<link\b[^>]*\brel=["\']stylesheet["\'][^>]*\bhref=["\']([^"\']+)', self.html, re.I)
        refs += re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)', self.html, re.I)
        local_refs = [ref.removeprefix("./") for ref in refs if "://" not in ref]
        missing = sorted(set(local_refs) - self.cached_assets)
        self.assertEqual(missing, [], f"Local assets absent or version-mismatched in sw.js: {missing}")

    def test_worker_and_python_reference_urls_match_cache(self):
        expected = {
            "optimizer-worker.mjs?v=3.4.4-cache-sync",
            "python/optimizer.py?v=3.4.4-cache-sync",
            "python/kyber_data.py?v=3.4.4-cache-sync",
            "python/optimizer_profiles.json?v=3.4.4-cache-sync",
            "python/kyber_profiles.json?v=3.4.4-cache-sync",
        }
        self.assertTrue(expected.issubset(self.cached_assets))
        self.assertIn("optimizer-worker.mjs?v=3.4.4-cache-sync", self.core)
        for asset in (
            "python/optimizer.py?v=3.4.4-cache-sync",
            "python/kyber_data.py?v=3.4.4-cache-sync",
            "python/optimizer_profiles.json?v=3.4.4-cache-sync",
        ):
            self.assertIn(asset, self.worker)
        self.assertIn("optimizer_profiles.json", self.seigneur)
        self.assertIn("kyber_profiles.json", self.seigneur)
        self.assertIn("?v=3.4.4-cache-sync", self.seigneur)

    def test_obsolete_repository_fallback_is_removed(self):
        self.assertNotIn("/SWGOH-Optimizer-Web/", self.seigneur)

    def test_service_worker_has_new_cache_and_network_first_navigation(self):
        self.assertIn("holocron-static-v4.0.8-gac-parameters", self.sw)
        self.assertIn("holocron-static-v4.0.19-padawan-seasonal-defense", self.sw)
        self.assertNotIn("holocron-static-v3.4.3-weak-donor-pool", self.sw)
        self.assertIn("request.mode === 'navigate'", self.sw)
        self.assertIn("fetch(request).then(response =>", self.sw)

    def test_displayed_release_version_is_consistent(self):
        self.assertIn("Selimna’s Holocron — V4.0.35", self.html)
        self.assertNotIn("Selimna’s Holocron — V3.4.4", self.html)

    def test_blue_gac_padawan_is_defense_only_for_all_formats_and_leagues(self):
        blue = (ROOT / "blue-gac" / "index.html").read_text(encoding="utf-8")
        for value in ('data-mode="3v3"', 'data-mode="5v5"',
                      'data-access="Padawan"', 'data-access="Maître Jedi"',
                      'data-tier="Kyber"', 'data-tier="Aurodium"',
                      'data-tier="Chromium"', 'data-tier="Bronzium"',
                      'data-tier="Carbonite"'):
            self.assertIn(value, blue)
        self.assertIn("V4.0.23", blue)
        self.assertIn("function addUnavailableTeamCard(number)", blue)
        self.assertIn("Aucune proposition ne répond aux critères pour cette équipe.", blue)
        self.assertIn('id="tierView"', blue)
        self.assertNotIn('id="strategyView"', blue)
        self.assertIn("var order=['mode','tier','access']", blue)
        self.assertIn("ÉTAPE 03 / 03", blue)
        self.assertNotIn('id="attackPanel"', blue)
        self.assertNotIn("data-strategy", blue)
        self.assertNotIn("ÉQUILIBRÉE", blue)
        self.assertNotIn("Mode Attaque", blue)
        self.assertIn("Défense uniquement", blue)
        self.assertIn("function show(step)", blue)
        self.assertNotIn("getElementById('attackDefenderLeader').addEventListener", blue)
        self.assertNotIn("getElementById('chosenTier').textContent", blue)
        self.assertNotIn("getElementById('backToTier').addEventListener", blue)
        self.assertIn("state.mode=b.dataset.mode;state.tier='';", blue)
        self.assertIn("show('tier')", blue)


if __name__ == "__main__":
    unittest.main()
