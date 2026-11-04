import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

vm.runInThisContext(fs.readFileSync(new URL("../blue-gac/gac-audit.js", import.meta.url), "utf8"));
const api = globalThis.GACAudit;
assert.ok(api && typeof api.auditCatalog === "function");

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

console.log("GAC audit regression tests: OK");
