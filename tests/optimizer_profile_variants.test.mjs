import assert from "node:assert/strict";
import { buildOptimizerProfileVariants } from "../scripts/build-optimizer-profile-variants.mjs";
import { calculateCrinoloProfile } from "../modules/optimizer-progression.mjs";

const gearIds = ["GEAR_1", "GEAR_2", "GEAR_3", "GEAR_4", "GEAR_5", "GEAR_6"];
const base = { 1: 1000, 5: 150, 6: 100, 7: 100, 8: 100, 9: 100, 17: 0.1, 18: 0.2, 28: 500 };
const gear = { 1: 100, 5: 5, 6: 10, 7: 10, 8: 20, 9: 30, 17: 0.01, 18: 0.02, 28: 50 };
const calculator = {
  setGameData() {},
  calcCharStats() { return { base, gear }; },
};
const gameData = {
  source: { repository: "swgoh-utils/gamedata", commit: "test" },
  unitData: {
    TEST_UNIT: {
      combatType: 1,
      gearLvl: { 13: { gear: gearIds } },
      growthModifiers: { 7: {} },
      relic: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 3, `RELIC_${index + 1}`])),
    },
  },
  gearData: Object.fromEntries(gearIds.map(id => [id, {}])),
  relicData: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`RELIC_${index + 1}`, {}])),
};
const rosterSource = {
  data: {
    base_id: "TEST_UNIT",
    level: 85,
    rarity: 7,
    gear_level: 13,
    relic_tier: 3,
    gear: gearIds.map((base_id, index) => ({ slot: index + 1, is_obtained: true, base_id })),
  },
};
const exact = calculateCrinoloProfile(rosterSource, calculator, gameData);
assert.equal(exact.error, null);

const original = {
  name: "Test Unit",
  base_id: "TEST_UNIT",
  level: 85,
  rarity: 7,
  gear_level: 13,
  relic_tier: 3,
  base_stats: exact.profile.base_stats,
};
const built = buildOptimizerProfileVariants({ TEST_UNIT: original }, gameData, calculator);
assert.equal(built.dataset.schemaVersion, 2);
assert.equal(Object.keys(built.dataset.profiles.TEST_UNIT.variants).length, 11);
assert.ok(built.dataset.profiles.TEST_UNIT.variants["13:2"]);
assert.ok(built.dataset.profiles.TEST_UNIT.variants["13:12"]);
assert.equal(built.dataset.profiles.TEST_UNIT.variants["13:3"].base_stats.Speed, exact.profile.base_stats.Speed);
assert.equal(built.dataset.profiles.TEST_UNIT.variants["13:3"].stat_components.source, "Crinolo.stats.base+stats.gear");
assert.deepEqual(built.coverage.supportedRelicRanks, [0,1,2,3,4,5,6,7,8,9,10]);
assert.deepEqual(built.coverage.unsupportedRelicRanks, [11,12]);
assert.equal(built.coverage.g13Characters, 1);
assert.equal(built.coverage.originalSnapshotsPreserved, 1);

assert.throws(
  () => buildOptimizerProfileVariants({
    TEST_UNIT: { ...original, base_stats: { ...original.base_stats, Speed: 999 } },
  }, gameData, calculator),
  /Parité Crinolo refusée/,
);

console.log("Optimizer exact profile variants tests passed.");
