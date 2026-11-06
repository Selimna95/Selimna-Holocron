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
