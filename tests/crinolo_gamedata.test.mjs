import assert from "node:assert/strict";
import fs from "node:fs";
import crinoloStatCalc from "../vendor/crinolo-stat-calc.mjs";
import { calculateCrinoloProfile, normalizeCrinoloRosterUnit } from "../modules/optimizer-progression.mjs";
import { buildCrinoloGameData } from "../scripts/build-crinolo-gamedata.mjs";

const gameData = await buildCrinoloGameData();
const profiles = JSON.parse(fs.readFileSync(new URL("../python/optimizer_profiles.json", import.meta.url), "utf8"));

let calculatedCount = 0;
const failures = [];
for (const profile of Object.values(profiles)) {
  const unit = gameData.unitData?.[profile.base_id];
  const crinoloGearLevel = Number(profile.gear_level);
  if (!unit?.gearLvl?.[crinoloGearLevel] || !unit.growthModifiers?.[profile.rarity]) {
    failures.push(`${profile.base_id}: référence unité/gear/rareté absente`);
    continue;
  }
  const gear = (unit.gearLvl[crinoloGearLevel].gear || []).map((base_id, index) => ({
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
  if (calculatedCount === 0) {
    const normalized = normalizeCrinoloRosterUnit(source);
    const gameStyle = crinoloStatCalc.calcCharStats(normalized.unit, { withoutModCalc: true, gameStyle: true });
    const statNames = {
      "1": "Health", "28": "Protection", "5": "Speed",
      "6": "Physical Damage", "7": "Special Damage",
      "8": "Armor", "9": "Resistance", "17": "Potency", "18": "Tenacity",
    };
    for (const [statId, name] of Object.entries(statNames)) {
      const scale = statId === "8" || statId === "9" ? 100 : 1;
      const expected = Number(gameStyle.final?.[statId] || 0) * scale;
      assert.ok(
        Math.abs(result.profile.base_stats[name] - expected) < 1e-6,
        `${profile.base_id} ${name}: séparation base/gear différente du résultat Crinolo gameStyle`
      );
    }
  }
  calculatedCount++;
}
assert.deepEqual(failures, [], `Profils non calculables par Crinolo :\n${failures.join("\n")}`);
assert.equal(calculatedCount, Object.keys(profiles).length);
console.log(`Crinolo gameData: ${calculatedCount} profils statiques vérifiés à leur gear/relique exacts.`);
