import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../modules/mod-engine.js', import.meta.url), 'utf8');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const engine = sandbox.module.exports;

assert.equal(engine.version, '0.2.0');

assert.equal(engine.canonicalSet(1), 'health');
assert.equal(engine.canonicalSet('Critical Damage'), 'criticalDamage');
assert.equal(engine.canonicalSet('Protection'), null);
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

const defenseFlat = engine.normalizeStat({ unitStatId: 42, unscaledDecimalValue: 1200000000 });
const defensePercent = engine.normalizeStat({ unitStatId: 49, unscaledDecimalValue: 5000000 });
assert.equal(defenseFlat.unit, 'flat');
assert.equal(defensePercent.unit, 'percentagePoints');
assert.equal(defensePercent.value, 5);

assert.equal(engine.normalizeStat({ unitStatId: 16, unscaledDecimalValue: 30000000 }).key, 'criticalDamage');
assert.equal(engine.normalizeStat({ unitStatId: 16, unscaledDecimalValue: 30000000 }).value, 30);
assert.equal(engine.canonicalStatKey('Offense %'), 'OFFENSEPERCENT');
assert.equal(engine.canonicalStatKey('Potency %'), 'POTENCY');
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
  secondary_1_stat: 'Speed',
  secondary_1_value: 15
});
assert.equal(mod.id, 'fixture-mod');
assert.equal(mod.primary.unit, 'percentagePoints');
assert.equal(mod.primary.value, 2.5);
assert.equal(mod.secondaries[0].key, 'speed');
assert.equal(mod.secondaries[0].value, 15);
assert.equal(mod.complete, true);

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

console.log('Shared mod engine contract tests passed.');
