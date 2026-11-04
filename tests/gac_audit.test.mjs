import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

vm.runInThisContext(fs.readFileSync(new URL("../blue-gac/gac-audit.js", import.meta.url), "utf8"));
const api = globalThis.GACAudit;
assert.ok(api && typeof api.auditCatalog === "function");
assert.equal(typeof api.analyzePerformance, "function");
assert.equal(typeof api.wilsonInterval, "function");

const valid = {
  schemaVersion: 1, collectionStatus: "partial", currentSeasons: {"3v3":83,"5v5":84},
  coverage: {"3v3":{kyber:1,aurodium:0,chromium:0,bronzium:0,carbonite:0},"5v5":{kyber:0,aurodium:0,chromium:0,bronzium:0,carbonite:0}},
  seasons: {"3v3":{kyber:[83],aurodium:[],chromium:[],bronzium:[],carbonite:[]},"5v5":{kyber:[],aurodium:[],chromium:[],bronzium:[],carbonite:[]}},
  teams: [{format:"3v3",league:"Kyber",season:83,rank:1,name:"Test",members:["Alpha","Beta","Gamma"],hold:50,battles:100,source:"https://swgoh.gg/tier-list/3v3/"}]
};
let result = api.auditCatalog(valid, ["Alpha","Beta","Gamma"]);
assert.equal(result.errors, 0);
assert.equal(result.selections.length, 10);
assert.equal(result.selections[0].selected, 1);

const malformed = structuredClone(valid);
malformed.teams[0].members = ["Alpha","Alpha","Gamma"];
result = api.auditCatalog(malformed, ["Alpha","Beta","Gamma"]);
assert.ok(result.errors >= 1, "duplicate members inside a squad must fail");

const badCoverage = structuredClone(valid);
badCoverage.coverage["3v3"].kyber = 99;
result = api.auditCatalog(badCoverage, []);
assert.ok(result.checks.some(x => x.level === "error" && x.title === "Couverture 3v3 · Kyber"));

const duplicate = structuredClone(valid);
duplicate.teams.push(structuredClone(duplicate.teams[0]));
duplicate.coverage["3v3"].kyber = 2;
result = api.auditCatalog(duplicate, []);
assert.ok(result.checks.some(x => x.level === "error" && x.title === "Compositions en double"));

const noCurrentSeason = structuredClone(valid);
noCurrentSeason.currentSeasons["3v3"] = 0;
result = api.auditCatalog(noCurrentSeason, []);
assert.ok(result.checks.some(x => x.level === "error" && x.title === "Saison actuelle 3v3"));


const performanceCatalog = {
  teams: [
    {format:"5v5",league:"Kyber",season:84,name:"Alpha squad",members:["A","B","C","D","E"],hold:60,battles:10000,rank:1,source:"https://swgoh.gg/a"},
    {format:"5v5",league:"Kyber",season:84,name:"Beta squad",members:["F","G","H","I","J"],hold:40,battles:10000,rank:2,source:"https://swgoh.gg/b"},
    {format:"5v5",league:"Kyber",season:83,name:"Old squad",members:["K","L","M","N","O"],hold:90,battles:10000,rank:1,source:"https://swgoh.gg/c"}
  ]
};
const performance = api.analyzePerformance(performanceCatalog);
assert.equal(performance.items.length, 3);
assert.equal(performance.items[0].baseline, 40);
assert.equal(performance.items[0].delta, 20);
assert.equal(performance.items[1].delta, -20);
assert.equal(performance.items[2].baseline, null, "Different seasons must never be compared.");
assert.equal(performance.items[0].confidence, "élevée");
assert.ok(performance.items[0].interval.low < 60 && performance.items[0].interval.high > 60);
assert.ok(api.wilsonInterval(50, 10000).margin < api.wilsonInterval(50, 100).margin, "Larger samples must reduce uncertainty.");
console.log("GAC audit and statistical analysis tests: OK");
