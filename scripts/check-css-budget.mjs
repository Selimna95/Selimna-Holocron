import fs from 'node:fs';

const file = 'app.css';
const size = fs.statSync(file).size;
const budget = 120 * 1024;
console.log(`${file}: ${(size / 1024).toFixed(1)} Ko / ${(budget / 1024).toFixed(0)} Ko maximum`);
if (size > budget) process.exit(1);
