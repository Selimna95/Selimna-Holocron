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

assert.equal(engine.version, '0.3.28');

assert.equal(engine.canonicalSet(1), 'health');
assert.equal(engine.canonicalSet('Critical Damage'), 'criticalDamage');
assert.equal(engine.canonicalSet('Protection'), null);
assert.deepEqual(Array.from({ length: 7 }, (_, index) => engine.canonicalSlot(index + 1)), ['Square','Square','Arrow','Diamond','Triangle','Circle','Cross']);
assert.equal(engine.canonicalSlot(8), null);

const invalidLevelMod = engine.normalizeMod({
  level: 0, set_name: 'Health', primary_stat: 'Health', primary_value: 0
});
assert.equal(invalidLevelMod.complete, false);
const invalidLevelSet = engine.calculateSetBonuses([
  { set_name: 'Health', level: 16 }, { set_name: 'Health', level: 15 }
]);
assert.equal(invalidLevelSet.complete, false);
assert.ok(invalidLevelSet.missing.includes('mod:level_invalid'));
assert.deepEqual(['111','112','113','114','115','116'].map(id => engine.slotFromDefinitionId(id)), ['Square','Arrow','Diamond','Triangle','Circle','Cross']);
assert.equal(engine.normalizeMod({ definitionId: '111', level: 15, primary_stat: 'Speed', primary_value: 15 }).slot, 'Square');
assert.equal(engine.normalizeMod({ definitionId: '112', slot: 2, level: 15, primary_stat: 'Speed', primary_value: 15 }).slot, 'Arrow');
assert.equal(engine.normalizeMod({ slot_id: 7, level: 15, primary_stat: 'Speed', primary_value: 15 }).slot, 'Cross');
const comlinkPipsFallback = engine.normalizeMod({
  slot: 7, set: '1', level: 15, pips: 0, rarity: 5,
  primary_stat: 'Tenacity %', primary_value: 21,
  secondary_1_stat: 'Offense', secondary_1_value: 21,
  secondary_2_stat: 'Speed', secondary_2_value: 4,
  secondary_3_stat: 'Health %', secondary_3_value: 0.72,
  secondary_4_stat: 'Defense %', secondary_4_value: 2.37
});
assert.equal(comlinkPipsFallback.pips, 5, 'A zero Comlink pips sentinel must not mask the actual rarity');
assert.equal(engine.normalizeMod({ pips: 6, rarity: 5 }).pips, 6, 'A valid explicit pips value keeps precedence');
const realComlinkDefenseMod = engine.normalizeMod({
  slot: 7, set: '1', level: 15, pips: 0, rarity: 5,
  primary_stat: 'Health %', primary_value: 5.88,
  secondary_stats: [
    { name: 'Defense', stat_id: 49, value: 237.1, display_value: '2.37%', unscaled_roll_values: [2336, 2616] },
    { name: 'Speed', stat_id: 5, value: 40000, display_value: '4', unscaled_roll_values: [40000] },
    { name: 'Health', stat_id: 1, value: 8350000, display_value: '835', unscaled_roll_values: [41085900, 42449400] },
    { name: 'Tenacity', stat_id: 18, value: 281.8, display_value: '2.82%', unscaled_roll_values: [1778, 1159, 1761] }
  ]
});
assert.equal(realComlinkDefenseMod.pips, 5);
assert.equal(realComlinkDefenseMod.secondaries.find(stat => stat.id === 49).value, 2.371,
  'Comlink stat_id 49 value 237.1 must normalize to 2.371 percentage points, not 237.1');
assert.equal(realComlinkDefenseMod.secondaries.find(stat => stat.id === 5).value, 4,
  'Comlink flat Speed value 40000 must normalize to 4');
assert.equal(realComlinkDefenseMod.secondaries.find(stat => stat.id === 1).value, 835,
  'Comlink flat Health value 8350000 must normalize to 835');
assert.equal(realComlinkDefenseMod.secondaries.find(stat => stat.id === 18).value, 2.818,
  'Comlink percentage Tenacity value 281.8 must normalize to 2.818 percentage points');

const realComlinkScaleCases = [
  [48, 'Offense', 48.1, '0.48%', 0.481, 'percentagePoints'],
  [49, 'Defense', 237.1, '2.37%', 2.371, 'percentagePoints'],
  [53, 'Critical Chance', 316.7, '3.17%', 3.167, 'percentagePoints'],
  [55, 'Health', 71.8, '0.72%', 0.718, 'percentagePoints'],
  [56, 'Protection', 214, '2.14%', 2.14, 'percentagePoints'],
  [17, 'Potency', 198.2, '1.98%', 1.982, 'percentagePoints'],
  [18, 'Tenacity', 281.8, '2.82%', 2.818, 'percentagePoints'],
  [1, 'Health', 7410000, '741', 741, 'flat'],
  [5, 'Speed', 40000, '4', 4, 'flat'],
  [28, 'Protection', 7170000, '717', 717, 'flat'],
  [41, 'Offense', 210000, '21', 21, 'flat'],
  [42, 'Defense', 50000, '5', 5, 'flat']
];
for (const [id, name, value, display_value, expected, unit] of realComlinkScaleCases) {
  const normalized = engine.normalizeStat({
    name, stat_id: id, value, display_value,
    unscaled_roll_values: [value]
  });
  assert.ok(Math.abs(normalized.value - expected) < 1e-9,
    'Comlink stat_id ' + id + ' must be converted from source scale');
  assert.equal(normalized.unit, unit, 'Comlink stat_id ' + id + ' unit must remain canonical');
}
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

const setReferenceCases = [
  ['Health', 2, 'health', 5, 10],
  ['Defense', 2, 'defense', 12.5, 25],
  ['Critical Chance', 2, 'criticalChance', 4, 8],
  ['Tenacity', 2, 'tenacity', 10, 20],
  ['Potency', 2, 'potency', 7.5, 15],
  ['Offense', 4, 'offense', 7.5, 15],
  ['Speed', 4, 'speed', 5, 10],
  ['Critical Damage', 4, 'criticalDamage', 15, 30]
];
for (const [name, required, key, minimum, maximum] of setReferenceCases) {
  assert.equal(engine.calculateSetBonuses(Array.from({ length: required }, () => ({ set_name: name, level: 14 } )))[key], minimum, name + ' minimum set bonus');
  assert.equal(engine.calculateSetBonuses(Array.from({ length: required }, () => ({ set_name: name, level: 15 } )))[key], maximum, name + ' level-15 set bonus');
}

// Comlink IDs preserve the distinction that core.js previously erased.
// Mapping contract copied from the documented Comlink UnitStat enum.
const comlinkStatCases = [
  [14, 'physicalCriticalChance', 'flat'], [15, 'specialCriticalChance', 'flat'],
  [16, 'criticalDamage', 'percentagePoints'], [17, 'potency', 'percentagePoints'],
  [18, 'tenacity', 'percentagePoints'], [21, 'physicalCriticalChance', 'percentagePoints'],
  [22, 'specialCriticalChance', 'percentagePoints'], [23, 'armor', 'percentagePoints'],
  [24, 'resistance', 'percentagePoints'], [25, 'armorPenetration', 'percentagePoints'],
  [26, 'resistancePenetration', 'percentagePoints'], [28, 'protection', 'flat'],
  [33, 'physicalAccuracy', 'percentagePoints'], [34, 'specialAccuracy', 'percentagePoints'],
  [35, 'physicalCriticalAvoidance', 'percentagePoints'], [36, 'specialCriticalAvoidance', 'percentagePoints'],
  [37, 'physicalAccuracy', 'flat'], [38, 'specialAccuracy', 'flat'],
  [39, 'physicalCriticalAvoidance', 'flat'], [40, 'specialCriticalAvoidance', 'flat'],
  [41, 'offense', 'flat'], [42, 'defense', 'flat'],
  [48, 'offense', 'percentagePoints'], [49, 'defense', 'percentagePoints'], [52, 'accuracy', 'percentagePoints'],
  [53, 'criticalChance', 'percentagePoints'], [54, 'criticalAvoidance', 'percentagePoints'],
  [55, 'health', 'percentagePoints'], [56, 'protection', 'percentagePoints'],
  [57, 'speed', 'percentagePoints']
];
for (const [id, key, unit] of comlinkStatCases) {
  const stat = engine.normalizeStat({ unitStatId: id, unscaledDecimalValue: 100000000 });
  assert.equal(stat.key, key, 'Comlink UnitStat ' + id + ' key');
  assert.equal(stat.unit, unit, 'Comlink UnitStat ' + id + ' unit');
  assert.equal(stat.complete, true, 'Comlink UnitStat ' + id + ' is recognized');
}
for (const id of [31, 32, 43, 44, 45, 46, 47, 50, 51, 58, 59, 60, 61]) {
  const stat = engine.normalizeStat({ unitStatId: id, unscaledDecimalValue: 100000000 });
  assert.equal(stat.complete, false, 'unsupported Comlink UnitStat ' + id + ' must remain unknown');
}
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
assert.equal(engine.normalizeStat('Accuracy', 30).key, 'accuracy');
assert.equal(engine.normalizeStat('Accuracy', 30).unit, 'percentagePoints');
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
assert.equal(engine.normalizeStat({ unitStatId: 31, unscaledDecimalValue: 3000000 }).complete, false);
assert.equal(engine.normalizeStat({ unitStatId: 32, unscaledDecimalValue: 4000000 }).complete, false);
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
// Comlink values are normalized by 1e8; Crinolo returns decimal ratios, while Holocron stores percentage points (x100), so 24 normalized rating units = 1 point.
const critRatingProjection = engine.calculateFinalStats({ gear_level: 13, base_stats: projectionBase }, [
  { level: 1, set_name: 'Health', primary_stat: { unitStatId: 14, unscaledDecimalValue: 2400000000 } },
  { level: 1, set_name: 'Defense', primary_stat: { unitStatId: 15, unscaledDecimalValue: 4800000000 } }
]);
assert.equal(critRatingProjection.complete, true);
assert.equal(critRatingProjection.stats['Physical Critical Chance'], 41);
assert.equal(critRatingProjection.stats['Special Critical Chance'], 32);
assert.equal(critRatingProjection.stats['Physical Critical Chance'] - projectionBase['Physical Critical Chance'], 1);
assert.equal(critRatingProjection.stats['Special Critical Chance'] - projectionBase['Special Critical Chance'], 2);

const critAvoidanceProjection = engine.calculateFinalStats({
  'Physical Critical Avoidance': 10, 'Special Critical Avoidance': 5
}, [
  { level: 1, set_name: 'Health', primary_stat: { unitStatId: 39, unscaledDecimalValue: 2400000000 } },
  { level: 1, set_name: 'Defense', primary_stat: { unitStatId: 40, unscaledDecimalValue: 2400000000 } }
]);
assert.equal(critAvoidanceProjection.complete, true);
assert.equal(critAvoidanceProjection.stats['Physical Critical Avoidance'], 11);
assert.equal(critAvoidanceProjection.stats['Special Critical Avoidance'], 6);
const unsupportedGenericCrit = engine.normalizeStat({ unitStatId: 45, unscaledDecimalValue: 2400000000 });
assert.equal(unsupportedGenericCrit.key, null);
assert.equal(unsupportedGenericCrit.complete, false);
const unsupportedGenericCritProjection = engine.calculateFinalStats({
  'Physical Critical Chance': 40, 'Special Critical Chance': 30
}, [{ level: 1, set_name: 'Health', primary_stat: { name: 'Critical Chance', value: 24, unit: 'flat' } }]);
assert.equal(unsupportedGenericCritProjection.complete, false);
assert.ok(unsupportedGenericCritProjection.missing.includes('stat:criticalChance:flat_unsupported'));
const unsupportedGenericAvoidanceProjection = engine.calculateFinalStats({
  'Physical Critical Avoidance': 10, 'Special Critical Avoidance': 5
}, [{ level: 1, set_name: 'Defense', primary_stat: { name: 'Critical Avoidance', value: 24, unit: 'flat' } }]);
assert.equal(unsupportedGenericAvoidanceProjection.complete, false);
assert.ok(unsupportedGenericAvoidanceProjection.missing.includes('stat:criticalAvoidance:flat_unsupported'));
const speedPercentMods = [{
  level: 1, set_name: 'Health', primary_stat: 'Health', primary_value: 0,
  secondary_1_stat: { unitStatId: 57, unscaledDecimalValue: 5000000 }
}];
const g13SpeedPercentWithoutBreakdown = engine.calculateSpeed(100, speedPercentMods, 13);
assert.equal(g13SpeedPercentWithoutBreakdown.complete, false, 'G13 alone must not authorize Speed %');
assert.ok(g13SpeedPercentWithoutBreakdown.missing.includes('speed:gear_component_required'));
const verifiedSpeedComponents = {
  source: 'Crinolo.stats.base+stats.gear',
  base: { Speed: 100 }, gear: { Speed: 0 }
};
const speedPercentProjection = engine.calculateSpeed(100, speedPercentMods, 13, verifiedSpeedComponents);
assert.equal(speedPercentProjection.complete, true);
assert.equal(speedPercentProjection.total, 105);
const inconsistentSpeedComponents = {
  source: 'Crinolo.stats.base+stats.gear',
  base: { Speed: 100 }, gear: { Speed: 1 }
};
const inconsistentSpeedProjection = engine.calculateSpeed(100, speedPercentMods, 13, inconsistentSpeedComponents);
assert.equal(inconsistentSpeedProjection.complete, false, 'base + gear must reconcile with the pre-mod total');
assert.ok(inconsistentSpeedProjection.missing.includes('speed:gear_component_required'));

const completeSpeedSet = Array.from({ length: 4 }, (_, index) => ({
  slot: ['Square','Arrow','Diamond','Triangle'][index],
  level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 0,
  secondary_1_stat: 'Protection', secondary_1_value: 0,
  secondary_2_stat: 'Potency %', secondary_2_value: 0,
  secondary_3_stat: 'Tenacity %', secondary_3_value: 0,
  secondary_4_stat: 'Critical Damage %', secondary_4_value: 0
}));
const g13SpeedSetWithoutBreakdown = engine.calculateSpeed(153, completeSpeedSet, 13);
assert.equal(g13SpeedSetWithoutBreakdown.complete, false, 'A G13 Speed set still requires the exact Crinolo base/gear split');
assert.ok(g13SpeedSetWithoutBreakdown.missing.includes('speed:gear_component_required'));
const verifiedGideonSpeedComponents = {
  source: 'Crinolo.stats.base+stats.gear',
  base: { Speed: 153 }, gear: { Speed: 0 }
};
const verifiedGideonSpeedSet = engine.calculateSpeed(153, completeSpeedSet, 13, verifiedGideonSpeedComponents);
assert.equal(verifiedGideonSpeedSet.setBonus, 15.3);
assert.equal(verifiedGideonSpeedSet.total, 168.3);
const gearSpeedComponents = {
  source: 'Crinolo.stats.base+stats.gear',
  base: { Speed: 153 }, gear: { Speed: 2 }
};
const gearSpeedSet = engine.calculateSpeed(155, completeSpeedSet, 12, gearSpeedComponents);
assert.equal(gearSpeedSet.complete, true, 'A verified component split is sufficient at any gear level');
assert.equal(gearSpeedSet.setBonus, 15.3, 'Speed % applies to Crinolo base, not base plus gear');
assert.equal(gearSpeedSet.total, 170.3, 'Gear Speed is added after the percentage bonus');
const halfSpeedSet = completeSpeedSet.map((mod, index) => ({ ...mod, level: index === 3 ? 14 : 15 }));
const verifiedHalfSpeedSet = engine.calculateSpeed(153, halfSpeedSet, 13, verifiedGideonSpeedComponents);
assert.equal(verifiedHalfSpeedSet.setBonus, 7.65);
assert.equal(verifiedHalfSpeedSet.total, 160.65);

const accuracyProjection = engine.calculateFinalStats({ gear_level: 13, base_stats: projectionBase }, [
  { level: 1, set_name: 'Health', primary_stat: { unitStatId: 33, unscaledDecimalValue: 12000000 }, secondary_1_stat: { unitStatId: 37, unscaledDecimalValue: 1200000000 } },
  { level: 1, set_name: 'Defense', primary_stat: { unitStatId: 34, unscaledDecimalValue: 6000000 }, secondary_1_stat: { unitStatId: 38, unscaledDecimalValue: 2400000000 } },
  { level: 1, set_name: 'Speed', primary_stat: { unitStatId: 52, unscaledDecimalValue: 12000000 } }
]);
assert.equal(accuracyProjection.complete, true, JSON.stringify(accuracyProjection.missing));
assert.equal(accuracyProjection.stats['Physical Accuracy'], 13);
assert.equal(accuracyProjection.stats['Special Accuracy'], 8);
assert.equal(accuracyProjection.stats.Accuracy, 0.12);

const offenseMods = [
  { level: 15, set_name: 'Offense', primary_stat: 'Offense', primary_value: 40, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Offense %', primary_value: 10, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }
];
const offenseProjection = engine.calculateFinalStats({ gear_level: 13, base_stats: projectionBase }, offenseMods, 85);
assert.equal(offenseProjection.complete, false);
assert.ok(offenseProjection.missing.includes('offense:gear_component_required'));

const gear12Profile = { gear_level: 12, base_stats: projectionBase };
const gear12OffenseProjection = engine.calculateFinalStats(gear12Profile, offenseMods, 85);
assert.equal(gear12OffenseProjection.complete, false);
assert.ok(gear12OffenseProjection.missing.includes('offense:gear_component_required'));
const gear13OffenseProjection = engine.calculateFinalStats({ gear_level: 13, base_stats: projectionBase }, offenseMods, 85);
assert.equal(gear13OffenseProjection.complete, false);
assert.ok(gear13OffenseProjection.missing.includes('offense:gear_component_required'));
const directDamagePercentMods = [
  { level: 1, set_name: 'Health', primary_stat: 'Physical Damage %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Health', primary_value: 0 }
];
const g12DirectDamageProjection = engine.calculateFinalStats(gear12Profile, directDamagePercentMods, 85);
assert.equal(g12DirectDamageProjection.complete, false);
assert.ok(g12DirectDamageProjection.missing.includes('offense:gear_component_required'));
const g13DirectDamageProjection = engine.calculateFinalStats({ gear_level: 13, base_stats: projectionBase }, directDamagePercentMods, 85);
assert.equal(g13DirectDamageProjection.complete, false);
assert.ok(g13DirectDamageProjection.missing.includes('offense:gear_component_required'));

const gearDependentPercentCases = [
  ['health', [
    { level: 1, set_name: 'Health', primary_stat: 'Health %', primary_value: 10 },
    { level: 1, set_name: 'Defense', primary_stat: 'Health', primary_value: 0 }
  ]],
  ['protection', [
    { level: 1, set_name: 'Health', primary_stat: 'Protection %', primary_value: 10 },
    { level: 1, set_name: 'Defense', primary_stat: 'Health', primary_value: 0 }
  ]],
  ['speed', [
    { level: 1, set_name: 'Health', primary_stat: 'Speed %', primary_value: 10 },
    { level: 1, set_name: 'Defense', primary_stat: 'Health', primary_value: 0 }
  ]]
];
for (const [key, mods] of gearDependentPercentCases) {
  const projection = engine.calculateFinalStats(gear12Profile, mods, 85);
  assert.equal(projection.complete, false, `${key} % must not use aggregated gear stats`);
  assert.ok(projection.missing.includes(key + ':gear_component_required'));
  const g13Projection = engine.calculateFinalStats({ gear_level: 13, base_stats: projectionBase }, mods, 85);
  assert.equal(g13Projection.complete, false, key + ' % must not assume a zero gear component from G13');
  assert.ok(g13Projection.missing.includes(key + ':gear_component_required'));
}

const defenseProjection = engine.calculateFinalStats(projectionBase, [
  { level: 1, set_name: 'Health', primary_stat: 'Defense', primary_value: 40 },
  { level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10 }
], 85);
assert.equal(defenseProjection.complete, false);
assert.ok(defenseProjection.missing.includes('defense:gear_component_required'));
const defensePercentMods = [
  { level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Health', primary_value: 0 }
];
const nonG13DefenseProjection = engine.calculateFinalStats({ gear_level: 12, base_stats: projectionBase }, defensePercentMods, 85);
assert.equal(nonG13DefenseProjection.complete, false);
assert.ok(nonG13DefenseProjection.missing.includes('defense:gear_component_required'));
const g13DefenseProjection = engine.calculateFinalStats({ gear_level: 13, base_stats: projectionBase }, defensePercentMods, 85);
assert.equal(g13DefenseProjection.complete, false);
assert.ok(g13DefenseProjection.missing.includes('defense:gear_component_required'));
const flatDefenseProjection = engine.calculateFinalStats(projectionBase, [
  { level: 1, set_name: 'Defense', primary_stat: 'Defense', primary_value: 40 }
], 85);
const missingLevelDefenseProjection = engine.calculateFinalStats(projectionBase, [
  { level: 1, set_name: 'Health', primary_stat: 'Defense', primary_value: 40 }
]);
assert.equal(missingLevelDefenseProjection.complete, false);
assert.ok(missingLevelDefenseProjection.missing.includes('level'));
assert.equal(flatDefenseProjection.complete, true);
assert.ok(Math.abs(flatDefenseProjection.stats.Armor - 51.5209) < 0.001);
assert.ok(Math.abs(flatDefenseProjection.stats.Resistance - 42.1769) < 0.001);

const speedProjection = engine.calculateFinalStats({
  gear_level: 13, base_stats: projectionBase,
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Speed: 100 }, gear: { Speed: 0 }
  }
}, [
  ...Array.from({ length: 4 }, () => ({ level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }))
], 85);
assert.equal(engine.calculateSetBonuses(Array.from({ length: 4 }, () => ({ level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }))).speed, 10);
const speedCalc = engine.calculateSpeed(100, Array.from({ length: 4 }, () => ({ level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries })), 13, { source: 'Crinolo.stats.base+stats.gear', base: { Speed: 100 }, gear: { Speed: 0 } });
assert.equal(speedCalc.total, 110, JSON.stringify(speedCalc));
const incompleteSpeedSet = engine.calculateSpeed(100, [
  { set_name: 'Speed', level: 15, primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }, { set_name: 'Speed', level: 15, primary_stat: 'Health', primary_value: 100, ...zeroSecondaries },
  { set_name: 'Speed', level: 15, primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }, { set_name: 'Speed', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }
], 13);
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
const unknownSecondarySpeed = engine.calculateSpeed(100, [{
  level: 15, set_name: 'Health', primary_stat: 'Health', primary_value: 10,
  secondary_1_stat: 'Unknown Stat', secondary_1_value: 5,
  secondary_2_stat: 'Protection', secondary_2_value: 0,
  secondary_3_stat: 'Potency %', secondary_3_value: 0,
  secondary_4_stat: 'Tenacity %', secondary_4_value: 0
}]);
assert.equal(unknownSecondarySpeed.complete, false);
assert.ok(unknownSecondarySpeed.missing.includes('mod:secondary_incomplete'));
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

const noDeltaProfile = {
  level: 85,
  base_stats: { Health: 1000, Speed: 100 },
  current_stats: { Protection: 2000 }
};
const noDeltaProjection = engine.calculateFinalStats(noDeltaProfile, [
  { level: 1, set_name: 'Health', primary_stat: 'Protection', primary_value: 10 }
]);
assert.equal(noDeltaProjection.complete, false);
assert.ok(noDeltaProjection.missing.includes('protection'));
const sourcedDeltaProjection = engine.calculateFinalStats({
  level: 85,
  base_stats: { Health: 1000, Speed: 100 },
  current_stats: { Protection: 2000 },
  mod_stat_diffs: { Protection: 500 }
}, [{ level: 1, set_name: 'Health', primary_stat: 'Protection', primary_value: 10 }]);
assert.equal(sourcedDeltaProjection.complete, true);
assert.equal(sourcedDeltaProjection.stats.Protection, 1510);
const profileLevelDefense = engine.calculateFinalStats({
  level: 85,
  base_stats: { Health: 1000, Speed: 100, Armor: 50, Resistance: 40 }
}, [{ level: 1, set_name: 'Health', primary_stat: 'Defense', primary_value: 40 }], 85);
assert.equal(profileLevelDefense.complete, true);
assert.ok(Math.abs(profileLevelDefense.stats.Armor - 51.5209) < 0.001);
const profileOnlyLevelDefense = engine.calculateFinalStats({
  level: 85,
  base_stats: { Health: 1000, Speed: 100, Armor: 50, Resistance: 40 }
}, [{ level: 1, set_name: 'Health', primary_stat: 'Defense', primary_value: 40 }]);
assert.equal(profileOnlyLevelDefense.complete, false);
assert.ok(profileOnlyLevelDefense.missing.includes('level'));

console.log('Shared mod engine contract tests passed.');
