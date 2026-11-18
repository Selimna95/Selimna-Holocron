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
const originalRunPython = pyodide.runPython.bind(pyodide);
pyodide.runPython = (...args) => {
  try { return originalRunPython(...args); }
  catch (error) {
    console.error('PYODIDE_RUNPYTHON_ERROR:', error?.name, error?.message);
    throw new Error(`Pyodide runPython failed: ${error?.message || String(error)}`);
  }
};
pyodide.FS.writeFile('/home/pyodide/optimizer.py', read('../python/optimizer.py'));
pyodide.FS.mkdirTree('/home/pyodide/python');
pyodide.FS.writeFile('/home/pyodide/python/optimizer.py', read('../python/optimizer.py'));
pyodide.FS.writeFile('/home/pyodide/python/optimizer_profiles.json', read('../python/optimizer_profiles.json'));
pyodide.FS.mkdirTree('/home/pyodide/tests');
pyodide.FS.writeFile('/home/pyodide/tests/test_optimizer.py', read('./test_optimizer.py'));
const engineBridge = (baseJson, modsJson, level) => {
  scalarBridgeCalls++;
  const baseProfile = JSON.parse(baseJson);
  const result = engine.calculateFinalStats(baseProfile, JSON.parse(modsJson), Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null);
  return JSON.stringify(result);
};
const speedBridge = (baseJson, modsJson) => {
  const source = JSON.parse(baseJson);
  const base = source.base_stats || source;
  return JSON.stringify(engine.calculateSpeed(
    base.Speed ?? base.speed,
    JSON.parse(modsJson),
    source.gear_level ?? source.gearLevel,
    source.stat_components ?? null
  ));
};
const normalizeBridge = modJson => JSON.stringify(engine.normalizeMod(JSON.parse(modJson)));
let batchBridgeCalls = 0;
let batchProjectedBuilds = 0;
let scalarBridgeCalls = 0;
const batchBridge = (baseJson, indexedBuildsJson, level) => {
  batchBridgeCalls++;
  const payload = JSON.parse(indexedBuildsJson);
  batchProjectedBuilds += payload.builds.length;
  const baseProfile = JSON.parse(baseJson);
  const results = payload.builds.map(indexes => engine.calculateFinalStats(
    baseProfile, indexes.map(index => payload.mods[index]),
    Number.isFinite(Number(level)) && Number(level) > 0 ? Number(level) : null
  ));
  return JSON.stringify(results);
};
pyodide.globals.set('holocron_mod_engine_bridge', engineBridge);
pyodide.globals.set('holocron_mod_normalize_bridge', normalizeBridge);
pyodide.globals.set('holocron_mod_engine_batch_bridge', batchBridge);
pyodide.globals.set('holocron_mod_engine_speed_bridge', speedBridge);
pyodide.runPython(`import sys
sys.path.insert(0, '/home/pyodide')
import optimizer
optimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge, holocron_mod_engine_batch_bridge, speed_bridge=holocron_mod_engine_speed_bridge)
import python.optimizer as package_optimizer
package_optimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge, holocron_mod_engine_batch_bridge, speed_bridge=holocron_mod_engine_speed_bridge)
`);

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
  Health: 10000, Protection: 8000, Speed: 100,
  'Physical Damage': 500, 'Special Damage': 700,
  Armor: 50, Resistance: 40, Potency: 0.1, Tenacity: 0.2,
  'Critical Damage': 1.5, 'Critical Chance': 40, 'Critical Avoidance': 0,
  'Physical Critical Chance': 40, 'Special Critical Chance': 30,
  'Physical Critical Avoidance': 0, 'Special Critical Avoidance': 0,
  'Physical Accuracy': 0, 'Special Accuracy': 0, Accuracy: 0.1
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
pyodide.runPython("import json\ntry:\n optimizer.final_stats(json.loads(mods_json), json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85, 'gear_level': 13})\n offense_projection_error = ''\nexcept RuntimeError as error:\n offense_projection_error = str(error)\n");
assert.equal(pyodide.runPython('offense_projection_error'), '', 'G13 offense percentage projection is calculable with zero gear contribution');

const defense = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense', 'primary_value': 40}], json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85})\njson.dumps(result)\n"));
assert.ok(Math.abs(defense.Armor - 51.5209) < 0.001);
assert.ok(Math.abs(defense.Resistance - 42.1769) < 0.001);

pyodide.runPython("try:\n optimizer.final_stats([{'level': 15, 'set_name': 'Health', 'primary_stat': 'Defense', 'primary_value': 40}], json.loads(base_json))\nexcept RuntimeError as error:\n missing_level_error = str(error)\nelse:\n missing_level_error = ''\n");
const missingLevel = pyodide.runPython('missing_level_error');
assert.match(missingLevel, /level/);


const critRating = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 14, 'unscaledDecimalValue': 2400000000}}, {'level': 1, 'set_name': 'Defense', 'primary_stat': {'unitStatId': 15, 'unscaledDecimalValue': 4800000000}}], json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85, 'gear_level': 13})\njson.dumps(result)\n"));
assert.equal(critRating['Physical Critical Chance'], 41);
assert.equal(critRating['Special Critical Chance'], 32);

pyodide.runPython("try:\n optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense %', 'primary_value': 10}], json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85})\nexcept RuntimeError as error:\n incomplete_defense_error = str(error)\nelse:\n incomplete_defense_error = ''\n");
const incompleteDefense = pyodide.runPython('incomplete_defense_error');
assert.match(incompleteDefense, /defense:gear_component_required/);


const optimizerProfiles = JSON.parse(read('../python/optimizer_profiles.json'));
const moffGideonProfile = optimizerProfiles.MOFFGIDEONS3;
assert.ok(moffGideonProfile && moffGideonProfile.base_stats && moffGideonProfile.gear_level === 13);
assert.equal(moffGideonProfile.gear, undefined, 'profile must not be mistaken for a Crinolo gear-component breakdown');
const g13SpeedSetMods = Array.from({ length: 4 }, (_, index) => ({
  slot: ['Square', 'Arrow', 'Diamond', 'Triangle'][index],
  level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 0,
  ...zeroSecondaries
}));
const unverifiedG13Speed = engine.calculateFinalStats(moffGideonProfile, g13SpeedSetMods, moffGideonProfile.level);
assert.equal(unverifiedG13Speed.complete, true, 'G13 Speed set needs no synthetic gear split');
assert.equal(unverifiedG13Speed.stats.Speed, 168);
const verifiedG13SpeedProfile = {
  ...moffGideonProfile,
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Speed: 153 }, gear: { Speed: 0 }
  }
};
const verifiedG13Speed = engine.calculateFinalStats(verifiedG13SpeedProfile, g13SpeedSetMods, verifiedG13SpeedProfile.level);
assert.equal(verifiedG13Speed.complete, true);
assert.equal(verifiedG13Speed.stats.Speed, 168, 'Pyodide uses Crinolo integer flooring for Speed set bonuses');
pyodide.globals.set('speed_test_mods_json', JSON.stringify(g13SpeedSetMods));
pyodide.globals.set('speed_test_profile_json', JSON.stringify(verifiedG13SpeedProfile));
const pythonSpeedProjection = JSON.parse(pyodide.runPython(`
import json
json.dumps(optimizer.calculate_speed(
    json.loads(speed_test_mods_json),
    {"Speed": 153},
    json.loads(speed_test_profile_json)
))
`));
assert.equal(pythonSpeedProjection.complete, true);
assert.equal(pythonSpeedProjection.total, 168, 'Python Seigneur speed floor must use calculateSpeed only');
const r5d4Profile = optimizerProfiles.R5D4;
assert.ok(r5d4Profile && r5d4Profile.gear_level === 12);
const r5d4OffenseProjection = engine.calculateFinalStats(r5d4Profile, offenseMods, r5d4Profile.level);
assert.equal(r5d4OffenseProjection.complete, false);
assert.ok(r5d4OffenseProjection.missing.includes('offense:gear_component_required'));
const moffGideonOffenseProjection = engine.calculateFinalStats(moffGideonProfile, offenseMods, moffGideonProfile.level);
assert.equal(moffGideonOffenseProjection.complete, true, 'G13 Offense % must use the zero-gear base');
const defenseProfileMods = [
  { level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Health', primary_value: 0 }
];
let g13ProfileCount = 0;
let lowerGearProfileCount = 0;
for (const profile of Object.values(optimizerProfiles)) {
  const projection = engine.calculateFinalStats(profile, defenseProfileMods, profile.level);
  if (Number(profile.gear_level) === 13) g13ProfileCount++;
  else lowerGearProfileCount++;
  if (Number(profile.gear_level) === 13) {
    assert.equal(projection.complete, true, `G13 profile ${profile.base_id} has a known zero gear component`);
    assert.ok(!projection.missing.includes('defense:gear_component_required'));
  } else {
    assert.equal(projection.complete, false, `Profile ${profile.base_id} below G13 must not guess the Defense % gear component`);
    assert.ok(projection.missing.includes('defense:gear_component_required'));
  }
}
assert.equal(g13ProfileCount, 328);
assert.equal(lowerGearProfileCount, 6);

// G13 has a verified zero equipment contribution for every multiplicative stat.
const g13PercentProfile = { ...moffGideonProfile, stat_components: undefined };
const g13PercentMods = [
  { level: 1, set_name: 'Health', primary_stat: 'Health %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Protection %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Offense %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10 }
];
const g13PercentProjection = engine.calculateFinalStats(g13PercentProfile, g13PercentMods, g13PercentProfile.level);
assert.equal(g13PercentProjection.complete, true, 'All supported percentage families must calculate at G13');
assert.ok(Number.isFinite(g13PercentProjection.stats.Health));
assert.ok(Number.isFinite(g13PercentProjection.stats.Protection));
assert.ok(Number.isFinite(g13PercentProjection.stats['Physical Damage']));
assert.ok(Number.isFinite(g13PercentProjection.stats.Armor));
pyodide.globals.set('moff_gideon_profile_json', JSON.stringify(moffGideonProfile));
pyodide.runPython(`import json
profile = json.loads(moff_gideon_profile_json)
mods = [
 {'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense %', 'primary_value': 10},
 {'level': 1, 'set_name': 'Health', 'primary_stat': 'Health', 'primary_value': 0}
]
moff_defense_missing = optimizer.final_stats_many(
 [mods], profile['base_stats'], profile,
 required_stats={'Speed', 'Health', 'Protection'}
)[0].get('_projection_missing', [])
profile = dict(profile, gear_level=12)
non_g13_defense_missing = optimizer.final_stats_many(
 [[{'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense %', 'primary_value': 10}]],
 profile['base_stats'], profile,
 required_stats={'Speed', 'Health', 'Protection'}
)[0].get('_projection_missing', [])
non_g13_defense_reported = 'defense:gear_component_required' in non_g13_defense_missing
`);
assert.equal(pyodide.runPython("'defense:gear_component_required' in moff_defense_missing"), false);
assert.equal(pyodide.runPython('non_g13_defense_reported'), true);

const defenseWarningResult = JSON.parse(pyodide.runPython(`import json
mods = []
for index, slot in enumerate(['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']):
    mod = {'game_id': 'valid-' + slot, 'slot': slot, 'level': 15,
           'set_name': ['Offense', 'Speed', 'Defense', 'Critical Damage', 'Potency', 'Tenacity'][index],
           'primary_stat': 'Defense %' if slot == 'Cross' else 'Health',
           'primary_value': 10 if slot == 'Cross' else 100,
           'secondary_1_stat': 'Speed', 'secondary_1_value': 10,
           'secondary_2_stat': 'Potency %', 'secondary_2_value': 1,
           'secondary_3_stat': 'Tenacity %', 'secondary_3_value': 1,
           'secondary_4_stat': 'Critical Damage %', 'secondary_4_value': 1}
    mods.append(mod)
try:
    result = optimizer.optimize_kyber(
        mods, base_stats=json.loads(base_json),
        base_profile={'base_stats': json.loads(base_json), 'level': 85},
        kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=8
    )
    warning_error = ''
except RuntimeError as error:
    result = []
    warning_error = str(error)
json.dumps({'count': len(result), 'missing': result[0].get('missing_stats', []) if result else [], 'error': warning_error})
`));
assert.equal(defenseWarningResult.count, 1, 'Defense % alone must not reject a build when score stats are complete');
assert.ok(defenseWarningResult.missing.includes('defense:gear_component_required'), 'The result must disclose the uncalculated Defense %');

const g13CandidateMods = JSON.parse(pyodide.runPython('json.dumps(mods)'));
const g13DirectCandidateProjection = engine.calculateFinalStats(moffGideonProfile, g13CandidateMods, moffGideonProfile.level);
assert.equal(g13DirectCandidateProjection.complete, true, 'G13 Defense % is calculable with zero gear contribution');
assert.ok(!g13DirectCandidateProjection.missing.includes('defense:gear_component_required'));
const g13DefenseWarningResult = JSON.parse(pyodide.runPython(`import json
profile = json.loads(moff_gideon_profile_json)
result = optimizer.optimize_kyber(
    mods, base_stats=profile['base_stats'], base_profile=profile,
    kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=8
)
json.dumps({
    'count': len(result),
    'missing': result[0].get('missing_stats', []) if result else []
})
`));
assert.equal(g13DefenseWarningResult.count, 1, 'G13 builds must calculate Defense % using the known zero gear contribution');
assert.ok(!g13DefenseWarningResult.missing.includes('defense:gear_component_required'));
pyodide.globals.set('score_missing_profile_json', JSON.stringify({
  base_stats: base, level: 85, gear_level: 12
}));
pyodide.globals.set('score_missing_mod_json', JSON.stringify({
  level: 1, set_name: 'Health', primary_stat: 'Health %', primary_value: 10
}));
const scoreStatMissing = JSON.parse(pyodide.runPython(`
import json
builds = [[json.loads(score_missing_mod_json)]]
base_profile = json.loads(score_missing_profile_json)
speed_only_projection = optimizer.final_stats_many(
    builds, json.loads(base_json), base_profile, required_stats={"Speed"}
)[0]
health_score_projection = optimizer.final_stats_many(
    builds, json.loads(base_json), base_profile, required_stats={"Health"}
)[0]
json.dumps({
    'speed_only_accepted': not isinstance(speed_only_projection, RuntimeError),
    'missing': speed_only_projection.get('_projection_missing', []) if isinstance(speed_only_projection, dict) else [],
    'health_rejected': isinstance(health_score_projection, RuntimeError),
    'health_reason': str(health_score_projection) if isinstance(health_score_projection, RuntimeError) else ''
})
`));
assert.equal(scoreStatMissing.speed_only_accepted, true, 'A missing Health projection must not block a score that does not use Health');
assert.ok(scoreStatMissing.missing.includes('health:gear_component_required'));
assert.equal(scoreStatMissing.health_rejected, true, 'The same build must be rejected when Health is part of the score');
assert.match(scoreStatMissing.health_reason, /Health/);

const secondaryDefenseSearch = JSON.parse(pyodide.runPython(`import json
secondary_defense_mods = []
for index, slot in enumerate(['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']):
    secondary_defense_mods.append({
        'game_id': 'secondary-defense-' + slot,
        'slot': slot, 'level': 15,
        'set_name': ['Health', 'Offense', 'Speed', 'Defense', 'Potency', 'Tenacity'][index],
        'primary_stat': 'Health', 'primary_value': 100,
        'secondary_1_stat': {'stat_id': 49, 'name': 'Defense', 'unscaledDecimalValue': 10000000},
        'secondary_2_stat': 'Speed', 'secondary_2_value': 10,
        'secondary_3_stat': 'Potency %', 'secondary_3_value': 1,
        'secondary_4_stat': 'Tenacity %', 'secondary_4_value': 1
    })
score_profile = {'base_stats': json.loads(base_json), 'level': 85, 'gear_level': 13}
result = optimizer.optimize_kyber(
    secondary_defense_mods, base_stats=json.loads(base_json), base_profile=score_profile,
    kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=8
)
json.dumps({
    'count': len(result),
    'missing': result[0].get('missing_stats', []) if result else []
})
`));
assert.equal(secondaryDefenseSearch.count, 1, 'Uncalculable Defense must not reject a build when the score stats are complete');
assert.ok(!secondaryDefenseSearch.missing.includes('defense:gear_component_required'), 'G13 Defense % must be calculated with zero gear contribution');


const realComlinkDefenseSearch = JSON.parse(pyodide.runPython(`import json
comlink_mods = []
for index, slot in enumerate(['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']):
    comlink_mods.append({
        'game_id': 'real-comlink-defense-' + slot,
        'slot': slot, 'level': 15, 'pips': 0, 'rarity': 5,
        'set_name': ['Health', 'Offense', 'Speed', 'Defense', 'Potency', 'Tenacity'][index],
        'primary_stat': 'Health', 'primary_value': 100,
        'secondary_stats': [
            {'name': 'Defense', 'stat_id': 49, 'value': 237.1, 'display_value': '2.37%', 'unscaled_roll_values': [2336, 2616]},
            {'name': 'Speed', 'stat_id': 5, 'value': 40000, 'display_value': '4', 'unscaled_roll_values': [40000]},
            {'name': 'Health', 'stat_id': 1, 'value': 8350000, 'display_value': '835', 'unscaled_roll_values': [41085900, 42449400]},
            {'name': 'Tenacity', 'stat_id': 18, 'value': 281.8, 'display_value': '2.82%', 'unscaled_roll_values': [1778, 1159, 1761]}
        ]
    })
score_profile = {'base_stats': json.loads(base_json), 'level': 85, 'gear_level': 13}
result = optimizer.optimize_kyber(
    comlink_mods, base_stats=json.loads(base_json), base_profile=score_profile,
    kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=8
)
json.dumps({
    'count': len(result),
    'missing': result[0].get('missing_stats', []) if result else []
})
`));
assert.equal(realComlinkDefenseSearch.count, 1, 'Comlink mods with Defense % must remain optimizable at G13');
assert.ok(!realComlinkDefenseSearch.missing.includes('defense:gear_component_required'));


pyodide.runPython("try:\n optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 999, 'unscaledDecimalValue': 120000000}}], json.loads(base_json))\nexcept RuntimeError as error:\n incomplete_unknown_error = str(error)\nelse:\n incomplete_unknown_error = ''\n");
const incompleteUnknown = pyodide.runPython('incomplete_unknown_error');
assert.match(incompleteUnknown, /stat:unknown/);

const accuracy = JSON.parse(pyodide.runPython("import json\nmods = [\n {'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 33, 'unscaledDecimalValue': 12000000}, 'secondary_1_stat': {'unitStatId': 37, 'unscaledDecimalValue': 1200000000}},\n {'level': 1, 'set_name': 'Defense', 'primary_stat': {'unitStatId': 34, 'unscaledDecimalValue': 6000000}, 'secondary_1_stat': {'unitStatId': 38, 'unscaledDecimalValue': 2400000000}},\n {'level': 1, 'set_name': 'Speed', 'primary_stat': {'unitStatId': 52, 'unscaledDecimalValue': 12000000}}\n]\nresult = optimizer.final_stats(mods, json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85, 'gear_level': 13})\njson.dumps(result)\n"));
assert.equal(accuracy['Physical Accuracy'], 13);
assert.equal(accuracy['Special Accuracy'], 8);
assert.equal(accuracy['Accuracy'], 0.12);

const batchParity = JSON.parse(pyodide.runPython("import json\nbuilds = [[], [{'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 52, 'unscaledDecimalValue': 12000000}}]]\njson.dumps(optimizer.final_stats_many(builds, json.loads(base_json)))\n"));
assert.deepEqual(batchParity[0], base);
assert.equal(batchParity[1].Accuracy, 0.12);
batchProjectedBuilds = 0;
batchBridgeCalls = 0;
scalarBridgeCalls = 0;

const batchSearch = JSON.parse(pyodide.runPython(`import json
slots = ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']
primaries = {
 'Square': (41, 4000000000),
 'Arrow': (5, 3000000000),
 'Diamond': (42, 4000000000),
 'Triangle': (16, 30000000),
 'Circle': (55, 5880000),
 'Cross': (17, 10000000),
}
secondary_ids = {
 'Square': [(5, 400000000), (1, 83500000000), (17, 1982000), (18, 2818000)],
 'Arrow': [(1, 83500000000), (28, 71700000000), (48, 5000000), (18, 2818000)],
 'Diamond': [(5, 400000000), (48, 5000000), (17, 1982000), (18, 2818000)],
 'Triangle': [(5, 400000000), (48, 5000000), (17, 1982000), (18, 2818000)],
 'Circle': [(5, 400000000), (28, 71700000000), (48, 5000000), (17, 1982000)],
 'Cross': [(5, 400000000), (48, 5000000), (1, 83500000000), (18, 2818000)],
}
mods = []
for slot in slots:
 for variant in range(3):
  primary_id, primary_value = primaries[slot]
  secondaries = [
   {'unitStatId': stat_id, 'unscaledDecimalValue': raw + (variant * 1000 if stat_id in (5, 48) else 0)}
   for stat_id, raw in secondary_ids[slot]
  ]
  mods.append({
   'game_id': f'batch-{slot}-{variant}', 'slot': slot, 'level': 15,
   'pips': 5, 'rarity': 5, 'set_name': 'Potency',
   'primary_stat': {'unitStatId': primary_id, 'unscaledDecimalValue': primary_value},
   'secondary_stats': secondaries
  })
result = optimizer.optimize_kyber(
 mods, base_stats=json.loads(base_json),
 base_profile={'base_stats': json.loads(base_json), 'level': 85, 'gear_level': 13},
 kyber={}, number_of_builds=1, limit_per_slot=3, beam_width=4
)
json.dumps({'count': len(result), 'mods': len(result[0]['build']) if result else 0})
`));
assert.equal(batchSearch.count, 1);
assert.equal(batchSearch.mods, 6);
assert.equal(batchProjectedBuilds, 60);
assert.equal(scalarBridgeCalls, 0, `optimizer repeated ${scalarBridgeCalls} scalar projections after batching`);
assert.equal(batchBridgeCalls, 6, `expected one batch bridge call per slot, got ${batchBridgeCalls}`);
pyodide.runPython("try:\n optimizer.final_stats([{'level': 15, 'set_name': 'Health', 'primary_stat': 'Health', 'primary_value': 10, 'secondary_1_stat': 'Speed', 'secondary_1_value': 5}], json.loads(base_json))\nexcept RuntimeError as error:\n incomplete_secondary_error = str(error)\nelse:\n incomplete_secondary_error = ''\n");
const incompleteSecondary = pyodide.runPython('incomplete_secondary_error');
assert.match(incompleteSecondary, /mod:secondary_incomplete/);


// Run the Python optimizer unit suite inside Pyodide. Both Python imports use
// the exact same JavaScript mod engine and normalizer as the browser worker.
pyodide.runPython(`import os, sys, unittest
os.environ["HOLOCRON_PYODIDE"] = "1"
sys.path.insert(0, "/home/pyodide/tests")
import test_optimizer
suite = unittest.defaultTestLoader.loadTestsFromModule(test_optimizer)
result = unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful():
    raise AssertionError("Python optimizer tests failed against the shared JavaScript mod engine")
`);
console.log('Python optimizer unittest suite executed through the shared JavaScript engine.');

// A 2,000-mod inventory in Comlink's real stat-id/unscaled-value shape.
// Every primary is legal for its slot; all percentage stat IDs occur in the
// inventory. Armor/resistance penetration are deliberately present on two
// mods because the shared engine currently reports those two as unsupported.
const slotNames = ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross'];
const allowedPrimaryBySlot = {
  Square: [{ id: 41, key: 'offense', raw: 4_000_000_000 }],
  Arrow: [
    { id: 5, key: 'speed', raw: 3_000_000_000 },
    { id: 55, key: 'health', raw: 5_880_000 },
    { id: 56, key: 'protection', raw: 5_880_000 },
    { id: 48, key: 'offense', raw: 5_880_000 },
    { id: 49, key: 'defense', raw: 5_880_000 },
    { id: 53, key: 'criticalChance', raw: 5_880_000 },
    { id: 54, key: 'criticalAvoidance', raw: 5_880_000 },
    { id: 52, key: 'accuracy', raw: 5_880_000 },
    { id: 17, key: 'potency', raw: 10_000_000 },
    { id: 18, key: 'tenacity', raw: 10_000_000 }
  ],
  Diamond: [{ id: 42, key: 'defense', raw: 4_000_000_000 }],
  Triangle: [
    { id: 16, key: 'criticalDamage', raw: 30_000_000 },
    { id: 53, key: 'criticalChance', raw: 5_880_000 },
    { id: 48, key: 'offense', raw: 5_880_000 },
    { id: 55, key: 'health', raw: 5_880_000 },
    { id: 56, key: 'protection', raw: 5_880_000 },
    { id: 49, key: 'defense', raw: 5_880_000 }
  ],
  Circle: [
    { id: 55, key: 'health', raw: 5_880_000 },
    { id: 56, key: 'protection', raw: 5_880_000 }
  ],
  Cross: [
    { id: 17, key: 'potency', raw: 10_000_000 },
    { id: 18, key: 'tenacity', raw: 10_000_000 },
    { id: 48, key: 'offense', raw: 5_880_000 },
    { id: 49, key: 'defense', raw: 5_880_000 }
  ]
};
const secondaryPool = [
  { id: 5, key: 'speed', raw: 400_000_000 },
  { id: 1, key: 'health', raw: 83_500_000_000 },
  { id: 28, key: 'protection', raw: 71_700_000_000 },
  { id: 41, key: 'offense', raw: 2_100_000_000 },
  { id: 42, key: 'defense', raw: 500_000_000 },
  { id: 16, key: 'criticalDamage', raw: 3_000_000 },
  { id: 17, key: 'potency', raw: 1_982_000 },
  { id: 18, key: 'tenacity', raw: 2_818_000 },
  { id: 21, key: 'physicalCriticalChance', raw: 12_000_000 },
  { id: 22, key: 'specialCriticalChance', raw: 12_000_000 },
  { id: 23, key: 'armor', raw: 10_000_000 },
  { id: 24, key: 'resistance', raw: 20_000_000 },
  { id: 33, key: 'physicalAccuracy', raw: 12_000_000 },
  { id: 34, key: 'specialAccuracy', raw: 6_000_000 },
  { id: 35, key: 'physicalCriticalAvoidance', raw: 10_000_000 },
  { id: 36, key: 'specialCriticalAvoidance', raw: 10_000_000 },
  { id: 48, key: 'offense', raw: 5_000_000 },
  { id: 49, key: 'defense', raw: 2_371_000 },
  { id: 52, key: 'accuracy', raw: 12_000_000 },
  { id: 53, key: 'criticalChance', raw: 3_167_000 },
  { id: 54, key: 'criticalAvoidance', raw: 10_000_000 },
  { id: 55, key: 'health', raw: 718_000 },
  { id: 56, key: 'protection', raw: 2_140_000 },
  { id: 57, key: 'speed', raw: 10_000_000 }
];
const percentStatIds = [16, 17, 18, 21, 22, 23, 24, 25, 26, 33, 34, 35, 36, 48, 49, 52, 53, 54, 55, 56, 57];
const setNames = ['Speed', 'Speed', 'Health', 'Offense', 'Defense', 'Potency', 'Tenacity', 'Critical Damage', 'Critical Chance'];
const seenPrimaryIds = new Set();
const seenSecondaryIds = new Set();
const benchmarkMods = Array.from({ length: 2000 }, (_, index) => {
  const slot = slotNames[index % slotNames.length];
  const primaryOptions = allowedPrimaryBySlot[slot];
  const primary = primaryOptions[Math.floor(index / slotNames.length) % primaryOptions.length];
  seenPrimaryIds.add(primary.id);
  const secondaries = [];
  const secondaryKeys = new Set([primary.key]);
  // Keep Speed as a common, realistic secondary unless it is already the primary.
  if (primary.key !== 'speed') {
    const speedStat = secondaryPool[0];
    secondaries.push(speedStat);
    secondaryKeys.add(speedStat.key);
    seenSecondaryIds.add(speedStat.id);
  }
  for (let step = 0; secondaries.length < 4 && step < secondaryPool.length * 2; step++) {
    const candidate = secondaryPool[(Math.floor(index / 6) * 3 + step) % secondaryPool.length];
    if (secondaryKeys.has(candidate.key)) continue;
    secondaries.push(candidate);
    secondaryKeys.add(candidate.key);
    seenSecondaryIds.add(candidate.id);
  }
  // Two real-but-not-yet-supported percentage stats stay visible as rejected
  // inputs rather than being rewritten into a supported stat to force success.
  if (index === 0 || index === 1) {
    const unsupported = { id: index === 0 ? 25 : 26, raw: 10_000_000 };
    secondaries[3] = unsupported;
    seenSecondaryIds.add(unsupported.id);
  }
  const mod = {
    game_id: `comlink-realistic-${index}`,
    slot,
    level: 15,
    pips: 5,
    rarity: 5,
    set_name: setNames[Math.floor(index / 6) % setNames.length],
    primary_stat: { unitStatId: primary.id, unscaledDecimalValue: primary.raw },
    secondary_stats: secondaries.map(stat => ({
      unitStatId: stat.id,
      unscaledDecimalValue: stat.raw
    }))
  };
  return mod;
});
seenSecondaryIds.clear();
for (const mod of benchmarkMods) {
  for (const stat of mod.secondary_stats) seenSecondaryIds.add(stat.unitStatId);
}
assert.equal(benchmarkMods.length, 2000);
for (const mod of benchmarkMods) {
  assert.ok(allowedPrimaryBySlot[mod.slot].some(item => item.id === mod.primary_stat.unitStatId),
    `illegal primary ${mod.primary_stat.unitStatId} on ${mod.slot}`);
}
assert.ok(percentStatIds.every(id => seenPrimaryIds.has(id) || seenSecondaryIds.has(id)),
  'the inventory must cover every percentage stat family');
assert.ok(benchmarkMods.filter(mod => mod.set_name === 'Speed').length >= 4,
  'the inventory must contain enough Speed-set mods for a six-slot build');
const realisticProfile = { base_stats: base, level: 85, gear_level: 13 };
const individualStartedAt = performance.now();
const individualProjections = benchmarkMods.map(mod =>
  engine.calculateFinalStats(realisticProfile, [mod], 85));
const individualCalculationMs = performance.now() - individualStartedAt;
const individuallyCalculated = individualProjections.filter(result => result.complete).length;
const individuallyCalculableRatio = individuallyCalculated / benchmarkMods.length;
assert.ok(individuallyCalculableRatio >= 0.90,
  `only ${individuallyCalculated}/${benchmarkMods.length} mods are individually calculable`);
assert.equal(individualProjections[0].complete, false,
  'an explicitly unsupported percentage stat must be rejected, not normalized away');
assert.ok(individualProjections[0].missing.includes('stat:armorPenetration:unsupported'));
assert.ok(individualProjections[1].missing.includes('stat:resistancePenetration:unsupported'));

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
    base_profile={'base_stats': json.loads(base_json), 'level': 85, 'gear_level': 13},
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
assert.ok(batch1024.result.length >= 1, 'the realistic 2,000-mod inventory must produce at least one optimizer result');
assert.equal(batch1024.result[0].ids.length, 6, 'the optimizer result must contain a complete six-slot build');
assert.ok(batch1024.elapsedMs <= 18000,
  `realistic 2,000-mod optimization exceeded 18,000 ms: ${batch1024.elapsedMs.toFixed(1)} ms`);
console.log('End-to-end realistic Comlink inventory:');
console.log(JSON.stringify({
  mods: benchmarkMods.length,
  individuallyCalculable: individuallyCalculated,
  individuallyCalculablePercent: Number((individuallyCalculableRatio * 100).toFixed(2)),
  individualCalculationMs: Number(individualCalculationMs.toFixed(1)),
  optimizerResults: batch1024.result.length,
  optimizerElapsedMs: Number(batch1024.elapsedMs.toFixed(1)),
  sixSlotBuild: batch1024.result[0].ids.length
}));
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

