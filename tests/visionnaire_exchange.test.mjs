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
assert.ok(js.includes('afterSpeed+1e-9<beforeSpeed'),'Target speed must never decrease');
assert.ok(js.includes('RECOMMANDÉ'),'Scenario verdict must be explicit');
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
vm.runInContext(js.slice(start,end)+'\nthis.project=exchangeFinalStats;this.score=exchangeScenarioScore;',sandbox);
const fixture={baseId:'GLREY',base_stats:{Health:1000,Speed:100,Potency:0.1}};
const healthMods=[
 {set_name:'Health',primary_stat:'Health %',primary_value:5},
 {set_name:'Health',primary_stat:'Health %',primary_value:5}
];
assert.equal(sandbox.project(fixture,healthMods).Health,1200);
const speedMods=['Square','Arrow','Diamond','Triangle'].map(slot=>({slot,set_name:'Speed',primary_stat:'Speed',primary_value:5}));
assert.equal(sandbox.project(fixture,speedMods).Speed,120);
const better=sandbox.score({mode:'sets',beforeSetDistance:4,afterSetDistance:0,primaryShare:.9,targetBalance:.02,donors:[{uses:5,statBalance:.01,statusWorsened:false}]});
const worse=sandbox.score({mode:'sets',beforeSetDistance:4,afterSetDistance:3,primaryShare:.2,targetBalance:-.03,donors:[{uses:100,statBalance:-.05,statusWorsened:true}]});
assert.ok(better.score>worse.score);
assert.equal(better.verdict,'RECOMMANDÉ');
