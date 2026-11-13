import { chromium } from "playwright";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:8765";
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];

page.on("pageerror", error => pageErrors.push(error.message));

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

  // Seigneur regression: never trade away a complete Speed-set bonus, even
  // when the incoming mod has the same individual speed as the equipped mod.
  const speedGuard = await page.evaluate(() => {
    const character = { baseId: "TEST", name: "Test", characterId: "UNIT-SPEED" };
    const make = (id, set, speed) => ({game_id:id,character:"TEST",slot:"Square",set_name:set,level:15,primary_stat:"Offense",primary_value:5,secondary_1_stat:"Speed",secondary_1_value:speed});
    const equipped = [make("a","Speed",5),make("b","Speed",5),make("c","Speed",5),make("d","Speed",5),make("e","Health",0),make("f","Health",0)];
    const before = forgeProjectedModSpeed(character,{base_stats:{Speed:300}},equipped);
    const after = forgeProjectedModSpeed(character,{base_stats:{Speed:300}},[...equipped.slice(1),make("replacement","Health",5)]);
    return {before:before.total,after:after.total,accepted:after.total+1e-9>=before.total,beforeSet:before.hasFourPieceSpeedSet,afterSet:after.hasFourPieceSpeedSet,beforeBonus:before.setBonus,afterBonus:after.setBonus};
  });
  assert.equal(speedGuard.accepted, false, "A replacement must not remove the 4-piece Speed-set bonus: "+JSON.stringify(speedGuard));

  // Mod P0 regressions: keep arithmetic numeric and preserve stat identity.
  const modMath = await page.evaluate(() => ({
    localized: numericValue("1 234,5"),
    forgeTotal: forgeProjectedModSpeed({baseId:"TEST",name:"Test"},{},Array.from({length:6},(_,i)=>({game_id:"m"+i,slot:["Square","Arrow","Diamond","Triangle","Circle","Cross"][i],set_name:"Health",level:15,secondary_1_stat:"Speed",secondary_1_value:5}))).modSpeed,
    offenseFlat: discipleCanonicalStat("Offense"),
    offensePercent: discipleCanonicalStat("Offense %"),
    healthFlat: discipleCanonicalStat("Health"),
    healthPercent: discipleCanonicalStat("Health %"),
  }));
  assert.equal(modMath.localized, 1234.5);
  assert.equal(modMath.forgeTotal, 30, "Forge must add six mod speeds numerically, not concatenate strings");
  assert.notEqual(modMath.offenseFlat, modMath.offensePercent, "Offense and Offense % are distinct secondary stats");
  assert.notEqual(modMath.healthFlat, modMath.healthPercent, "Health and Health % are distinct secondary stats");

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
  console.log("Browser smoke passed: shell, navigation, profile sync, and blue-GAC flow.");
} finally {
  await browser.close();
}
