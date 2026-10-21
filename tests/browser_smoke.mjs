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
      body: 'export async function loadPyodide(){ throw new Error("Pyodide stubbed by browser smoke test"); }',
    });
  } else {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: 'window.loadPyodide = async () => { throw new Error("Pyodide stubbed by browser smoke test"); };',
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
    document.querySelector("#appShell").hidden = false;
    showPage("dashboard");
  });
  await page.locator('[data-page="help"]').click();
  assert.equal(await page.locator("body").getAttribute("data-page"), "help");
  assert.equal(await page.locator('[data-page="help"]').getAttribute("aria-current"), "page");

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
    const character = { baseId: "AHSOKATANO", name: "Ahsoka Tano" };
    const slots = ["Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross"];
    const makeMod = (slot, id) => ({
      game_id: id,
      character: "Ahsoka Tano",
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

  await page.waitForTimeout(500);
  assert.deepEqual(pageErrors, [], "Unexpected uncaught browser errors: " + pageErrors.join(" | "));
  console.log("Browser smoke passed: shell, navigation, and six-slot mod invariant.");
} finally {
  await browser.close();
}
