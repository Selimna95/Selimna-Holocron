import { brotliDecompressSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const GAMEDATA_COMMIT = "e96f00d4bcddb41d9bb93428a00ab7b4bb6fcdef";
const RAW_BASE = `https://raw.githubusercontent.com/swgoh-utils/gamedata/${GAMEDATA_COMMIT}`;

async function fetchResponse(file) {
  const response = await fetch(`${RAW_BASE}/${file}`);
  if (!response.ok) throw new Error(`Téléchargement SWGOH.GG gameData impossible (${file}): HTTP ${response.status}`);
  return response;
}

function collectionRows(payload, name) {
  const rows = Array.isArray(payload) ? payload : payload?.data;
  if (!Array.isArray(rows)) throw new Error(`Collection de jeu invalide : ${name}`);
  return rows;
}

async function fetchCollection(name) {
  const response = await fetchResponse(`${name}.json`);
  return collectionRows(await response.json(), name);
}

async function fetchCompressedCollection(name) {
  const response = await fetchResponse(`${name}.json.br`);
  const compressed = Buffer.from(await response.arrayBuffer());
  const decoded = brotliDecompressSync(compressed).toString("utf8");
  return collectionRows(JSON.parse(decoded), name);
}

function buildStatProgressionList(list) {
  const tables = {};
  for (const table of list) {
    if (!/^stattable_/.test(String(table.id || ""))) continue;
    const values = {};
    for (const stat of table.stat?.stat || []) {
      values[stat.unitStatId] = Number(stat.unscaledDecimalValue);
    }
    tables[table.id] = values;
  }
  return tables;
}

function buildGearData(list) {
  const data = {};
  for (const gear of list) {
    const stats = {};
    for (const stat of gear.equipmentStat?.stat || []) {
      stats[stat.unitStatId] = Number(stat.unscaledDecimalValue);
    }
    // Keep statless equipment IDs too: Crinolo must distinguish known gear
    // with no stat contribution from an unknown/mismatched equipment ID.
    data[gear.id] = { stats };
  }
  return data;
}

function buildModSetData(list) {
  const data = {};
  for (const set of list) {
    const stat = set.completeBonus?.stat;
    if (!stat) continue;
    data[set.id] = {
      id: stat.unitStatId,
      count: set.setCount,
      value: Number(stat.unscaledDecimalValue),
    };
  }
  return data;
}

function buildRelicData(list, statTables) {
  const data = {};
  for (const relic of list) {
    const stats = {};
    for (const stat of relic.stat?.stat || []) {
      stats[stat.unitStatId] = Number(stat.unscaledDecimalValue);
    }
    data[relic.id] = {
      stats,
      gms: statTables[relic.relicStatTable] || {},
    };
  }
  return data;
}

function parseSkills(list) {
  const skills = {};
  for (const skill of list) {
    const tiers = Array.isArray(skill.tier) ? skill.tier : [];
    const powerOverrideTags = {};
    tiers.forEach((tier, index) => {
      if (tier.powerOverrideTag) powerOverrideTags[index + 2] = tier.powerOverrideTag;
    });
    skills[skill.id] = {
      id: skill.id,
      maxTier: tiers.length + 1,
      powerOverrideTags,
      isZeta: tiers.at(-1)?.powerOverrideTag === "zeta",
    };
  }
  return skills;
}

function masteryModifierName(primaryStatId, tags) {
  const primaryStats = { 2: "strength", 3: "agility", 4: "intelligence" };
  const role = (Array.isArray(tags) ? tags : []).find(tag => /^role_(?!leader)[^_]+/.test(tag));
  return `${primaryStats[primaryStatId]}_${role}_mastery`;
}

function buildUnitData(units, skillList, statTables) {
  const skills = parseSkills(skillList);
  const growthByUnit = {};
  const baseUnits = [];

  for (const unit of units) {
    if (!unit.obtainable || unit.obtainableTime !== "0") continue;
    growthByUnit[unit.baseId] ||= {};
    growthByUnit[unit.baseId][unit.rarity] = statTables[unit.statProgressionId];
    if (unit.rarity === 1) baseUnits.push(unit);
  }

  const data = {};
  for (const unit of baseUnits) {
    const skillRefs = (unit.skillReference || []).map(skill => skills[skill.skillId]).filter(Boolean);
    if (unit.combatType === 1) {
      const gearLevels = {};
      for (const tier of unit.unitTier || []) {
        const stats = {};
        for (const stat of tier.baseStat?.stat || []) {
          stats[stat.unitStatId] = Number(stat.unscaledDecimalValue);
        }
        gearLevels[tier.tier] = {
          gear: Array.isArray(tier.equipmentSet) ? tier.equipmentSet : [],
          stats,
        };
      }
      const relic = {};
      for (const tierId of unit.relicDefinition?.relicTierDefinitionId || []) {
        relic[Number(String(tierId).slice(-2)) + 2] = tierId;
      }
      data[unit.baseId] = {
        combatType: 1,
        primaryStat: unit.primaryUnitStat,
        gearLvl: gearLevels,
        growthModifiers: growthByUnit[unit.baseId],
        skills: skillRefs,
        relic,
        masteryModifierID: masteryModifierName(unit.primaryUnitStat, unit.categoryId),
      };
    } else if (unit.combatType === 2) {
      const stats = {};
      for (const stat of unit.baseStat?.stat || []) {
        stats[stat.unitStatId] = Number(stat.unscaledDecimalValue);
      }
      const ship = {
        combatType: 2,
        primaryStat: unit.primaryUnitStat,
        stats,
        growthModifiers: growthByUnit[unit.baseId],
        skills: skillRefs,
        crewStats: statTables[unit.crewContributionTableId] || {},
        crew: [],
      };
      for (const crew of unit.crew || []) {
        ship.crew.push(crew.unitId);
        for (const skill of crew.skillReference || []) {
          if (skills[skill.skillId]) ship.skills.push(skills[skill.skillId]);
        }
      }
      data[unit.baseId] = ship;
    }
  }
  return data;
}

export async function buildCrinoloGameData() {
  const [equipment, relicTiers, skills, statProgression, units, modSets, versions] = await Promise.all([
    fetchCollection("equipment"),
    fetchCollection("relicTierDefinition"),
    fetchCollection("skill"),
    fetchCollection("statProgression"),
    fetchCompressedCollection("units"),
    fetchCollection("statModSet"),
    (async () => {
      const response = await fetchResponse("allVersions.json");
      return response.json();
    })(),
  ]);

  const statTables = buildStatProgressionList(statProgression);
  const gameData = {
    gearData: buildGearData(equipment),
    modSetData: buildModSetData(modSets),
    relicData: buildRelicData(relicTiers, statTables),
    unitData: buildUnitData(units, skills, statTables),
    crTables: {},
    gpTables: {},
    source: {
      repository: "swgoh-utils/gamedata",
      commit: GAMEDATA_COMMIT,
      gameVersion: versions.gameVersion || null,
      localeVersion: versions.localeVersion || null,
    },
  };

  if (!Object.keys(gameData.unitData).length || !Object.keys(gameData.gearData).length ||
      !Object.keys(gameData.relicData).length) {
    throw new Error("Le gameData Crinolo construit est incomplet.");
  }
  return gameData;
}

async function main() {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: node scripts/build-crinolo-gamedata.mjs <output.json>");
  const gameData = await buildCrinoloGameData();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(gameData), "utf8");
  const size = Buffer.byteLength(JSON.stringify(gameData));
  console.log(`Crinolo gameData prêt : ${Object.keys(gameData.unitData).length} unités, ${Object.keys(gameData.gearData).length} pièces, ${Object.keys(gameData.relicData).length} reliques, ${size} octets; source ${GAMEDATA_COMMIT}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
