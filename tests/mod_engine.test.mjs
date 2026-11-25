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

assert.equal(engine.version, '0.3.33');

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

// Exhaustively compare set grouping with Crinolo's count/maxLevel formula.
// A completed group earns the minimum bonus; every fully level-15 group
// earns one additional minimum bonus (equivalent to the documented maximum).
for (const [name, required, key, minimum] of setReferenceCases) {
  for (let count = 0; count <= 12; count++) {
    for (let maxLevelCount = 0; maxLevelCount <= count; maxLevelCount++) {
      const levels = [
        ...Array(maxLevelCount).fill(15),
        ...Array(count - maxLevelCount).fill(14)
      ];
      const expectedGroups = Math.floor(count / required) + Math.floor(maxLevelCount / required);
      const expected = expectedGroups * minimum;
      const mods = levels.map(level => ({ set_name: name, level }));
      const actual = engine.calculateSetBonuses(mods)[key] || 0;
      assert.equal(actual, expected,
        name + ' set count=' + count + ' level-15=' + maxLevelCount + ' must match Crinolo grouping');
      assert.equal(engine.calculateSetBonuses([...mods].reverse())[key] || 0, expected,
        name + ' set bonus must not depend on input order');
    }
  }
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
  pips: 5,
  level: 15,
  primary_stat: 'Offense %',
  primary_value: 5.88,
  secondary_1_stat: 'Speed',
  secondary_1_value: 20,
  secondary_2_stat: 'Potency %',
  secondary_2_value: 2.5
});
assert.ok(Math.abs(scored - (20 / 30 * 31 * 1.8 + 2.5 / 11.25 * 0.24 + 0.75)) < 1e-12,
  'Each secondary is normalized against its dot-specific maximum before weighting');

const secondaryMaximumCases = [
  ['Critical Chance %', [5, 6.25, 7.5, 10, 11.25, 11.75]],
  ['Defense', [20, 25, 30, 40, 49, 80]],
  ['Defense %', [5, 5.5, 6.5, 7.5, 8.5, 20]],
  ['Health', [995, 1180, 1500, 1735, 2143, 2700]],
  ['Health %', [2.5, 3.13, 3.75, 5, 5.625, 10]],
  ['Offense', [80, 100, 140, 180, 228, 251]],
  ['Offense %', [1.25, 1.565, 1.875, 2.5, 2.815, 8.5]],
  ['Potency %', [5, 6.25, 7.5, 10, 11.25, 15]],
  ['Protection', [995, 1545, 2415, 3195, 4153, 4600]],
  ['Protection %', [5, 6.25, 7.5, 10, 11.25, 15]],
  ['Speed', [10, 15, 20, 25, 30, 31]],
  ['Tenacity %', [5, 6.25, 7.5, 10, 11.25, 15]]
];
for (const [name, maxima] of secondaryMaximumCases) {
  const unit = name.endsWith('%') ? 'percentagePoints' : 'flat';
  const key = engine.normalizeStat(name, 1).key;
  const stat = { key, unit };
  for (let pips = 1; pips <= 6; pips++) {
    assert.equal(engine.maxSecondaryValue(stat, pips), maxima[pips - 1],
      name + ' ' + pips + '-dot maximum');
  }
}
assert.equal(engine.maxSecondaryValue(engine.normalizeStat('Offense %', 1), null), 8.5,
  'Unknown dot count uses the conservative 6-dot ceiling');

const maxOffenseSixDot = engine.scoreMod({
  pips: 6, level: 15, secondary_1_stat: 'Offense %', secondary_1_value: 8.5
});
const maxHealthSixDot = engine.scoreMod({
  pips: 6, level: 15, secondary_1_stat: 'Health', secondary_1_value: 2700
});
assert.ok(maxOffenseSixDot > maxHealthSixDot,
  'A maxed Offense % secondary ranks above maxed flat Health under the configured priorities');

const maxOffenseFiveDot = engine.scoreMod({
  pips: 5, level: 15, secondary_1_stat: 'Offense %', secondary_1_value: 2.815
});
assert.ok(Math.abs(maxOffenseFiveDot - maxOffenseSixDot) < 1e-12,
  'Equivalent 5-dot and 6-dot secondary quality must receive the same normalized score');

const speedFiveDot = engine.scoreMod({
  pips: 5, level: 15, secondary_1_stat: 'Speed', secondary_1_value: 15
});
const speedSixDot = engine.scoreMod({
  pips: 6, level: 15, secondary_1_stat: 'Speed', secondary_1_value: 15.5
});
assert.ok(Math.abs(speedFiveDot - speedSixDot) < 1e-12,
  'Equivalent 5-dot and 6-dot Speed secondary quality must receive the same normalized score');

const maxSpeedPrimaryScore = engine.scoreMod({
  pips: 6, level: 15, primary_stat: 'Speed', primary_value: 30
});
const maxSpeedSecondaryScore = engine.scoreMod({
  pips: 6, level: 15, secondary_1_stat: 'Speed', secondary_1_value: 31
});
assert.ok(Math.abs((maxSpeedSecondaryScore - maxSpeedPrimaryScore) - 1.8) < 1e-12,
  'A max Speed secondary keeps its historical score scale relative to a Speed primary');


const projectionBase = {
  Health: 1000, Protection: 2000, Speed: 100,
  'Physical Damage': 500, 'Special Damage': 700,
  Armor: 50, Resistance: 40, Potency: 0.1, Tenacity: 0.2,
  'Critical Damage': 1.5,
  'Physical Critical Chance': 40, 'Special Critical Chance': 30,
  'Physical Critical Avoidance': 0, 'Special Critical Avoidance': 0
};
const g13ProjectionProfile = {
  gear_level: 13,
  level: 85,
  base_stats: projectionBase,
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Health: 800, Protection: 1500, Speed: 90, 'Physical Damage': 400, 'Special Damage': 600, Armor: 45, Resistance: 35 },
    gear: { Health: 200, Protection: 500, Speed: 10, 'Physical Damage': 100, 'Special Damage': 100, Armor: 5, Resistance: 5 }
  }
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

// Below G13, Defense % applies to the verified base Defense component only,
// not to the total Armor/Resistance-derived rating that already includes gear.
const defenseLevelEffect = 85 * 7.5;
const defenseTotalRating = 100;
const defenseBasePercent = defenseTotalRating / (defenseLevelEffect + defenseTotalRating) * 100;
const splitDefenseProfile = {
  gear_level: 12,
  base_stats: {
    Defense: defenseTotalRating,
    Armor: defenseBasePercent,
    Resistance: defenseBasePercent
  },
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Defense: 80 },
    gear: { Defense: 20 }
  }
};
const splitDefenseProjection = engine.calculateFinalStats(splitDefenseProfile, [{
  level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10
}], 85);
const expectedBaseOnlyDefensePercent = 108 / (defenseLevelEffect + 108) * 100;
const incorrectlyGearInclusiveDefensePercent = 110 / (defenseLevelEffect + 110) * 100;
assert.equal(splitDefenseProjection.complete, true);
assert.ok(Math.abs(splitDefenseProjection.stats.Armor - expectedBaseOnlyDefensePercent) < 1e-10,
  'Armor Defense % bonus must use 10% of base Defense 80, not total Defense 100');
assert.ok(Math.abs(splitDefenseProjection.stats.Resistance - expectedBaseOnlyDefensePercent) < 1e-10,
  'Resistance Defense % bonus must use the same base Defense component');
assert.ok(Math.abs(splitDefenseProjection.stats.Armor - incorrectlyGearInclusiveDefensePercent) > 0.02,
  'The old gear-inclusive calculation must be observably different');

const dynamicCrinoloDefenseProfile = {
  level: 85,
  gear_level: 12,
  base_stats: { Armor: 50, Resistance: 40 },
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Armor: 45, Resistance: 35 },
    gear: { Armor: 5, Resistance: 5 }
  }
};
const dynamicCrinoloDefenseProjection = engine.calculateFinalStats(dynamicCrinoloDefenseProfile, [{
  level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10
}], 85);
const baseArmorRating = 0.45 * defenseLevelEffect / (1 - 0.45);
const baseResistanceRating = 0.35 * defenseLevelEffect / (1 - 0.35);
const currentArmorRating = 0.50 * defenseLevelEffect / (1 - 0.50);
const currentResistanceRating = 0.40 * defenseLevelEffect / (1 - 0.40);
const expectedDynamicArmor = (currentArmorRating + Math.floor(baseArmorRating * 0.10)) /
  (defenseLevelEffect + currentArmorRating + Math.floor(baseArmorRating * 0.10)) * 100;
const expectedDynamicResistance = (currentResistanceRating + Math.floor(baseResistanceRating * 0.10)) /
  (defenseLevelEffect + currentResistanceRating + Math.floor(baseResistanceRating * 0.10)) * 100;
assert.equal(dynamicCrinoloDefenseProjection.complete, true);
assert.ok(Math.abs(dynamicCrinoloDefenseProjection.stats.Armor - expectedDynamicArmor) < 1e-10,
  'Dynamic Crinolo Armor % uses the base Armor component, excluding current gear contribution');
assert.ok(Math.abs(dynamicCrinoloDefenseProjection.stats.Resistance - expectedDynamicResistance) < 1e-10,
  'Dynamic Crinolo Resistance % uses the base Resistance component, excluding current gear contribution');


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
assert.equal(g13SpeedPercentWithoutBreakdown.complete, false, 'G13 totals also require the equipped-gear split');
assert.ok(g13SpeedPercentWithoutBreakdown.missing.includes('speed:gear_component_required'));
const verifiedSpeedComponents = {
  source: 'Crinolo.stats.base+stats.gear',
  base: { Speed: 90 }, gear: { Speed: 10 }
};
const speedPercentProjection = engine.calculateSpeed(100, speedPercentMods, 13, verifiedSpeedComponents);
assert.equal(speedPercentProjection.complete, true);
assert.equal(speedPercentProjection.total, 104, 'Speed % applies to base Speed before adding the gear contribution');
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
assert.equal(g13SpeedSetWithoutBreakdown.complete, false, 'G13 Speed set requires the real gear split');
assert.ok(g13SpeedSetWithoutBreakdown.missing.includes('speed:gear_component_required'));
const verifiedGideonSpeedComponents = {
  source: 'Crinolo.stats.base+stats.gear',
  base: { Speed: 150 }, gear: { Speed: 3 }
};
const verifiedGideonSpeedSet = engine.calculateSpeed(153, completeSpeedSet, 13, verifiedGideonSpeedComponents);
assert.equal(verifiedGideonSpeedSet.setBonus, 15, 'Crinolo floors the percentage-derived Speed set bonus');
assert.equal(verifiedGideonSpeedSet.total, 168);
const fractionalSpeedSet = engine.calculateSpeed(153.9, completeSpeedSet, 13, {
  source: 'Crinolo.stats.base+stats.gear', base: { Speed: 153.9 }, gear: { Speed: 0 }
});
assert.equal(fractionalSpeedSet.setBonus, 15, 'Speed set bonus floors fractional base × 10%');
assert.equal(fractionalSpeedSet.total, 168.9);
const gearSpeedComponents = {
  source: 'Crinolo.stats.base+stats.gear',
  base: { Speed: 153 }, gear: { Speed: 2 }
};
const gearSpeedSet = engine.calculateSpeed(155, completeSpeedSet, 12, gearSpeedComponents);
assert.equal(gearSpeedSet.complete, true, 'A verified component split is sufficient at any gear level');
assert.equal(gearSpeedSet.setBonus, 15, 'Speed % applies to Crinolo base, then floors the bonus');
assert.equal(gearSpeedSet.total, 170, 'Gear Speed is added after the floored percentage bonus');
const halfSpeedSet = completeSpeedSet.map((mod, index) => ({ ...mod, level: index === 3 ? 14 : 15 }));
const verifiedHalfSpeedSet = engine.calculateSpeed(153, halfSpeedSet, 13, verifiedGideonSpeedComponents);
assert.equal(verifiedHalfSpeedSet.setBonus, 7, 'Half Speed set bonus is floored to an integer');
assert.equal(verifiedHalfSpeedSet.total, 160);

// Percentage-derived stat bonuses follow Crinolo's integer stat flooring.
// Set bonuses and mod percentage secondaries are summed before one floor.
const roundingProfile = {
  gear_level: 13,
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Health: 1001, Protection: 1001, Speed: 153, 'Physical Damage': 501, 'Special Damage': 701, Armor: 50, Resistance: 40 },
    gear: { Health: 0, Protection: 0, Speed: 0, 'Physical Damage': 0, 'Special Damage': 0, Armor: 0, Resistance: 0 }
  },
  base_stats: {
    Health: 1001, Protection: 1001, Speed: 153,
    'Physical Damage': 501, 'Special Damage': 701,
    Armor: 50, Resistance: 40,
    Potency: 0.1, Tenacity: 0.2, 'Critical Damage': 1.5,
    'Physical Critical Chance': 40, 'Special Critical Chance': 30,
    'Physical Critical Avoidance': 0, 'Special Critical Avoidance': 0
  }
};
const completeSetMods = (setName, count) => Array.from({ length: count }, () => ({
  level: 15, set_name: setName, primary_stat: 'Health', primary_value: 0, ...zeroSecondaries
}));
const healthSetProjection = engine.calculateFinalStats(roundingProfile, completeSetMods('Health', 2));
assert.equal(healthSetProjection.stats.Health, 1101, 'Health set bonus must reach Health');
const criticalChanceSetProjection = engine.calculateFinalStats(roundingProfile, completeSetMods('Critical Chance', 2));
assert.equal(criticalChanceSetProjection.stats['Physical Critical Chance'], 48);
assert.equal(criticalChanceSetProjection.stats['Special Critical Chance'], 38);
const tenacitySetProjection = engine.calculateFinalStats(roundingProfile, completeSetMods('Tenacity', 2));
assert.equal(tenacitySetProjection.stats.Tenacity, 0.4);
const potencySetProjection = engine.calculateFinalStats(roundingProfile, completeSetMods('Potency', 2));
assert.equal(potencySetProjection.stats.Potency, 0.25);
const criticalDamageSetProjection = engine.calculateFinalStats(roundingProfile, completeSetMods('Critical Damage', 4));
assert.equal(criticalDamageSetProjection.stats['Critical Damage'], 1.8);

const healthRoundingMods = [
  { level: 15, set_name: 'Health', primary_stat: 'Health', primary_value: 0, ...zeroSecondaries },
  { level: 15, set_name: 'Health', primary_stat: 'Health', primary_value: 0, ...zeroSecondaries },
  { level: 15, set_name: 'Health', primary_stat: 'Health %', primary_value: 5.88, ...zeroSecondaries }
];
const healthRounding = engine.calculateFinalStats(roundingProfile, healthRoundingMods);
assert.equal(healthRounding.complete, true, JSON.stringify(healthRounding));
assert.equal(healthRounding.stats.Health, 1159,
  'Health set + Health % must floor the combined 15.88% base-derived bonus once');
const protectionRounding = engine.calculateFinalStats(roundingProfile, [
  { level: 15, set_name: 'Health', primary_stat: 'Protection %', primary_value: 5.88, ...zeroSecondaries }
]);
assert.equal(protectionRounding.complete, true, JSON.stringify(protectionRounding));
assert.equal(protectionRounding.stats.Protection, 1059,
  'Protection % must floor its base-derived bonus to an integer');
const offenseRounding = engine.calculateFinalStats(roundingProfile, [
  ...Array.from({ length: 4 }, () => ({ level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 0, ...zeroSecondaries })),
  { level: 15, set_name: 'Health', primary_stat: 'Offense %', primary_value: 5.88, ...zeroSecondaries }
]);
assert.equal(offenseRounding.complete, true, JSON.stringify(offenseRounding));
assert.equal(offenseRounding.stats['Physical Damage'], 605,
  'Offense set + Offense % must floor the combined bonus on Physical Damage');
assert.equal(offenseRounding.stats['Special Damage'], 847,
  'Offense set + Offense % must floor the combined bonus on Special Damage');
const speedRounding = engine.calculateSpeed(153, [
  ...completeSpeedSet,
  { level: 15, set_name: 'Health', primary_stat: 'Health', primary_value: 0,
    ...zeroSecondaries, secondary_1_stat: 'Speed %', secondary_1_value: 2.5 }
], 13, roundingProfile.stat_components);
assert.equal(speedRounding.complete, true);
assert.equal(speedRounding.setBonus, 15);
assert.equal(speedRounding.total, 172,
  'Speed set + Speed % mod must be combined before flooring (153 × 12.5% = 19)');
const defenseRounding = engine.calculateFinalStats(roundingProfile, [
  { level: 15, set_name: 'Defense', primary_stat: 'Health', primary_value: 0, ...zeroSecondaries },
  { level: 15, set_name: 'Defense', primary_stat: 'Health', primary_value: 0, ...zeroSecondaries }
], 85);
const expectedArmorRating = 637.5 + Math.floor(637.5 * 0.25);
const expectedResistanceRating = 425 + Math.floor(425 * 0.25);
assert.equal(defenseRounding.complete, true);
assert.equal(defenseRounding.stats.Armor,
  expectedArmorRating / (637.5 + expectedArmorRating) * 100,
  'Defense set must floor the derived Armor rating bonus before conversion');
assert.equal(defenseRounding.stats.Resistance,
  expectedResistanceRating / (637.5 + expectedResistanceRating) * 100,
  'Defense set must floor the derived Resistance rating bonus before conversion');
const stackingPercentRounding = engine.calculateFinalStats(roundingProfile, [
  { level: 15, set_name: 'Health', primary_stat: 'Potency %', primary_value: 2.5,
    ...zeroSecondaries, secondary_1_stat: 'Tenacity %', secondary_1_value: 0 }
]);
assert.equal(stackingPercentRounding.stats.Potency, 0.125,
  'Stacking percentage-point stats retain fractional precision; they are not integer-floored');

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
const offenseProjection = engine.calculateFinalStats(g13ProjectionProfile, offenseMods, 85);
assert.equal(offenseProjection.complete, true, 'G13 Offense % uses verified base and gear components');

const gear12Profile = { gear_level: 12, base_stats: projectionBase };
const gear12OffenseProjection = engine.calculateFinalStats(gear12Profile, offenseMods, 85);
assert.equal(gear12OffenseProjection.complete, false);
assert.ok(gear12OffenseProjection.missing.includes('offense:gear_component_required'));
const gear13OffenseProjection = engine.calculateFinalStats(g13ProjectionProfile, offenseMods, 85);
assert.equal(gear13OffenseProjection.complete, true, 'G13 Offense % is calculable with the supplied split');
const directDamagePercentMods = [
  { level: 1, set_name: 'Health', primary_stat: 'Physical Damage %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Health', primary_value: 0 }
];
const g12DirectDamageProjection = engine.calculateFinalStats(gear12Profile, directDamagePercentMods, 85);
assert.equal(g12DirectDamageProjection.complete, false);
assert.ok(g12DirectDamageProjection.missing.includes('offense:gear_component_required'));
const g13DirectDamageProjection = engine.calculateFinalStats(g13ProjectionProfile, directDamagePercentMods, 85);
assert.equal(g13DirectDamageProjection.complete, true, 'G13 direct damage % uses verified base and gear components');

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
  const g13Projection = engine.calculateFinalStats(g13ProjectionProfile, mods, 85);
  assert.equal(g13Projection.complete, true, key + ' % must use the verified G13 gear split');
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
const g13DefenseProjection = engine.calculateFinalStats(g13ProjectionProfile, defensePercentMods, 85);
assert.equal(g13DefenseProjection.complete, true, 'G13 Defense % must use verified Armor and Resistance components');
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
