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
  'Physical Accuracy': 0, 'Special Accuracy': 0, Accuracy: 0
};
pyodide.globals.set('base_json', JSON.stringify(base));
const g13BaseProfile = {
  level: 85,
  gear_level: 13,
  base_stats: base,
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: {
      Health: 9000, Protection: 7000, Speed: 90,
      'Physical Damage': 450, 'Special Damage': 600,
      Armor: 45, Resistance: 35
    },
    gear: {
      Health: 1000, Protection: 1000, Speed: 10,
      'Physical Damage': 50, 'Special Damage': 100,
      Armor: 5, Resistance: 5
    }
  }
};
pyodide.globals.set('g13_profile_json', JSON.stringify(g13BaseProfile));
const zeroSecondaries = { secondary_1_stat:'Protection', secondary_1_value:0, secondary_2_stat:'Potency %', secondary_2_value:0, secondary_3_stat:'Tenacity %', secondary_3_value:0, secondary_4_stat:'Critical Damage %', secondary_4_value:0 };

const offenseMods = [
  { level: 15, set_name: 'Offense', primary_stat: 'Offense', primary_value: 40, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Offense %', primary_value: 10, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries },
  { level: 15, set_name: 'Offense', primary_stat: 'Health', primary_value: 100, ...zeroSecondaries }
];
pyodide.globals.set('mods_json', JSON.stringify(offenseMods));
pyodide.runPython("import json\ntry:\n optimizer.final_stats(json.loads(mods_json), json.loads(base_json), json.loads(g13_profile_json))\n offense_projection_error = ''\nexcept RuntimeError as error:\n offense_projection_error = str(error)\n");
assert.equal(pyodide.runPython('offense_projection_error'), '', 'G13 offense percentage projection is calculable with the Crinolo gear split');

const defense = JSON.parse(pyodide.runPython("import json\nresult = optimizer.final_stats([{'level': 1, 'set_name': 'Health', 'primary_stat': 'Defense', 'primary_value': 40}], json.loads(base_json), {'base_stats': json.loads(base_json), 'level': 85})\njson.dumps(result)\n"));
assert.ok(Math.abs(defense.Armor - 51.5209) < 0.001);
assert.ok(Math.abs(defense.Resistance - 42.1769) < 0.001);

const defenseLevelEffect = 85 * 7.5;
const defenseTotalRating = 100;
const defenseBasePercent = defenseTotalRating / (defenseLevelEffect + defenseTotalRating) * 100;
const splitDefenseProfile = {
  gear_level: 12,
  level: 85,
  base_stats: { Defense: defenseTotalRating, Armor: defenseBasePercent, Resistance: defenseBasePercent },
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Defense: 80 },
    gear: { Defense: 20 }
  }
};
const splitDefenseMods = [{
  level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10
}];
const sharedDefense = engine.calculateFinalStats(splitDefenseProfile, splitDefenseMods, 85);
assert.equal(sharedDefense.complete, true);
pyodide.globals.set('split_defense_profile_json', JSON.stringify(splitDefenseProfile));
pyodide.globals.set('split_defense_mods_json', JSON.stringify(splitDefenseMods));
const pythonSplitDefense = JSON.parse(pyodide.runPython(`
import json
json.dumps(optimizer.final_stats(
    json.loads(split_defense_mods_json),
    json.loads(split_defense_profile_json)["base_stats"],
    json.loads(split_defense_profile_json)
))
`));
const expectedBaseOnlyDefense = 108 / (defenseLevelEffect + 108) * 100;
assert.ok(Math.abs(pythonSplitDefense.Armor - expectedBaseOnlyDefense) < 1e-10,
  'Python optimizer must receive the shared base-only Defense % projection');
assert.ok(Math.abs(pythonSplitDefense.Resistance - expectedBaseOnlyDefense) < 1e-10);

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
const moffGideonScoreProfile = {
  ...moffGideonProfile,
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: {
      Speed: 150,
      Health: Number(moffGideonProfile.base_stats.Health),
      Protection: Number(moffGideonProfile.base_stats.Protection)
    },
    gear: { Speed: 3, Health: 0, Protection: 0 }
  }
};
const g13SpeedSetMods = Array.from({ length: 4 }, (_, index) => ({
  slot: ['Square', 'Arrow', 'Diamond', 'Triangle'][index],
  level: 15, set_name: 'Speed', primary_stat: 'Health', primary_value: 0,
  ...zeroSecondaries
}));
const unverifiedG13Speed = engine.calculateFinalStats(moffGideonProfile, g13SpeedSetMods, moffGideonProfile.level);
assert.equal(unverifiedG13Speed.complete, false, 'Static G13 snapshots do not disclose their equipped-gear contribution');
assert.ok(unverifiedG13Speed.missing.includes('speed:gear_component_required'));
const verifiedG13SpeedProfile = {
  ...moffGideonProfile,
  stat_components: {
    source: 'Crinolo.stats.base+stats.gear',
    base: { Speed: 150 }, gear: { Speed: 3 }
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
assert.equal(moffGideonOffenseProjection.complete, false, 'Static G13 profile cannot project Offense % without gear components');
const verifiedG13OffenseProjection = engine.calculateFinalStats(g13BaseProfile, offenseMods, 85);
assert.equal(verifiedG13OffenseProjection.complete, true, 'Dynamic G13 profile projects Offense % from Crinolo components');
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
  assert.equal(projection.complete, false, `Static profile ${profile.base_id} must not guess the Defense % gear component`);
  assert.ok(projection.missing.includes('defense:gear_component_required'));
}
assert.equal(g13ProfileCount, 328);
assert.equal(lowerGearProfileCount, 6);

// A static G13 snapshot has no gear split; a live Crinolo profile does.
const g13PercentProfile = { ...moffGideonProfile, stat_components: undefined };
const g13PercentMods = [
  { level: 1, set_name: 'Health', primary_stat: 'Health %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Protection %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Offense %', primary_value: 10 },
  { level: 1, set_name: 'Health', primary_stat: 'Defense %', primary_value: 10 }
];
const g13PercentProjection = engine.calculateFinalStats(g13PercentProfile, g13PercentMods, g13PercentProfile.level);
assert.equal(g13PercentProjection.complete, false, 'Static G13 snapshots must not invent a zero gear component');
const verifiedG13PercentProjection = engine.calculateFinalStats(g13BaseProfile, g13PercentMods, 85);
assert.equal(verifiedG13PercentProjection.complete, true, 'Crinolo components enable all supported percentage families at G13');
assert.ok(Number.isFinite(verifiedG13PercentProjection.stats.Health));
assert.ok(Number.isFinite(verifiedG13PercentProjection.stats.Protection));
assert.ok(Number.isFinite(verifiedG13PercentProjection.stats['Physical Damage']));
assert.ok(Number.isFinite(verifiedG13PercentProjection.stats.Armor));
pyodide.globals.set('moff_gideon_profile_json', JSON.stringify(moffGideonProfile));
pyodide.globals.set('moff_gideon_score_profile_json', JSON.stringify(moffGideonScoreProfile));
pyodide.runPython(`import json
profile = json.loads(moff_gideon_score_profile_json)
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
assert.equal(pyodide.runPython("'defense:gear_component_required' in moff_defense_missing"), true);
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
const g13DirectCandidateProjection = engine.calculateFinalStats(g13BaseProfile, g13CandidateMods, 85);
assert.equal(g13DirectCandidateProjection.complete, true, 'G13 Defense % is calculable with verified Crinolo components');
assert.ok(!g13DirectCandidateProjection.missing.includes('defense:gear_component_required'));
const g13DefenseWarningResult = JSON.parse(pyodide.runPython(`import json
profile = json.loads(g13_profile_json)
result = optimizer.optimize_kyber(
    mods, base_stats=profile['base_stats'], base_profile=profile,
    kyber={}, number_of_builds=1, limit_per_slot=2, beam_width=8
)
json.dumps({
    'count': len(result),
    'missing': result[0].get('missing_stats', []) if result else []
})
`));
assert.equal(g13DefenseWarningResult.count, 1, 'G13 builds must calculate Defense % using verified Crinolo components');
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
score_profile = json.loads(g13_profile_json)
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
assert.ok(!secondaryDefenseSearch.missing.includes('defense:gear_component_required'), 'G13 Defense % must be calculated with verified Crinolo gear components');


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
score_profile = json.loads(g13_profile_json)
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

const accuracy = JSON.parse(pyodide.runPython("import json\nmods = [\n {'level': 1, 'set_name': 'Health', 'primary_stat': {'unitStatId': 33, 'unscaledDecimalValue': 12000000}, 'secondary_1_stat': {'unitStatId': 37, 'unscaledDecimalValue': 1200000000}},\n {'level': 1, 'set_name': 'Defense', 'primary_stat': {'unitStatId': 34, 'unscaledDecimalValue': 6000000}, 'secondary_1_stat': {'unitStatId': 38, 'unscaledDecimalValue': 2400000000}},\n {'level': 1, 'set_name': 'Speed', 'primary_stat': {'unitStatId': 52, 'unscaledDecimalValue': 12000000}}\n]\nresult = optimizer.final_stats(mods, json.loads(base_json), json.loads(g13_profile_json))\njson.dumps(result)\n"));
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
 base_profile=json.loads(g13_profile_json),
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

// Legal mod primaries and the 12 actual secondary stat types (Comlink stat IDs).
// Values are generated from 5-dot roll ranges; no non-mod character stats are
// smuggled into the inventory benchmark.
const allowedPrimaryBySlot = {
  Square: [{ id: 48, key: 'offense', raw: 5880000 }],
  Arrow: [
    { id: 5, key: 'speed', raw: 3000000000 },
    { id: 52, key: 'accuracy', raw: 12000000 },
    { id: 54, key: 'criticalAvoidance', raw: 24000000 },
    { id: 55, key: 'health', raw: 5880000 },
    { id: 56, key: 'protection', raw: 23500000 },
    { id: 48, key: 'offense', raw: 5880000 },
    { id: 49, key: 'defense', raw: 11750000 }
  ],
  Diamond: [{ id: 49, key: 'defense', raw: 11750000 }],
  Triangle: [
    { id: 16, key: 'criticalDamage', raw: 36000000 },
    { id: 53, key: 'criticalChance', raw: 12000000 },
    { id: 55, key: 'health', raw: 5880000 },
    { id: 56, key: 'protection', raw: 23500000 },
    { id: 48, key: 'offense', raw: 5880000 },
    { id: 49, key: 'defense', raw: 11750000 }
  ],
  Circle: [
    { id: 55, key: 'health', raw: 5880000 },
    { id: 56, key: 'protection', raw: 23500000 }
  ],
  Cross: [
    { id: 17, key: 'potency', raw: 24000000 },
    { id: 18, key: 'tenacity', raw: 24000000 },
    { id: 55, key: 'health', raw: 5880000 },
    { id: 56, key: 'protection', raw: 23500000 },
    { id: 48, key: 'offense', raw: 5880000 },
    { id: 49, key: 'defense', raw: 11750000 }
  ]
};
const realSecondaryStats = [
  { id: 53, key: 'criticalChance', minRoll: 1.125, maxRoll: 2.25, scale: 1e6 },
  { id: 42, key: 'defense', minRoll: 4.9, maxRoll: 9.8, scale: 1e8 },
  { id: 49, key: 'defense', minRoll: 0.85, maxRoll: 1.70, scale: 1e6, basePercent: true },
  { id: 1, key: 'health', minRoll: 214.3, maxRoll: 428.6, scale: 1e8 },
  { id: 55, key: 'health', minRoll: 0.563, maxRoll: 1.125, scale: 1e6, basePercent: true },
  { id: 41, key: 'offense', minRoll: 22.8, maxRoll: 45.6, scale: 1e8 },
  { id: 48, key: 'offense', minRoll: 0.281, maxRoll: 0.563, scale: 1e6, basePercent: true },
  { id: 17, key: 'potency', minRoll: 1.125, maxRoll: 2.25, scale: 1e6 },
  { id: 28, key: 'protection', minRoll: 415.3, maxRoll: 830.6, scale: 1e8 },
  { id: 56, key: 'protection', minRoll: 1.125, maxRoll: 2.25, scale: 1e6, basePercent: true },
  { id: 5, key: 'speed', minRoll: 3, maxRoll: 6, scale: 1e8 },
  { id: 18, key: 'tenacity', minRoll: 1.125, maxRoll: 2.25, scale: 1e6 }
];
const realSecondaryIds = new Set(realSecondaryStats.map(stat => stat.id));
const fiveDotRollPatterns = [
  [5, 1, 1, 1], [4, 2, 1, 1], [3, 3, 1, 1], [3, 2, 2, 1],
  [2, 2, 2, 2], [4, 1, 2, 1], [2, 3, 2, 1], [3, 1, 3, 1]
];
const slotNames = ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross'];
const basePercentSecondaries = realSecondaryStats.filter(stat => stat.basePercent);

function createComlinkFixtureMod(slot, index, setName, slotIndex) {
  const primaryOptions = allowedPrimaryBySlot[slot];
  const primary = primaryOptions[Math.floor(index / 6) % primaryOptions.length];
  const selected = [];
  const usedKeys = new Set([primary.key]);

  // Every fixture mod has at least one base-percentage secondary. This makes
  // the G12/no-split case exercise the explicit missing-component path.
  for (let offset = 0; selected.length === 0 && offset < basePercentSecondaries.length; offset++) {
    const candidate = basePercentSecondaries[(index + slotIndex + offset) % basePercentSecondaries.length];
    if (!usedKeys.has(candidate.key)) {
      selected.push(candidate);
      usedKeys.add(candidate.key);
    }
  }
  for (let step = 0; selected.length < 4 && step < realSecondaryStats.length * 3; step++) {
    const candidate = realSecondaryStats[(index * 5 + slotIndex * 3 + step * 7) % realSecondaryStats.length];
    if (usedKeys.has(candidate.key)) continue;
    selected.push(candidate);
    usedKeys.add(candidate.key);
  }
  assert.equal(selected.length, 4, 'Every 5-dot mod fixture must contain four distinct secondary stat families');

  const rollCounts = fiveDotRollPatterns[index % fiveDotRollPatterns.length];
  assert.equal(rollCounts.reduce((sum, count) => sum + count, 0), 8,
    'A 5-dot 5A mod fixture must distribute eight secondary rolls');
  const secondaryStats = selected.map((stat, statIndex) => {
    const quality = 0.35 + (((index + 1) * 17 + stat.id * 13 + slotIndex * 19) % 66) / 100;
    const perRoll = stat.minRoll + (stat.maxRoll - stat.minRoll) * quality;
    return {
      unitStatId: stat.id,
      unscaledDecimalValue: Math.round(rollCounts[statIndex] * perRoll * stat.scale)
    };
  });
  return {
    mod: {
      game_id: 'comlink-fixture-' + slot + '-' + index,
      slot,
      level: 15,
      pips: 5,
      rarity: 5,
      set_name: setName,
      primary_stat: { unitStatId: primary.id, unscaledDecimalValue: primary.raw },
      secondary_stats: secondaryStats
    },
    rollCounts
  };
}

function optimizerBridgeReset(useBatch) {
  pyodide.globals.set('benchmark_use_batch', useBatch);
  pyodide.runPython("optimizer.set_mod_engine_bridge(holocron_mod_engine_bridge, holocron_mod_normalize_bridge, holocron_mod_engine_batch_bridge if benchmark_use_batch else None)");
}

// Keep a quick G12 integration check in every CI run. R5-D4 is an actual
// bundled gear-12 profile; it deliberately has no fabricated base/gear split.
assert.ok(r5d4Profile && r5d4Profile.gear_level === 12);
assert.equal(r5d4Profile.stat_components, undefined);
const smokeSets = ['Speed', 'Speed', 'Speed', 'Speed', 'Health', 'Health'];
const smokeEntries = slotNames.map((slot, index) =>
  createComlinkFixtureMod(slot, index * 6, smokeSets[index], index));
const g12SmokeMods = smokeEntries.map(entry => entry.mod);
assert.equal(g12SmokeMods.length, 6);
for (const mod of g12SmokeMods) {
  assert.ok(allowedPrimaryBySlot[mod.slot].some(primary => primary.id === mod.primary_stat.unitStatId),
    'The G12 smoke inventory must use a legal primary for ' + mod.slot);
  assert.equal(mod.secondary_stats.length, 4);
  assert.ok(mod.secondary_stats.every(stat => realSecondaryIds.has(stat.unitStatId)));
}
pyodide.globals.set('g12_profile_json', JSON.stringify(r5d4Profile));
pyodide.globals.set('g12_mods_json', JSON.stringify(g12SmokeMods));

function runG12SmokeSearch(useBatch) {
  scalarBridgeCalls = 0;
  batchBridgeCalls = 0;
  batchProjectedBuilds = 0;
  optimizerBridgeReset(useBatch);
  const source = [
    'import json',
    'profile = json.loads(g12_profile_json)',
    'mods = json.loads(g12_mods_json)',
    'result = optimizer.optimize_kyber(',
    '    mods, base_stats=profile["base_stats"], base_profile=profile,',
    '    kyber={"specific_sets": [{"name": "Speed x4 + Health x2", "counts": {"Speed": 4, "Health": 2}, "weight": 1.0}]},',
    '    number_of_builds=1, limit_per_slot=2, beam_width=8, projection_batch_size=16',
    ')',
    'json.dumps([{"ids": [m.get("game_id") for m in item["build"]], "sets": [m.get("set_name") for m in item["build"]], "stats": item["stats"], "missing_stats": item.get("missing_stats", [])} for item in result])'
  ].join('\n');
  return {
    result: JSON.parse(pyodide.runPython(source)),
    scalarCalls: scalarBridgeCalls,
    batchCalls: batchBridgeCalls,
    projectedBuilds: batchProjectedBuilds
  };
}
const g12ScalarSearch = runG12SmokeSearch(false);
const g12BatchSearch = runG12SmokeSearch(true);
assert.deepEqual(g12BatchSearch.result, g12ScalarSearch.result,
  'Scalar and batch bridges must return the same six-mod result on a real G12 profile');
assert.ok(g12ScalarSearch.scalarCalls > 0);
assert.equal(g12BatchSearch.scalarCalls, 0);
assert.ok(g12BatchSearch.batchCalls > 0);
assert.ok(g12BatchSearch.projectedBuilds > 0);
assert.equal(g12BatchSearch.result.length, 1);
assert.equal(g12BatchSearch.result[0].ids.length, 6);
assert.equal(g12BatchSearch.result[0].sets.filter(name => name === 'Speed').length, 4);
assert.equal(g12BatchSearch.result[0].sets.filter(name => name === 'Health').length, 2);
assert.ok(g12BatchSearch.result[0].missing_stats.includes('speed:gear_component_required'),
  'A G12 Speed set without a verified base/gear split must report the missing Speed component');
assert.ok(g12BatchSearch.result[0].missing_stats.some(code => code.endsWith(':gear_component_required')),
  'The partial G12 result must expose its uncalculated percentage components');

// The full 2,000-mod / interface-beam benchmark is intentionally nightly.
// It records elapsed time without inventing a performance threshold; priority 5
// will set the target against the observed 162.9-second standard-search baseline.
if (process.env.HOLOCRON_NIGHTLY_E2E === '1') {
  const setNames = [
    'Speed', 'Speed', 'Speed', 'Speed', 'Health', 'Health',
    'Offense', 'Defense', 'Potency', 'Tenacity', 'Critical Damage', 'Critical Chance'
  ];
  const benchmarkEntries = Array.from({ length: 2000 }, (_, index) => {
    const slot = slotNames[index % slotNames.length];
    const slotIndex = index % slotNames.length;
    const setName = setNames[Math.floor(index / slotNames.length) % setNames.length];
    return createComlinkFixtureMod(slot, index, setName, slotIndex);
  });
  const benchmarkMods = benchmarkEntries.map(entry => entry.mod);
  assert.equal(benchmarkMods.length, 2000);
  const seenSecondaryIds = new Set();
  for (const entry of benchmarkEntries) {
    const mod = entry.mod;
    assert.ok(allowedPrimaryBySlot[mod.slot].some(primary => primary.id === mod.primary_stat.unitStatId),
      'Illegal primary ' + mod.primary_stat.unitStatId + ' on ' + mod.slot);
    assert.equal(mod.secondary_stats.length, 4);
    assert.equal(entry.rollCounts.reduce((sum, count) => sum + count, 0), 8);
    for (const stat of mod.secondary_stats) {
      assert.ok(realSecondaryIds.has(stat.unitStatId),
        'Unexpected non-mod secondary stat ID: ' + stat.unitStatId);
      seenSecondaryIds.add(stat.unitStatId);
      const definition = realSecondaryStats.find(item => item.id === stat.unitStatId);
      const value = stat.unscaledDecimalValue / definition.scale;
      assert.ok(value <= definition.maxRoll * 5 + 0.001,
        'Secondary stat exceeds the 5-dot theoretical maximum: ' + stat.unitStatId);
    }
    const normalized = engine.normalizeMod(mod);
    assert.equal(normalized.complete, true, 'Every generated Comlink mod must normalize completely');
    assert.equal(normalized.secondaries.length, 4);
  }
  assert.deepEqual([...seenSecondaryIds].sort((a, b) => a - b),
    [...realSecondaryIds].sort((a, b) => a - b),
    'The 2,000-mod inventory must cover exactly the 12 real secondary stat IDs');

  const realisticProfile = r5d4Profile;
  assert.equal(realisticProfile.gear_level, 12);
  assert.equal(realisticProfile.stat_components, undefined);
  const individualStartedAt = performance.now();
  const individualProjections = benchmarkMods.map(mod =>
    engine.calculateFinalStats(realisticProfile, [mod], realisticProfile.level));
  const individualCalculationMs = performance.now() - individualStartedAt;
  const individualMissing = new Set(individualProjections.flatMap(result => result.missing || []));
  for (const code of [
    'health:gear_component_required',
    'protection:gear_component_required',
    'offense:gear_component_required',
    'defense:gear_component_required'
  ]) {
    assert.ok(individualMissing.has(code), 'The G12 inventory must disclose ' + code);
  }
  assert.ok(![...individualMissing].some(code => String(code).includes(':unsupported') || String(code).startsWith('stat:unknown')),
    'The 12-secondary fixture must not contain unsupported or unknown stat IDs');

  pyodide.globals.set('benchmark_mods_json', JSON.stringify(benchmarkMods));
  pyodide.globals.set('realistic_profile_json', JSON.stringify(realisticProfile));
  scalarBridgeCalls = 0;
  batchBridgeCalls = 0;
  batchProjectedBuilds = 0;
  optimizerBridgeReset(true);
  const searchStartedAt = performance.now();
  const standardSearch = JSON.parse(pyodide.runPython([
    'import json',
    'profile = json.loads(realistic_profile_json)',
    'mods = json.loads(benchmark_mods_json)',
    'result = optimizer.optimize_kyber(',
    '    mods, base_stats=profile["base_stats"], base_profile=profile,',
    '    kyber={"specific_sets": [{"name": "Speed x4 + Health x2", "counts": {"Speed": 4, "Health": 2}, "weight": 1.0}]},',
    '    number_of_builds=5, limit_per_slot=80, beam_width=1200, projection_batch_size=512',
    ')',
    'json.dumps([{"ids": [m.get("game_id") for m in item["build"]], "sets": [m.get("set_name") for m in item["build"]], "score": item["score"], "stats": item["stats"], "missing_stats": item.get("missing_stats", [])} for item in result])'
  ].join('\n')));
  const optimizerElapsedMs = performance.now() - searchStartedAt;
  const fullE2ECalculationMs = individualCalculationMs + optimizerElapsedMs;
  assert.ok(standardSearch.length >= 1, 'The 2,000-mod G12 inventory must produce an optimizer result');
  const best = standardSearch[0];
  assert.equal(best.ids.length, 6);
  assert.equal(best.sets.filter(name => name === 'Speed').length, 4);
  assert.equal(best.sets.filter(name => name === 'Health').length, 2);
  assert.ok(best.missing_stats.includes('speed:gear_component_required'));
  assert.ok(best.missing_stats.some(code => code.endsWith(':gear_component_required')));
  assert.equal(scalarBridgeCalls, 0, 'The nightly interface benchmark must use the batch bridge');
  assert.ok(batchBridgeCalls > 0);
  assert.ok(batchProjectedBuilds > 0);
  console.log('Nightly standard-interface optimizer E2E:');
  console.log(JSON.stringify({
    mods: benchmarkMods.length,
    realSecondaryTypes: seenSecondaryIds.size,
    profile: realisticProfile.base_id,
    gearLevel: realisticProfile.gear_level,
    candidatesPerSlot: 80,
    beamWidth: 1200,
    projectionBatchSize: 512,
    individualCalculationMs: Number(individualCalculationMs.toFixed(1)),
    optimizerElapsedMs: Number(optimizerElapsedMs.toFixed(1)),
    fullE2ECalculationMs: Number(fullE2ECalculationMs.toFixed(1)),
    results: standardSearch.length,
    bridgeCalls: batchBridgeCalls,
    projectedBuilds: batchProjectedBuilds,
    missingStats: best.missing_stats
  }));

  const scoreCacheBenchmark = JSON.parse(pyodide.runPython([
    'import json, time',
    'mods = json.loads(benchmark_mods_json)',
    "by_slot = {slot: [] for slot in ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']}",
    'for mod in mods:',
    '    if len(by_slot[mod["slot"]]) < 40:',
    '        by_slot[mod["slot"]].append(mod)',
    'builds = [',
    "    tuple(by_slot[slot][(index * (slot_index + 3)) % 40]",
    "          for slot_index, slot in enumerate(['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross']))",
    '    for index in range(5000)',
    ']',
    'metadata = {id(mod): optimizer._mod_metadata(mod) for slot_mods in by_slot.values() for mod in slot_mods}',
    'context = optimizer._prepare_scoring_context({})',
    "projected = {'Speed': 200, 'Health': 100000, 'Protection': 50000}",
    "weights = {'Speed': 1.0, 'Health': 0.01, 'Protection': 0.01, 'Offense': 0.5}",
    'started = time.perf_counter()',
    'cached_scores = [optimizer.build_score(build, {}, weights, {}, projected_stats=projected, mod_metadata=metadata, scoring_context=context) for build in builds]',
    'cached_ms = (time.perf_counter() - started) * 1000',
    'started = time.perf_counter()',
    'uncached_scores = [optimizer.build_score(build, {}, weights, {}, projected_stats=projected) for build in builds]',
    'uncached_ms = (time.perf_counter() - started) * 1000',
    "json.dumps({'builds': len(builds), 'cachedMs': cached_ms, 'uncachedMs': uncached_ms, 'identicalScores': cached_scores == uncached_scores})"
  ].join('\n')));
  assert.equal(scoreCacheBenchmark.builds, 5000);
  assert.equal(scoreCacheBenchmark.identicalScores, true);
  console.log('Optimizer scoring metadata benchmark (5,000 six-mod builds):');
  console.log(JSON.stringify({
    cachedMs: Number(scoreCacheBenchmark.cachedMs.toFixed(1)),
    uncachedMs: Number(scoreCacheBenchmark.uncachedMs.toFixed(1)),
    speedup: Number((scoreCacheBenchmark.uncachedMs / scoreCacheBenchmark.cachedMs).toFixed(2)),
    identicalScores: true
  }));
} else {
  console.log('Nightly 2,000-mod / beam-1,200 benchmark skipped in regular CI.');
}

console.log('Real Pyodide ↔ JavaScript shared mod-engine integration tests passed.');

