import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../modules/mod-engine.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const engine = sandbox.module.exports;
const zeroSecondaries = {
  secondary_1_stat: 'Protection', secondary_1_value: 0,
  secondary_2_stat: 'Potency %', secondary_2_value: 0,
  secondary_3_stat: 'Tenacity %', secondary_3_value: 0,
  secondary_4_stat: 'Critical Damage %', secondary_4_value: 0
};

assert.equal(engine.version, '0.3.14');

assert.equal(engine.canonicalSet(1), 'health');
assert.equal(engine.canonicalSet('Critical Damage'), 'criticalDamage');
assert.equal(engine.canonicalSet('Protection'), null);
assert.deepEqual(Array.from({ length: 7 }, (_, index) => engine.canonicalSlot(index + 1)), ['Square','Square','Arrow','Diamond','Triangle','Circle','Cross']);
assert.equal(engine.canonicalSlot(8), null);
assert.deepEqual(['130','131','132','133','134','135'].map(id => engine.slotFromDefinitionId(id)), ['Square','Arrow','Diamond','Triangle','Circle','Cross']);
assert.equal(engine.normalizeMod({ definitionId: '130', level: 15, primary_stat: 'Speed', primary_value: 15 }).slot, 'Square');
assert.equal(engine.normalizeMod({ definitionId: '131', slot: 2, level: 15, primary_stat: 'Speed', primary_value: 15 }).slot, 'Arrow');
assert.equal(engine.normalizeMod({ slot_id: 7, level: 15, primary_stat: 'Speed', primary_value: 15 }).slot, 'Cross');
assert.deepEqual({ ...engine.calculateSetBonuses([
  { set_name: 'Speed', level: 15 }, { set_name: 'Speed', level: 15 },
  { set_name: 'Speed', level: 15 }, { set_name: 'Speed', level: 15 }
]) }, { speed: 10 });
assert.deepEqual({ ...engine.calculateSetBonuses([
  { set_name: 'Speed', level: 15 }, { set_name: 'Speed', level: 14 },
  { set_name: 'Speed', level: 15 }, { set_name: 'Speed', level: 15 }
]) }, { speed: 5 });
assert.deepEqual({ ...engine.calculateSetBonuses([
  { set_name: 'Health', level: 15 }, { set_name: 'Health', level: 15 },
  { set_name: 'Health', level: 10 }, { set_name: 'Health', level: 15 },
  { set_name: 'Health', level: 15 }, { set_name: 'Health', level: 15 }
]) }, { health: 25 });

// Comlink IDs preserve the distinction that core.js previously erased.
const offenseFlat = engine.normalizeStat({ unitStatId: 41, unscaledDecimalValue: 4000000000 });
const offensePercent = engine.normalizeStat({ unitStatId: 48, unscaledDecimalValue: 2500000 });
assert.equal(offenseFlat.key, 'offense');
assert.equal(offenseFlat.unit, 'flat');
assert.equal(offenseFlat.value, 40);
assert.equal(offensePercent.key, 'offense');
assert.equal(offensePercent.unit, 'percentagePoints');
assert.equal(offensePercent.value, 2.5);
assert.equal(engine.normalizeStat({ unitStatId: 48, unscaledDecimalValue: 2500000 }, 2.5).value, 2.5);

const defenseFlat = engine.normalizeStat({ unitStatId: 42, unscaledDecimalValue: 1200000000 });
const defensePercent = engine.normalizeStat({ unitStatId: 49, unscaledDecimalValue: 5000000 });
assert.equal(defenseFlat.unit, 'flat');
assert.equal(defensePercent.unit, 'percentagePoints');
assert.equal(defensePercent.value, 5);

assert.equal(engine.normalizeStat({ unitStatId: 16, unscaledDecimalValue: 30000000 }).key, 'criticalDamage');
const physicalCritRating = engine.normalizeStat({ unitStatId: 14, unscaledDecimalValue: 2400000000 });
const specialCritRating = engine.normalizeStat({ unitStatId: 15, unscaledDecimalValue: 4800000000 });
assert.equal(physicalCritRating.key, 'physicalCriticalChance');
assert.equal(physicalCritRating.unit, 'flat');
assert.equal(physicalCritRating.value, 24);
assert.equal(specialCritRating.key, 'specialCriticalChance');
assert.equal(specialCritRating.value, 48);
assert.equal(engine.normalizeStat({ unitStatId: 45, unscaledDecimalValue: 2400000000 }).complete, false);
assert.equal(engine.normalizeStat({ unitStatId: 47, unscaledDecimalValue: 2400000000 }).complete, false);
assert.equal(engine.normalizeStat('Potency', 2.5).unit, 'unknown');
assert.equal(engine.normalizeStat('Potency', 2.5).complete, false);
assert.equal(engine.normalizeStat('Speed', 5).unit, 'flat');
assert.equal(engine.normalizeStat('Offense', 40).unit, 'flat');
assert.equal(engine.normalizeStat('Potency %', 2.5).unit, 'percentagePoints');
assert.equal(engine.normalizeStat('Potency %', '2.5%').value, 2.5);
assert.equal(engine.normalizeStat('Speed', '12garbage').value, null);
assert.equal(engine.normalizeStat({ unitStatId: 16, unscaledDecimalValue: 30000000 }).value, 30);
assert.equal(engine.canonicalStatKey('Offense %'), 'OFFENSEPERCENT');
assert.equal(engine.canonicalStatKey('Potency %'), 'POTENCY');
assert.equal(engine.canonicalStatKey('Speed %'), 'SPEEDPERCENT');
assert.equal(engine.canonicalStatKey({ unitStatId: 14, unscaledDecimalValue: 2400000000 }), 'PHYSICALCRITICALCHANCE');
assert.equal(engine.canonicalStatKey({ unitStatId: 21, unscaledDecimalValue: 2000000 }), 'PHYSICALCRITICALCHANCEPERCENT');
assert.notEqual(
  engine.canonicalStatKey({ unitStatId: 39, unscaledDecimalValue: 2400000000 }),
  engine.canonicalStatKey({ unitStatId: 35, unscaledDecimalValue: 2000000 })
);
const speedParts = engine.speedMetrics({ primary_stat: 'Speed', primary_value: 30, secondary_1_stat: 'Speed', secondary_1_value: 5 });
assert.equal(speedParts.primary, true);
assert.equal(speedParts.primarySpeed, 30);
assert.equal(speedParts.secondary, 5);
assert.equal(speedParts.total, 35);
assert.equal(engine.normalizeStat({ unitStatId: 31, unscaledDecimalValue: 3000000 }).key, 'physicalDamage');
assert.equal(engine.normalizeStat({ unitStatId: 32, unscaledDecimalValue: 4000000 }).key, 'specialDamage');
assert.equal(engine.normalizeStat({ unitStatId: 23, unscaledDecimalValue: 1000000 }).key, 'armor');
assert.equal(engine.normalizeStat({ unitStatId: 24, unscaledDecimalValue: 2000000 }).key, 'resistance');

const displayPercent = engine.normalizeStat('Offense %', '2,5%');
assert.equal(displayPercent.unit, 'percentagePoints');
assert.equal(displayPercent.value, 2.5);

const mod = engine.normalizeMod({
  id: 'fixture-mod',
  level: 15,
  set_name: 'Offense',
  slot: 'Square',
  primary_stat: { unitStatId: 48, unscaledDecimalValue: 2500000 },
  secondary_1_stat: 'Speed', secondary_1_value: 15,
  secondary_2_stat: 'Protection', secondary_2_value: 0,
  secondary_3_stat: 'Potency %', secondary_3_value: 0,
  secondary_4_stat: 'Tenacity %', secondary_4_value: 0
});
assert.equal(mod.id, 'fixture-mod');
assert.equal(mod.primary.unit, 'percentagePoints');
assert.equal(mod.primary.value, 2.5);
assert.equal(mod.secondaries[0].key, 'speed');
assert.equal(mod.secondaries[0].value, 15);
assert.equal(mod.complete, true);
const explicitUnitMod = engine.normalizeMod({ primary_stat: 'Offense', primary_stat_unit: 'percentagePoints', primary_value: 2.5 });
assert.equal(explicitUnitMod.primary.unit, 'percentagePoints');
assert.equal(explicitUnitMod.primary.value, 2.5);

const unknown = engine.normalizeStat({ unitStatId: 999, unscaledDecimalValue: 123 });
assert.equal(unknown.unit, 'unknown');
assert.equal(unknown.complete, false);

const scored = engine.scoreMod({
  level: 15,
  primary_stat: 'Offense %',
  primary_value: 5.88,
  secondary_1_stat: 'Speed',
  secondary_1_value: 20,
  secondary_2_stat: 'Potency %',
  secondary_2_value: 2.5
});
assert.equal(scored, 37.35);


const projectionBase = {
  Health: 1000, Protection: 2000, Speed: 100,
  'Physical Damage': 500, 'Special Damage': 700,
  Armor: 50, Resistance: 40, Potency: 0.1, Tenacity: 0.2,
  'Critical Damage': 1.5,
  'Physical Critical Chance': 40, 'Special Critical Chance': 30,
  'Physical Critical Avoidance': 0, 'Special Critical Avoidance': 0
};
const critRatingProjection = engine.calculateFinalStats(projectionBase, [
  { level: 1, set_name: 'Health', primary_stat: { unitStatId: 14, unscaledDecimalValue: 2400000000 } },
  { level: 1, set_name: 'Health', primary_stat: { unitStatId: 15, unscaledDecimalValue: 4800000000 } }
]);
assert.equal(critRatingProjection.complete, true);
assert.equal(critRatingProjection.stats['Physical Critical Chance'], 41);
assert.equal(critRatingProjection.stats['Special Critical Chance'], 32);

const unsupportedProjection = engine.calculateFinalStats(projectionBase, [{ level: 1, set_name: 'Health', primary_stat: { unitStatId: 33, unscaledDecimalValue: 12000000 } }]);
assert.equal(unsupportedProjection.complete, false);
assert.ok(unsupportedProjection.missing.includes('stat:physicalAccuracy:unsupported') || unsupportedProjection.missing.includes('stat:specialAccuracy:unsupported'));

const offenseProjection = engine.calculateFinalStats(projectionBase, [
  { level: 15, set_name: 'Offense', primary_stat: 'Offense', primary_value: 40, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Offense %', primary_value: 10, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }
], 85);
assert.equal(offenseProjection.complete, true);
assert.equal(offenseProjection.stats['Physical Damage'], 665);
assert.equal(offenseProjection.stats['Special Damage'], 915);

const defenseProjection = engine.calculateFinalStats(projectionBase, [
  { level: 1, set_name: 'Health', primary_stat: 'Defense', primary_value: 40 },
  { level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10 }
], 85);
assert.equal(defenseProjection.complete, false);
assert.ok(defenseProjection.missing.includes('defense:gear_component_required'));
const flatDefenseProjection = engine.calculateFinalStats(projectionBase, [
  { level: 1, set_name: 'Health', primary_stat: 'Defense', primary_value: 40 }
], 85);
const missingLevelDefenseProjection = engine.calculateFinalStats(projectionBase, [
  { level: 1, set_name: 'Health', primary_stat: 'Defense', primary_value: 40 }
]);
assert.equal(missingLevelDefenseProjection.complete, false);
assert.ok(missingLevelDefenseProjection.missing.includes('level'));
assert.equal(flatDefenseProjection.complete, true);
assert.ok(Math.abs(flatDefenseProjection.stats.Armor - 51.5209) < 0.001);
assert.ok(Math.abs(flatDefenseProjection.stats.Resistance - 42.1769) < 0.001);

const speedProjection = engine.calculateFinalStats(projectionBase, [
  ...Array.from({ length: 4 }, () => ({ level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }))
], 85);
assert.equal(engine.calculateSetBonuses(Array.from({ length: 4 }, () => ({ level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }))).speed, 10);
const speedCalc = engine.calculateSpeed(100, Array.from({ length: 4 }, () => ({ level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries })));
assert.equal(speedCalc.total, 110, JSON.stringify(speedCalc));
const incompleteSpeedSet = engine.calculateSpeed(100, [
  { set_name: 'Speed', level: 15, primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }, { set_name: 'Speed', level: 15, primary_stat: 'Health', primary_value: 100, ...zeroSecondaries },
  { set_name: 'Speed', level: 15, primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }, { set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }
]);
assert.equal(incompleteSpeedSet.complete, false);
assert.equal(incompleteSpeedSet.total, null);
assert.ok(incompleteSpeedSet.missing.includes('mod:level_unknown'));
const incompleteSpeedPrimary = engine.calculateSpeed(100, [{ level: 15, set_name: 'Health', ...zeroSecondaries }]);
assert.equal(incompleteSpeedPrimary.complete, false);
assert.equal(incompleteSpeedPrimary.total, null);
assert.ok(incompleteSpeedPrimary.missing.includes('mod:primary_incomplete'));
const unknownSetProjection = engine.calculateFinalStats(projectionBase, [{ level: 1, set_name: 'Unmapped Set', primary_stat: 'Health', primary_value: 10 }]);
assert.equal(unknownSetProjection.complete, false);
assert.ok(unknownSetProjection.missing.includes('set:unknown'));
const unknownModLevelProjection = engine.calculateFinalStats(projectionBase, [{ set_name: 'Health', primary_stat: 'Health', primary_value: 10 }]);
assert.equal(unknownModLevelProjection.complete, false);
assert.ok(unknownModLevelProjection.missing.includes('mod:level_unknown'));
const incompleteSecondaryProjection = engine.calculateFinalStats(projectionBase, [{ level: 15, set_name: 'Health', primary_stat: 'Health', primary_value: 10, secondary_1_stat: 'Speed', secondary_1_value: 5 }]);
assert.equal(incompleteSecondaryProjection.complete, false);
assert.ok(incompleteSecondaryProjection.missing.includes('mod:secondary_incomplete'));
const level12CompleteMod = engine.normalizeMod({ level: 12, set_name: 'Health', primary_stat: 'Health', primary_value: 10, ...zeroSecondaries });
assert.equal(level12CompleteMod.expectedSecondaries, 4);
assert.equal(level12CompleteMod.complete, true);

assert.equal(speedProjection.stats.Speed, 110);
const noPrimarySpeedMods = Array.from({ length: 6 }, () => ({ level: 15, set_name: 'Health', primary_stat: 'Health %', primary_value: 5, secondary_1_stat: 'Speed', secondary_1_value: 5, secondary_2_stat: 'Protection', secondary_2_value: 0, secondary_3_stat: 'Potency %', secondary_3_value: 0, secondary_4_stat: 'Tenacity %', secondary_4_value: 0 }));
assert.equal(engine.calculateSpeed(0, noPrimarySpeedMods).total, 30);
assert.equal(engine.calculateFinalStats({ Speed: 100, Health: 1000 }, noPrimarySpeedMods).stats.Speed, 130);
const missingPrimaryProjection = engine.calculateFinalStats(projectionBase, [{ level: 1, set_name: 'Health' }]);
assert.equal(missingPrimaryProjection.complete, false);
assert.ok(missingPrimaryProjection.missing.includes('mod:primary_incomplete'));
const missingPrimaryValueProjection = engine.calculateFinalStats(projectionBase, [{ level: 1, set_name: 'Health', primary_stat: { unitStatId: 41 } }]);
assert.equal(missingPrimaryValueProjection.complete, false);
assert.ok(missingPrimaryValueProjection.missing.includes('stat:value_missing'));


const profileProjection = engine.calculateFinalStats({
  level: 85,
  base_stats: { Health: 1000, Speed: 100, 'Physical Damage': 500, 'Special Damage': 700, Armor: 50, Resistance: 40 },
  current_stats: { 'Physical Critical Chance': 50, 'Special Critical Chance': 45, 'Critical Damage': 1.8, Potency: 0.12, Tenacity: 0.3 },
  mod_stat_diffs: { 'Physical Critical Chance': 5, 'Special Critical Chance': 5, 'Critical Damage': 0.3, Potency: 0.02, Tenacity: 0.1 }
}, [{ level: 1, set_name: 'Health', primary_stat: 'Critical Chance %', primary_value: 2 }], 85);
assert.equal(profileProjection.complete, true);
assert.equal(profileProjection.stats['Physical Critical Chance'], 47);
assert.equal(profileProjection.stats['Special Critical Chance'], 42);
assert.equal(profileProjection.stats['Critical Damage'], 1.5);

console.log('Shared mod engine contract tests passed.');
