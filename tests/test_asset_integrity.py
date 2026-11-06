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
        refs = re.findall(r'<link\b[^>]*\brel=["\']stylesheet["\'][^>]*\bhref=["\']([^"\']+)', self.html, re.I)
        refs += re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)', self.html, re.I)
        refs += ["blue-gac/" + ref for ref in re.findall(r'<link\b[^>]*\brel=["\']stylesheet["\'][^>]*\bhref=["\']([^"\']+)', self.blue_html, re.I)]
        refs += ["blue-gac/" + ref for ref in re.findall(r'<script\b[^>]*\bsrc=["\']([^"\']+)', self.blue_html, re.I)]
        local_refs = [ref.removeprefix("./") for ref in refs if "://" not in ref]
        missing = sorted(set(local_refs) - self.cached_assets)
        self.assertEqual(missing, [], f"Local assets absent or version-mismatched in sw.js: {missing}")

    def test_catalogue_is_versioned_and_network_first_in_pwa(self):
        self.assertIn("holocron-static-v4.4.32-custom-faction-dropdown", self.sw)
        self.assertIn("blue-gac/gac-catalog.json?v=4.1.2", self.sw)
        self.assertIn("url.pathname.endsWith('/blue-gac/gac-catalog.json')", self.sw)
        self.assertIn("url.hostname === 'raw.githubusercontent.com'", self.sw)
        self.assertIn("fetch(request).then(response =>", self.sw)
        self.assertIn('"schemaVersion": 1', self.catalog)

    def test_blue_gac_loads_dynamic_catalogue_and_keeps_padawan_constraints(self):
        for value in ('data-mode="3v3"', 'data-mode="5v5"',
                      'data-access="Padawan"', 'data-access="Maître Jedi"',
                      'data-tier="Kyber"', 'data-tier="Aurodium"',
                      'data-tier="Chromium"', 'data-tier="Bronzium"',
                      'data-tier="Carbonite"'):
            self.assertIn(value, self.blue_html)
        self.assertIn("raw.githubusercontent.com/Selimna95/Selimna-Holocron/main/blue-gac/gac-catalog.json", self.blue_js)
        self.assertIn("t.league===state.tier", self.blue_js)
        self.assertIn("t.members.map(canonicalName)", self.blue_js)
        self.assertIn("members.some(function(m){return used.has(m);})", self.blue_js)
        self.assertIn("Number(b.season||0)-Number(a.season||0)", self.blue_js)
        self.assertIn("catalogMeta.currentSeasons", self.blue_js)
        self.assertIn("Saison prioritaire", self.blue_js)
        self.assertIn("var publicTeams=[];", self.blue_js)
        self.assertNotIn("sourceLeague:(Number(t.season)", self.blue_js)
        self.assertIn("font-size:max(13px", self.blue_css)
        self.assertIn("V4.1.4", self.blue_html)
        self.assertIn("gac-audit.js?v=4.1.4", self.blue_html)
        self.assertIn("AUDITER LE CATALOGUE GAC", self.blue_html)
        self.assertIn("GACAudit.auditCatalog", self.blue_js)
        self.assertIn("auditCoverage", self.blue_html)
        self.assertIn("auditSignals", self.blue_html)
        self.assertIn("analyzePerformance", self.blue_js)
        self.assertIn("marge 95 %", self.blue_js)


    def test_profile_sync_is_staged_and_rejects_incomplete_mod_inventory(self):
        core = (ROOT / "modules" / "core.js").read_text(encoding="utf-8")
        load_player = core.split("async function loadRemotePlayer(){", 1)[1].split("\nfunction updateAccountSummary", 1)[0]
        self.assertIn("const previousSnapshot={currentData,rosterCharacters,rosterShips,mods,accountGalacticPower}", load_player)
        self.assertIn("let nextGalacticPower={total:0,characters:0,ships:0}", load_player)
        self.assertIn("let htmlModsComplete=true", load_player)
        self.assertIn("!apiMods.length && (!htmlMods.length || !htmlModsComplete)", load_player)
        self.assertIn("if(!chars.length)throw new Error", load_player)
        self.assertIn("mods=nextMods;rosterCharacters=chars;rosterShips=ships;accountGalacticPower=nextGalacticPower", load_player)
        self.assertIn("currentData=previousSnapshot.currentData", load_player)
        self.assertNotIn("accountGalacticPower={total:0,characters:0,ships:0}", load_player)

    def test_seigneur_uses_current_gac_evidence_for_targets_and_weak_donors(self):
        bridge = (ROOT / "modules" / "seigneur-gac.js").read_text(encoding="utf-8")
        seigneur = (ROOT / "modules" / "seigneur.js").read_text(encoding="utf-8")
        self.assertIn("holocronGacPriorityForCharacter", bridge)
        self.assertIn("buildDefenseUsage", bridge)
        self.assertIn("defense-composition", bridge)
        self.assertIn("une absence n’est jamais assimilée à zéro", bridge)
        self.assertIn("holocron:gac-usage-ready", bridge)
        self.assertIn("byFormat", seigneur)
        self.assertIn("const eligible=matching.filter(s=>Number(s.season)<=ceiling)", seigneur)
        self.assertIn("status==='INCOMPLETS'", seigneur)
        self.assertIn("forgeSourceStatusAllowed(st)", seigneur)
        self.assertIn("_sourceFleetKnown", seigneur)
        self.assertIn("modules/seigneur-gac.js?v=1.1.0-history-fallback", self.html)
        self.assertIn("modules/seigneur-gac.js?v=1.1.0-history-fallback", self.sw)
        self.assertIn("modules/seigneur.js?v=3.9.4-slot-comparison", self.html)
        self.assertIn("modules/seigneur.js?v=3.9.4-slot-comparison", self.sw)
        self.assertIn("modules/seigneur-impact.js?v=1.0.0-roster-impact", self.html)
        self.assertIn("modules/seigneur-impact.js?v=1.0.0-roster-impact", self.sw)
        self.assertIn("app.css?v=4.1.3-visionnaire-cleanup", self.html)
        self.assertIn("app.css?v=4.1.3-visionnaire-cleanup", self.sw)
        self.assertIn("PRIORITÉ GAC", (ROOT / "modules" / "core.js").read_text(encoding="utf-8"))

    def test_seigneur_worker_receives_current_mods_and_enforces_speed_floor(self):
        core = (ROOT / "modules" / "core.js").read_text(encoding="utf-8")
        seigneur = (ROOT / "modules" / "seigneur.js").read_text(encoding="utf-8")
        worker = (ROOT / "optimizer-worker.mjs").read_text(encoding="utf-8")
        optimizer = (ROOT / "python" / "optimizer.py").read_text(encoding="utf-8")
        self.assertIn("current_target_mods: currentTargetMods", core)
        self.assertIn("currentTargetMods);", seigneur)
        self.assertIn("minimum_speed = optimizer.final_stats(current_target_mods, base_stats).get(\"Speed\")", worker)
        self.assertIn("minimum_speed=minimum_speed", worker)
        self.assertIn("minimum_speed=None", optimizer)
        self.assertIn("if minimum_speed is not None and not safe_beam:", optimizer)
        self.assertIn("Aucun transfert entraînant une perte de vitesse", optimizer)
        self.assertIn("VITESSE TOTALE ESTIMÉE", seigneur)
        self.assertIn("COMPARAISON DES SIX SLOTS", seigneur)

    def test_pwa_navigation_and_cross_origin_catalog_cache_are_route_aware(self):
        raw_handler = self.sw.index("url.hostname === 'raw.githubusercontent.com'")
        same_origin_filter = self.sw.index("url.origin !== self.location.origin")
        self.assertLess(raw_handler, same_origin_filter, "Raw GitHub cache handler must run before same-origin filtering")
        self.assertIn("cache.put(request, copy)", self.sw)
        self.assertIn("new URL('./blue-gac/index.html', self.registration.scope)", self.sw)
        self.assertIn("new URL('./index.html', self.registration.scope)", self.sw)
        self.assertNotIn("cache.put(indexUrl, copy)", self.sw)

    def test_catalogue_source_is_not_silently_replaced_with_static_teams(self):
        self.assertIn("gac-catalog.json", self.blue_js)
        self.assertIn("aucune ancienne composition", self.blue_js.lower())
        self.assertIn("gac-catalog.json", self.blue_js)


    def test_live_catalogue_records_partial_real_data_without_fabricating_missing_views(self):
        import json
        data = json.loads(self.catalog)
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
            self.assertEqual(set(data["seasons"][fmt]), {x.lower() for x in leagues})
            for league in leagues:
                entries = [t for t in data["teams"] if t["format"] == fmt and t["league"] == league]
                self.assertEqual(len(entries), expected[fmt][league.lower()])
                self.assertEqual(data["coverage"][fmt][league.lower()], len(entries))
                seasons = data["seasons"][fmt][league.lower()]
                self.assertEqual(seasons, [] if not entries else ([84] if fmt == "5v5" else [83]))
                for team in entries:
                    self.assertEqual(len(team["members"]), size)
                    self.assertIn("swgoh.gg", team["source"])
                    self.assertGreater(team["battles"], 0)
                    self.assertGreaterEqual(team["hold"], 0)
                    self.assertLessEqual(team["hold"], 100)
        self.assertIn("Cloudflare", data["collectionNote"])

    def test_gac_collector_accepts_empty_or_partial_current_season_views(self):
        collector = (ROOT / "scripts" / "update_gac_catalog.py").read_text(encoding="utf-8")
        self.assertIn("MIN_TEAMS_PER_VIEW = 0", collector)
        self.assertIn('"currentSeasons": current_seasons', collector)
        self.assertNotIn("coverage[fmt][league] < MIN_TEAMS_PER_VIEW", collector)
        self.assertIn("Inconsistent current seasons detected", collector)

    def test_relay_sync_uses_one_timeout_json_reader_and_preserves_direct_fallback(self):
        core = (ROOT / "modules" / "core.js").read_text(encoding="utf-8")
        self.assertEqual(core.count("async function fetchJSON(url)"), 1)
        fetch_text = core.split("async function fetchText(url)", 1)[1].split("function parseHTML", 1)[0]
        self.assertIn("candidates.push(url)", fetch_text)
        self.assertIn("fetchTextWithTimeout(u", fetch_text)
        self.assertIn("const candidates=[], relay=workerUrl()", fetch_text)
        self.assertIn("if(relay)", fetch_text)
        load_player = core.split("async function loadRemotePlayer(){", 1)[1].split("\nfunction updateAccountSummary", 1)[0]
        self.assertIn("path=api-profile", load_player)
        self.assertIn("path=api-mods", load_player)
        self.assertIn("if(!apiMods.length)", load_player)
        self.assertIn("if(!ownedApi.length || !profileApi ||", load_player)
        self.assertIn("account.character_galactic_power", load_player)
        self.assertIn("account.ship_galactic_power", load_player)
        self.assertIn("modules/core.js?v=4.2.15-kyber-split-percentages", self.html)
        self.assertIn("modules/core.js?v=4.2.15-kyber-split-percentages", self.sw)
        self.assertIn("holocron-static-v4.4.32-custom-faction-dropdown", self.sw)


    def test_visionnaire_replaces_the_legacy_permutation_engine(self):
        js = (ROOT / "modules" / "visionnaire.js").read_text(encoding="utf-8")
        self.assertTrue((ROOT / "visionnaire.css").exists())
        self.assertFalse((ROOT / "modules" / "sithari.js").exists())
        self.assertFalse((ROOT / "modules" / "sithari-strategy.js").exists())
        self.assertFalse((ROOT / "sithari.css").exists())
        self.assertFalse((ROOT / "sithari-strategy.css").exists())
        self.assertIn('id="visionnaire"', self.html)
        self.assertIn('data-page="visionnaire"', self.html)
        self.assertIn("modules/visionnaire.js?v=4.1.48-custom-faction-dropdown", self.html)
        self.assertIn("visionnaire.css?v=4.1.48-custom-faction-dropdown", self.html)
        self.assertIn("rosterCharacters", js)
        self.assertIn('data-mode="sets"', js)
        self.assertIn('data-mode="primaries"', js)
        self.assertIn('data-mode="both"', js)
        self.assertIn("row.setMismatch&&row.primaryVerifiable&&row.primaryMismatch", js)
        self.assertIn("const criteria=activeIssues(row)", js)
        self.assertIn("data-slot", js)
        self.assertNotIn("slice(0,50)", js)
        self.assertNotIn("ssFindCycles", js)

    def test_kyber_profile_fetch_is_serialized_retried_and_cached(self):
        core = (ROOT / "modules" / "core.js").read_text(encoding="utf-8")
        self.assertIn("function fetchKyberThroughRelay(url)", core)
        self.assertIn("kyberFetchQueue=operation.then", core)
        self.assertIn("X-Upstream-Status", core)
        self.assertIn("KYBER_PROFILE_CACHE_TTL", core)
        self.assertIn("AbortSignal.timeout(12000)", core)
        self.assertIn("kyberCircuitOpenUntil=Date.now()+60000", core)
        self.assertIn("const directCandidate=slug(display)", core)
        self.assertIn("Tentative avec le slug du personnage", core)
        self.assertIn("persistKyberProfile(requestKey,candidate,result.profile)", core)
        self.assertIn("const effectiveStatus=upstreamStatus||response.status", core)
        self.assertIn("if(fallback)return fallback", core)
        self.assertIn("window.__kyberLastParseDiagnostic", core)
