import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import crinoloStatCalc from "../vendor/crinolo-stat-calc.mjs";
import { calculateCrinoloProfile } from "../modules/optimizer-progression.mjs";

const RELIC_TIER_MIN = 2; // Crinolo's locked relic tier (R0).
const RELIC_TIER_MAX = 12; // Latest tier present in the pinned game data (R10).
const PARITY_TOLERANCE = 1e-9;

function assertRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Structure invalide : ${label}.`);
  }
}

function compareOriginalProfile(original, generated, baseId) {
  const oldStats = original?.base_stats;
  const newStats = generated?.base_stats;
  assertRecord(oldStats, `base_stats existantes pour ${baseId}`);
  assertRecord(newStats, `base_stats Crinolo pour ${baseId}`);
  const keys = Object.keys(oldStats);
  const generatedKeys = Object.keys(newStats);
  const mismatches = [];
  if (!keys.length) throw new Error(`Aucune statistique de référence pour ${baseId}.`);
  if (keys.length !== generatedKeys.length || keys.some(key => !Object.hasOwn(newStats, key))) {
    mismatches.push({ field: "stat_keys", existing: keys.sort(), crinolo: generatedKeys.sort() });
  }
  for (const key of keys) {
    const oldValue = Number(oldStats[key]);
    const newValue = Number(newStats[key]);
    if (!Number.isFinite(oldValue) || !Number.isFinite(newValue) ||
        Math.abs(oldValue - newValue) > PARITY_TOLERANCE) {
      mismatches.push({ field: key, existing: oldStats[key], crinolo: newStats[key] });
    }
  }
  return mismatches;
}

function profileMetadataKey(profile) {
  return `${Number(profile.gear_level)}:${Number(profile.relic_tier)}`;
}

/**
 * Build exact G13 variants from the pinned Crinolo game data.
 * Existing snapshots are retained at their exact original progression.
 * No interpolation, nearest-tier fallback or guessed stat is permitted.
 */
export function buildOptimizerProfileVariants(sourceProfiles, gameData, calculator = crinoloStatCalc) {
  assertRecord(sourceProfiles, "profils Optimizer source");
  assertRecord(gameData?.unitData, "gameData.unitData");
  assertRecord(gameData?.gearData, "gameData.gearData");
  assertRecord(gameData?.relicData, "gameData.relicData");
  if (typeof calculator?.setGameData !== "function" ||
      typeof calculator?.calcCharStats !== "function") {
    throw new Error("Calculateur Crinolo indisponible.");
  }

  calculator.setGameData(gameData);
  const outputProfiles = {};
  const coverage = {
    schemaVersion: 1,
    source: gameData.source || null,
    characters: Object.keys(sourceProfiles).length,
    g13Characters: 0,
    variants: 0,
    supportedRelicTiers: [],
    unsupportedRelicRanks: [11, 12],
    uncoveredCharacters: [],
    originalSnapshotsPreserved: 0,
  };
  const supportedTiers = new Set([RELIC_TIER_MIN]);
  const parityFailures = [];
  let supportedRanks = Array.from({ length: RELIC_TIER_MAX - RELIC_TIER_MIN + 1 }, (_, index) => index);

  for (const [profileId, original] of Object.entries(sourceProfiles)) {
    assertRecord(original, `profil ${profileId}`);
    const baseId = String(original.base_id || profileId).trim().toUpperCase();
    const unit = gameData.unitData[baseId];
    if (!unit || unit.combatType !== 1) {
      coverage.uncoveredCharacters.push({ base_id: baseId, reason: "unit_data_unavailable" });
      continue;
    }

    const variants = {};
    const originalKey = profileMetadataKey(original);
    variants[originalKey] = { ...original };
    coverage.originalSnapshotsPreserved++;

    const gearDefinition = unit.gearLvl?.[13];
    const gearIds = gearDefinition?.gear;
    if (!Array.isArray(gearIds) || gearIds.length !== 6 ||
        gearIds.some(id => !id || !gameData.gearData[id])) {
      coverage.uncoveredCharacters.push({ base_id: baseId, reason: "g13_gear_reference_unavailable" });
      outputProfiles[baseId] = { name: original.name || baseId, base_id: baseId, variants };
      continue;
    }

    const relicKeys = Object.keys(unit.relic || {}).map(Number)
      .filter(value => Number.isInteger(value) && value >= 3 && value <= RELIC_TIER_MAX);
    const missingRanks = Array.from({ length: RELIC_TIER_MAX - RELIC_TIER_MIN }, (_, index) => index + 1)
      .filter(rank => !relicKeys.includes(rank + 2));
    supportedRanks = supportedRanks.filter(rank => rank === 0 || relicKeys.includes(rank + 2));
    for (const tier of relicKeys) supportedTiers.add(tier);
    if (missingRanks.length) {
      coverage.uncoveredCharacters.push({
        base_id: baseId,
        reason: "relic_progression_unavailable",
        missing_relic_ranks: missingRanks,
      });
      outputProfiles[baseId] = { name: original.name || baseId, base_id: baseId, variants };
      continue;
    }
    const tiers = [...new Set([RELIC_TIER_MIN, ...relicKeys])].sort((a, b) => a - b);

    for (const relicTier of tiers) {
      const gear = gearIds.map((base_id, index) => ({
        slot: index + 1,
        is_obtained: true,
        base_id,
      }));
      const source = {
        data: {
          base_id: baseId,
          level: 85,
          rarity: 7,
          gear_level: 13,
          relic_tier: relicTier,
          gear,
        },
      };
      const resolved = calculateCrinoloProfile(source, calculator, gameData);
      if (!resolved.profile) {
        throw new Error(
          `Génération refusée pour ${baseId} G13 tier ${relicTier} : ${resolved.error || "erreur inconnue"}.`
        );
      }
      const key = `13:${relicTier}`;
      if (original.gear_level === 13 && Number(original.relic_tier) === relicTier) {
        const mismatches = compareOriginalProfile(original, resolved.profile, baseId);
        if (mismatches.length) parityFailures.push({
          base_id: baseId,
          progression: key,
          mismatches,
        });
      }
      variants[key] = resolved.profile;
      coverage.variants++;
    }

    coverage.g13Characters++;
    const { variants: _legacyVariants, ...originalMetadata } = original;
    outputProfiles[baseId] = {
      ...originalMetadata,
      name: original.name || baseId,
      base_id: baseId,
      variants,
    };
  }

  coverage.supportedRelicTiers = [...supportedTiers].sort((a, b) => a - b);
  coverage.supportedRelicRanks = supportedRanks;
  if (coverage.supportedRelicRanks.length !== RELIC_TIER_MAX - RELIC_TIER_MIN + 1) {
    throw new Error("La couverture des reliques Crinolo est incomplète pour tous les personnages.");
  }
  const requiredCharacters = Object.keys(sourceProfiles).length;
  if (Object.keys(outputProfiles).length !== requiredCharacters) {
    throw new Error(
      `Génération incomplète : ${Object.keys(outputProfiles).length}/${requiredCharacters} personnages ont une entrée de profil.`
    );
  }
  if (coverage.g13Characters !== requiredCharacters) {
    throw new Error(
      `Couverture G13 incomplète : ${coverage.g13Characters}/${requiredCharacters}. Aucun fichier ne sera publié.`
    );
  }
  if (coverage.uncoveredCharacters.length) {
    throw new Error(`Profils G13 non couverts : ${JSON.stringify(coverage.uncoveredCharacters.slice(0, 5))}`);
  }
  if (parityFailures.length) {
    throw new Error(
      `Parité Crinolo refusée pour ${parityFailures.length} profil(s) d'origine : ${JSON.stringify(parityFailures.slice(0, 30))}`
    );
  }

  return {
    dataset: { schemaVersion: 2, profiles: outputProfiles },
    coverage,
  };
}

async function main() {
  const [sourcePath, gameDataPath, outputPath, manifestPath] = process.argv.slice(2);
  if (!sourcePath || !gameDataPath || !outputPath || !manifestPath) {
    throw new Error(
      "Usage: node scripts/build-optimizer-profile-variants.mjs <source-profiles.json> <gameData.json> <output.json> <coverage.json>"
    );
  }
  const sourceProfiles = JSON.parse(await readFile(sourcePath, "utf8"));
  const gameData = JSON.parse(await readFile(gameDataPath, "utf8"));
  const { dataset, coverage } = buildOptimizerProfileVariants(sourceProfiles, gameData);
  await writeFile(outputPath, JSON.stringify(dataset), "utf8");
  await writeFile(manifestPath, JSON.stringify(coverage, null, 2) + "\n", "utf8");
  console.log(
    `Profils Optimizer v2 prêts : ${coverage.characters} personnages, ${coverage.variants} variantes G13 exactes, tiers Crinolo ${coverage.supportedRelicTiers.join(",")}.`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
