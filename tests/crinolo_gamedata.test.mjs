import assert from "node:assert/strict";
import fs from "node:fs";
import crinoloStatCalc from "../vendor/crinolo-stat-calc.mjs";
import { calculateCrinoloProfile } from "../modules/optimizer-progression.mjs";

const gameDataUrl = "https://raw.githubusercontent.com/swgoh-utils/gamedata/e96f00d4bcddb41d9bb93428a00ab7b4bb6fcdef/gameData.json";
const response = await fetch(gameDataUrl);
assert.equal(response.ok, true, `Crinolo gameData HTTP ${response.status}`);
const gameData = await response.json();
const profiles = JSON.parse(fs.readFileSync(new URL("../python/optimizer_profiles.json", import.meta.url), "utf8"));

let calculatedCount = 0;
const failures = [];
for (const profile of Object.values(profiles)) {
  const unit = gameData.unitData?.[profile.base_id];
  if (!unit?.gearLvl?.[profile.gear_level] || !unit.growthModifiers?.[profile.rarity]) {
    failures.push(`${profile.base_id}: référence unité/gear/rareté absente`);
    continue;
  }
  const gear = profile.gear_level === 13
    ? undefined
    : (unit.gearLvl[profile.gear_level].gear || []).map((base_id, index) => ({
        slot: index + 1,
        is_obtained: true,
        base_id,
      }));
  const source = { data: {
    base_id: profile.base_id,
    level: profile.level,
    rarity: profile.rarity,
    gear_level: profile.gear_level,
    relic_tier: profile.relic_tier,
    ...(gear ? { gear } : {}),
  } };
  const result = calculateCrinoloProfile(source, crinoloStatCalc, gameData);
  if (!result.profile) {
    failures.push(`${profile.base_id}: ${result.error}`);
    continue;
  }
  assert.equal(Object.keys(result.profile.base_stats).length, 9);
  assert.equal(result.profile.profile_source, "Crinolo");
  calculatedCount++;
}
assert.deepEqual(failures, [], `Profils non calculables par Crinolo :\n${failures.join("\n")}`);
assert.equal(calculatedCount, Object.keys(profiles).length);
console.log(`Crinolo gameData: ${calculatedCount} profils statiques vérifiés à leur gear/relique exacts.`);
