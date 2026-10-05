#!/usr/bin/env node
// Split pipeline/seed/todo.json into research batches for the agent workflow.
//   node pipeline/tools/make-batches.mjs [--size 12] [--exclude id,id]
// Cons that share a website (multi-city brands) stay together so one agent learns the
// site once; batches holding the biggest cons are scheduled first.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const SIZE = Number(opt('size', 12));
const exclude = new Set((opt('exclude', '') || '').split(',').filter(Boolean));
const done = new Set(readdirSync(join(ROOT, 'pipeline', 'research')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
const todo = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'seed', 'todo.json'), 'utf8')).filter((c) => !done.has(c.id) && !exclude.has(c.id));

const RANK = { major: 0, large: 1, mid: 2, small: 3 };
const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const hostCount = new Map();
for (const c of todo) hostCount.set(host(c.url), (hostCount.get(host(c.url)) || 0) + 1);
const family = (c) => {
  const h = host(c.url);
  return hostCount.get(h) > 1 && !/facebook|instagram/.test(h) ? `0:${h}` : `1:${c.country}:${c.region}`;
};
todo.sort((a, b) => family(a).localeCompare(family(b)) || (RANK[a.size] ?? 9) - (RANK[b.size] ?? 9) || a.name.localeCompare(b.name));

const batches = [];
for (let i = 0; i < todo.length; i += SIZE) batches.push(todo.slice(i, i + SIZE));
const prio = (b) => Math.min(...b.map((c) => RANK[c.size] ?? 9)) * 100 + b.filter((c) => c.size === 'small').length;
batches.sort((a, b) => prio(a) - prio(b));
// One plain-text work list per batch for the research workflow (pipeline/workflows/research.js).
const dir = join(ROOT, 'pipeline', 'seed', 'batches');
mkdirSync(dir, { recursive: true });
for (const f of readdirSync(dir)) if (/^batch-\d+\.txt$/.test(f)) rmSync(join(dir, f));
batches.forEach((b, i) => {
  const lines = b.map(
    (c, k) =>
      `${k + 1}. id=${c.id} | ${c.name} | ${c.url} | ${[c.city, c.region, c.country].filter(Boolean).join(', ')} | types: ${c.types.join(', ')}${
        c.organizer ? ` | organizer: ${c.organizer}` : ''
      }${c.note ? ` | note: ${c.note}` : ''}`,
  );
  writeFileSync(join(dir, `batch-${String(i + 1).padStart(2, '0')}.txt`), lines.join('\n') + '\n');
});
console.log(`${todo.length} cons in ${batches.length} batches of up to ${SIZE}: pipeline/seed/batches/batch-01..${String(batches.length).padStart(2, '0')}.txt`);
