const OPTIMIZER_STATS = Object.freeze({
  1: "Health",
  5: "Speed",
  6: "Physical Damage",
  7: "Special Damage",
  8: "Armor",
  9: "Resistance",
  17: "Potency",
  18: "Tenacity",
  28: "Protection",
});

const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const numeric = value => {
  const result = Number(value);
  return value !== null && value !== "" && Number.isFinite(result) ? result : null;
};
const firstValue = (...values) => values.find(value => value !== undefined && value !== null);

function fail(error) {
  return { unit: null, metadata: null, error };
}

/** Convert the SWGOH.GG unit payload retained by core.js into Crinolo's raw format. */
export function normalizeCrinoloRosterUnit(source) {
  const raw = isRecord(source?.data) ? source.data : source;
  if (!isRecord(raw)) return fail("Données brutes du personnage absentes.");

  const baseId = String(firstValue(raw.base_id, raw.baseId, raw.definitionId, "")).split(":")[0].trim();
  const level = numeric(firstValue(raw.level, raw.currentLevel));
  const rarity = numeric(firstValue(raw.rarity, raw.currentRarity, raw.starLevel, raw.stars));
  const gearLevel = numeric(firstValue(raw.gear_level, raw.gearLevel, raw.currentTier));
  if (!baseId || !Number.isInteger(level) || level < 1 || level > 90 ||
      !Number.isInteger(rarity) || rarity < 1 || rarity > 7 ||
      !Number.isInteger(gearLevel) || gearLevel < 1 || gearLevel > 13) {
    return fail("Identité ou progression du personnage incomplète (base_id, niveau, rareté ou gear).");
  }

  const rawRelicTier = firstValue(
    raw.relic_tier, raw.relicTier, raw.relic_level, raw.relicLevel,
    raw.relic?.currentTier, raw.relic?.tier
  );
  if (gearLevel === 13 && rawRelicTier === undefined) {
    return fail("Palier de relique absent pour un personnage G13 : calcul exact impossible.");
  }
  let relicTier = rawRelicTier === undefined ? 1 : numeric(rawRelicTier);
  if (relicTier === 0 && gearLevel === 13) relicTier = 2; // SWGOH.GG uses 0 for G13 without a relic.
  if (relicTier === 0 && gearLevel < 13) relicTier = 1;
  if (!Number.isInteger(relicTier) || relicTier < 1 || relicTier > 12 ||
      (gearLevel < 13 && relicTier > 2)) {
    return fail("Palier de relique invalide ou incohérent avec le gear.");
  }

  const gear = firstValue(raw.gear, raw.equipment);
  if (!Array.isArray(gear) || gear.length !== 6) {
    return fail("Les six emplacements de gear courant ne sont pas fournis : calcul Crinolo refusé.");
  }
  const equipped = [];
  const slots = new Set();
  for (const item of gear) {
    if (!isRecord(item)) return fail("Une pièce de gear ne possède pas un format exploitable.");
    const slot = numeric(item.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 6 || slots.has(slot) ||
        typeof item.is_obtained !== "boolean") {
      return fail("Les six emplacements de gear ne sont pas identifiables sans ambiguïté.");
    }
    slots.add(slot);
    if (item.is_obtained) {
      const equipmentId = String(firstValue(item.base_id, item.baseId, item.equipmentId, item.equipment_id, "")).trim();
      if (!equipmentId) return fail("Identifiant d'une pièce de gear équipée absent.");
      equipped.push({ equipmentId });
    }
  }
  if (slots.size !== 6) return fail("Un ou plusieurs emplacements de gear sont absents.");
  if (gearLevel === 13 && equipped.length !== 6) {
    return fail("Un personnage G13 doit avoir ses six pièces de gear équipées pour un calcul Crinolo exact.");
  }

  return {
    unit: {
      defId: baseId,
      rarity,
      level,
      // Crinolo models G13 as gear tier 12 with all six current-tier pieces equipped.
      gear: gearLevel,
      equipped,
      relic: { currentTier: relicTier },
    },
    metadata: { level, rarity, gear_level: gearLevel, relic_tier: relicTier },
    error: null,
  };
}

/** Calculate an exact optimizer profile from current roster progression via Crinolo. */
export function calculateCrinoloProfile(source, calculator, gameData) {
  const normalized = normalizeCrinoloRosterUnit(source);
  if (!normalized.unit) return { profile: null, error: normalized.error };
  if (!calculator || typeof calculator.calcCharStats !== "function" ||
      typeof calculator.setGameData !== "function" || !isRecord(gameData)) {
    return { profile: null, error: "Calculateur ou données de jeu Crinolo indisponibles." };
  }

  const { unit, metadata } = normalized;
  const unitData = gameData.unitData?.[unit.defId];
  if (!unitData?.gearLvl?.[unit.gear] || !unitData.growthModifiers?.[unit.rarity]) {
    return { profile: null, error: "Référence Crinolo absente pour ce personnage, son gear ou sa rareté." };
  }
  for (const piece of unit.equipped) {
    if (!gameData.gearData?.[piece.equipmentId]) {
      return { profile: null, error: `Pièce de gear inconnue dans les données Crinolo : ${piece.equipmentId}.` };
    }
  }
  if (unit.relic.currentTier > 2) {
    const relicId = unitData.relic?.[unit.relic.currentTier];
    if (relicId == null || !gameData.relicData?.[relicId]) {
      return { profile: null, error: "Données Crinolo absentes pour le palier de relique du personnage." };
    }
  }

  try {
    calculator.setGameData(gameData);
    const calculated = calculator.calcCharStats(unit, { withoutModCalc: true, gameStyle: true });
    if (!isRecord(calculated?.base)) {
      return { profile: null, error: "Crinolo n'a pas retourné de statistiques de base." };
    }
    const base = {};
    const gear = {};
    const baseStats = {};
    for (const [statId, name] of Object.entries(OPTIMIZER_STATS)) {
      const baseValue = numeric(calculated.base[statId]);
      const gearValue = numeric(calculated.gear?.[statId] ?? 0);
      if (baseValue === null || gearValue === null) {
        return { profile: null, error: `Statistique Crinolo incomplète : ${name}.` };
      }
      // Crinolo gameStyle returns Armor/Resistance as decimal ratios; the
      // shared Holocron engine and existing profiles use percentage points.
      const displayScale = statId === "8" || statId === "9" ? 100 : 1;
      base[name] = baseValue * displayScale;
      gear[name] = gearValue * displayScale;
      baseStats[name] = (baseValue + gearValue) * displayScale;
    }
    return {
      profile: {
        ...metadata,
        base_stats: baseStats,
        stat_components: {
          source: "Crinolo.stats.base+stats.gear",
          base,
          gear,
        },
        profile_source: "Crinolo",
      },
      error: null,
    };
  } catch (error) {
    return { profile: null, error: `Échec du calcul Crinolo : ${error?.message || String(error)}` };
  }
}
