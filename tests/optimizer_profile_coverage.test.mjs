import assert from "node:assert/strict";
import { buildOptimizerProfileCoverage } from "../scripts/build-optimizer-profile-coverage.mjs";

const profiles = {
  UNIT_A: { base_id: "UNIT_A", name: "Unit A", gear_level: 13, relic_tier: 5 },
  UNIT_B: { base_id: "UNIT_B", name: "Unit B", gear_level: 12, relic_tier: 1 },
};
const gameData = {
  source: { repository: "swgoh-utils/gamedata", commit: "test" },
  unitData: {
    UNIT_A: { gearLvl: { 13: { gear: ["G1","G2","G3","G4","G5","G6"] } }, relic: { 3: "A1", 4: "A2", 5: "A3" } },
    UNIT_B: { gearLvl: { 13: { gear: ["G1","G2","G3","G4","G5","G6"] } }, relic: { 3: "B1", 4: "B2", 5: "B3" } },
  },
};
const manifest = buildOptimizerProfileCoverage(profiles, gameData);
assert.equal(manifest.profileCount, 2);
assert.equal(manifest.g13SnapshotCount, 1);
assert.equal(manifest.nonG13SnapshotCount, 1);
assert.deepEqual(manifest.supportedG13RelicRanks, [0, 1, 2, 3]);
assert.equal(manifest.targetG13VariantCount, 8);
assert.equal(manifest.coveredG13VariantCount, 1);
assert.equal(manifest.missingG13VariantCount, 7);
assert.deepEqual(manifest.characters[0].covered_g13_relic_ranks, [3]);
assert.deepEqual(manifest.characters[1].covered_g13_relic_ranks, []);
console.log("Optimizer profile coverage manifest tests passed.");
