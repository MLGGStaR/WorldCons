#!/usr/bin/env node
// List guests in data/cons.json that have no photo, as task files for the fix-up workflow:
//   node pipeline/tools/photo-gaps.mjs [--size 25]
// writes pipeline/seed/fixup/photos-NN.txt (guest id | name | known for | category | con | guest page)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--size');
const SIZE = i >= 0 ? Number(process.argv[i + 1]) : 25;
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'cons.json'), 'utf8'));
const conOf = new Map();
for (const c of data.cons) for (const g of c.g) if (!conOf.has(g)) conOf.set(g, c);
const gaps = Object.entries(data.guests)
  .filter(([, g]) => !g.p)
  .map(([id, g]) => {
    const c = conOf.get(id) || {};
    return `${id} | ${g.n} | ${g.k || ''} | ${g.c} | ${c.series || ''} | ${c.guestsPage || c.url || ''}`;
  });
const dir = join(ROOT, 'pipeline', 'seed', 'fixup');
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (/^photos-\d+\.txt$/.test(f)) rmSync(join(dir, f));
let n = 0;
for (let k = 0; k < gaps.length; k += SIZE) writeFileSync(join(dir, `photos-${String(++n).padStart(2, '0')}.txt`), gaps.slice(k, k + SIZE).join('\n') + '\n');
console.log(`${gaps.length} guests without a photo -> ${n} task files`);
