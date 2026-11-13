import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadPyodide } from 'pyodide';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(read('../modules/mod-engine.js'), sandbox);
const engine = sandbox.module.exports;

let pyodide;
try {
  pyodide = await loadPyodide({ indexURL: new URL('../node_modules/pyodide/', import.meta.url).pathname });
} catch (error) {
  console.error('Pyodide runtime initialization failed:', error?.stack || String(error));
  throw error;
}
console.log('Pyodide runtime loaded.');
pyodide.FS.writeFile('/home/pyodide/optimizer.py', read('../python/optimizer.py'));
const engineBridge = (baseJson, modsJson, level) => JSON.stringify(
  engine.calculateFinalStats(JSON.parse(baseJson), JSON.parse(modsJson), Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null)
);
const normalizeBridge = modJson => JSON.stringify(engine.normalizeMod(JSON.parse(modJson)));
pyodide.globals.set('holocron_mod_engine_bridge', engineBridge);
pyodide.globals.set('holocron_mod_normalize_bridge', normalizeBridge);
pyodide.runPython("import sys\nsys.path.insert(0, '/home/pyodide')\nimport optimizer\noptimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge)\n");

const profileValidation = pyodide.runPython(`
profile = {"level":85,"rarity":7,"gear_level":13,"relic_tier":8,"base_stats":{"Speed":153}}
metadata = {"level":85,"rarity":7,"gear_level":13,"relic_tier":8}
optimizer.validate_profile_compatibility(profile, metadata)
`);
assert.equal(profileValidation, true);
pyodide.runPython(`
try:
    optimizer.validate_profile_compatibility(profile, {"level":85,"rarity":7,"gear_level":12,"relic_tier":8})
except RuntimeError as error:
    incompatible_profile_error = str(error)
else:
    incompatible_profile_error = ""
`);
assert.match(pyodide.runPython('incompatible_profile_error'), /gear/);

const base = {
  Health: 1000, Protection: 2000, Speed: 100,
  'Physical Damage': 500, 'Special Damage': 700,
  Armor: 50, Resistance: 40, Potency: 0.1, Tenacity: 0.2,
  'Critical Damage': 1.5,
  'Physical Critical Chance': 40, 'Special Critical Chance': 30,
  'Physical Critical Avoidance': 0, 'Special Critical Avoidance': 0
};
pyodide.globals.set('base_json', JSON.stringify(base));
const zeroSecondaries = { secondary_1_stat:'Protection', secondary_1_value:0, secondary_2_stat:'Potency %', secondary_2_value:0, secondary_3_stat:'Tenacity %', secondary_3_value:0, secondary_4_stat:'Critical Damage %', secondary_4_value:0 };

const offenseMods = [
  { level: 15, set_name: 'Offense', primary_stat: 'Offense', primary_value: 40, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Offense %', primary_value: 10, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }
];
pyodide.globals.set('mods_json', JSON.stringify(offenseMods));
const offense = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats(json.loads(mods_json), json.loads(base_json))\njson.dumps(result)\n"));
assert.equal(offense['Physical Damage'], 665);
assert.equal(offense['Special Damage'], 915);

const defense = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense', 'primary_value': 40}], json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85})\njson.dumps(result)\n"));
assert.ok(Math.abs(defense.Armor - 51.5209) < 0.001);
assert.ok(Math.abs(defense.Resistance - 42.1769) < 0.001);

pyodide.runPython("try:\n optimizer.final_stats([{'level': 15, 'set_name': 'Health', 'primary_stat': 'Defense', 'primary_value': 40}], json.loads(base_json))\nexcept RuntimeError as error:\n missing_level_error = str(error)\nelse:\n missing_level_error = ''\n");
const missingLevel = pyodide.runPython('missing_level_error');
assert.match(missingLevel, /level/);


const critRating = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 14, 'unscaledDecimalValue': 2400000000}}, {'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 15, 'unscaledDecimalValue': 4800000000}}], json.loads(base_json))\njson.dumps(result)\n"));
assert.equal(critRating['Physical Critical Chance'], 41);
assert.equal(critRating['Special Critical Chance'], 32);

pyodide.runPython("try:\n optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense %', 'primary_value': 10}], json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85})\nexcept RuntimeError as error:\n incomplete_defense_error = str(error)\nelse:\n incomplete_defense_error = ''\n");
const incompleteDefense = pyodide.runPython('incomplete_defense_error');
assert.match(incompleteDefense, /defense:gear_component_required/);

pyodide.runPython("try:\n optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 999, 'unscaledDecimalValue': 120000000}}], json.loads(base_json))\nexcept RuntimeError as error:\n incomplete_unknown_error = str(error)\nelse:\n incomplete_unknown_error = ''\n");
const incompleteUnknown = pyodide.runPython('incomplete_unknown_error');
assert.match(incompleteUnknown, /stat:unknown/);
pyodide.runPython("try:\n optimizer.final_stats([{'level': 15, 'set_name': 'Health', 'primary_stat': 'Health', 'primary_value': 10, 'secondary_1_stat': 'Speed', 'secondary_1_value': 5}], json.loads(base_json))\nexcept RuntimeError as error:\n incomplete_secondary_error = str(error)\nelse:\n incomplete_secondary_error = ''\n");
const incompleteSecondary = pyodide.runPython('incomplete_secondary_error');
assert.match(incompleteSecondary, /mod:secondary_incomplete/);

console.log('Real Pyodide ↔ JavaScript shared mod-engine integration tests passed.');
