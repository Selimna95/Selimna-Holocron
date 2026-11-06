import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../modules/core.js', import.meta.url), 'utf8');
const start = source.indexOf('function kyberPercentageEntries');
const end = source.indexOf('\nfunction kyberSetComposition', start);
assert.ok(start >= 0 && end > start, 'Kyber percentage parser must exist');
const sandbox = {
  kyberNumber(value) {
    const raw = String(value ?? '').trim();
    const normalized = /^[+-]?\\d+,\\d+$/.test(raw) ? raw.replace(',', '.') : raw.replace(/,/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
};
vm.runInNewContext(source.slice(start, end) + '\nthis.parseRows = kyberPercentageEntries; this.parsePrimaries = kyberPrimaryDistribution;', sandbox);

const splitRows = [
  'Primary Set', 'Speed', '78.7%', 'Offense', '4.4%',
  'Secondary Set', 'Tenacity', '39.6%',
  'Specific Mod Sets', 'Speed + Tenacity', '39.6%', 'Speed + Potency', '20.8%',
  'Arrow', 'Speed', '95.97%', 'Offense', '1.72%',
  'Triangle', 'Offense', '52.87%'
];
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.parseRows(splitRows, 1, 5))),
  [{ name: 'Speed', weight: 0.787 }, { name: 'Offense', weight: 0.044 }]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.parseRows(splitRows, 9, 13))),
  [{ name: 'Speed + Tenacity', weight: 0.396 }, { name: 'Speed + Potency', weight: 0.208 }]
);
assert.deepEqual(
  JSON.parse(JSON.stringify(sandbox.parsePrimaries(splitRows, 'Arrow'))),
  { Speed: 0.9597, Offense: 0.0172 }
);
console.log('Kyber split-percentage parser tests passed.');
