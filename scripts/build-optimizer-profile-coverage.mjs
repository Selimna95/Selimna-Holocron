import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Structure invalide : ${label}.`);
  }
}

function availableRelicRanks(unit) {
  const gear = unit?.gearLvl?.[13]?.gear;
  if (!Array.isArray(gear) || gear.length !== 6 || gear.some(id => !id)) return [];
  const tiers = Object.keys(unit?.relic || {}).map(Number)
    .filter(tier => Number.isInteger(tier) && tier >= 3 && tier <= 12)
    .map(tier => tier - 2);
  return [...new Set([0, ...tiers])].sort((a, b) => a - b);
}

/** Describe current exact-snapshot coverage without generating or approximating stats. */
export function buildOptimizerProfileCoverage(profiles, gameData) {
  record(profiles, "optimizer_profiles.json");
  record(gameData?.unitData, "gameData.unitData");

  const gearLevelDistribution = {};
  const relicTierDistribution = {};
  const characters = [];
  let g13Snapshots = 0;
  let exactSnapshotCount = 0;
  let targetG13VariantCount = 0;
  let coveredG13VariantCount = 0;
  const rankSets = [];

  for (const [profileId, profile] of Object.entries(profiles)) {
    record(profile, `profil ${profileId}`);
    const baseId = String(profile.base_id || profileId).trim().toUpperCase();
    const gear = Number(profile.gear_level);
    const relic = Number(profile.relic_tier);
    const unit = gameData.unitData[baseId];
    const ranks = availableRelicRanks(unit);
    gearLevelDistribution[gear] = (gearLevelDistribution[gear] || 0) + 1;
    const relicKey = `${gear}:${relic}`;
    relicTierDistribution[relicKey] = (relicTierDistribution[relicKey] || 0) + 1;
    if (Number.isInteger(gear) && Number.isInteger(relic)) exactSnapshotCount++;

    const currentRank = gear === 13 && Number.isInteger(relic) ? relic - 2 : null;
    const covered = currentRank !== null && ranks.includes(currentRank) ? [currentRank] : [];
    if (gear === 13) {
      g13Snapshots++;
      targetG13VariantCount += ranks.length;
      coveredG13VariantCount += covered.length;
    } else {
      targetG13VariantCount += ranks.length;
    }
    rankSets.push(new Set(ranks));
    characters.push({
      base_id: baseId,
      name: profile.name || baseId,
      snapshot: { gear_level: gear, relic_tier: relic },
      snapshot_is_g13: gear === 13,
      available_g13_relic_ranks: ranks,
      covered_g13_relic_ranks: covered,
      missing_g13_relic_ranks: ranks.filter(rank => !covered.includes(rank)),
      crinolo_unit_available: !!unit,
      crinolo_g13_available: ranks.length > 0,
    });
  }

  const commonRanks = rankSets.length
    ? [...rankSets[0]].filter(rank => rankSets.every(set => set.has(rank))).sort((a, b) => a - b)
    : [];
  const unavailableCharacters = characters.filter(item => !item.crinolo_g13_available);
  const missingG13VariantCount = targetG13VariantCount - coveredG13VariantCount;

  return {
    schemaVersion: 1,
    source: gameData.source || null,
    profileCount: characters.length,
    exactSnapshotCount,
    g13SnapshotCount: g13Snapshots,
    nonG13SnapshotCount: characters.length - g13Snapshots,
    gearLevelDistribution,
    relicTierDistribution,
    supportedG13RelicRanks: commonRanks,
    unsupportedG13RelicRanks: [11, 12].filter(rank => !commonRanks.includes(rank)),
    targetG13VariantCount,
    coveredG13VariantCount,
    missingG13VariantCount,
    unavailableCharacterCount: unavailableCharacters.length,
    unavailableCharacters,
    characters,
  };
}

async function main() {
  const [profilesPath, gameDataPath, outputPath] = process.argv.slice(2);
  if (!profilesPath || !gameDataPath || !outputPath) {
    throw new Error(
      "Usage: node scripts/build-optimizer-profile-coverage.mjs <profiles.json> <gameData.json> <coverage.json>"
    );
  }
  const profiles = JSON.parse(await readFile(profilesPath, "utf8"));
  const gameData = JSON.parse(await readFile(gameDataPath, "utf8"));
  const manifest = buildOptimizerProfileCoverage(profiles, gameData);
  await writeFile(outputPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(
    `Couverture Optimizer : ${manifest.profileCount} profils, ${manifest.g13SnapshotCount} instantanés G13, ${manifest.missingG13VariantCount} variantes G13 non couvertes sur ${manifest.targetG13VariantCount} progressions Crinolo.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
