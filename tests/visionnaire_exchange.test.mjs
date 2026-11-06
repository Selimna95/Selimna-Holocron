import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync(new URL('../modules/visionnaire.js',import.meta.url),'utf8');
assert.ok(js.includes('function exchangeFinalStats'),'Full stat projection must exist');
assert.ok(js.includes('function exchangeScenarioScore'),'Strategic scoring must exist');
assert.ok(js.includes("const isFree=!ownerKey"),'Free inventory mods must be included');
assert.ok(js.includes('targetStatsBefore,targetStatsAfter,targetStatDeltas'),'Target full stat impact must be retained');
assert.ok(js.includes('beforeStats,afterStats,statDeltas'),'Donor full stat impact must be retained');
assert.ok(js.includes('b.score.score-a.score.score'),'Scenarios must rank by strategic score');
assert.ok(js.includes('isGalacticLegendCharacter(owner)'),'GL donors must be excluded');
assert.ok(js.includes('exchangeSetBonusesPreserved(before,after)'),'Donor set bonuses must be preserved');
assert.ok(js.includes('options.slice(0,24)'), 'Search must keep a broad enough donor pool before validating donor set preservation');
assert.ok(js.includes('modTotalSpeed(b)-modTotalSpeed(a)'), 'Candidate search must prioritize speed-preserving mods before donor-usage tie breaks');
assert.ok(js.includes('candidateSpeedCeiling'), 'Search diagnostics must expose the maximum speed reachable from the current candidate pool');
assert.ok(js.includes('async function buildExchangeProposals'), 'Six-slot search must run asynchronously');
assert.ok(js.includes('await new Promise(resolve=>setTimeout(resolve,0))'), 'Search must yield to the browser while evaluating combinations');
assert.ok(js.includes('await buildExchangeProposals'), 'UI must await the responsive search routine');
assert.ok(js.includes('searchProgress.tested'), 'UI must expose live search progress');
assert.ok(js.includes('speedLoss:beforeSpeed-afterSpeed'), 'Rejected speed exchanges must report the measured speed loss');
assert.ok(js.includes('afterSpeed+1e-9<beforeSpeed'),'Target speed must never decrease');
assert.ok(js.includes('RECOMMANDÉ'),'Scenario verdict must be explicit');
assert.ok(js.includes('const diagnostics={limit:15000'),'Search diagnostics must expose the safety limit and candidate counts');
assert.ok(js.includes('perte_stat_cible'),'Search must count target-stat rejections');
assert.ok(js.includes('bonus_sets_donneur'),'Search must count donor set-bonus rejections');
assert.ok(js.includes('renderExchangeDiagnostics'),'Search diagnostics must be visible in the UI');
console.log('Visionnaire exchange contract tests passed.');

import vm from 'node:vm';

const start=js.indexOf('  const exchangeSetCounts =');
const end=js.indexOf('  function buildExchangeProposals',start);
const sandbox={
  key:value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,''),
  labelSet:value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,''),
  baseStatsForCharacter:character=>character.base_stats||{},
  optimizerProfileForCharacter:()=>({}),
  modTotalSpeed:mod=>Number(mod.speed||0)
};
vm.createContext(sandbox);
vm.runInContext(js.slice(start,end)+'\nthis.project=exchangeFinalStats;this.score=exchangeScenarioScore;this.focus=exchangeSecondaryFocusScore;this.focusImpact=exchangeTargetFocusImpact;',sandbox);
const fixture={baseId:'GLREY',base_stats:{Health:1000,Speed:100,Potency:0.1}};
const healthMods=[
 {set_name:'Health',primary_stat:'Health %',primary_value:5},
 {set_name:'Health',primary_stat:'Health %',primary_value:5}
];
assert.equal(sandbox.project(fixture,healthMods).Health,1200);
const speedMods=['Square','Arrow','Diamond','Triangle'].map(slot=>({slot,set_name:'Speed',primary_stat:'Speed',primary_value:5}));
assert.equal(sandbox.project(fixture,speedMods).Speed,130);
const better=sandbox.score({mode:'sets',beforeSetDistance:4,afterSetDistance:0,primaryShare:.9,targetBalance:.02,donors:[{uses:5,statBalance:.01,statusWorsened:false}]});
const worse=sandbox.score({mode:'sets',beforeSetDistance:4,afterSetDistance:3,primaryShare:.2,targetBalance:-.03,donors:[{uses:100,statBalance:-.05,statusWorsened:true}]});
assert.ok(better.score>worse.score);
assert.equal(better.verdict,'RECOMMANDÉ');

const buildStart=js.indexOf('  function buildExchangeProposals');
const buildEnd=js.indexOf('  function renderExchangeProposals',buildStart);
const buildSandbox={
  SLOTS:['Square','Arrow','Diamond','Triangle','Circle','Cross'],
  slotOf:mod=>mod?.slot||'',
  window:{__SWGOH_GAC_USAGE__:{sourceStatus:'observed'}},
  LABELS:{Square:'Carré',Arrow:'Flèche',Diamond:'Losange',Triangle:'Triangle',Circle:'Cercle',Cross:'Croix'},
  state:{mode:'sets'},key:value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,''),
  labelSet:value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,''),
  statKey:value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,''),
  modTotalSpeed:mod=>Number(mod.speed||0),
  characterKey:c=>String(c.baseId),
  optimizerProfileForCharacter:c=>({base_stats:c.base_stats||{}}),
  baseStatsForCharacter:c=>c.base_stats||{},
  isGalacticLegendCharacter:c=>String(c.baseId).startsWith('GL'),
  forgeSourceAllowedForSearch:()=>true,
  rankedSetConfigurations:p=>(p.specific_sets||[]).map(x=>({name:x.name,counts:Object.fromEntries(Object.entries(x.counts).map(([k,v])=>[String(k).toLowerCase(),v])),weight:x.weight||1,exact:true})),
  primaryDistribution:(p,s)=>Object.entries(p?.slots?.[s]?.primaries||{}).map(([name,weight])=>({name,weight})),
  v176ModStatus:mods=>({status:mods.length===6?'FAIBLES':'INCOMPLETS'})
};
vm.createContext(buildSandbox);
vm.runInContext(js.slice(start,end)+'\n'+js.slice(buildStart,buildEnd)+'\nthis.search=buildExchangeProposals;',buildSandbox);
const makeMod=(id,slot,set,speed,primary='Speed',value=5)=>({game_id:id,slot,set_name:set,speed,primary_stat:primary,primary_value:value});
function runSearch(target,donorMods,freeMods,profile,mode='sets',glDonorMods=[]){
  const donor={baseId:'DONOR',name:'Donneur',base_stats:{Speed:100,Health:1000,Offense:500}};
  donor.mods=donorMods;
  const glDonor={baseId:'GLDONOR',name:'Donneur GL',base_stats:{Speed:100},mods:glDonorMods};
  const roster=[target,...(donorMods.length?[donor]:[]),...(glDonorMods.length?[glDonor]:[])];
  const byOwner=new Map(roster.map(c=>[c.baseId,c.mods||[]]));
  const sources=[
    ...donorMods.map(m=>({...m,_sourceOwnerKey:'DONOR',_sourceOwner:'Donneur',_sourcePriorityKnown:true,_sourceUsage:12})),
    ...glDonorMods.map(m=>({...m,_sourceOwnerKey:'GLDONOR',_sourceOwner:'Donneur GL',_sourcePriorityKnown:true,_sourceUsage:0})),
    ...freeMods.map(m=>({...m,_sourceOwnerKey:null,_sourceOwner:'Libre',_sourcePriorityKnown:true,_sourceUsage:0}))
  ];
  Object.assign(buildSandbox,{
    state:{mode},rosterCharacters:roster,
    getCharacterMods:c=>byOwner.get(c.baseId)||[],
    forgeAllSourceMods:()=>sources,
    forgeProjectedModSpeed:(c,_p,list)=>{
      const speed=list.reduce((sum,m)=>sum+Number(m.speed||0),0);
      const four=list.filter(m=>m.set_name==='Speed').length>=4;
      const base=Number(c.base_stats?.Speed||0);
      return {total:speed+(four&&base?base*.1:0),baseSpeed:base,hasFourPieceSpeedSet:four};
    }
  });
  return buildSandbox.search({character:target,profile},['Square','Circle']);
}
const glTarget={baseId:'GLREY',name:'Rey',base_stats:{Speed:100,Health:1000,Offense:500}};
glTarget.mods=[
 makeMod('t1','Square','Health',1,'Health %',5),makeMod('t2','Arrow','Speed',1),
 makeMod('t3','Diamond','Health',1,'Health %',5),makeMod('t4','Triangle','Speed',1),
 makeMod('t5','Circle','Health',1,'Health %',5),makeMod('t6','Cross','Health',1,'Health %',5)
];
const kyber={specific_sets:[{name:'4 Speed + 2 Offense',counts:{Speed:4,Offense:2},weight:1}]};
const weakDonor=['Square','Arrow','Diamond','Triangle','Circle','Cross'].map((slot,i)=>makeMod('d'+i,slot,'Speed',10,'Speed',10));
const dangerousGlDonor=['Square','Arrow','Diamond','Triangle','Circle','Cross'].map((slot,i)=>makeMod('g'+i,slot,'Speed',25,'Speed',25));
const glSearch=runSearch(glTarget,weakDonor,[],kyber,'sets',dangerousGlDonor);
assert.ok(glSearch.proposals.length>0,'A Galactic Legend is a valid recipient');
assert.equal(glSearch.proposals[0].donors[0].owner.baseId,'DONOR','The non-GL donor is selected');
assert.ok(glSearch.proposals[0].targetStatsAfter,'Recipient global stats are calculated');
assert.ok(glSearch.proposals[0].donors[0].afterStats,'Donor global stats are calculated');

// A non-GL recipient can use free inventory mods without creating a donor.
const normalTarget={...glTarget,baseId:'JEDIKNIGHTLUKE',name:'Jedi Knight Luke',mods:glTarget.mods.map(m=>({...m,game_id:'n-'+m.game_id}))};
const freeChoices=[makeMod('free-s','Square','Speed',10,'Speed',10),makeMod('free-c','Circle','Speed',10,'Speed',10)];
const freeSearch=runSearch(normalTarget,[],freeChoices,kyber);
assert.ok(freeSearch.proposals.length>0,'A normal character can receive free inventory mods');
assert.equal(freeSearch.proposals[0].freeMods,2);
assert.equal(freeSearch.proposals[0].donors.length,0);

// The hard speed floor rejects a primary-only exchange that would lower total speed.
const speedTarget={baseId:'GLLEIA',name:'Leia',base_stats:{Speed:100,Health:1000}};
speedTarget.mods=['Square','Arrow','Diamond','Triangle','Circle','Cross'].map((slot,i)=>makeMod('sp'+i,slot,'Speed',10,'Speed',5));
const slowFree=[makeMod('slow-s','Square','Health',0,'Speed',5),makeMod('slow-c','Circle','Health',0,'Speed',5)];
const primaryProfile={slots:{Square:{primaries:{Speed:1}},Circle:{primaries:{Speed:1}}}};
const rejected=runSearch(speedTarget,[],slowFree,primaryProfile,'primaries');
assert.equal(rejected.proposals.length,0,'No scenario may lower the target total speed');

const focusScore=sandbox.focus({secondary_focus:{Speed:20,Health:10}},[
 {secondary_1_stat:'Speed',secondary_1_value:20,secondary_2_stat:'Health',secondary_2_value:10}
]);
assert.equal(focusScore,100,'Kyber secondary-focus score must use observed secondary totals');
const focusImpact=sandbox.focusImpact({secondary_focus:{Speed:20,Health:100}},[
 {secondary_1_stat:'Speed',secondary_1_value:20,secondary_2_stat:'Health',secondary_2_value:100}
],[
 {secondary_1_stat:'Speed',secondary_1_value:20,secondary_2_stat:'Health',secondary_2_value:60}
],{Defense:76},{Defense:33});
assert.equal(focusImpact.losses.length,2,'Major Kyber-secondary and core-stat losses must be rejected');
assert.equal(focusImpact.losses[0].name,'Health');
assert.ok(focusImpact.balance<0,'Target focus impact must penalize loss of prioritized secondaries');
assert.equal(focusImpact.coreLosses.length,1,'A major core-stat loss must also be rejected');
assert.equal(focusImpact.coreLosses[0].name,'Defense');

const noSources=runSearch(glTarget,[],[],kyber);
assert.equal(noSources.proposals.length,0);
assert.match(noSources.reason,/Aucun donneur vérifié/i,'Missing verified donor data must be explained, not reported as a generic no-result');
buildSandbox.window.__SWGOH_GAC_USAGE__.sourceStatus='unavailable';
const unavailableSources=runSearch(glTarget,[],[],kyber);
assert.match(unavailableSources.reason,/collecteur navigateur/i,'Unavailable GAC source must direct the user to the browser collector');
