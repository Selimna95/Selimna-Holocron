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

  await page.evaluate(() => showPage("sithari"));
  assert.equal(await page.locator("body").getAttribute("data-page"), "sithari");
  assert.equal(await page.locator("#sithari").getAttribute("aria-hidden"), "false");

  // Regression guard: duplicate/aliased rows must never inflate equipped mods
  // beyond the six physical slots on either forge or Sith'ari.
  const counts = await page.evaluate(() => {
    const character = { baseId: "AHSOKATANO", name: "Ahsoka Tano", characterId: "UNIT-42" };
    const slots = [2, 3, 4, 5, 6, 7];
    const makeMod = (slot, id) => ({
      game_id: id,
      characterId: "UNIT-42",
      slot,
      set_name: "Speed",
      primary_stat: "Speed",
      primary_value: 30,
      level: 15,
      rarity: 5,
      secondary_1_stat: "Speed",
      secondary_1_value: 5,
    });
    const originalMods = mods;
    const originalRoster = rosterCharacters;
    const originalCache = sithariModCache;
    try {
      rosterCharacters = [character];
      mods = slots.flatMap((slot, index) => [
        makeMod(slot, "equipped-" + index),
        makeMod(slot, "duplicate-" + index),
      ]);
      sithariModCache = { signature: "", items: [], byOwner: new Map(), statusByOwner: new Map() };
      return {
        forge: getCharacterMods(character).length,
        sithari: sithariCharacterMods(character).length,
      };
    } finally {
      mods = originalMods;
      rosterCharacters = originalRoster;
      sithariModCache = originalCache;
    }
  });
  assert.deepEqual(counts, { forge: 6, sithari: 6 });

  // Seigneur regression: never trade away a complete Speed-set bonus, even
  // when the incoming mod has the same individual speed as the equipped mod.
  const speedGuard = await page.evaluate(() => {
    const character = { baseId: "TEST", name: "Test", characterId: "UNIT-SPEED" };
    const make = (id, set, speed) => ({game_id:id,character:"TEST",slot:"Square",set_name:set,primary_stat:"Offense",primary_value:5,secondary_1_stat:"Speed",secondary_1_value:speed});
    const equipped = [make("a","Speed",5),make("b","Speed",5),make("c","Speed",5),make("d","Speed",5),make("e","Health",0),make("f","Health",0)];
    const before = forgeProjectedModSpeed(character,{base_stats:{Speed:300}},equipped);
    const after = forgeProjectedModSpeed(character,{base_stats:{Speed:300}},[...equipped.slice(1),make("replacement","Health",5)]);
    return {before:before.total,after:after.total,accepted:after.total+1e-9>=before.total};
  });
  assert.equal(speedGuard.accepted, false, "A replacement must not remove the 4-piece Speed-set bonus");

  // Sanctuaire bleu: verify that extracted CSS/JS load and the real
  // mode -> league -> Padawan route remains functional.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const blueResponse = await page.goto(origin + "/blue-gac/", { waitUntil: "domcontentloaded" });
  assert.equal(blueResponse?.status(), 200, "The blue GAC page must return HTTP 200");
  assert.match(await page.title(), /V4\.0\.55/);
  assert.equal(await page.locator("#modeView").isVisible(), true);
  await page.locator('[data-mode="3v3"]').click();
  await page.locator('[data-tier="Kyber"]').click();
  await page.locator('[data-access="Padawan"]').click();
  await page.locator("#padawanView").waitFor({ state: "visible" });
  assert.match(await page.locator("#padawanStatus").textContent(), /Aucune recommandation|Aucune donnée défensive/);
  assert.equal(await page.locator(".access-scene img").count(), 1);
  assert.deepEqual(pageErrors, [], "Unexpected uncaught browser errors: " + pageErrors.join(" | "));
  console.log("Browser smoke passed: shell, navigation, six-slot invariant, characterId ownership, and numeric slot aliases.");
} finally {
  await browser.close();
}
