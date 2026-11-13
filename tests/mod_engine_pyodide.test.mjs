import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadPyodide } from 'pyodide';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const sandbox = { module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(read('../modules/mod-engine.js'), sandbox);
const engine = sandbox.module.exports;

const pyodide = await loadPyodide();
pyodide.FS.writeFile('/home/pyodide/optimizer.py', read('../python/optimizer.py'));
const engineBridge = (baseJson, modsJson, level) => JSON.stringify(
  engine.calculateFinalStats(JSON.parse(baseJson), JSON.parse(modsJson), Number(level) || 85)
);
const normalizeBridge = modJson => JSON.stringify(engine.normalizeMod(JSON.parse(modJson)));
pyodide.globals.set('holocron_mod_engine_bridge', engineBridge);
pyodide.globals.set('holocron_mod_normalize_bridge', normalizeBridge);
pyodide.runPython("import sys\nsys.path.insert(0, '/home/pyodide')\nimport optimizer\noptimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge)\n");

const base = {
  Health: 1000, Protection: 2000, Speed: 100,
  'Physical Damage': 500, 'Special Damage': 700,
  Armor: 50, Resistance: 40, Potency: 0.1, Tenacity: 0.2,
  'Critical Damage': 1.5,
  'Physical Critical Chance': 40, 'Special Critical Chance': 30,
  'Physical Critical Avoidance': 0, 'Special Critical Avoidance': 0
};
pyodide.globals.set('base_json', JSON.stringify(base));

const offenseMods = [
  { level: 15, set_name: 'Offense', primary_stat: 'Offense', primary_value: 40 },
  { level: 15, set_name: 'Offense', primary_stat: 'Offense %', primary_value: 10 },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100 },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100 }
];
pyodide.globals.set('mods_json', JSON.stringify(offenseMods));
const offense = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats(json.loads(mods_json), json.loads(base_json))\njson.dumps(result)\n"));
assert.equal(offense['Physical Damage'], 665);
assert.equal(offense['Special Damage'], 915);

const defense = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats([{'level': 15, 'primary_stat': 'Defense', 'primary_value': 40}], json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85})\njson.dumps(result)\n"));
assert.ok(Math.abs(defense.Armor - 51.5209) < 0.001);
assert.ok(Math.abs(defense.Resistance - 42.1769) < 0.001);

const missingLevel = pyodide.runPython("try:\n optimizer.final_stats([{'primary_stat': 'Defense', 'primary_value': 40}], json.loads(base_json))\nexcept RuntimeError as error:\n str(error)\nelse:\n raise AssertionError('Defense must fail closed without a sourced character level')\n");
assert.match(missingLevel, /level/);

const critRating = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats([{'primary_stat': {'unitStatId': 14, 'unscaledDecimalValue': 2400000000}}, {'primary_stat': {'unitStatId': 15, 'unscaledDecimalValue': 4800000000}}], json.loads(base_json))\njson.dumps(result)\n"));
assert.equal(critRating['Physical Critical Chance'], 41);
assert.equal(critRating['Special Critical Chance'], 32);

const incompleteDefense = pyodide.runPython("try:\n optimizer.final_stats([{'primary_stat': 'Defense %', 'primary_value': 10}], json.loads(base_json))\nexcept RuntimeError as error:\n str(error)\nelse:\n raise AssertionError('Defense % must fail closed without the gear component')\n");
assert.match(incompleteDefense, /defense:gear_component_required/);

const incompleteUnknown = pyodide.runPython("try:\n optimizer.final_stats([{'primary_stat': {'unitStatId': 999, 'unscaledDecimalValue': 120000000}}], json.loads(base_json))\nexcept RuntimeError as error:\n str(error)\nelse:\n raise AssertionError('An unknown source stat must fail closed')\n");
assert.match(incompleteUnknown, /stat:unknown/);

console.log('Real Pyodide ↔ JavaScript shared mod-engine integration tests passed.');
