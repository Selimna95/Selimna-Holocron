import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function functionSources(file, names) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const found = new Map();
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && names.includes(node.id?.name)) {
      found.set(node.id.name, source.slice(node.start, node.end));
    }
  }
  const missing = names.filter(name => !found.has(name));
  if (missing.length) throw new Error(`Fonctions absentes de ${file}: ${missing.join(', ')}`);
  return names.map(name => found.get(name)).join('\n');
}

function loadProductionFunctions() {
  const coreNames = [
    'statNameFromAny', 'statValueFromAny', 'statObjectFromAny', 'normalizeMod',
    'compactKey', 'modSpeedMetrics', 'modPrimarySpeed', 'modTotalSpeed', 'holocronModScore',
  ];
  const core = functionSources('modules/core.js', coreNames);
  const sithari = functionSources('modules/sithari.js', ['sithariCanonicalSet']);
  const context = {};
  vm.runInNewContext(`${core}\n${sithari}`, context);
  return context;
}

const production = loadProductionFunctions();

describe('normalisation des mods (code de production)', () => {
  it('normalise les alias de champs et les secondaires sans perdre les valeurs', () => {
    const mod = production.normalizeMod({
      id: 'mod-1',
      slot_id: '7',
      set: { name: 'Critical Damage' },
      primaryStat: { name: 'Speed', display_value: '30' },
      secondaryStats: [
        { name: 'Speed', display_value: '15' },
        { name: 'Offense %', display_value: '5.5%' },
      ],
      level: '15',
    }, 4);
    expect(mod.game_id).toBe('mod-1');
    expect(mod.slot).toBe('7');
    expect(mod.set_name).toBe('Critical Damage');
    expect(mod.primary_stat).toBe('Speed');
    expect(mod.primary_value).toBe(30);
    expect(mod.secondary_1_stat).toBe('Speed');
    expect(mod.secondary_1_value).toBe(15);
    expect(mod.secondary_2_stat).toBe('Offense %');
    expect(mod.secondary_2_value).toBe(5.5);
  });

  it('canonicalise les alias de sets utilisés par Sith’ari', () => {
    expect(production.sithariCanonicalSet('Crit Chance')).toBe('CRITICALCHANCE');
    expect(production.sithariCanonicalSet('Critical Damage')).toBe('CRITICALDAMAGE');
    expect(production.sithariCanonicalSet('Health')).toBe('HEALTH');
  });

  it('calcule un score stable et valorise la vitesse totale (primaire + secondaire)', () => {
    const mod = {
      primary_stat: 'Speed', primary_value: 30,
      secondary_1_stat: 'Speed', secondary_1_value: 15,
      level: 15,
    };
    expect(production.holocronModScore(mod)).toBeCloseTo(96.75, 4);
  });
});


describe('gardes de sécurité du navigateur', () => {
  it('n’autorise que les URL HTTPS pour les attributs de ressource', async () => {
    const guardsPath = path.join(root, 'modules/runtime-guards.js');
    const source = fs.readFileSync(guardsPath, 'utf8');
    const fakeWindow = { location: { href: 'https://holocron.test/index.html' } };
    vm.runInNewContext(source, { window: fakeWindow, URL, AbortController, DOMException, setTimeout, clearTimeout, fetch });
    expect(fakeWindow.safeUrl('https://cdn.example/image.png')).toBe('https://cdn.example/image.png');
    expect(fakeWindow.safeUrl('javascript:alert(1)')).toBe('');
    expect(fakeWindow.safeUrl('http://cdn.example/image.png')).toBe('');
    expect(fakeWindow.safeUrl('https://cdn.example/" onerror="alert(1)')).not.toContain('"');
  });

  it('refuse HTTP pour un relais distant et accepte localhost pour le développement', () => {
    const source = fs.readFileSync(path.join(root, 'modules/runtime-guards.js'), 'utf8');
    const fakeWindow = { location: { href: 'https://holocron.test/index.html' } };
    vm.runInNewContext(source, { window: fakeWindow, URL, AbortController, DOMException, setTimeout, clearTimeout, fetch });
    expect(fakeWindow.normalizeRelayUrl('http://relay.example')).toBe('');
    expect(fakeWindow.normalizeRelayUrl('https://relay.example/')).toBe('https://relay.example');
    expect(fakeWindow.normalizeRelayUrl('http://localhost:8787')).toBe('http://localhost:8787');
  });
});
