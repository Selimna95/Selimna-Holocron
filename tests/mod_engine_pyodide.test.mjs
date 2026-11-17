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
const engineBridge = (baseJson, modsJson, level) => {
  scalarBridgeCalls++;
  return JSON.stringify(engine.calculateFinalStats(JSON.parse(baseJson), JSON.parse(modsJson), Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null));
};
const normalizeBridge = modJson => JSON.stringify(engine.normalizeMod(JSON.parse(modJson)));
let batchBridgeCalls = 0;
let batchProjectedBuilds = 0;
let scalarBridgeCalls = 0;
const batchBridge = (baseJson, indexedBuildsJson, level) => {
  batchBridgeCalls++;
  const payload = JSON.parse(indexedBuildsJson);
  batchProjectedBuilds += payload.builds.length;
  return JSON.stringify(payload.builds.map(indexes => engine.calculateFinalStats(
    JSON.parse(baseJson), indexes.map(index => payload.mods[index]),
    Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null
  )));
};
pyodide.globals.set('holocron_mod_engine_bridge', engineBridge);
pyodide.globals.set('holocron_mod_normalize_bridge', normalizeBridge);
pyodide.globals.set('holocron_mod_engine_batch_bridge', batchBridge);
pyodide.runPython("import sys\nsys.path.insert(0, '/home/pyodide')\nimport optimizer\noptimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge, holocron_mod_engine_batch_bridge)\n");

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
pyodide.runPython(`
try:
    optimizer.validate_profile_compatibility(profile, {"level":85,"rarity":7,"gear_level":13})
except RuntimeError as error:
    missing_profile_metadata_error = str(error)
else:
    missing_profile_metadata_error = ""
`);
assert.match(pyodide.runPython('missing_profile_metadata_error'), /relique/);

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


const optimizerProfiles = JSON.parse(read('../python/optimizer_profiles.json'));
const moffGideonProfile = optimizerProfiles.MOFFGIDEONS3;
assert.ok(moffGideonProfile && moffGideonProfile.base_stats && moffGideonProfile.gear_level === 13);
assert.equal(moffGideonProfile.gear, undefined, 'profile must not be mistaken for a Crinolo gear-component breakdown');
const defenseProfileMods = [
  { level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Health', primary_value: 0 }
];
let g13ProfileCount = 0;
let lowerGearProfileCount = 0;
for (const profile of Object.values(optimizerProfiles)) {
  const projection = engine.calculateFinalStats(profile, defenseProfileMods, profile.level);
  if (Number(profile.gear_level) === 13) {
    g13ProfileCount++;
    assert.equal(projection.complete, true, `G13 profile ${profile.base_id} rejected: ${projection.missing.join(', ')}`);
  } else {
    lowerGearProfileCount++;
    assert.equal(projection.complete, false, `Lower-gear profile ${profile.base_id} must not guess the gear component`);
    assert.ok(projection.missing.includes('defense:gear_component_required'));
  }
}
assert.equal(g13ProfileCount, 328);
assert.equal(lowerGearProfileCount, 6);
pyodide.globals.set('moff_gideon_profile_json', JSON.stringify(moffGideonProfile));
const moffGideonDefense = JSON.parse(pyodide.runPython(`import json
profile = json.loads(moff_gideon_profile_json)
mods = [
 {'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense %', 'primary_value': 10},
 {'level': 1, 'set_name': 'Health', 'primary_stat': 'Health', 'primary_value': 0}
]
result = optimizer.final_stats(mods, profile['base_stats'], profile)
json.dumps(result)
`));
assert.ok(Math.abs(moffGideonDefense.Armor - 59.74107988632776) < 1e-8);
assert.ok(Math.abs(moffGideonDefense.Resistance - 54.457779682811825) < 1e-8);
pyodide.runPython(`try:
 profile = dict(json.loads(moff_gideon_profile_json), gear_level=12)
 optimizer.final_stats(
  [{'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense %', 'primary_value': 10}],
  profile['base_stats'], profile
 )
 non_g13_defense_error = ''
except RuntimeError as error:
 non_g13_defense_error = str(error)
`);
assert.match(pyodide.runPython('non_g13_defense_error'), /defense:gear_component_required/);

const defenseWarningResult = JSON.parse(pyodide.runPython(`import json
mods = []
for slot in ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']:
    mod = {'game_id': 'valid-' + slot, 'slot': slot, 'level': 15, 'set_name': 'Health',
           'primary_stat': 'Health', 'primary_value': 100,
           'secondary_1_stat': 'Speed', 'secondary_1_value': 10,
           'secondary_2_stat': 'Potency %', 'secondary_2_value': 1,
           'secondary_3_stat': 'Tenacity %', 'secondary_3_value': 1,
           'secondary_4_stat': 'Offense %', 'secondary_4_value': 1}
    mods.append(mod)
mods.append({'game_id': 'unsupported-defense', 'slot': 'Square', 'level': 15,
             'set_name': 'Health', 'primary_stat': 'Defense %', 'primary_value': 10,
             'secondary_1_stat': 'Speed', 'secondary_1_value': 10,
             'secondary_2_stat': 'Potency %', 'secondary_2_value': 1,
             'secondary_3_stat': 'Tenacity %', 'secondary_3_value': 1,
             'secondary_4_stat': 'Offense %', 'secondary_4_value': 1})
result = optimizer.optimize_kyber(
    mods, base_stats=json.loads(base_json),
    base_profile={'base_stats': json.loads(base_json), 'level': 85},
    kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=8
)
json.dumps({'count': len(result), 'warnings': result[0].get('warnings', []) if result else []})
`));
assert.equal(defenseWarningResult.count, 1);
assert.ok(defenseWarningResult.warnings.includes('defense_percent_unavailable'));

const g13DefenseWarningResult = JSON.parse(pyodide.runPython(`import json
profile = json.loads(moff_gideon_profile_json)
result = optimizer.optimize_kyber(
    mods, base_stats=profile['base_stats'], base_profile=profile,
    kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=8
)
json.dumps({'count': len(result), 'warnings': result[0].get('warnings', []) if result else []})
`));
assert.equal(g13DefenseWarningResult.count, 1);
assert.ok(!g13DefenseWarningResult.warnings.includes('defense_percent_unavailable'));


pyodide.runPython("try:\n optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 999, 'unscaledDecimalValue': 120000000}}], json.loads(base_json))\nexcept RuntimeError as error:\n incomplete_unknown_error = str(error)\nelse:\n incomplete_unknown_error = ''\n");
const incompleteUnknown = pyodide.runPython('incomplete_unknown_error');
assert.match(incompleteUnknown, /stat:unknown/);

const accuracy = JSON.parse(pyodide.runPython("import json\nmods = [\n {'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 33, 'unscaledDecimalValue': 12000000}, 'secondary_1_stat': {'unitStatId': 37, 'unscaledDecimalValue': 1200000000}},\n {'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 34, 'unscaledDecimalValue': 6000000}, 'secondary_1_stat': {'unitStatId': 38, 'unscaledDecimalValue': 2400000000}},\n {'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 52, 'unscaledDecimalValue': 12000000}}\n]\nresult = optimizer.final_stats(mods, json.loads(base_json))\njson.dumps(result)\n"));
assert.equal(accuracy['Physical Accuracy'], 13);
assert.equal(accuracy['Special Accuracy'], 8);
assert.equal(accuracy['Accuracy'], 0.12);

const batchParity = JSON.parse(pyodide.runPython("import json\nbuilds = [[], [{'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 52, 'unscaledDecimalValue': 12000000}}]]\njson.dumps(optimizer.final_stats_many(builds, json.loads(base_json)))\n"));
assert.deepEqual(batchParity[0], base);
assert.equal(batchParity[1].Accuracy, 0.12);
batchProjectedBuilds = 0;
batchBridgeCalls = 0;
scalarBridgeCalls = 0;

const batchSearch = JSON.parse(pyodide.runPython("import json\nmods = []\nfor index, slot in enumerate(['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']):\n for variant in range(3):\n  mod = {'game_id': f'batch-{index}-{variant}', 'slot': slot, 'level': 15, 'set_name': 'Health', 'primary_stat': 'Health', 'primary_value': 100 + variant, 'secondary_1_stat': 'Speed', 'secondary_1_value': 5 + variant, 'secondary_2_stat': 'Potency %', 'secondary_2_value': 0.1, 'secondary_3_stat': 'Tenacity %', 'secondary_3_value': 0.1, 'secondary_4_stat': 'Critical Damage %', 'secondary_4_value': 0.1}\n  mods.append(mod)\nresult = optimizer.optimize_kyber(mods, base_stats=json.loads(base_json), base_profile={'base_stats': json.loads(base_json), 'level': 85}, kyber={}, number_of_builds=1, limit_per_slot=3, beam_width=4)\njson.dumps({'count': len(result), 'mods': len(result[0]['build']) if result else 0})\n"));
assert.equal(batchSearch.count, 1);
assert.equal(batchSearch.mods, 6);
assert.equal(batchProjectedBuilds, 60);
assert.equal(scalarBridgeCalls, 0, `optimizer repeated ${scalarBridgeCalls} scalar projections after batching`);
assert.equal(batchBridgeCalls, 6, `expected one batch bridge call per slot, got ${batchBridgeCalls}`);
pyodide.runPython("try:\n optimizer.final_stats([{'level': 15, 'set_name': 'Health', 'primary_stat': 'Health', 'primary_value': 10, 'secondary_1_stat': 'Speed', 'secondary_1_value': 5}], json.loads(base_json))\nexcept RuntimeError as error:\n incomplete_secondary_error = str(error)\nelse:\n incomplete_secondary_error = ''\n");
const incompleteSecondary = pyodide.runPython('incomplete_secondary_error');
assert.match(incompleteSecondary, /mod:secondary_incomplete/);


const benchmarkMods = Array.from({ length: 2000 }, (_, index) => {
  const slot = ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross'][index % 6];
  const speed = 1 + ((index * 7) % 20);
  return {
    game_id: `bench-${index}`,
    slot,
    level: 15,
    set_name: ['Health', 'Offense', 'Speed', 'Defense'][index % 4],
    primary_stat: slot === 'Arrow' ? 'Speed' : 'Health',
    primary_value: slot === 'Arrow' ? 30 : 100,
    secondary_1_stat: 'Speed',
    secondary_1_value: speed,
    secondary_2_stat: 'Offense %',
    secondary_2_value: 1 + (index % 5),
    secondary_3_stat: 'Potency %',
    secondary_3_value: 1,
    secondary_4_stat: 'Tenacity %',
    secondary_4_value: 1
  };
});
pyodide.globals.set('benchmark_mods_json', JSON.stringify(benchmarkMods));

function runOptimizerBridgeBenchmark(useBatch, batchSize) {
  scalarBridgeCalls = 0;
  batchBridgeCalls = 0;
  batchProjectedBuilds = 0;
  optimizerBridgeReset(useBatch);
  const started = performance.now();
  const result = JSON.parse(pyodide.runPython(`import json
mods = json.loads(benchmark_mods_json)
result = optimizer.optimize_kyber(
    mods,
    base_stats=json.loads(base_json),
    base_profile={'base_stats': json.loads(base_json), 'level': 85},
    kyber={},
    number_of_builds=5,
    limit_per_slot=40,
    beam_width=240,
    projection_batch_size=${batchSize},
    minimum_speed=150,
)
json.dumps([
    {'ids': [m.get('game_id') or m.get('id') for m in item['build']],
     'score': item['score'], 'stats': item['stats']}
    for item in result
])`));
  return {
    elapsedMs: performance.now() - started,
    result,
    scalarCalls: scalarBridgeCalls,
    batchCalls: batchBridgeCalls,
    projectedBuilds: batchProjectedBuilds
  };
}

function optimizerBridgeReset(useBatch) {
  pyodide.globals.set('benchmark_use_batch', useBatch);
  // Reset the bridge and normalizer cache so both passes pay the same
  // normalization cost; only the bridge batching differs.
  pyodide.runPython("optimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge, holocron_mod_engine_batch_bridge if benchmark_use_batch else None)");
}

const scalarBenchmark = runOptimizerBridgeBenchmark(false, 256);
const batch256 = runOptimizerBridgeBenchmark(true, 256);
const batch512 = runOptimizerBridgeBenchmark(true, 512);
const batch1024 = runOptimizerBridgeBenchmark(true, 1024);
assert.equal(scalarBenchmark.projectedBuilds, 0);
assert.equal(scalarBenchmark.scalarCalls, 40040);
for (const benchmark of [batch256, batch512, batch1024]) {
  assert.equal(benchmark.scalarCalls, 0);
  assert.equal(benchmark.projectedBuilds, 40040);
  assert.deepEqual(benchmark.result, scalarBenchmark.result, 'scalar and indexed batch bridges must return identical top builds and stats');
}
assert.ok(batch512.batchCalls < batch256.batchCalls);
assert.ok(batch1024.batchCalls < batch512.batchCalls);
console.log('Optimizer bridge benchmark (synthetic 2,000-mod inventory; 40 candidates/slot; beam 240):');
console.log(JSON.stringify({
  scalar: { elapsedMs: Number(scalarBenchmark.elapsedMs.toFixed(1)), bridgeCalls: scalarBenchmark.scalarCalls },
  batch256: { elapsedMs: Number(batch256.elapsedMs.toFixed(1)), bridgeCalls: batch256.batchCalls },
  batch512: { elapsedMs: Number(batch512.elapsedMs.toFixed(1)), bridgeCalls: batch512.batchCalls },
  batch1024: { elapsedMs: Number(batch1024.elapsedMs.toFixed(1)), bridgeCalls: batch1024.batchCalls, projectedBuilds: batch1024.projectedBuilds },
  speedup512: Number((scalarBenchmark.elapsedMs / batch512.elapsedMs).toFixed(2)),
  speedup1024: Number((scalarBenchmark.elapsedMs / batch1024.elapsedMs).toFixed(2)),
  identicalResults: true
}));

const scoreCacheBenchmark = JSON.parse(pyodide.runPython(`import json, time
mods = json.loads(benchmark_mods_json)
by_slot = {slot: [] for slot in ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']}
for mod in mods:
    if len(by_slot[mod['slot']]) < 40:
        by_slot[mod['slot']].append(mod)
builds = [
    tuple(by_slot[slot][(index * (slot_index + 3)) % 40]
          for slot_index, slot in enumerate(['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']))
    for index in range(5000)
]
metadata = {id(mod): optimizer._mod_metadata(mod) for slot_mods in by_slot.values() for mod in slot_mods}
context = optimizer._prepare_scoring_context({})
projected = {'Speed': 200, 'Health': 100000, 'Protection': 50000}
weights = {'Speed': 1.0, 'Health': 0.01, 'Protection': 0.01, 'Offense': 0.5}
started = time.perf_counter()
cached_scores = [optimizer.build_score(build, {}, weights, {}, projected_stats=projected,
                                       mod_metadata=metadata, scoring_context=context)
                 for build in builds]
cached_ms = (time.perf_counter() - started) * 1000
started = time.perf_counter()
uncached_scores = [optimizer.build_score(build, {}, weights, {}, projected_stats=projected)
                   for build in builds]
uncached_ms = (time.perf_counter() - started) * 1000
json.dumps({'builds': len(builds), 'cachedMs': cached_ms, 'uncachedMs': uncached_ms,
            'identicalScores': cached_scores == uncached_scores})
`));
assert.equal(scoreCacheBenchmark.builds, 5000);
assert.equal(scoreCacheBenchmark.identicalScores, true);
console.log('Optimizer scoring metadata benchmark (5,000 six-mod builds):');
console.log(JSON.stringify({
  cachedMs: Number(scoreCacheBenchmark.cachedMs.toFixed(1)),
  uncachedMs: Number(scoreCacheBenchmark.uncachedMs.toFixed(1)),
  speedup: Number((scoreCacheBenchmark.uncachedMs / scoreCacheBenchmark.cachedMs).toFixed(2)),
  identicalScores: true
}));

console.log('Real Pyodide ↔ JavaScript shared mod-engine integration tests passed.');

