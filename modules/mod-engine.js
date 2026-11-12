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
    specialcriticalavoidance: 'specialCriticalAvoidance'
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

  function normalizeMod(mod) {
    if (!mod || typeof mod !== 'object') return null;
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
    return Object.freeze({
      id: String(mod.game_id ?? mod.id ?? mod.modId ?? mod.uid ?? ''),
      level: numeric(mod.level) ?? null,
      set: mod.set_name ?? mod.set ?? mod.setName ?? mod.setId ?? null,
      slot: mod.slot ?? mod.slot_id ?? mod.slotId ?? null,
      pips: numeric(mod.pips ?? mod.dots ?? mod.dotCount ?? mod.rarity) ?? null,
      primary,
      secondaries: Object.freeze(secondaries),
      complete: !!primary.key && primary.complete && secondaries.every(stat => stat.complete)
    });
  }

  const api = Object.freeze({
    version: '0.1.0',
    statDefinitions: STAT_DEFINITIONS,
    normalizeStat,
    normalizeMod
  });

  root.HolocronModEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
