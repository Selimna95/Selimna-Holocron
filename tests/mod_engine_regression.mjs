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

// SWGOH.GG's live Kyber page uses plain slot headings and focus rows such as
// "+19.6 avg 23.68%". Keep these exact live-format regressions covered.
const kyberParserContext=vm.createContext({});
load(core,['normalizeKyberKey','kyberCharacterLabel'],kyberParserContext);
assert.equal(kyberParserContext.normalizeKyberKey(kyberParserContext.kyberCharacterLabel('General Skywalker Attacker • Leader • Jedi')),'generalskywalker');
assert.equal(kyberParserContext.normalizeKyberKey(kyberParserContext.kyberCharacterLabel('0-0-0 Support • Droid')),'000');
load(core,['kyberNumber','kyberAverageFromFocusLine','kyberPrimaryDistribution'],kyberParserContext);
assert.equal(kyberParserContext.kyberAverageFromFocusLine('+19.6 avg 23.68%'),19.6);
assert.equal(kyberParserContext.kyberAverageFromFocusLine('+1,682.4 avg 8.35%'),1682.4);
assert.equal(kyberParserContext.kyberAverageFromFocusLine('+3.93% avg 11.86%'),3.93);
assert.equal(kyberParserContext.kyberAverageFromFocusLine('not a focus row'),null,'Non-average rows must not be treated as secondary guidance');
const arrowPrimary=kyberParserContext.kyberPrimaryDistribution([
  'Arrow','Protection 65.38%','Speed 30.47%','Offense 3.55%','Triangle',
  'Protection 61.24%','Critical Damage 33.13%','Circle','Protection 97.04%',
  'Cross','Protection 84.31%','Offense 13.6%','Secondary Stat Focus','Speed'
],'Arrow');
assert.deepEqual(Object.keys(arrowPrimary).sort(),['Offense','Protection','Speed']);
assert.ok(Math.abs(arrowPrimary.Protection-0.6538)<1e-9);
assert.ok(Math.abs(arrowPrimary.Speed-0.3047)<1e-9);
assert.ok(Math.abs(arrowPrimary.Offense-0.0355)<1e-9);
const trianglePrimary=kyberParserContext.kyberPrimaryDistribution([
  'Arrow','Protection 65.38%','Triangle','Protection 61.24%','Critical Damage 33.13%'
],'Triangle');
assert.deepEqual(Object.keys(trianglePrimary).sort(),['Critical Damage','Protection']);
assert.ok(Math.abs(trianglePrimary.Protection-0.6124)<1e-9);
assert.ok(Math.abs(trianglePrimary['Critical Damage']-0.3313)<1e-9);
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

// 4b) Seigneur: donor priority comes from terrestrial + fleet GAC use, never mod quality.
const seigneur = read('../modules/seigneur.js');
const donorContext = vm.createContext({
  compactKey,
  window: { __SWGOH_GAC_USAGE__: { seasons: [{
    season: 84,
    characters: { LOWLAND: { uses: 10 }, HIGHLAND: { uses: 100 }, PILOTLOW: { uses: 2 }, PILOTHIGH: { uses: 2 } },
    ships: { LOWSHIP: { uses: 3 }, HIGHSHIP: { uses: 90 } }
  }] } },
  rosterShips: [
    { baseId: 'LOWSHIP', raw: { data: { crew: [{ baseId: 'PILOTLOW' }] } } },
    { baseId: 'HIGHSHIP', raw: { data: { crew: [{ baseId: 'PILOTHIGH' }] } } }
  ]
});
load(seigneur, [
  'seigneurUsageKey','seigneurUsageRecord','seigneurUsageCount','seigneurLatestGacUsageSeason',
  'seigneurCharacterGacUsage','seigneurShipCrewAliases','seigneurShipUsageMap',
  'seigneurCharacterFleetUsage','seigneurDonorPriority'
], donorContext);
const donorGateContext = vm.createContext({
  characterKey: character => String(character?.baseId || character?.name || ''),
  compactKey
});
load(seigneur, ['forgeSourceAllowedForSearch'], donorGateContext);
assert.equal(donorGateContext.forgeSourceAllowedForSearch({
  _sourceOwner: 'Libre', _sourceOwnerKey: null, _sourcePriorityKnown: true
}), true, 'Free inventory mods remain available');
assert.equal(donorGateContext.forgeSourceAllowedForSearch({
  _sourceOwner: 'Unknown Pilot', _sourceOwnerKey: null, _sourcePriorityKnown: false
}), false, 'Unresolved owners must not be mistaken for free mods');
assert.equal(donorGateContext.forgeSourceAllowedForSearch({
  _sourceOwner: 'Pilot', _sourceOwnerKey: 'PILOT', _sourcePriorityKnown: true
}), true, 'Verified GAC donors remain available');
assert.equal(donorGateContext.forgeSourceAllowedForSearch({
  _sourceOwner: 'Target', _sourceOwnerKey: 'TARGET', _sourcePriorityKnown: false
}, {baseId:'TARGET'}), true, 'The selected target keeps its own equipped mods');

const donorSeason = donorContext.seigneurLatestGacUsageSeason();
assert.equal(donorContext.seigneurCharacterGacUsage({baseId:'LOWLAND'}, donorSeason), 10);
assert.equal(donorContext.seigneurCharacterFleetUsage({baseId:'PILOTLOW'}, donorSeason).uses, 3);
assert.equal(donorContext.seigneurDonorPriority({baseId:'PILOTLOW'}, donorSeason).uses, 5);
assert.equal(donorContext.seigneurDonorPriority({baseId:'PILOTHIGH'}, donorSeason).uses, 92,
  'A pilot with a heavily used ship is protected despite low terrestrial usage');
assert.equal(donorContext.seigneurDonorPriority({baseId:'LOWLAND'}, donorSeason).uses, 10);
const unknownFleetSeason = { season: 85, characters: { PILOTLOW: { uses: 0 } }, ships: {} };
const unknownFleetPriority=donorContext.seigneurDonorPriority({baseId:'PILOTLOW'}, unknownFleetSeason);
assert.equal(unknownFleetPriority.known, false,
  'A pilot identified through a ship association must remain protected if that ship usage is missing');
assert.equal(unknownFleetPriority.fleetKnown, false);
assert.equal(unknownFleetPriority.fleetUses, null,
  'Missing fleet usage must remain explicitly unknown, never be converted to zero');
assert.equal(donorContext.seigneurCharacterGacUsage({baseId:'ABSENT'}, donorSeason), null,
  'Missing terrestrial usage must remain unknown');

// Current 5v5 and 3v3 seasons are combined independently; an older season
// fills a missing format observation but never overrides a current one.
const seasonalContext=vm.createContext({
  compactKey,
  window:{__SWGOH_GAC_USAGE__:{
    currentSeasons:{'5v5':84,'3v3':83},
    sourceStatus:'partial',
    seasons:[
      {season:84,coverage:[{format:'5v5'}],characters:{
        TARGET:{uses:100,byFormat:{'5v5':100}},
        CURRENTONLY:{uses:50,byFormat:{'5v5':50}}
      },ships:{},fleets:[]},
      {season:83,coverage:[{format:'3v3'}],characters:{
        TARGET:{uses:70,byFormat:{'3v3':70}},
        CURRENTONLY:{uses:30,byFormat:{'3v3':30}}
      },ships:{},fleets:[]},
      {season:82,coverage:[{format:'5v5'}],characters:{
        TARGET:{uses:999,byFormat:{'5v5':999}},
        HISTORICAL:{uses:25,byFormat:{'5v5':25}}
      },ships:{},fleets:[]}
    ]
  }}
});
load(seigneur,['seigneurUsageKey','seigneurUsageRecord','seigneurUsageCount','seigneurLatestGacUsageSeason','seigneurCharacterGacUsage'],seasonalContext);
const mergedSeason=seasonalContext.seigneurLatestGacUsageSeason();
assert.deepEqual(JSON.parse(JSON.stringify(mergedSeason.formatSeasons)),{'5v5':84,'3v3':83});
assert.equal(seasonalContext.seigneurCharacterGacUsage({baseId:'TARGET'},mergedSeason),170,
  'Current 5v5 S84 and 3v3 S83 observations are both included');
assert.equal(seasonalContext.seigneurCharacterGacUsage({baseId:'HISTORICAL'},mergedSeason),25,
  'Historical evidence fills a missing current observation');
assert.equal(seasonalContext.seigneurCharacterGacUsage({baseId:'CURRENTONLY'},mergedSeason),80);

// Incomplete/weak donors are in scope by default; medium/good characters are not.
const sourceStatusContext=vm.createContext({$:()=>null});
load(seigneur,['forgeSourceStatusAllowed'],sourceStatusContext);
assert.equal(sourceStatusContext.forgeSourceStatusAllowed('INCOMPLETS'),true);
assert.equal(sourceStatusContext.forgeSourceStatusAllowed('TRÈS FAIBLES'),true);
assert.equal(sourceStatusContext.forgeSourceStatusAllowed('FAIBLES'),true);
assert.equal(sourceStatusContext.forgeSourceStatusAllowed('MOYENS'),false);
assert.equal(sourceStatusContext.forgeSourceStatusAllowed('BONS'),false);

// Seigneur must retain the selected recipient, but harvest only weak,
// incomplete, non-GL donors and genuinely free mods.
const donorRoster=[
  {baseId:'TARGET',name:'Target'},
  {baseId:'WEAK',name:'Weak donor'},
  {baseId:'INCOMPLETE',name:'Incomplete donor'},
  {baseId:'GOOD',name:'Good donor'},
  {baseId:'GLDONOR',name:'GL donor',isGL:true}
];
const statusById={TARGET:'BONS',WEAK:'FAIBLES',INCOMPLETE:'INCOMPLETS',GOOD:'BONS',GLDONOR:'FAIBLES'};
const scopedContext=vm.createContext({
  compactKey,rosterCharacters:donorRoster,
  mods:[
    {id:'target-mod',character:'TARGET'},
    {id:'weak-mod',character:'WEAK'},
    {id:'incomplete-mod',character:'INCOMPLETE'},
    {id:'good-mod',character:'GOOD'},
    {id:'gl-mod',character:'GLDONOR'},
    {id:'free-mod'}
  ],
  $:()=>null,
  normalizeModForDisplay:m=>({...m,game_id:m.id}),
  getCharacterMods:c=>scopedContext.mods.filter(m=>m.character===c.baseId),
  v176ModStatus:list=>({status:statusById[list[0]?.character]||'SANS MODS'}),
  isGalacticLegendCharacter:c=>c.isGL===true,
  seigneurLatestGacUsageSeason:()=>({season:84,formatSeasons:{'5v5':84},sourceStatus:'partial',evidenceType:'defense-composition'}),
  seigneurDonorPriority:()=>({known:true,uses:10,characterUses:10,fleetUses:0,fleetKnown:true,sourceStatus:'partial'})
});
load(core,['characterKey','buildRosterOwnerResolver','modOwnerKey','resolveModOwnerKey'],scopedContext);
load(seigneur,['forgeSourceStatusAllowed','forgeAllSourceMods'],scopedContext);
const scoped=scopedContext.forgeAllSourceMods(donorRoster[0]);
assert.deepEqual(Array.from(scoped,x=>x.id).sort(),['free-mod','incomplete-mod','target-mod','weak-mod'].sort(),
  'Strong and GL donors must be excluded while target/free/incomplete/weak mods remain');


// 5) Seigneur: allow a set change only when known base speed proves the net is safe.
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


// 7) Sith'ari cumulative pipeline: donors include equipped characters without a Kyber target profile.
const strategy = read('../modules/sithari-strategy.js');
const targetChar = { baseId: 'TARGET' };
const donorCharA = { baseId: 'DONOR_A' };
const donorCharB = { baseId: 'DONOR_B' };
const donorCharC = { baseId: 'DONOR_C' };
const targetNode = { key: 'TARGET::Square', owner: 'TARGET', name: 'Target', character: targetChar, slot: 'Square', profile: {}, needsWork: true };
const sourceNode = (owner, character, coverage, fit, speedValue) => ({
  key: owner + '::Square', owner, name: owner, character, slot: 'Square',
  mod: { slot: 'Square', coverage, fit, speed: speedValue }
});
const donorSources = [
  sourceNode('DONOR_A', donorCharA, 0.5, 0.99, 10),
  sourceNode('DONOR_B', donorCharB, 1, 0.4, 12),
  sourceNode('DONOR_C', donorCharC, 1, 0.8, 9)
];
const strategyContext = vm.createContext({
  sithariSetMatch: () => true,
  sithariPrimaryMatch: () => true,
  ssSecondaryCoverage: mod => mod.coverage,
  ssKyberSecondaryFit: mod => mod.fit,
  modTotalSpeed: mod => Number(mod.speed || 0)
});
load(strategy, ['ssIsProtectedLegend','ssBuildSetPools','ssBuildPrimaryPools','ssBuildSecondaryEdges'], strategyContext);
const snapshotFixture = { nodes: [targetNode], sources: donorSources };
const setStage = strategyContext.ssBuildSetPools(snapshotFixture);
assert.equal(setStage.count, 3, 'All roster donors are considered at the set stage');
const primaryStage = strategyContext.ssBuildPrimaryPools(snapshotFixture, setStage.pools);
assert.equal(primaryStage.count, 3, 'Primary stage narrows only after set compatibility');
const secondaryStage = strategyContext.ssBuildSecondaryEdges(snapshotFixture, primaryStage.pools);
assert.equal(secondaryStage.count, 2, 'Secondary stage keeps only the best available coverage tier');
assert.deepEqual(
  Array.from(secondaryStage.edges.get(targetNode.key), edge => edge.source.owner),
  ['DONOR_C', 'DONOR_B'],
  'Kyber secondary fit ranks candidates within the best secondary tier'
);


// Every displayed transfer must expose the target's real Kyber set, primary,
// secondary priorities and whether the received mod satisfies set/primary.
const auditContext=vm.createContext({
  sithariKyberSetChoices:p=>p.sets.map(x=>x.name),
  sithariPrimaryRefs:(p,slot)=>Object.entries(p.slots[slot].primaries).map(([name,weight])=>({name,weight})),
  sithariModSecondaryMap:m=>m.secondary,
  sithariStatKey:x=>x,
  sithariStatLabel:x=>x,
  sithariSetMatch:(m,p)=>p.sets.some(x=>x.name===m.set_name),
  sithariPrimaryMatch:(m,p,slot)=>Object.keys(p.slots[slot].primaries).includes(m.primary_stat)
});
load(strategy,['ssKyberMoveAudit'],auditContext);
const kyberAudit=auditContext.ssKyberMoveAudit({
  target:{profile:{source:'SWGOH.GG Kyber / Top 1000 GAC',sets:[{name:'Offense'}],slots:{Square:{primaries:{Offense:1}}},secondary_focus:{Speed:20,Offense:1500}},slot:'Square',character:{name:'Target'}},
  source:{mod:{set_name:'Offense',primary_stat:'Offense',secondary:{Speed:15,Offense:900}}},
  kyber:0.7
});
assert.equal(kyberAudit.set.matches,true);
assert.equal(kyberAudit.primary.matches,true);
assert.equal(kyberAudit.secondaries.length,2);
assert.equal(kyberAudit.secondaries[0].actual,15);
assert.equal(kyberAudit.secondaryFit,0.7);

// Sith'ari: open chains and broken active mod sets are forbidden.
const openTargetMods = [{ slot: 'Square', set_name: 'Offense', speed: 0 }, { slot: 'Arrow', set_name: 'Speed', speed: 12 }];
const openDonorMods = [{ slot: 'Square', set_name: 'Health', speed: 0 }, { slot: 'Arrow', set_name: 'Speed', speed: 8 }];
const openSpeedContext = vm.createContext({
  numericValue,
  modTotalSpeed: speed,
  ssSlot: mod => mod.slot,
  sithariCharacterMods: character => character.baseId === 'TARGET' ? openTargetMods : openDonorMods,
  sithariProjectedSpeed: (character, list) => ({ baseSpeed: 100, modSpeed: list.reduce((sum, mod) => sum + Number(mod.speed || 0), 0), total: 100 + list.reduce((sum, mod) => sum + Number(mod.speed || 0), 0), speedSetPieces: 0 }),
  sithariIsSpeedSet: mod => mod.set_name === 'Speed',
  HOLOCRON_GALACTIC_LEGENDS: new Set(['GLREY'])
});
load(strategy, ['ssCyclePreservesSpeed','ssPreservesSetBonuses','ssSetBonusCounts','ssIsProtectedLegend'], openSpeedContext);
const safeOpenEdge = { target: targetNode, source: { ...donorSources[0], mod: { slot: 'Square', set_name: 'Offense', speed: 0 } } };
assert.equal(openSpeedContext.ssCyclePreservesSpeed([safeOpenEdge], true), false, 'Open chains must never leave a terminal donor without a replacement');
assert.equal(openSpeedContext.ssPreservesSetBonuses(
  [{set_name:'Offense'},{set_name:'Offense'},{set_name:'Offense'},{set_name:'Offense'},{set_name:'Speed'},{set_name:'Speed'}],
  [{set_name:'Offense'},{set_name:'Offense'},{set_name:'Offense'},{set_name:'Speed'},{set_name:'Speed'},{set_name:'Health'}]
), false, 'A transfer that breaks an existing four-piece set is rejected');
assert.equal(openSpeedContext.ssPreservesSetBonuses(
  [{set_name:'Offense'},{set_name:'Offense'},{set_name:'Speed'},{set_name:'Speed'},{set_name:'Health'},{set_name:'Health'}],
  [{set_name:'Offense'},{set_name:'Offense'},{set_name:'Speed'},{set_name:'Speed'},{set_name:'Health'},{set_name:'Health'}]
), true, 'Existing two-piece set bonuses remain valid');
assert.equal(openSpeedContext.ssIsProtectedLegend({baseId:'GL Rey'}), true, 'GL aliases are normalized before donor protection');
assert.equal(openSpeedContext.ssIsProtectedLegend({baseId:'RANDOM_CHARACTER'}), false);
assert.ok(strategy.includes('if(!edges.has(next))continue'), 'Open donor-chain endpoints are discarded');

// 8) Kyber profile validity depends on real mod-reference content, not fragile average-stat blocks.
const kyberValidationContext=vm.createContext({});
load(core,['kyberProfileValid'],kyberValidationContext);
assert.equal(kyberValidationContext.kyberProfileValid({
  sets:[{name:'Health',weight:0.8}],
  slots:{Arrow:{primaries:{Speed:0.9}}},
  secondary_focus:{Speed:20}
}),true,'A usable Kyber reference remains valid when SWGOH.GG omits average stats');
assert.equal(kyberValidationContext.kyberProfileValid({
  sets:[{name:'Health',weight:0.8}],
  slots:{Square:{primaries:{Offense:1}},Diamond:{primaries:{Defense:1}}},
  averages:{Speed:260,Health:100000,Protection:50000}
}),false,'Fixed Square/Diamond primaries must not make a set-only page look like a parsed Kyber reference');
assert.equal(kyberValidationContext.kyberProfileValid({
  sets:[{name:'Health',weight:0.8}],
  slots:{Arrow:{primaries:{Speed:0.9}}}
}),true,'A variable-slot primary distribution is real Kyber guidance');
assert.equal(kyberValidationContext.kyberProfileValid({
  averages:{Speed:260,Health:100000,Protection:50000}
}),false,'Character averages alone must never masquerade as a mod reference');
assert.ok(core.includes('let kyberUnitIndexPromise=null;'),'Kyber unit index must be cached across profile requests');
assert.ok(core.includes('const index=await loadKyberUnitIndex();'),'Profile discovery must use the shared canonical unit index');
assert.ok(!core.includes('if(!/Best Mods|Data Slice:'),'HTML title wording must not reject otherwise parseable Kyber profile pages');
assert.ok(strategy.includes('const batch=40'),'Sith’ari must process useful batches rather than 20 individual profiles');
assert.ok(strategy.includes('state.profileStats.found+=found'),'Sith’ari must report the number of usable profiles found');

console.log('Mods engine regression tests passed.');
