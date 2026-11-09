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
load(core,['kyberNumber','kyberPercentageEntries','kyberAverageFromFocusLine','kyberPrimaryDistribution'],kyberParserContext);
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
load(core,['kyberSetComposition'],kyberParserContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(kyberParserContext.kyberSetComposition('Double Tenacity + Health'))),
  {Tenacity:4,Health:2},
  'A Double prefix assigns four mods to the named set'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(kyberParserContext.kyberSetComposition('Health + Double Tenacity'))),
  {Health:2,Tenacity:4},
  'A Double prefix on the second set must not reverse the composition'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(kyberParserContext.kyberSetComposition('Triple Health'))),
  {Health:6},
  'Triple sets occupy all six mods'
);
const kyberPageLines=[
  'Data Slice: Kyber','Based on 950 fully-modded units','Updated 13h ago',
  'Primary Set','Offense 74.4%','Speed 6%','Triple Health 3.3%',
  'Secondary Set','Health 35.2%','Defense 27%',
  'Specific Mod Sets','Offense + Health 35.2%','Offense + Defense 27%',
  'Speed + Health 6%','Triple Health 3.3%',
  'Arrow','Protection 65.67%','Speed 30.14%','Triangle','Protection 61.49%',
  'Critical Damage 33.43%','Circle','Protection 97.01%','Cross','Protection 84.47%',
  'Offense 13.73%','Secondary Stat Focus','Speed','+19.9 avg 23.69%',
  'Relic','9.06','Average Stats for General Skywalker','Speed','281',
  'Best Mod Set for General Skywalker','Offense + Potency 5.26%',
  'Note that there are always special use cases'
];
Object.assign(kyberParserContext,{
  parseHTML:()=>({}),
  cleanLinesFromDoc:()=>kyberPageLines,
  kyberProfileValid:()=>true
});
load(core,['kyberPageHasNoReference','parseKyberProfileHTML'],kyberParserContext);
const parsedKyber=kyberParserContext.parseKyberProfileHTML('<html></html>','General Skywalker','general-skywalker');
assert.equal(parsedKyber.sample_size,950,'The fully-modded sample size is retained');
assert.equal(parsedKyber.updated_label,'Updated 13h ago','The SWGOH.GG freshness label is retained');
assert.equal(parsedKyber.data_slice,'Kyber','The Kyber data slice is explicit');
assert.equal(parsedKyber.schema_version,2,'The parser marks the full-distribution profile schema');
assert.equal(parsedKyber.specific_sets.length,5,'The parser retains table configurations and additional popular builds');
assert.ok(parsedKyber.specific_sets.some(x=>x.name==='Offense + Potency'&&Math.abs(x.weight-0.0526)<1e-9));
assert.ok(Math.abs(parsedKyber.slots.Arrow.primaries.Protection-0.6567)<1e-9);
assert.ok(Math.abs(parsedKyber.slots.Arrow.primaries.Speed-0.3014)<1e-9);

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
  window: { __SWGOH_GAC_USAGE__: { sourceStatus: 'observed', seasons: [{
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

// 5c) Seigneur: neutral verdicts remain independent of the retired interface.
const verdictContext = vm.createContext({});
load(seigneur, ['optimizerVerdictForBuild'], verdictContext);
assert.equal(verdictContext.optimizerVerdictForBuild({
  compliance: 80, setPct: 100, primaryKnown: 6, primaryPct: 100,
  primaryHits: 6, secondaryTotal: 6, secondaryPct: 100,
  setHits: 6, secondaryHits: 6
}, 'MOYENS', 0).kind, 'neutral');

// 8) Kyber profile validity depends on real mod-reference content, not fragile average-stat blocks.
const kyberValidationContext=vm.createContext({});
load(core,['kyberProfileValid'],kyberValidationContext);
assert.equal(kyberValidationContext.kyberProfileValid({
  source:'SWGOH.GG Kyber / Top 1000 GAC',
  sets:[{name:'Health',count:6,weight:0.8}],
  slots:{Arrow:{primaries:{Speed:0.9}}},
  secondary_focus:{Speed:20}
}),true,'A usable Kyber reference remains valid when SWGOH.GG omits average stats');
assert.equal(kyberValidationContext.kyberProfileValid({
  sets:[{name:'Health',weight:0.8}],
  slots:{Square:{primaries:{Offense:1}},Diamond:{primaries:{Defense:1}}},
  averages:{Speed:260,Health:100000,Protection:50000}
}),false,'Fixed Square/Diamond primaries must not make a set-only page look like a parsed Kyber reference');
assert.equal(kyberValidationContext.kyberProfileValid({
  source:'SWGOH.GG Kyber / Top 1000 GAC',
  sets:[{name:'Health',count:6,weight:0.8}],
  slots:{Arrow:{primaries:{Speed:0.9}}}
}),true,'A variable-slot primary distribution is real Kyber guidance');
assert.equal(kyberValidationContext.kyberProfileValid({
  sets:[{name:'Health',count:6,weight:0.8}],
  slots:{Arrow:{primaries:{Speed:0.9}}}
}),false,'A profile without Kyber provenance must not be used as a reference');
assert.equal(kyberValidationContext.kyberProfileValid({
  averages:{Speed:260,Health:100000,Protection:50000}
}),false,'Character averages alone must never masquerade as a mod reference');
assert.ok(core.includes('let kyberUnitIndexPromise=null;'),'Kyber unit index must be cached across profile requests');
assert.ok(core.includes('const index=await loadKyberUnitIndex();'),'Profile discovery must use the shared canonical unit index');
assert.ok(core.includes('let kyberUnitIndexFailureUntil=0;'),'A failed Kyber index fetch must enter a cooldown instead of retrying for every character');
assert.ok(core.includes('Date.now()+60000'),'Kyber index retry cooldown must be bounded to one minute');
assert.ok(core.includes('const kyberProfileInflight=new Map();'),'Concurrent requests for the same character must be deduplicated');
assert.ok(!core.includes('if(!/Best Mods|Data Slice:'),'HTML title wording must not reject otherwise parseable Kyber profile pages');

console.log('Mods engine regression tests passed.');
