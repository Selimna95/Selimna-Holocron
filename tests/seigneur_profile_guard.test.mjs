import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../modules/seigneur.js", import.meta.url), "utf8");
const start = source.indexOf("function forgeProjectedModSpeed(");
const end = source.indexOf("function forgeCandidatePreservesSpeed(", start);
assert.ok(start >= 0 && end > start, "Seigneur speed projection functions must exist");
const projection = source.slice(start, end);
assert.match(projection, /optimizerValidatedProfileForCharacter\(character\)/);
assert.match(projection, /localProfile\.base_stats/);
assert.match(projection, /localProfile\.stat_components/);
assert.match(projection, /optimizer_profile_error/);
assert.doesNotMatch(projection, /character\?\.(?:base_stats|baseStats|stat_components)/);
assert.doesNotMatch(projection, /character\?\.raw\?\.(?:base_stats|baseStats|stat_components)/);
console.log("Seigneur exact profile speed guard tests passed.");
