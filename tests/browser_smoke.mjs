import { chromium } from "playwright";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:8765";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
const failedLocalAssets = [];

page.on("pageerror", error => pageErrors.push(error.message));
page.on("response", response => {
  const url = new URL(response.url());
  if (url.origin === origin && /\\.(?:css|js)$/.test(url.pathname) && response.status() >= 400) {
    failedLocalAssets.push({ url: url.pathname, status: response.status() });
  }
});

// Pyodide is external and is intentionally stubbed here: this suite tests the
// application shell and local UI contracts, not the optimizer's Python runtime.
await page.route("https://cdn.jsdelivr.net/pyodide/**", async route => {
  const url = route.request().url();
  if (url.endsWith(".mjs")) {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: 'const fakePyodide = { FS: { writeFile() {} }, runPython() {}, globals: { set() {} }, runPythonAsync: async () => "[]" }; export async function loadPyodide(){ return fakePyodide; }',
    });
  } else {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: 'window.loadPyodide = async () => ({ FS: { writeFile() {} }, runPython() {}, globals: { set() {} }, runPythonAsync: async () => "[]" });',
    });
  }
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(origin);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(ready, true, "Local static server did not start");

  const response = await page.goto(origin, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, "The app shell must return HTTP 200");
  await page.locator("#gateActivate").waitFor({ state: "visible" });
  assert.match(await page.title(), /Selimna’s Holocron/);

  // Seigneur's bridge must load the freshly collected full GAC unit/fleet usage snapshot.
  const gacBridge = await page.evaluate(async () => {
    const data = await window.__SWGOH_GAC_USAGE_READY__;
    return {
      sourceStatus: data?.sourceStatus,
      evidenceType: data?.evidenceType,
      seasons: data?.currentSeasons,
      priorityHelper: typeof window.holocronGacPriorityForCharacter,
    };
  });
  assert.equal(gacBridge.sourceStatus, "observed");
  assert.equal(gacBridge.evidenceType, "unit-usage");
  assert.deepEqual(gacBridge.seasons, { "5v5": 84, "3v3": 83, fleet: 84 });
  assert.equal(gacBridge.priorityHelper, "function");


  // Exercise the real navigation handler without requiring an account login.
  await page.evaluate(() => {
    document.querySelector("#holocronGate").style.display = "none";
    document.querySelector("#appShell").hidden = false;
    showPage("dashboard");
  });
  await page.locator('aside.sidebar button.nav[data-page="help"]').click();
  assert.equal(await page.locator("body").getAttribute("data-page"), "help");
  assert.equal(await page.locator('aside.sidebar button.nav[data-page="help"]').getAttribute("aria-current"), "page");

  // The Codex entry is intentionally context-dependent in the sidebar; test
  // its destination directly rather than forcing a hidden button click.
  await page.evaluate(() => showPage("data"));
  assert.equal(await page.locator("body").getAttribute("data-page"), "data");
  assert.equal(await page.locator("#data").getAttribute("aria-hidden"), "false");

  await page.evaluate(() => showPage("visionnaire"));
  assert.equal(await page.locator("body").getAttribute("data-page"), "visionnaire");
  assert.equal(await page.locator("#visionnaire").getAttribute("aria-hidden"), "false");
  assert.equal(await page.locator("#visionnaireRoot").count(), 1);

  // Visionnaire: exercise the actual audit, mode filters, faction filter,
  // explicit slot selection, unavailable-reference handling and donor guards.
  const kyberCacheBehavior = await page.evaluate(async () => {
    const profile = {
      source: "SWGOH.GG",
      url: "https://swgoh.gg/gac/season/84/units/cache-probe/",
      data_slice: "kyber",
      specific_sets: [{ name: "Speed x4 + Health x2", counts: { Speed: 4, Health: 2 }, weight: 1 }],
      slots: {
        Square: { primaries: { Offense: 1 } },
        Arrow: { primaries: { Speed: 1 } },
        Diamond: { primaries: { Defense: 1 } },
        Triangle: { primaries: { "Critical Damage": 1 } },
        Circle: { primaries: { Health: 1 } },
        Cross: { primaries: { Potency: 1 } }
      }
    };
    const originalFetch = window.fetch;
    const oldQueue = kyberFetchQueue;
    const oldNextFetchAt = kyberNextFetchAt;
    const oldCircuitOpenUntil = kyberCircuitOpenUntil;
    const oldUnitIndexPromise = kyberUnitIndexPromise;
    const oldUnitIndexFailureUntil = kyberUnitIndexFailureUntil;
    let requests = 0;
    try {
      persistKyberProfile("cacheprobe", "cache-probe", profile);
      window.fetch = async () => {
        requests++;
        return new Response("upstream unavailable", { status: 502, headers: { "X-Upstream-Status": "502" } });
      };
      const cached = await fetchKyberProfile({ name: "Cache Probe", baseId: "CACHEPROBE" });
      const cacheStatus = window.__kyberReferenceStatuses.cacheprobe?.status;
      const requestsAfterCacheHit = requests;
      const cache = JSON.parse(localStorage.getItem("holocron-kyber-profile-cache-v3-full-distributions") || "{}");
      cache.cacheprobe.savedAt = Date.now() - 13 * 60 * 60 * 1000;
      localStorage.setItem("holocron-kyber-profile-cache-v3-full-distributions", JSON.stringify(cache));
      kyberPersistentCache = null;
      const stale = await fetchKyberProfile({ name: "Cache Probe", baseId: "CACHEPROBE" }, { forceRefresh: true });
      return {
        cacheHit: cached === profile,
        cacheStatus,
        requestsAfterCacheHit,
        staleFallback: stale?.url === profile.url && stale?.data_slice === profile.data_slice,
        staleStatus: window.__kyberReferenceStatuses.cacheprobe?.status,
        refreshRequests: requests - requestsAfterCacheHit
      };
    } finally {
      window.fetch = originalFetch;
      discardKyberPersistentCacheEntry("cacheprobe");
      kyberPersistentCache = null;
      kyberFetchQueue = oldQueue;
      kyberNextFetchAt = oldNextFetchAt;
      kyberCircuitOpenUntil = oldCircuitOpenUntil;
      kyberUnitIndexPromise = oldUnitIndexPromise;
      kyberUnitIndexFailureUntil = oldUnitIndexFailureUntil;
      if (window.__kyberReferenceStatuses) delete window.__kyberReferenceStatuses.cacheprobe;
    }
  });
  assert.equal(kyberCacheBehavior.cacheHit, true, "A fresh Kyber cache entry must be used before any network request.");
  assert.equal(kyberCacheBehavior.cacheStatus, "cached");
  assert.equal(kyberCacheBehavior.requestsAfterCacheHit, 0);
  assert.equal(kyberCacheBehavior.staleFallback, true, "An expired valid profile must survive a failed refresh.");
  assert.equal(kyberCacheBehavior.staleStatus, "stale");
  assert.ok(kyberCacheBehavior.refreshRequests >= 1);

  const visionnaireFixture = await page.evaluate(() => {
    const original = {
      rosterCharacters,
      mods,
      factionMap,
      fetchKyberProfile: window.fetchKyberProfile,
      referenceStatuses: window.__kyberReferenceStatuses,
      forgeAllSourceMods: window.forgeAllSourceMods,
      forgeSourceAllowedForSearch: window.forgeSourceAllowedForSearch,
      forgeProjectedModSpeed: window.forgeProjectedModSpeed,
      isGalacticLegendCharacter: window.isGalacticLegendCharacter,
    };
    window.__visionnaireSmokeRestore = original;
    const characters = [
      { baseId: "TESTJEDI", characterId: "UNIT-JEDI", name: "Jedi Test", combat_type: 1, gear_level: 13, factions: ["Jedi"], base_stats: { Speed: 300 } },
      { baseId: "TESTSITH", characterId: "UNIT-SITH", name: "Sith Test", combat_type: 1, gear_level: 13, factions: ["Sith"], base_stats: { Speed: 300 } },
      { baseId: "TESTNOREF", characterId: "UNIT-NOREF", name: "No Reference", combat_type: 1, gear_level: 13, factions: ["Jedi"], base_stats: { Speed: 300 } },
    ];
    const profile = {
      source: "SWGOH.GG",
      url: "https://swgoh.gg/gac/season/84/units/test-jedi/",
      data_slice: "kyber",
      sample_size: 100,
      updated_label: "Saison 84",
      specific_sets: [{ name: "Speed x4 + Health x2", counts: { Speed: 4, Health: 2 }, weight: 1 }],
      slots: {
        Square: { primaries: { Offense: 1 } },
        Arrow: { primaries: { Speed: 1 } },
        Diamond: { primaries: { Defense: 1 } },
        Triangle: { primaries: { "Critical Damage": 1 } },
        Circle: { primaries: { Health: 1 } },
        Cross: { primaries: { Potency: 1 } }
      }
    };
    const sets = { Square: "Speed", Arrow: "Speed", Diamond: "Health", Triangle: "Health", Circle: "Potency", Cross: "Potency" };
    const primaries = {
      Square: ["Offense %", 5], Arrow: ["Speed", 30], Diamond: ["Defense %", 5],
      Triangle: ["Critical Damage %", 30], Circle: ["Protection %", 5.88], Cross: ["Potency %", 10]
    };
    const fixtureMods = [];
    for (const character of characters) {
      for (const slot of ["Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross"]) {
        const [primary, value] = primaries[slot];
        const secondaries = slot === "Arrow"
          ? [["Protection", 100], ["Health", 100], ["Potency %", 2], ["Tenacity %", 2]]
          : [["Speed", 5], ["Protection", 100], ["Potency %", 2], ["Tenacity %", 2]];
        fixtureMods.push({
          game_id: character.baseId + "-" + slot,
          characterId: character.characterId,
          slot,
          set_name: sets[slot],
          level: 15,
          pips: 5,
          rarity: 5,
          primary_stat: primary,
          primary_value: value,
          secondary_1_stat: secondaries[0][0], secondary_1_value: secondaries[0][1],
          secondary_2_stat: secondaries[1][0], secondary_2_value: secondaries[1][1],
          secondary_3_stat: secondaries[2][0], secondary_3_value: secondaries[2][1],
          secondary_4_stat: secondaries[3][0], secondary_4_value: secondaries[3][1],
        });
      }
    }
    rosterCharacters = characters;
    mods = fixtureMods;
    factionMap = { TESTJEDI: ["Jedi"], TESTSITH: ["Sith"], TESTNOREF: ["Jedi"] };
    window.__kyberReferenceStatuses = {
      testjedi: { status: "fresh", label: "Référence actualisée" },
      testsith: { status: "fresh", label: "Référence actualisée" },
      noreference: { status: "unavailable", label: "Pas de référence Kyber disponible", reason: "Aucun échantillon Kyber publié." }
    };
    window.fetchKyberProfile = async character => character.baseId === "TESTNOREF" ? null : profile;
    window.forgeAllSourceMods = () => [{
      game_id: "unknown-gac-donor",
      slot: "Square",
      set_name: "Speed",
      level: 15,
      primary_stat: "Offense",
      primary_value: 5,
      secondary_1_stat: "Speed",
      secondary_1_value: 10,
      _sourceOwnerKey: "TESTSITH",
      _sourcePriorityKnown: false,
      _sourceUsage: null
    }];
    window.forgeSourceAllowedForSearch = () => true;
    window.forgeProjectedModSpeed = () => ({ complete: true, total: 300, baseSpeed: 300, hasFourPieceSpeedSet: true });
    window.isGalacticLegendCharacter = () => false;
    window.renderVisionnaire();
    return {
      jediMods: getCharacterMods(characters[0]).length,
      sithMods: getCharacterMods(characters[1]).length,
      noReferenceMods: getCharacterMods(characters[2]).length
    };
  });
  assert.deepEqual(visionnaireFixture, { jediMods: 6, sithMods: 6, noReferenceMods: 6 });
  await page.waitForFunction(() =>
    document.querySelector("#visionnaireRoot .visionnaire-state")?.textContent.includes("AUDIT 3 PERSONNAGES")
  );
  assert.equal(await page.locator('#visionnaireRoot [data-character]').count(), 2,
    "The audit must use the complete roster while keeping unavailable Kyber references out of mismatch lists.");
  assert.match(await page.locator("#visionnaireRoot").textContent(), /Pas de référence Kyber disponible/);
  await page.locator('#visionnaireRoot [data-mode="primaries"]').click();
  assert.equal(await page.locator('#visionnaireRoot [data-character]').count(), 2);
  await page.locator('#visionnaireRoot [data-mode="both"]').click();
  assert.equal(await page.locator('#visionnaireRoot [data-character]').count(), 2);
  await page.locator('#visionnaireRoot [data-faction-toggle]').click();
  await page.locator('#visionnaireRoot [data-faction-option="Jedi"]').click();
  assert.equal(await page.locator('#visionnaireRoot [data-character]').count(), 1,
    "The faction filter must update the visible character list.");
  assert.match(await page.locator('#visionnaireRoot [data-character]').textContent(), /Jedi Test/);
  await page.locator('#visionnaireRoot [data-mode="primaries"]').click();
  assert.equal(await page.locator('#visionnaireRoot [data-character]').count(), 1,
    "The selected faction must persist when the discrepancy mode changes.");
  await page.locator('#visionnaireRoot [data-mode="both"]').click();
  assert.equal(await page.locator('#visionnaireRoot [data-character]').count(), 1,
    "The selected faction must remain active across subsequent mode changes.");
  await page.locator('#visionnaireRoot [data-character="TESTJEDI"]').click();
  assert.equal(await page.locator('#visionnaireRoot .visionnaire-selected').count(), 1);
  const selectedBefore = await page.locator('#visionnaireRoot [data-slot].selected').count();
  assert.equal(selectedBefore, 4, "The slots with set or primary mismatches must be preselected.");
  await page.locator('#visionnaireRoot [data-slot="Square"]').click();
  assert.equal(await page.locator('#visionnaireRoot [data-slot].selected').count(), 3,
    "The user must be able to remove a preselected slot.");
  await page.locator('#visionnaireRoot [data-slot="Square"]').click();
  for (const slot of ["Arrow", "Circle", "Cross"]) {
    await page.locator('#visionnaireRoot [data-slot="' + slot + '"]').click();
  }
  assert.equal(await page.locator('#visionnaireRoot [data-slot].selected').count(), 1);
  await page.locator('#visionnaireRoot [data-search-exchanges]').click();
  await page.waitForFunction(() => {
    const node = document.querySelector("#visionnaireRoot .visionnaire-selected .visionnaire-empty");
    return node && /donneur|GAC/i.test(node.textContent || "");
  });
  assert.equal(await page.locator('#visionnaireRoot .visionnaire-proposal').count(), 0,
    "A donor with unknown GAC priority must not become an exchange proposal.");
  const visionnaireSearchMessage = await page.locator('#visionnaireRoot .visionnaire-selected .visionnaire-empty').textContent();
  assert.match(visionnaireSearchMessage, /donneur|GAC/i);

  // Verify the loaded local JavaScript and CSS assets are actually served.
  await page.evaluate(() => {
    const saved = window.__visionnaireSmokeRestore;
    if (!saved) return;
    showPage("dashboard");
    rosterCharacters = saved.rosterCharacters;
    mods = saved.mods;
    factionMap = saved.factionMap;
    window.fetchKyberProfile = saved.fetchKyberProfile;
    window.__kyberReferenceStatuses = saved.referenceStatuses;
    window.forgeAllSourceMods = saved.forgeAllSourceMods;
    window.forgeSourceAllowedForSearch = saved.forgeSourceAllowedForSearch;
    window.forgeProjectedModSpeed = saved.forgeProjectedModSpeed;
    window.isGalacticLegendCharacter = saved.isGalacticLegendCharacter;
    delete window.__visionnaireSmokeRestore;
    window.dispatchEvent(new Event("holocron:data-updated"));
  });

  const ambiguousSlotCount = await page.evaluate(() => {
    const character = { baseId: "AHSOKATANO", name: "Ahsoka Tano", characterId: "UNIT-42" };
    const make = (slot, id) => ({game_id:id,characterId:"UNIT-42",slot,set_name:"Speed",primary_stat:"Speed",primary_value:30,level:15,rarity:5,secondary_1_stat:"Speed",secondary_1_value:5});
    const originalMods = mods, originalRoster = rosterCharacters;
    try {
      rosterCharacters = [character];
      mods = [
        make("Square","square-a"), make("Square","square-b"),
        make("Arrow","arrow"), make("Diamond","diamond"),
        make("Triangle","triangle"), make("Circle","circle"), make("Cross","cross"),
      ];
      return getCharacterMods(character).length;
    } finally { mods = originalMods; rosterCharacters = originalRoster; }
  });
  assert.equal(ambiguousSlotCount, 5, "Two distinct mods claiming the same equipped slot must not be resolved by arbitrary first-row selection.");

  // Ownership, donor eligibility and speed guards are exercised against the
  // real browser-loaded modules, not by searching their source text.
  const ownerBehavior = await page.evaluate(() => {
    const savedRoster = rosterCharacters, savedMods = mods;
    const roster = [
      { baseId: "OWNER_A", characterId: "UNIT-A", name: "Alias A", combat_type: 1 },
      { baseId: "OWNER_B", characterId: "UNIT-B", name: "OWNER_A", combat_type: 1 },
      { baseId: "OWNER_C", characterId: "UNIT-C", name: "Duplicate", combat_type: 1 },
      { baseId: "OWNER_D", characterId: "UNIT-D", name: "Duplicate", combat_type: 1 }
    ];
    const make = (id, slot, fields) => ({
      game_id: id, slot, set_name: "Speed", level: 15, rarity: 5,
      primary_stat: "Offense", primary_value: 5,
      secondary_1_stat: "Speed", secondary_1_value: 10,
      secondary_2_stat: "Protection", secondary_2_value: 0,
      secondary_3_stat: "Potency %", secondary_3_value: 0,
      secondary_4_stat: "Tenacity %", secondary_4_value: 0,
      ...fields
    });
    try {
      rosterCharacters = roster;
      mods = [
        make("owner-a-square", "Square", { characterId: "UNIT-A" }),
        make("owner-a-arrow", "Arrow", { characterId: "OWNER_A" }),
        make("contradictory-owner", "Diamond", { characterId: "UNIT-A", characterName: "UNIT-B" }),
        make("ambiguous-name", "Triangle", { characterName: "Duplicate" }),
        make("partial-name", "Circle", { characterName: "Alias A extended" })
      ];
      const resolver = buildRosterOwnerResolver(rosterCharacters);
      const firstIndex = getCharacterModsIndex();
      const secondIndex = getCharacterModsIndex();
      return {
        canonicalBaseIdWinsAliasCollision: resolver.resolve("OWNER_A") === "OWNERA",
        duplicateDisplayNameIsAmbiguous: resolver.resolve("Duplicate") === "",
        exactCharacterIdResolves: resolveModOwnerKey({ characterId: "UNIT-A" }, resolver) === "OWNERA",
        partialNameDoesNotResolve: resolveModOwnerKey({ characterName: "Alias A extended" }, resolver) === "",
        canonicalOwnerMods: getCharacterMods(roster[0]).map(mod => mod.game_id).sort(),
        collidingAliasOwnerMods: getCharacterMods(roster[1]).map(mod => mod.game_id),
        indexIsReusedForUnchangedInputs: firstIndex === secondIndex
      };
    } finally {
      rosterCharacters = savedRoster;
      mods = savedMods;
    }
  });
  assert.equal(ownerBehavior.canonicalBaseIdWinsAliasCollision, true);
  assert.equal(ownerBehavior.duplicateDisplayNameIsAmbiguous, true);
  assert.equal(ownerBehavior.exactCharacterIdResolves, true);
  assert.equal(ownerBehavior.partialNameDoesNotResolve, true);
  assert.deepEqual(ownerBehavior.canonicalOwnerMods, ["owner-a-arrow", "owner-a-square"]);
  assert.deepEqual(ownerBehavior.collidingAliasOwnerMods, []);
  assert.equal(ownerBehavior.indexIsReusedForUnchangedInputs, true,
    "The owner index should be reused while both roster and mod-array identities remain unchanged.");

  const transferGuards = await page.evaluate(() => {
    const make = (id, speed) => ({
      game_id: id, slot: "Square", set_name: "Health", level: 15, rarity: 5,
      primary_stat: "Offense", primary_value: 5,
      secondary_1_stat: "Speed", secondary_1_value: speed,
      secondary_2_stat: "Protection", secondary_2_value: 0,
      secondary_3_stat: "Potency %", secondary_3_value: 0,
      secondary_4_stat: "Tenacity %", secondary_4_value: 0
    });
    const selected = make("selected", 5);
    const rows = [
      { speed: 4, value: 99, mod: { ...make("slower", 4), secondary_1_stat: "Potency %", secondary_1_value: 99 } },
      { speed: 5, value: 4, mod: { ...make("equal", 5), secondary_1_stat: "Potency %", secondary_1_value: 4 } },
      { speed: 8, value: 7, mod: { ...make("faster", 8), secondary_1_stat: "Potency %", secondary_1_value: 7 } }
    ];
    const safe = discipleSpeedSafeCandidates(selected, rows, "Potency %");
    return {
      acolyteAcceptsSpeedGain: holocronAcolyteTransferPreservesSpeed(selected, make("better", 10), [selected]),
      acolyteRejectsSpeedLoss: holocronAcolyteTransferPreservesSpeed(selected, make("worse", 4), [selected]),
      discipleCandidates: safe.map(row => ({ id: row.mod.game_id, speed: row.speed, value: row.value })),
      sharedLegendRegistry: window.HOLOCRON_GALACTIC_LEGENDS instanceof Set,
      knownLegendRecognized: isGalacticLegendCharacter({ baseId: "JEDIMASTERKENOBI" }),
      similarNonLegendRejected: !isGalacticLegendCharacter({ baseId: "JEDIKNIGHTKENOBI", name: "Jedi Master Kenobi" })
    };
  });
  assert.equal(transferGuards.acolyteAcceptsSpeedGain, true);
  assert.equal(transferGuards.acolyteRejectsSpeedLoss, false);
  assert.deepEqual(transferGuards.discipleCandidates, [
    { id: "faster", speed: 8, value: 7 },
    { id: "equal", speed: 5, value: 4 }
  ], "Disciple must reject any donor mod below the selected mod's speed and rank safe matches by the requested secondary.");
  assert.equal(transferGuards.sharedLegendRegistry, true);
  assert.equal(transferGuards.knownLegendRecognized, true);
  assert.equal(transferGuards.similarNonLegendRejected, true);

  const acolyteDonorEligibility = await page.evaluate(() => {
    const savedRoster = rosterCharacters, savedMods = mods;
    const roster = [
      { baseId: "RECIPIENT", characterId: "UNIT-RECIPIENT", name: "Recipient", combat_type: 1, gear_level: 13, base_stats: { Speed: 300 } },
      { baseId: "WEAKDONOR", characterId: "UNIT-WEAK", name: "Weak Donor", combat_type: 1, gear_level: 13, base_stats: { Speed: 300 } },
      { baseId: "JEDIMASTERKENOBI", characterId: "UNIT-GL", name: "Galactic Legend Donor", combat_type: 1, gear_level: 13, base_stats: { Speed: 300 } },
      { baseId: "HEALTHYDONOR", characterId: "UNIT-HEALTHY", name: "Healthy Donor", combat_type: 1, gear_level: 13, base_stats: { Speed: 300 } }
    ];
    const slots = ["Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross"];
    const make = (owner, slot, speed, id) => ({
      game_id: id, characterId: owner, slot, set_name: "Speed", level: 15, rarity: 5,
      primary_stat: "Offense", primary_value: 5,
      secondary_1_stat: "Speed", secondary_1_value: speed,
      secondary_2_stat: "Protection", secondary_2_value: 0,
      secondary_3_stat: "Potency %", secondary_3_value: 0,
      secondary_4_stat: "Tenacity %", secondary_4_value: 0
    });
    const sourceMods = [];
    for (const [owner, speeds] of [
      ["UNIT-RECIPIENT", [5, 13, 13, 13, 13, 13]],
      ["UNIT-WEAK", [10, 0, 0, 0, 0, 0]],
      ["UNIT-GL", [0, 0, 0, 0, 0, 0]],
      ["UNIT-HEALTHY", [20, 12, 12, 12, 12, 12]]
    ]) {
      speeds.forEach((speed, i) => sourceMods.push(make(owner, slots[i], speed, owner + "-" + slots[i])));
    }
    try {
      rosterCharacters = roster;
      mods = sourceMods;
      const proposals = holocronTopChangeCandidates();
      return {
        statuses: roster.map(character => v176ModStatus(getCharacterMods(character)).status),
        donorIds: [...new Set(proposals.map(item => item.donor.baseId))],
        proposals: proposals.length
      };
    } finally {
      rosterCharacters = savedRoster;
      mods = savedMods;
    }
  });
  assert.deepEqual(acolyteDonorEligibility.statuses, ["BONS", "TRÈS FAIBLES", "TRÈS FAIBLES", "BONS"]);
  assert.ok(acolyteDonorEligibility.proposals > 0,
    "The fixture must produce a real exchange so donor eligibility is tested through the Acolyte engine.");
  assert.deepEqual(acolyteDonorEligibility.donorIds, ["WEAKDONOR"],
    "Acolyte must exclude Galactic Legends and healthy characters from the donor pool.");


  // Seigneur regression: never trade away a complete Speed-set bonus, even
  // when the incoming mod has the same individual speed as the equipped mod.
  const speedGuard = await page.evaluate(() => {
    const character = { baseId: "TEST", name: "Test", characterId: "UNIT-SPEED", gear_level: 13, base_stats: { Speed: 300 }, stat_components: { source: "Crinolo.stats.base+stats.gear", base: { Speed: 300 }, gear: { Speed: 0 } } };
    const make = (id, set, speed) => ({game_id:id,character:"TEST",slot:"Square",set_name:set,level:15,primary_stat:"Offense",primary_value:5,secondary_1_stat:"Speed",secondary_1_value:speed,secondary_2_stat:"Protection",secondary_2_value:0,secondary_3_stat:"Potency %",secondary_3_value:0,secondary_4_stat:"Tenacity %",secondary_4_value:0});
    const equipped = [make("a","Speed",5),make("b","Speed",5),make("c","Speed",5),make("d","Speed",5),make("e","Health",0),make("f","Health",0)];
    const before = forgeProjectedModSpeed(character,{base_stats:{Speed:300}},equipped);
    const after = forgeProjectedModSpeed(character,{base_stats:{Speed:300}},[...equipped.slice(1),make("replacement","Health",5)]);
    const replacement=make("replacement","Health",5);
    const build=[...equipped.slice(1),replacement];
    return {before:before.total,after:after.total,accepted:after.total+1e-9>=before.total,beforeSet:before.hasFourPieceSpeedSet,afterSet:after.hasFourPieceSpeedSet,beforeBonus:before.setBonus,afterBonus:after.setBonus,candidateAccepted:forgeCandidatePreservesSpeed(character,{base_stats:{Speed:300}},equipped,equipped[0],replacement),buildAccepted:forgeBuildPreservesSpeed(character,{base_stats:{Speed:300}},equipped,build),unchangedBuildAccepted:forgeBuildPreservesSpeed(character,{base_stats:{Speed:300}},equipped,equipped)};
  });
  assert.equal(speedGuard.accepted, false, "A replacement must not remove the 4-piece Speed-set bonus: "+JSON.stringify(speedGuard));
  assert.equal(speedGuard.candidateAccepted, false, "Seigneur must reject an individual mod exchange that removes the 4-piece Speed set.");
  assert.equal(speedGuard.buildAccepted, false, "Seigneur must reject a six-mod build that reduces the projected speed.");
  assert.equal(speedGuard.unchangedBuildAccepted, true, "A six-mod build preserving the current speed must remain eligible.");

  // Mod P0 regressions: keep arithmetic numeric and preserve stat identity.
  const modMath = await page.evaluate(() => ({
    localized: numericValue("1 234,5"),
    forgeTotal: forgeProjectedModSpeed({baseId:"TEST",name:"Test"},{},Array.from({length:6},(_,i)=>({game_id:"m"+i,slot:["Square","Arrow","Diamond","Triangle","Circle","Cross"][i],set_name:"Health",level:15,primary_stat:"Health",primary_value:100,secondary_1_stat:"Speed",secondary_1_value:5,secondary_2_stat:"Protection",secondary_2_value:0,secondary_3_stat:"Potency %",secondary_3_value:0,secondary_4_stat:"Tenacity %",secondary_4_value:0}))).modSpeed,
    offenseFlat: discipleCanonicalStat("Offense"),
    offensePercent: discipleCanonicalStat("Offense %"),
    healthFlat: discipleCanonicalStat("Health"),
    healthPercent: discipleCanonicalStat("Health %"),
    secondaryUnitIdentity: forgeSecondaryStats({level:15,primary_stat:"Health",primary_value:100,
      secondary_1_stat:"Offense",secondary_1_value:20,
      secondary_2_stat:"Offense %",secondary_2_value:5,
      secondary_3_stat:"Potency %",secondary_3_value:2.5,
      secondary_4_stat:"Tenacity %",secondary_4_value:3}).map(x=>({stat:x.stat,key:x.key})),
  }));
  assert.equal(modMath.localized, 1234.5);
  assert.equal(modMath.forgeTotal, 30, "Forge must add six mod speeds numerically, not concatenate strings");
  assert.notEqual(modMath.offenseFlat, modMath.offensePercent, "Offense and Offense % are distinct secondary stats");
  assert.notEqual(modMath.healthFlat, modMath.healthPercent, "Health and Health % are distinct secondary stats");
  assert.equal(modMath.secondaryUnitIdentity[0].key, "OFFENSE");
  assert.equal(modMath.secondaryUnitIdentity[1].key, "OFFENSEPERCENT");
  assert.equal(modMath.secondaryUnitIdentity[2].stat, "Potency %");
  assert.equal(modMath.secondaryUnitIdentity[3].stat, "Tenacity %");

  const incompleteSpeedUi = await page.evaluate(() => {
    const incomplete = {slot:"Square",set_name:"Health",level:15,primary_stat:"Offense",primary_value:50,secondary_1_stat:"Speed",secondary_1_value:5};
    const completeWithoutSpeed = {slot:"Square",set_name:"Health",level:15,primary_stat:"Offense",primary_value:50,secondary_1_stat:"Protection",secondary_1_value:0,secondary_2_stat:"Potency %",secondary_2_value:0,secondary_3_stat:"Tenacity %",secondary_3_value:0,secondary_4_stat:"Critical Damage %",secondary_4_value:0};
    const originalMods = mods;
    try {
      const summary = speedBreakdown([incomplete, completeWithoutSpeed]);
      mods = [incomplete];
      const row = inventoryRows()[0];
      return {unknown:summary.unknown,noSpeed:summary.no_speed,rowSpeed:row._speed,rowCategory:row._speedCategory,card:renderModCard(incomplete)};
    } finally { mods = originalMods; }
  });
  assert.equal(incompleteSpeedUi.unknown, 1, "Incomplete mod data must have its own summary category");
  assert.equal(incompleteSpeedUi.noSpeed, 1, "A complete mod with no Speed secondary is genuinely in the no-speed category");
  assert.equal(incompleteSpeedUi.rowSpeed, null, "An unknown speed value must remain null in the inventory model");
  assert.equal(incompleteSpeedUi.rowCategory, "unknown");
  assert.match(incompleteSpeedUi.card, /Données incomplètes/);
  assert.doesNotMatch(incompleteSpeedUi.card, /Sans Speed/);

  const discipleUnitSafety = await page.evaluate(() => {
    const make = secondary => ({slot:"Square",set_name:"Health",level:15,primary_stat:"Offense",primary_value:50,
      secondary_1_stat:secondary,secondary_1_value:secondary==="Offense %"?5:20,
      secondary_2_stat:"Protection",secondary_2_value:0,
      secondary_3_stat:"Potency %",secondary_3_value:0,
      secondary_4_stat:"Tenacity %",secondary_4_value:0});
    const flat=make("Offense"),percent=make("Offense %");
    const incomplete={slot:"Square",set_name:"Health",level:15,primary_stat:"Offense",primary_value:50,secondary_1_stat:"Speed",secondary_1_value:5};
    const originalMods=mods;
    try {
      mods=[flat,percent];
      return {
        labels:reallocationSecondaryOptions(),
        flatKey:discipleCanonicalStat(secondaryDisplayName("Offense")),
        percentKey:discipleCanonicalStat(secondaryDisplayName("Offense %")),
        flatMatchesPercent:reallocationCandidateSecondary(flat,"Offense %"),
        percentMatchesPercent:reallocationCandidateSecondary(percent,"Offense %"),
        incompleteTierMatch:reallocationSpeedTierMatch(incomplete,"speed_1_5")
      };
    } finally { mods=originalMods; }
  });
  assert.ok(discipleUnitSafety.labels.includes("Offense"));
  assert.ok(discipleUnitSafety.labels.includes("Offense %"));
  assert.notEqual(discipleUnitSafety.flatKey,discipleUnitSafety.percentKey,"Disciple must keep flat Offense distinct from Offense %");
  assert.equal(discipleUnitSafety.flatMatchesPercent,null,"A flat Offense secondary must not satisfy an Offense % search");
  assert.equal(discipleUnitSafety.percentMatchesPercent.value,5);
  assert.equal(discipleUnitSafety.incompleteTierMatch,false,"Incomplete mod data must not be classified into a numeric speed tier");

  // Disciple: consecutive searches must refresh the visible candidates every
  // time, including when the user changes the secondary and then clicks search.
  const discipleRepeatSearch = await page.evaluate(() => {
    const target = {
      game_id: "target-mod", character: "Target", slot: "Square",
      set_name: "Speed", primary_stat: "Offense", primary_value: 5, speed: 10,
    };
    const rowsBySearch = {
      POTENCY: [{
        character: { name: "Potency donor", baseId: "POTENCYDONOR" },
        mod: { game_id: "potency-mod", slot: "Square", set_name: "Speed", primary_stat: "Offense", primary_value: 5, secondary_1_stat: "Potency", secondary_1_value: 18, speed: 12 },
        status: "FAIBLES", class: "weak", speed: 12,
      }],
      OFFENSE: [{
        character: { name: "Offense donor", baseId: "OFFENSEDONOR" },
        mod: { game_id: "offense-mod", slot: "Square", set_name: "Speed", primary_stat: "Offense", primary_value: 5, secondary_1_stat: "Offense", secondary_1_value: 900, speed: 15 },
        status: "FAIBLES", class: "weak", speed: 15,
      }],
    };
    const original = {
      selected: selectedReallocationMod,
      sources: reallocationSourceRows,
      speed: modTotalSpeed,
      portrait: disciplePortraitHtml,
      icon: modIconHtml,
    };
    try {
      selectedReallocationMod = () => target;
      reallocationSourceRows = () => rowsBySearch[$('reallocationSecondary').value] || [];
      modTotalSpeed = mod => Number(mod?.speed || 0);
      disciplePortraitHtml = () => '<span></span>';
      modIconHtml = () => '<span></span>';
      const select = $('reallocationSecondary');
      select.innerHTML = '<option value="POTENCY">Potency</option><option value="OFFENSE">Offense</option>';
      const button = $('runReallocation');
      const snapshots = [];
      select.value = "POTENCY";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      snapshots.push({ search: select.value, text: $('reallocationResults').textContent });
      select.value = "OFFENSE";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      snapshots.push({ search: select.value, text: $('reallocationResults').textContent });
      select.value = "POTENCY";
      button.click();
      snapshots.push({ search: select.value, text: $('reallocationResults').textContent });
      return snapshots;
    } finally {
      selectedReallocationMod = original.selected;
      reallocationSourceRows = original.sources;
      modTotalSpeed = original.speed;
      disciplePortraitHtml = original.portrait;
      modIconHtml = original.icon;
      renderReallocationSecondaryOptions("");
      renderReallocationResults();
    }
  });
  assert.match(discipleRepeatSearch[0].text, /Potency donor/);
  assert.doesNotMatch(discipleRepeatSearch[0].text, /Offense donor/);
  assert.match(discipleRepeatSearch[1].text, /Offense donor/);
  assert.doesNotMatch(discipleRepeatSearch[1].text, /Potency donor/);
  assert.match(discipleRepeatSearch[2].text, /Potency donor/);
  assert.doesNotMatch(discipleRepeatSearch[2].text, /Offense donor/);

  // Profile sync: a valid API payload replaces the snapshot atomically.
  let failProfileSync = false;
  await page.route("**/swgoh-optimizer-relay.lorg75017.workers.dev/**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("path") === "api-profile" && !failProfileSync) {
      const units = [{
        base_id: "TESTCHAR",
        name: "Test Character",
        level: 85,
        rarity: 7,
        gear_level: 13,
        combat_type: 1,
      }];
      const mods = [2, 3, 4, 5, 6, 7].map((slot, index) => ({
        id: "sync-mod-" + index,
        slot,
        level: 15,
        set: 4,
        pips: 5,
        primary_stat: { name: "Offense", value: 5 },
        secondary_stats: [{ name: "Speed", value: 5 }],
        unit_equiped: "TESTCHAR",
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            name: "Sync Test",
            galactic_power: 12345,
            character_galactic_power: 10000,
            ship_galactic_power: 2345,
          },
          units,
          mods,
        }),
      });
      return;
    }
    await route.fulfill({ status: 502, contentType: "text/plain", body: "upstream unavailable" });
  });
  await page.route("https://swgoh.gg/**", route =>
    route.fulfill({ status: 502, contentType: "text/plain", body: "upstream unavailable" })
  );
  await page.locator("#allyCode").evaluate(el => { el.value = "123456789"; });
  const syncOk = await page.evaluate(() => loadRemotePlayer());
  assert.equal(syncOk, true, "A valid API profile and mod inventory must synchronize");
  const committedProfile = await page.evaluate(() => ({
    name: currentData?.name,
    allyCode: currentData?.allyCode,
    characters: rosterCharacters.length,
    ships: rosterShips.length,
    mods: mods.length,
    gp: accountGalacticPower,
  }));
  assert.equal(committedProfile.name, "Sync Test");
  assert.equal(committedProfile.characters, 1);
  assert.equal(committedProfile.ships, 0);
  assert.equal(committedProfile.mods, 6);
  assert.deepEqual(committedProfile.gp, { total: 12345, characters: 10000, ships: 2345 });

  // A failed refresh must not zero GP or partially replace the last valid roster.
  failProfileSync = true;
  const syncFailed = await page.evaluate(() => loadRemotePlayer());
  assert.equal(syncFailed, false, "An unavailable source must fail cleanly");
  const retainedProfile = await page.evaluate(() => ({
    name: currentData?.name,
    characters: rosterCharacters.length,
    ships: rosterShips.length,
    mods: mods.length,
    gp: accountGalacticPower,
  }));
  assert.deepEqual(retainedProfile, {
    name: committedProfile.name,
    characters: committedProfile.characters,
    ships: committedProfile.ships,
    mods: committedProfile.mods,
    gp: committedProfile.gp,
  });
  await page.unroute("**/swgoh-optimizer-relay.lorg75017.workers.dev/**");
  await page.unroute("https://swgoh.gg/**");

  // Sanctuaire bleu: verify that extracted CSS/JS load and the real
  // mode -> league -> Padawan route remains functional.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const sampleRoster = JSON.stringify([
      "Rey", "Ben Solo", "Cal Kestis", "Commander Ahsoka Tano", "General Kenobi"
    ]);
    sessionStorage.setItem("holocronRosterNames", sampleRoster);
    localStorage.setItem("holocronRosterNames", sampleRoster);
  });
  const rawCatalogAccessible = await page.evaluate(async () => {
    const response = await fetch("https://raw.githubusercontent.com/Selimna95/Selimna-Holocron/feature/live-gac-catalog-v4.1.0/blue-gac/gac-catalog.json", { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    return Array.isArray(data.teams) && data.teams.length > 1000;
  });
  assert.equal(rawCatalogAccessible, true, "The GitHub Raw catalogue must be readable cross-origin from the Pages app.");
  const blueResponse = await page.goto(origin + "/blue-gac/", { waitUntil: "domcontentloaded" });
  assert.equal(blueResponse?.status(), 200, "The blue GAC page must return HTTP 200");
  assert.match(await page.title(), /V4\.1\.4/);
  assert.equal(await page.locator("#modeView").isVisible(), true);
  await page.locator('[data-mode="5v5"]').click();
  await page.locator('[data-tier="Kyber"]').click();
  await page.locator('[data-access="Padawan"]').click();
  await page.locator("#padawanView").waitFor({ state: "visible" });
  assert.equal(await page.locator("#teamResults").count(), 1, "The Padawan result area must be present.");
  await page.locator("#runCatalogAudit").click();
  await page.locator("#catalogAuditPanel").waitFor({ state: "visible" });
  assert.equal(await page.locator("#auditSignals").count(), 1, "The strategic statistical audit must render.");
  assert.match(await page.locator("#auditSignals").textContent(), /comparables|données/i);
  assert.match(await page.locator("#padawanStatus").textContent(), /catalogue dynamique|compositions observées|équipes défensives retenues|classement actuel/i);
  assert.equal(await page.locator(".access-scene img").count(), 1);
  assert.deepEqual(pageErrors, [], "Unexpected uncaught browser errors: " + pageErrors.join(" | "));
  assert.deepEqual(failedLocalAssets, [], "Local JavaScript/CSS assets must be served successfully: " + JSON.stringify(failedLocalAssets));
  console.log("Browser smoke passed: shell, navigation, Visionnaire behavior, profile sync, and blue-GAC flow.");
} finally {
  await browser.close();
}
