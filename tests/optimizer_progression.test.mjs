import assert from "node:assert/strict";
import { calculateCrinoloProfile, normalizeCrinoloRosterUnit } from "../modules/optimizer-progression.mjs";
import crinoloStatCalc from "../vendor/crinolo-stat-calc.mjs";

assert.equal(typeof crinoloStatCalc.setGameData, "function");
assert.equal(typeof crinoloStatCalc.calcCharStats, "function");

const gear = [
  { slot: 1, is_obtained: true, base_id: "GEAR_A" },
  { slot: 2, is_obtained: false, base_id: "GEAR_B" },
  { slot: 3, is_obtained: true, base_id: "GEAR_C" },
  { slot: 4, is_obtained: false, base_id: "GEAR_D" },
  { slot: 5, is_obtained: false, base_id: "GEAR_E" },
  { slot: 6, is_obtained: false, base_id: "GEAR_F" },
];
const source = { data: {
  base_id: "TEST_UNIT", level: 85, rarity: 7, gear_level: 12, relic_tier: 2, gear,
} };
const normalized = normalizeCrinoloRosterUnit(source);
assert.equal(normalized.error, null);
assert.deepEqual(normalized.unit.equipped, [{ equipmentId: "GEAR_A" }, { equipmentId: "GEAR_C" }]);
assert.deepEqual(normalized.metadata, { level: 85, rarity: 7, gear_level: 12, relic_tier: 2 });

const missingGear = normalizeCrinoloRosterUnit({ data: { ...source.data, gear: gear.slice(0, 5) } });
assert.match(missingGear.error, /six emplacements/);
const ambiguousGear = normalizeCrinoloRosterUnit({ data: { ...source.data, gear: gear.map((item, i) => i ? item : { ...item, is_obtained: "true" }) } });
assert.match(ambiguousGear.error, /sans ambiguïté/);
const missingG13Relic = normalizeCrinoloRosterUnit({ data: { base_id: "TEST_UNIT", level: 85, rarity: 7, gear_level: 13, gear } });
assert.match(missingG13Relic.error, /relique absent/);
const g13Gear = gear.map(item => ({ ...item, is_obtained: true }));
const g13 = normalizeCrinoloRosterUnit({ data: { base_id: "TEST_UNIT", level: 85, rarity: 7, gear_level: 13, relic_tier: 0, gear: g13Gear } });
assert.equal(g13.error, null);
assert.equal(g13.unit.relic.currentTier, 2);
assert.equal(g13.unit.gear, 12);
assert.equal(g13.unit.equipped.length, 6);

const statIds = { 1: 1000, 5: 120, 6: 200, 7: 150, 8: 0.2, 9: 0.25, 17: 0.1, 18: 0.2, 28: 500 };
const gearIds = { 1: 100, 5: 5, 6: 10, 7: 0, 8: 0.02, 9: 0.03, 17: 0, 18: 0, 28: 50 };
let receivedUnit = null;
const calculator = {
  setGameData() {},
  calcCharStats(unit, options) {
    receivedUnit = unit;
    assert.deepEqual(options, { withoutModCalc: true, gameStyle: true });
    return { base: statIds, gear: gearIds };
  },
};
const gameData = {
  unitData: { TEST_UNIT: {
    gearLvl: { 12: {}, 13: {} },
    growthModifiers: { 7: {} },
    relic: { 8: "RELIC_8", 10: "RELIC_10" },
  } },
  gearData: { GEAR_A: {}, GEAR_B: {}, GEAR_C: {}, GEAR_D: {}, GEAR_E: {}, GEAR_F: {} },
  relicData: { RELIC_8: {}, RELIC_10: {} },
};
const calculated = calculateCrinoloProfile(source, calculator, gameData);
assert.equal(calculated.error, null);
assert.deepEqual(receivedUnit.equipped, [{ equipmentId: "GEAR_A" }, { equipmentId: "GEAR_C" }]);
assert.equal(calculated.profile.base_stats.Health, 1100);
assert.equal(calculated.profile.base_stats.Speed, 125);
assert.equal(calculated.profile.stat_components.base.Health, 1000);
assert.equal(calculated.profile.stat_components.gear.Health, 100);
assert.equal(calculated.profile.stat_components.source, "Crinolo.stats.base+stats.gear");
assert.equal(calculated.profile.base_stats.Armor, 22);
assert.ok(Math.abs(calculated.profile.base_stats.Resistance - 28) < 1e-10);
assert.equal(calculated.profile.stat_components.base.Armor, 20);
assert.equal(calculated.profile.stat_components.gear.Resistance, 3);

const unknownPiece = calculateCrinoloProfile({ data: { ...source.data, gear: gear.map((item, i) => i === 0 ? { ...item, base_id: "UNKNOWN" } : item) } }, calculator, gameData);
assert.match(unknownPiece.error, /Pièce de gear inconnue/);
const unsupportedRelic = calculateCrinoloProfile({ data: { base_id: "TEST_UNIT", level: 85, rarity: 7, gear_level: 13, relic_tier: 11, gear: g13Gear } }, calculator, gameData);
assert.match(unsupportedRelic.error, /palier de relique/);

console.log("Optimizer Crinolo progression tests passed.");
