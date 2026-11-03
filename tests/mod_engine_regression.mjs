import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
function extractFunction(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'Missing production function: ' + name);
  const open = source.indexOf('{', start + marker.length);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (ch === '/' && next === '/') {
      i += 2; while (i < source.length && source[i] !== String.fromCharCode(10)) i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2; while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++; continue;
    }
    if (ch === "'" || ch === '"' || ch === String.fromCharCode(96)) {
      const quote = ch;
      for (i++; i < source.length; i++) {
        if (source[i] === String.fromCharCode(92)) { i++; continue; }
        if (source[i] === quote) break;
      }
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function: ' + name);
}
function load(source, names, context) {
  vm.runInContext(names.map(name => extractFunction(source, name)).join('\n'), context);
}
const compactKey = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const numericValue = (value, fallback = 0) => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};
const speed = (mod) => Number(mod?.speed ?? 0);

// 1) Exact baseId identity must win over a colliding display-name alias.
const core = read('../modules/core.js');
const collisionRoster = [
  { name: 'Ahsoka Tano (Snips)', baseId: 'AHSOKATANO' },
  { name: 'Ahsoka Tano', baseId: 'GLAHSOKATANO' },
  { name: 'Darth Maul', baseId: 'MAUL' },
  { name: 'Maul', baseId: 'MAULS7' },
  { name: 'Sith Trooper', baseId: 'FOSITHTROOPER' },
  { name: 'Sith Empire Trooper', baseId: 'SITHTROOPER' },
  { name: 'Rey (Scavenger)', baseId: 'REY' },
  { name: 'Rey', baseId: 'GLREY' }
];
const ownerContext = vm.createContext({ compactKey, rosterCharacters: collisionRoster });
load(core, ['characterKey', 'buildRosterOwnerResolver', 'modOwnerKey', 'resolveModOwnerKey'], ownerContext);
const resolver = ownerContext.buildRosterOwnerResolver(collisionRoster);
for (const [raw, expected] of [
  ['AHSOKATANO', 'AHSOKATANO'], ['GLAHSOKATANO', 'GLAHSOKATANO'],
  ['MAUL', 'MAUL'], ['MAULS7', 'MAULS7'],
  ['SITHTROOPER', 'SITHTROOPER'], ['FOSITHTROOPER', 'FOSITHTROOPER'],
  ['REY', 'REY'], ['GLREY', 'GLREY']
]) assert.equal(resolver.resolve(raw), expected, 'Owner ' + raw);
const explicitOwner = ownerContext.resolveModOwnerKey(
  { characterName: 'Ahsoka Tano', characterId: 'GLAHSOKATANO' }, resolver
);
assert.equal(explicitOwner, 'GLAHSOKATANO', 'Explicit characterId must beat a colliding display name');

// GL classification: canonical roster baseIds must win over stale aliases.
const glContext = vm.createContext({ compactKey });
load(core, ['characterKey'], glContext);
const glStart = core.indexOf('const HOLOCRON_GALACTIC_LEGENDS = new Set([');
assert.notEqual(glStart, -1, 'Production GL baseId set exists');
const glEnd = core.indexOf(']);', glStart) + 3;
vm.runInContext(core.slice(glStart, glEnd), glContext);
load(read('../modules/acolyte.js'), ['holocronIsGalacticLegend'], glContext);
for (const baseId of ['GLREY', 'GLAHSOKATANO', 'GLLEIA', 'JEDIMASTERKENOBI', 'GRANDMASTERLUKE', 'SITHPALPATINE', 'JABBATHEHUTT', 'LORDVADER', 'SUPREMELEADERKYLOREN', 'GLHONDO', 'GLMANDOGROGU']) {
  assert.equal(glContext.holocronIsGalacticLegend({ baseId }), true, 'GL ' + baseId);
}
for (const baseId of ['REY', 'GRANDMASTERYODA', 'JEDIKNIGHTLUKE', 'STARKILLER', 'EXECUTOR']) {
  assert.equal(glContext.holocronIsGalacticLegend({ baseId }), false, 'Non-GL ' + baseId);
}

// 3) Run the production Sith'ari cache against the four real collision pairs.
const sithari = read('../modules/sithari.js');
const slots = ['Square', 'Arrow', 'Diamond', 'Triangle', 'Circle', 'Cross'];
const fixtureMods = collisionRoster.flatMap((c, ci) => slots.map((slot, si) => ({
  id: c.baseId + '-' + slot, game_id: c.baseId + '-' + slot,
  character: c.baseId, slot, set_name: 'Speed', primary_stat: 'Health',
  secondary_1_stat: 'Speed', secondary_1_value: 8 + ci + si, level: 15
})));
const cacheContext = vm.createContext({
  compactKey, rosterCharacters: collisionRoster, mods: fixtureMods,
  SITHARI_SLOT_ORDER: slots,
  sithariModCache: { signature: '', items: [], byOwner: new Map(), statusByOwner: new Map(), ownerResolver: null },
  normalizeModForDisplay: (m) => ({ ...m, game_id: m.game_id || m.id }),
  modSlotLabel: (v) => v,
  v176ModStatus: (arr) => ({ status: arr.length === 6 ? 'BONS' : arr.length ? 'FAIBLES' : 'SANS MODS' })
});
load(core, ['characterKey', 'buildRosterOwnerResolver', 'modOwnerKey', 'resolveModOwnerKey'], cacheContext);
cacheContext.getCharacterMods = (c) => {
  const r = cacheContext.buildRosterOwnerResolver(cacheContext.rosterCharacters);
  return cacheContext.mods.filter(m => r.resolve(m.character) === cacheContext.characterKey(c)).map(cacheContext.normalizeModForDisplay);
};
load(sithari, ['sithariEnsureModCache', 'sithariCharacterMods', 'sithariEquippedOwner', 'sithariSourceStatus'], cacheContext);
const cache = cacheContext.sithariEnsureModCache();
for (const c of collisionRoster) {
  const key = cacheContext.characterKey(c);
  assert.equal(cache.byOwner.get(key)?.length, 6, 'Sith\'ari cache ownership for ' + c.name);
  assert.equal(cacheContext.sithariCharacterMods(c).length, 6, 'Sith\'ari equipped slots for ' + c.name);
  assert.equal(cache.statusByOwner.get(key), 'BONS');
}
assert.equal(cacheContext.sithariEquippedOwner({ character: 'SITHTROOPER' }), 'SITHTROOPER');
assert.equal(cacheContext.sithariSourceStatus(cache.items.find(m => m.character === 'REY')), 'BONS');

// 3) Acolyte: the target must gain mod speed and total equipped speed.
const acolyte = read('../modules/acolyte.js');
const acContext = vm.createContext({ compactKey, numericValue, modTotalSpeed: speed });
load(acolyte, ['holocronModSecondarySpeed', 'holocronAcolyteTransferPreservesSpeed'], acContext);
const current = { speed: 4, secondary_1_stat: 'Speed', secondary_1_value: 4 };
const faster = { speed: 12, secondary_1_stat: 'Speed', secondary_1_value: 12 };
const slower = { speed: 3, secondary_1_stat: 'Speed', secondary_1_value: 3 };
assert.equal(acContext.holocronAcolyteTransferPreservesSpeed(current, faster, [current, { speed: 20 }]), true);
assert.equal(acContext.holocronAcolyteTransferPreservesSpeed(current, slower, [current, { speed: 20 }]), false);

// 3b) Execute the complete production Acolyte candidate engine with a valid
// target/donor pair. This catches missing score variables at proposal time.
const acolyteFixture = [
  { baseId: 'TARGET', name: 'Target' },
  { baseId: 'DONOR', name: 'Donor' }
];
const fixtureMod = (owner, index, slot, value) => ({
  owner, _index: index, slot, set_name: 'Speed',
  primary_stat: 'Offense %', primary_value: 5.88,
  secondary_1_stat: 'Speed', secondary_1_value: value,
  speed: value, level: 15
});
const acolyteFixtureMods = [
  fixtureMod('TARGET', 0, 'Square', 4),
  ...['Arrow','Diamond','Triangle','Circle','Cross'].map((slot,i)=>fixtureMod('TARGET',i+1,slot,10)),
  fixtureMod('DONOR', 6, 'Square', 12),
  ...['Arrow','Diamond','Triangle','Circle','Cross'].map((slot,i)=>fixtureMod('DONOR',i+7,slot,0))
];
Object.assign(acContext, {
  rosterCharacters: acolyteFixture,
  window: { __SWGOH_GAC_USAGE__: { seasons: [] } },
  HOLOCRON_GALACTIC_LEGENDS: new Set(),
  characterKey: c => String(c?.baseId || ''),
  rosterUnitType: () => 'character',
  getCharacterMods: c => acolyteFixtureMods.filter(m => m.owner === c.baseId),
  v176ModStatus: list => {
    const totalSpeed = list.reduce((sum,m)=>sum+Number(m.speed||0),0);
    return { totalSpeed, status: list.length < 6 ? 'INCOMPLETS' : totalSpeed < 30 ? 'TRÈS FAIBLES' : totalSpeed < 50 ? 'FAIBLES' : totalSpeed < 70 ? 'MOYENS' : 'BONS' };
  },
  holocronModScoreForCharacter: m => Number(m.speed||0),
  holocronKyberFit: () => 0,
  profileForCharacter: () => null
});
load(acolyte, ['holocronIsGalacticLegend','holocronLatestGacSeason','holocronGacUsage','holocronTopChangeCandidates'], acContext);
const acolyteRows = acContext.holocronTopChangeCandidates();
assert.equal(acolyteRows.length, 1, 'Acolyte must produce the valid fixture exchange');
assert.equal(acolyteRows[0].recipient.baseId, 'TARGET');
assert.equal(acolyteRows[0].donor.baseId, 'DONOR');
assert.equal(acolyteRows[0].gain, 8, 'Recipient score gain is calculated');
assert.equal(acolyteRows[0].gainPct, 200, 'Recipient score percentage is calculated');
assert.equal(acolyteRows[0].kyberGain, 0, 'Kyber fit delta is calculated');
assert.equal(acolyteRows[0].speedGain, 8, 'Target mod speed must increase');
assert.equal(acolyteRows[0].recipientAfter, 12, 'Recipient after-score is populated');


// 4) Disciple: no candidate with less speed than the selected mod can pass.
const disciple = read('../modules/disciple.js');
const discipleContext = vm.createContext({
  numericValue, modTotalSpeed: speed,
  reallocationCandidateSecondary: (mod, key) => mod?.stat === key ? { value: mod.value } : null
});
load(disciple, ['discipleSpeedSafeCandidates'], discipleContext);
const discipleRows = [
  { speed: 9, mod: { stat: 'Potency', value: 12 } },
  { speed: 10, mod: { stat: 'Potency', value: 8 } },
  { speed: 14, mod: { stat: 'Potency', value: 5 } }
];
const discipleSafe = discipleContext.discipleSpeedSafeCandidates({ speed: 10 }, discipleRows, 'Potency');
assert.deepEqual(Array.from(discipleSafe, x => x.speed), [10, 14]);
assert.deepEqual(
  Array.from(discipleSafe, x => x.value),
  [8, 5],
  'Disciple must rank the requested secondary before total mod speed'
);
const discipleTieRows = [
  { speed: 12, character: { name: 'Zulu' }, mod: { stat: 'Potency', value: 8 } },
  { speed: 16, character: { name: 'Beta' }, mod: { stat: 'Potency', value: 8 } },
  { speed: 14, character: { name: 'Alpha' }, mod: { stat: 'Potency', value: 9 } },
  { speed: 9, character: { name: 'Fast but unsafe' }, mod: { stat: 'Potency', value: 99 } }
];
const discipleRanked = discipleContext.discipleSpeedSafeCandidates({ speed: 10 }, discipleTieRows, 'Potency');
assert.deepEqual(
  Array.from(discipleRanked, x => [x.value, x.speed]),
  [[9, 14], [8, 16], [8, 12]],
  'Disciple must use total mod speed as the tie-breaker and still reject speed losses'
);

// 5) Seigneur: allow a set change only when known base speed proves the net is safe.
const seigneur = read('../modules/seigneur.js');
const forgeContext = vm.createContext({
  numericValue, modTotalSpeed: speed, optimizerSlotKey: (v) => String(v ?? ''),
  optimizerProfileForCharacter: () => ({}),
  forgeSpeedSetCount: (list) => list.filter(m => m.set_name === 'Speed').length
});
load(seigneur, ['forgeProjectedModSpeed', 'forgeCandidatePreservesSpeed'], forgeContext);
const baseSpeedCharacter = { base_stats: { Speed: 100 } };
const equipped = [
  { id: 'cur', slot: 'Square', set_name: 'Speed', speed: 5 },
  { id: 'a', slot: 'Arrow', set_name: 'Speed', speed: 5 },
  { id: 'd', slot: 'Diamond', set_name: 'Speed', speed: 5 },
  { id: 't', slot: 'Triangle', set_name: 'Speed', speed: 5 },
  { id: 'c', slot: 'Circle', set_name: 'Offense', speed: 5 },
  { id: 'x', slot: 'Cross', set_name: 'Offense', speed: 5 }
];
assert.equal(forgeContext.forgeCandidatePreservesSpeed(baseSpeedCharacter, {}, equipped, equipped[0], { id: 'gain', slot: 'Square', set_name: 'Offense', speed: 25 }), true);
assert.equal(forgeContext.forgeCandidatePreservesSpeed(baseSpeedCharacter, {}, equipped, equipped[0], { id: 'loss', slot: 'Square', set_name: 'Offense', speed: 10 }), false);
const threeSpeedSets = [
  { id: 'cur-offense', slot: 'Square', set_name: 'Offense', speed: 10 },
  { id: 'a', slot: 'Arrow', set_name: 'Speed', speed: 5 },
  { id: 'd', slot: 'Diamond', set_name: 'Speed', speed: 5 },
  { id: 't', slot: 'Triangle', set_name: 'Speed', speed: 5 },
  { id: 'c', slot: 'Circle', set_name: 'Offense', speed: 5 },
  { id: 'x', slot: 'Cross', set_name: 'Offense', speed: 5 }
];
assert.equal(forgeContext.forgeCandidatePreservesSpeed(baseSpeedCharacter, {}, threeSpeedSets, threeSpeedSets[0], { id: 'fourth-speed', slot: 'Square', set_name: 'Speed', speed: 5 }), true);
assert.equal(forgeContext.forgeCandidatePreservesSpeed({}, {}, equipped, equipped[0], { id: 'unknown', slot: 'Square', set_name: 'Offense', speed: 25 }), false);


// 5b) Seigneur: a Kyber set distribution is not an exact six-mod composition.
const seigneurCoreContext = vm.createContext({ compactKey });
load(core, ['optimizerRecommendationSummary', 'optimizerSlotKey', 'optimizerPrimaryReference'], seigneurCoreContext);
const forgeReferenceContext = vm.createContext({
  compactKey, optimizerRecommendationSummary: seigneurCoreContext.optimizerRecommendationSummary,
  optimizerSlotKey: seigneurCoreContext.optimizerSlotKey,
  optimizerPrimaryReference: seigneurCoreContext.optimizerPrimaryReference
});
load(seigneur, ['forgeKyberSetDistribution', 'forgeKyberSetRules', 'forgeModSetConformity', 'forgeSetCompatible', 'forgeModPrimaryConformity'], forgeReferenceContext);
const distributionOnlyProfile = {
  sets: [{ name: 'Health', weight: 0.9017 }, { name: 'Offense', weight: 0.0404 }],
  slots: { Arrow: { primaries: { Health: 0.8769, Speed: 0.1038 } } },
  secondary_focus: { Speed: 21.3 }
};
assert.equal(forgeReferenceContext.forgeKyberSetRules(distributionOnlyProfile).length, 0,
  'A set distribution must not be converted into an invented six-piece plan');
assert.equal(forgeReferenceContext.forgeModSetConformity({ set_name: 'Health' }, distributionOnlyProfile).ok, true,
  'A set observed in Kyber distribution is recognized');
assert.equal(forgeReferenceContext.forgeModSetConformity({ set_name: 'Critical Damage' }, distributionOnlyProfile).ok, false,
  'A set absent from the available distribution is not marked Kyber');
assert.equal(forgeReferenceContext.forgeSetCompatible({ set_name: 'Health' }, distributionOnlyProfile), true);
assert.equal(forgeReferenceContext.forgeModPrimaryConformity({ slot: 'Arrow', primary_stat: 'Health %' }, distributionOnlyProfile).ok, true,
  'Percentage formatting must not hide an equivalent primary stat');
const exactCompositionProfile = {
  sets: [{ name: 'Health', weight: 0.9 }],
  specific_sets: [{ name: '4 Health + 2 Speed', counts: { Health: 4, Speed: 2 }, weight: 0.8 }]
};
assert.equal(forgeReferenceContext.forgeKyberSetRules(exactCompositionProfile).length, 1,
  'Only an explicit six-piece composition becomes an exact set plan');

// 5c) Seigneur: neutral verdicts must not call an unrelated Sith’ari UI binder.
const verdictContext = vm.createContext({});
load(seigneur, ['optimizerVerdictForBuild'], verdictContext);
assert.equal(verdictContext.optimizerVerdictForBuild({
  compliance: 80, setPct: 100, primaryKnown: 6, primaryPct: 100,
  primaryHits: 6, secondaryTotal: 6, secondaryPct: 100,
  setHits: 6, secondaryHits: 6
}, 'MOYENS', 0).kind, 'neutral');

// 6) Sith'ari: same net-speed logic, with a conservative fallback when base speed is unknown.
const sithariSpeedContext = vm.createContext({
  numericValue, modTotalSpeed: speed, modSlotLabel: (v) => v,
  sithariCanonicalSet: (v) => String(v ?? '').toUpperCase(),
  SITHARI_SLOT_ORDER: slots,
  testBaseSpeed: 100,
  testEquipped: equipped
});
sithariSpeedContext.sithariBaseSpeed = () => sithariSpeedContext.testBaseSpeed;
sithariSpeedContext.sithariCharacterMods = () => sithariSpeedContext.testEquipped;
load(sithari, ['sithariIsSpeedSet', 'sithariProjectedSpeed', 'sithariReplacementPreservesSpeed'], sithariSpeedContext);
assert.equal(sithariSpeedContext.sithariReplacementPreservesSpeed({}, equipped[0], { slot: 'Square', set_name: 'Offense', speed: 25 }), true);
assert.equal(sithariSpeedContext.sithariReplacementPreservesSpeed({}, equipped[0], { slot: 'Square', set_name: 'Offense', speed: 10 }), false);
sithariSpeedContext.testBaseSpeed = 0;
assert.equal(sithariSpeedContext.sithariReplacementPreservesSpeed({}, equipped[0], { slot: 'Square', set_name: 'Offense', speed: 25 }), false);

console.log('Mods engine regression tests passed.');
