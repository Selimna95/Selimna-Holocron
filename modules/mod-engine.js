/* Selimna's Holocron — shared mod/stat engine.
 * This file is the single source of truth for stat identity and units.
 * Game formulas are added only after their source scales and profile inputs are verified.
 */
(function (root) {
  'use strict';

  const STAT_DEFINITIONS = Object.freeze({
    1:  { key: 'health', name: 'Health', unit: 'flat' },
    5:  { key: 'speed', name: 'Speed', unit: 'flat' },
    16: { key: 'criticalDamage', name: 'Critical Damage', unit: 'percentagePoints' },
    17: { key: 'potency', name: 'Potency', unit: 'percentagePoints' },
    18: { key: 'tenacity', name: 'Tenacity', unit: 'percentagePoints' },
    21: { key: 'physicalCriticalChance', name: 'Physical Critical Chance', unit: 'percentagePoints' },
    22: { key: 'specialCriticalChance', name: 'Special Critical Chance', unit: 'percentagePoints' },
    23: { key: 'armor', name: 'Armor', unit: 'percentagePoints' },
    24: { key: 'resistance', name: 'Resistance', unit: 'percentagePoints' },
    25: { key: 'armorPenetration', name: 'Armor Penetration', unit: 'percentagePoints' },
    26: { key: 'resistancePenetration', name: 'Resistance Penetration', unit: 'percentagePoints' },
    28: { key: 'protection', name: 'Protection', unit: 'flat' },
    31: { key: 'physicalDamage', name: 'Physical Damage', unit: 'percentagePoints' },
    32: { key: 'specialDamage', name: 'Special Damage', unit: 'percentagePoints' },
    33: { key: 'physicalAccuracy', name: 'Physical Accuracy', unit: 'percentagePoints' },
    34: { key: 'specialAccuracy', name: 'Special Accuracy', unit: 'percentagePoints' },
    35: { key: 'physicalCriticalAvoidance', name: 'Physical Critical Avoidance', unit: 'percentagePoints' },
    36: { key: 'specialCriticalAvoidance', name: 'Special Critical Avoidance', unit: 'percentagePoints' },
    35: { key: 'physicalCriticalAvoidance', name: 'Physical Critical Avoidance', unit: 'percentagePoints' },
    36: { key: 'specialCriticalAvoidance', name: 'Special Critical Avoidance', unit: 'percentagePoints' },
    37: { key: 'physicalAccuracy', name: 'Physical Accuracy', unit: 'flat' },
    38: { key: 'specialAccuracy', name: 'Special Accuracy', unit: 'flat' },
    39: { key: 'physicalCriticalAvoidance', name: 'Physical Critical Avoidance', unit: 'flat' },
    40: { key: 'specialCriticalAvoidance', name: 'Special Critical Avoidance', unit: 'flat' },
    41: { key: 'offense', name: 'Offense', unit: 'flat' },
    42: { key: 'defense', name: 'Defense', unit: 'flat' },
    45: { key: 'criticalChance', name: 'Critical Chance', unit: 'flat' },
    47: { key: 'criticalAvoidance', name: 'Critical Avoidance', unit: 'flat' },
    48: { key: 'offense', name: 'Offense', unit: 'percentagePoints' },
    49: { key: 'defense', name: 'Defense', unit: 'percentagePoints' },
    53: { key: 'criticalChance', name: 'Critical Chance', unit: 'percentagePoints' },
    54: { key: 'criticalAvoidance', name: 'Critical Avoidance', unit: 'percentagePoints' },
    55: { key: 'health', name: 'Health', unit: 'percentagePoints' },
    56: { key: 'protection', name: 'Protection', unit: 'percentagePoints' },
    57: { key: 'speed', name: 'Speed', unit: 'percentagePoints' }
  });

  const SET_DEFINITIONS = Object.freeze({
    health: { name: 'Health', required: 2, minimum: 5, maximum: 10 },
    defense: { name: 'Defense', required: 2, minimum: 12.5, maximum: 25 },
    criticalChance: { name: 'Critical Chance', required: 2, minimum: 4, maximum: 8 },
    tenacity: { name: 'Tenacity', required: 2, minimum: 10, maximum: 20 },
    potency: { name: 'Potency', required: 2, minimum: 7.5, maximum: 15 },
    offense: { name: 'Offense', required: 4, minimum: 7.5, maximum: 15 },
    speed: { name: 'Speed', required: 4, minimum: 5, maximum: 10 },
    criticalDamage: { name: 'Critical Damage', required: 4, minimum: 15, maximum: 30 }
  });

  const SET_ALIASES = Object.freeze({
    '1': 'health', health: 'health', healthset: 'health',
    '2': 'offense', offense: 'offense', offenseset: 'offense',
    '3': 'defense', defense: 'defense', defenseset: 'defense',
    '4': 'speed', speed: 'speed', speedset: 'speed',
    '5': 'criticalChance', criticalchance: 'criticalChance', critchance: 'criticalChance',
    '6': 'criticalDamage', criticaldamage: 'criticalDamage', critdamage: 'criticalDamage',
    '7': 'potency', potency: 'potency',
    '8': 'tenacity', tenacity: 'tenacity'
  });

  const NORMALIZED_MOD_CACHE = new Map();

  const NAME_ALIASES = Object.freeze({
    health: 'health', maxhealth: 'health',
    protection: 'protection', maxprotection: 'protection',
    speed: 'speed',
    offense: 'offense', attack: 'offense',
    defense: 'defense',
    potency: 'potency', tenacity: 'tenacity',
    criticalchance: 'criticalChance', critchance: 'criticalChance',
    criticalavoidance: 'criticalAvoidance', critavoidance: 'criticalAvoidance',
    criticaldamage: 'criticalDamage', critdamage: 'criticalDamage',
    physicaldamage: 'physicalDamage', specialdamage: 'specialDamage',
    armor: 'armor', resistance: 'resistance',
    armorpenetration: 'armorPenetration', resistancepenetration: 'resistancePenetration',
    physicalaccuracy: 'physicalAccuracy', specialaccuracy: 'specialAccuracy',
    physicalcriticalavoidance: 'physicalCriticalAvoidance',
    specialcriticalavoidance: 'specialCriticalAvoidance',
    physicalcriticalchance: 'physicalCriticalChance',
    specialcriticalchance: 'specialCriticalChance'
  });

  function numeric(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (value == null || value === '') return null;
    const text = String(value).trim().replace(/\s/g, '').replace(',', '.');
    const match = text.match(/^[-+]?(?:\d+\.?\d*|\.\d+)/);
    const parsed = match ? Number(match[0]) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }

  function compact(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function normalizeStat(input, explicitValue) {
    const raw = input && typeof input === 'object' ? input : { name: input, value: explicitValue };
    const nested = raw.stat && typeof raw.stat === 'object' ? raw.stat : raw;
    const rawId = nested.unitStatId ?? nested.statId ?? nested.stat_id ??
      nested.unitStat?.id ?? nested.unitStat ?? raw.unitStatId ?? raw.statId ?? raw.stat_id;
    const id = numeric(rawId);
    const known = id != null ? STAT_DEFINITIONS[id] : null;
    const rawName = nested.name ?? (typeof nested.stat === 'string' ? nested.stat : null) ??
      nested.displayName ?? raw.name ?? raw.displayName ?? '';
    const display = nested.displayValue ?? nested.display_value ?? raw.displayValue ?? raw.display_value;
    const sourceValue = explicitValue ?? nested.value ?? nested.amount ?? nested.unscaledDecimalValue ??
      nested.unscaled_decimal_value ?? raw.value ?? raw.amount ?? raw.unscaledDecimalValue ??
      raw.unscaled_decimal_value ?? display;
    let key = known?.key || NAME_ALIASES[compact(rawName)] || null;
    let unit = known?.unit || null;
    if (!known && rawName && /%|percent|percentage/i.test(String(rawName))) unit = 'percentagePoints';
    if (!known && rawName && !unit) unit = 'flat';
    let value = numeric(sourceValue);
    const isUnscaled = nested.unscaledDecimalValue != null || nested.unscaled_decimal_value != null ||
      raw.unscaledDecimalValue != null || raw.unscaled_decimal_value != null;
    if (value != null && isUnscaled) {
      value /= 100000000;
      if (unit === 'percentagePoints') value *= 100;
    } else if (value != null && display != null && /%/.test(String(display))) {
      unit = 'percentagePoints';
    }
    return Object.freeze({
      id: id == null ? null : id,
      key,
      name: known?.name || (key ? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()) : String(rawName || '').trim()),
      unit: unit || 'unknown',
      value,
      sourceValue: numeric(sourceValue),
      source: id != null ? 'comlink' : 'label',
      complete: !!key && !!unit && value != null
    });
  }

  function canonicalBaseKey(name) {
    return NAME_ALIASES[compact(name)] || null;
  }

  function calculateSpeed(baseSpeed, mods) {
    const base = numeric(baseSpeed);
    if (base == null) return { complete: false, total: null, modSpeed: 0, setBonus: 0, hasFourPieceSpeedSet: false };
    let modSpeed = 0;
    let speedPercent = 0;
    for (const rawMod of Array.isArray(mods) ? mods : []) {
      const mod = rawMod?.primary?.key ? rawMod : normalizeMod(rawMod);
      if (!mod) continue;
      modSpeed += speedMetrics(mod).total;
      for (const stat of [mod.primary, ...(mod.secondaries || [])]) {
        if (stat?.key === 'speed' && stat.unit === 'percentagePoints') speedPercent += stat.value || 0;
      }
    }
    const setBonusPercent = calculateSetBonuses(mods).speed || 0;
    const setBonus = setBonusPercent ? Math.floor(base * setBonusPercent / 100) : 0;
    const modPercent = speedPercent - setBonusPercent;
    return {
      complete: true,
      total: base + modSpeed + setBonus + base * modPercent / 100,
      modSpeed,
      setBonus,
      hasFourPieceSpeedSet: setBonusPercent > 0
    };
  }

  function calculateFinalStats(baseStats, mods, level = 85) {
    if (!baseStats || typeof baseStats !== 'object' || Array.isArray(baseStats)) {
      return { stats: null, complete: false, missing: ['base_stats'] };
    }
    const profile = baseStats.base_stats && typeof baseStats.base_stats === 'object' ? baseStats : null;
    const sourceBase = profile ? profile.base_stats : baseStats;
    const expandedBase = { ...sourceBase };
    if (profile && profile.current_stats && typeof profile.current_stats === 'object') {
      for (const [name, value] of Object.entries(profile.current_stats)) {
        const key = canonicalBaseKey(name);
        if (key && !Object.keys(expandedBase).some(existing => canonicalBaseKey(existing) === key)) {
          const current = numeric(value);
          const delta = numeric(profile.mod_stat_diffs?.[name]) ?? 0;
          if (current != null) expandedBase[name] = current - delta;
        }
      }
    }
    level = numeric(level) ?? numeric(profile?.level) ?? 85;
    const base = {};
    for (const [name, value] of Object.entries(expandedBase)) {
      const key = canonicalBaseKey(name);
      const amount = numeric(value);
      if (key && amount != null) base[key] = amount;
    }
    const result = { ...expandedBase };
    const totals = {};
    const missing = [];
    const add = (key, value) => { totals[key] = (totals[key] || 0) + value; };

    for (const rawMod of Array.isArray(mods) ? mods : []) {
      const mod = rawMod?.primary?.key ? rawMod : normalizeMod(rawMod);
      if (!mod) { missing.push('mod:invalid'); continue; }
      const entries = [mod.primary, ...(mod.secondaries || [])];
      for (const stat of entries) {
        if (!stat || stat.value == null) continue;
        if (!stat.key || !['flat', 'percentagePoints'].includes(stat.unit)) {
          missing.push('stat:unknown');
          continue;
        }
        add(stat.key + ':' + stat.unit, stat.value);
      }
    }

    const setBonuses = calculateSetBonuses(mods);
    for (const [set, value] of Object.entries(setBonuses)) {
      const target = ({
        health: 'health', offense: 'offense', defense: 'defense', speed: 'speed',
        criticalChance: 'criticalChance', criticalDamage: 'criticalDamage',
        potency: 'potency', tenacity: 'tenacity'
      })[set];
      if (target) add(target + ':percentagePoints', value);
    }

    const get = key => base[key];
    const has = key => Number.isFinite(get(key));
    const pct = key => (totals[key + ':percentagePoints'] || 0) / 100;
    const flat = key => totals[key + ':flat'] || 0;
    const setResult = (key, value) => {
      const displayName = ({
        health: 'Health', protection: 'Protection', speed: 'Speed',
        physicalDamage: 'Physical Damage', specialDamage: 'Special Damage',
        potency: 'Potency', tenacity: 'Tenacity', armor: 'Armor', resistance: 'Resistance',
        criticalDamage: 'Critical Damage'
      })[key];
      if (displayName) result[displayName] = value;
    };

    for (const key of ['health', 'protection']) {
      if (flat(key) || pct(key)) {
        if (!has(key)) missing.push(key);
        else setResult(key, get(key) + flat(key) + get(key) * pct(key));
      }
    }
    if (flat('speed') || pct('speed')) {
      if (!has('speed')) missing.push('speed');
      else setResult('speed', calculateSpeed(get('speed'), mods).total);
    }

    const offenseFlat = flat('offense');
    const offenseRatio = pct('offense');
    for (const key of ['physicalDamage', 'specialDamage']) {
      const directFlat = flat(key);
      const directRatio = pct(key);
      if (offenseFlat || offenseRatio || directFlat || directRatio) {
        if (!has(key)) missing.push(key);
        else setResult(key, get(key) + offenseFlat + directFlat + get(key) * (offenseRatio + directRatio));
      }
    }

    const defenseFlat = flat('defense');
    const defenseRatio = pct('defense');
    const characterLevel = numeric(level);
    if (defenseFlat || defenseRatio) {
      if (!Number.isFinite(characterLevel) || characterLevel <= 0) missing.push('level');
      else {
        const levelEffect = characterLevel * 7.5;
        for (const key of ['armor', 'resistance']) {
          if (!has(key)) { missing.push(key); continue; }
          const displayPercent = get(key) > 1 ? get(key) : get(key) * 100;
          const ratio = displayPercent / 100;
          if (ratio < 0 || ratio >= 1) { missing.push(key + ':invalid-base'); continue; }
          const baseRating = ratio * levelEffect / (1 - ratio);
          const finalRating = baseRating + defenseFlat + baseRating * defenseRatio;
          const finalPercent = finalRating / (levelEffect + finalRating) * 100;
          setResult(key, finalPercent);
        }
      }
    }

    for (const key of ['armor', 'resistance']) {
      const direct = totals[key + ':percentagePoints'] || 0;
      if (direct) {
        if (!has(key)) missing.push(key);
        else {
          const name = key === 'armor' ? 'Armor' : 'Resistance';
          const current = Number(result[name] ?? get(key));
          result[name] = current + direct;
        }
      }
    }

    for (const key of ['potency', 'tenacity', 'criticalDamage']) {
      if (pct(key) || flat(key)) {
        if (!has(key)) missing.push(key);
        else setResult(key, get(key) + flat(key) + pct(key));
      }
    }

    const criticalChancePoints = (totals['criticalChance:percentagePoints'] || 0) + flat('criticalChance') / 24;
    const criticalAvoidancePoints = (totals['criticalAvoidance:percentagePoints'] || 0) + flat('criticalAvoidance') / 24;
    for (const [key, shared] of [
      ['physicalCriticalChance', criticalChancePoints],
      ['specialCriticalChance', criticalChancePoints],
      ['physicalCriticalAvoidance', criticalAvoidancePoints],
      ['specialCriticalAvoidance', criticalAvoidancePoints]
    ]) {
      const amount = shared + (totals[key + ':percentagePoints'] || 0);
      if (!amount && !flat(key)) continue;
      if (!has(key)) { missing.push(key); continue; }
      const ratingPoints = flat(key) / 24;
      const displayName = ({
        physicalCriticalChance: 'Physical Critical Chance',
        specialCriticalChance: 'Special Critical Chance',
        physicalCriticalAvoidance: 'Physical Critical Avoidance',
        specialCriticalAvoidance: 'Special Critical Avoidance'
      })[key];
      result[displayName] = get(key) + amount + ratingPoints;
    }

    return { stats: result, complete: missing.length === 0, missing: [...new Set(missing)] };
  }

  function canonicalSet(value) {
    if (value && typeof value === 'object') {
      value = value.name ?? value.id ?? value.setId ?? value.modSetId ?? value.set ?? value.definitionId;
    }
    const raw = String(value ?? '').trim();
    if (/^[1-8][1-7][0-6]$/.test(raw)) return SET_ALIASES[raw[0]] || null;
    const key = compact(raw).replace(/modset$/, '').replace(/set$/, '');
    return SET_ALIASES[key] || null;
  }

  function canonicalSetFromMod(mod) {
    if (!mod || typeof mod !== 'object') return null;
    const direct = mod.set_name ?? mod.set ?? mod.setName ?? mod.setId ?? mod.modSetId ?? mod.mod_set_id;
    if (direct != null) {
      const normalized = canonicalSet(direct);
      if (normalized) return normalized;
    }
    for (const parentKey of ['statMod', 'stat_mod', 'definition', 'modDefinition', 'mod_definition']) {
      const parent = mod[parentKey];
      if (parent && typeof parent === 'object') {
        const normalized = canonicalSet(parent.setId ?? parent.modSetId ?? parent.set_id ?? parent.set);
        if (normalized) return normalized;
      }
    }
    return canonicalSet(mod.definitionId ?? mod.definition_id ?? mod.defId);
  }

  function calculateSetBonuses(mods) {
    const grouped = new Map();
    for (const mod of Array.isArray(mods) ? mods : []) {
      const set = canonicalSetFromMod(mod);
      const definition = set && SET_DEFINITIONS[set];
      if (!definition) continue;
      if (!grouped.has(set)) grouped.set(set, []);
      grouped.get(set).push(numeric(mod?.level) ?? 0);
    }

    const bonuses = {};
    for (const [set, levels] of grouped) {
      const definition = SET_DEFINITIONS[set];
      levels.sort((a, b) => b - a);
      let bonus = 0;
      for (let offset = 0; offset + definition.required <= levels.length; offset += definition.required) {
        const group = levels.slice(offset, offset + definition.required);
        bonus += group.every(level => level >= 15) ? definition.maximum : definition.minimum;
      }
      if (bonus) bonuses[set] = bonus;
    }
    return Object.freeze(bonuses);
  }

  function speedMetrics(mod) {
    const normalized = mod?.primary?.key ? mod : normalizeMod(mod);
    if (!normalized) return { secondary: null, primary: false, primarySpeed: 0, total: 0 };
    const primary = normalized.primary?.key === 'speed' && normalized.primary.unit === 'flat';
    const primarySpeed = primary ? (normalized.primary.value || 0) : 0;
    const speedSecondary = (normalized.secondaries || []).find(stat => stat.key === 'speed' && stat.unit === 'flat');
    const secondary = speedSecondary && Number.isFinite(speedSecondary.value) ? speedSecondary.value : null;
    return {
      secondary,
      primary,
      primarySpeed,
      total: primarySpeed + (secondary || 0)
    };
  }

  function canonicalStatKey(value) {
    const stat = normalizeStat(value);
    if (!stat.key) return compact(value).toUpperCase();
    const suffix = stat.unit === 'percentagePoints' &&
      ['offense', 'defense', 'health', 'protection'].includes(stat.key) ? 'PERCENT' : '';
    return (stat.key + suffix).toUpperCase();
  }

  function scoreMod(mod) {
    const normalized = mod?.primary?.key ? mod : normalizeMod(mod);
    if (!normalized) return 0;
    const weights = {
      'offense:flat': 0.32, 'offense:percentagePoints': 0.42,
      'health:flat': 0.12, 'health:percentagePoints': 0.22,
      'protection:flat': 0.10, 'protection:percentagePoints': 0.18,
      'potency:percentagePoints': 0.24, 'tenacity:percentagePoints': 0.20,
      'criticalChance:percentagePoints': 0.20, 'criticalDamage:percentagePoints': 0.22,
      'criticalAvoidance:percentagePoints': 0.18
    };
    const primarySpeed = normalized.primary?.key === 'speed' ? (normalized.primary.value || 0) : 0;
    const secondarySpeed = (normalized.secondaries || [])
      .filter(stat => stat.key === 'speed').reduce((sum, stat) => sum + (stat.value || 0), 0);
    let score = (primarySpeed + secondarySpeed) * 1.8;
    for (const stat of normalized.secondaries || []) {
      const weight = weights[stat.key + ':' + stat.unit];
      if (weight != null && stat.value != null) score += stat.value * weight;
    }
    const level = numeric(normalized.level) ?? 0;
    return score + Math.max(0, level - 12) * 0.25;
  }

  function normalizeMod(mod) {
    if (!mod || typeof mod !== 'object') return null;
    const cacheKey = JSON.stringify(mod);
    const cached = NORMALIZED_MOD_CACHE.get(cacheKey);
    if (cached) return cached;
    const primaryRaw = mod.primary_stat ?? mod.primaryStat ?? mod.primary;
    const primary = normalizeStat(primaryRaw, mod.primary_value ?? mod.primaryValue);
    const secondaries = [];
    const rawSecondaries = mod.secondary_stats ?? mod.secondaryStats ?? mod.secondary;
    if (Array.isArray(rawSecondaries)) {
      rawSecondaries.slice(0, 4).forEach((entry, index) => secondaries.push(normalizeStat(entry,
        entry?.value ?? entry?.amount ?? mod[`secondary_${index + 1}_value`])));
    } else {
      for (let i = 1; i <= 4; i++) {
        const name = mod[`secondary_${i}_stat`];
        if (name) secondaries.push(normalizeStat(name, mod[`secondary_${i}_value`]));
      }
    }
    const normalized = Object.freeze({
      id: String(mod.game_id ?? mod.id ?? mod.modId ?? mod.uid ?? ''),
      level: numeric(mod.level) ?? null,
      set: canonicalSetFromMod(mod),
      setName: SET_DEFINITIONS[canonicalSetFromMod(mod)]?.name || null,
      slot: mod.slot ?? mod.slot_id ?? mod.slotId ?? null,
      pips: numeric(mod.pips ?? mod.dots ?? mod.dotCount ?? mod.rarity) ?? null,
      primary,
      secondaries: Object.freeze(secondaries),
      complete: !!primary.key && primary.complete && secondaries.every(stat => stat.complete)
    });
    NORMALIZED_MOD_CACHE.set(cacheKey, normalized);
    if (NORMALIZED_MOD_CACHE.size > 5000) NORMALIZED_MOD_CACHE.delete(NORMALIZED_MOD_CACHE.keys().next().value);
    return normalized;
  }

  const api = Object.freeze({
    version: '0.3.0',
    statDefinitions: STAT_DEFINITIONS,
    setDefinitions: SET_DEFINITIONS,
    canonicalSet,
    canonicalSetFromMod,
    calculateSetBonuses,
    calculateFinalStats,
    scoreMod,
    speedMetrics,
    calculateSpeed,
    canonicalStatKey,
    normalizeStat,
    normalizeMod
  });

  root.HolocronModEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
