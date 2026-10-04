#!/usr/bin/env node
// Merge discovery output into pipeline/seed/series.json with stable ids, dropping
// duplicates and anything already researched.
//   node pipeline/tools/make-seed.mjs <discovery.json> [more.json ...]
// Each input is an array of { region, cons: [...] } (the discovery workflow's return value).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES, REGIONS } from '../../js/geo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'pipeline', 'seed', 'series.json');

export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

const normUrl = (u) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch {
    return String(u || '').toLowerCase();
  }
};

const SIZE_RANK = { major: 0, large: 1, mid: 2, small: 3 };
const existing = new Set(
  existsSync(join(ROOT, 'pipeline', 'research'))
    ? readdirSync(join(ROOT, 'pipeline', 'research')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))
    : [],
);
const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];

const all = [];
for (const f of process.argv.slice(2)) {
  for (const block of JSON.parse(readFileSync(f, 'utf8'))) for (const c of block.cons || []) all.push({ ...c, _region: block.region });
}

const byKey = new Map();
const dropped = [];
for (const c of [...prior, ...all]) {
  const country = String(c.country || '').toUpperCase();
  if (!COUNTRIES[country]) {
    dropped.push(`${c.name}: bad country ${c.country}`);
    continue;
  }
  let region = String(c.region || '').toUpperCase();
  if (REGIONS[country] && !REGIONS[country][region]) region = '';
  const base = slug(c.name);
  const city = slug(c.city);
  // Same name in the same city = same con. Same URL + city = same con.
  const key1 = `${base}|${city}`;
  const key2 = `${normUrl(c.url)}|${city}`;
  const hit = byKey.get(key1) || byKey.get(key2);
  if (hit) {
    if ((SIZE_RANK[c.size] ?? 9) < (SIZE_RANK[hit.size] ?? 9)) hit.size = c.size;
    if (!hit.note && c.note) hit.note = c.note;
    continue;
  }
  const rec = {
    id: c.id || base,
    name: c.name,
    url: c.url,
    city: c.city,
    region,
    country,
    types: c.types,
    month: c.month || 0,
    size: c.size,
    organizer: c.organizer || '',
    note: c.note || '',
  };
  byKey.set(key1, rec);
  byKey.set(key2, rec);
}

// Unique ids: append the city when two different cons share a name slug.
const recs = [...new Set(byKey.values())];
const count = new Map();
for (const r of recs) count.set(r.id, (count.get(r.id) || 0) + 1);
const used = new Set();
for (const r of recs) {
  if (count.get(r.id) > 1 && !r.id.includes(slug(r.city))) r.id = `${r.id}-${slug(r.city)}`;
  let id = r.id;
  for (let n = 2; used.has(id); n++) id = `${r.id}-${n}`;
  r.id = id;
  used.add(id);
}

const fresh = recs.filter((r) => !existing.has(r.id));
fresh.sort((a, b) => a.country.localeCompare(b.country) || a.region.localeCompare(b.region) || (SIZE_RANK[a.size] ?? 9) - (SIZE_RANK[b.size] ?? 9) || a.name.localeCompare(b.name));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(recs, null, 1));
writeFileSync(join(dirname(OUT), 'todo.json'), JSON.stringify(fresh, null, 1));
const bySize = {};
for (const r of recs) bySize[r.size] = (bySize[r.size] || 0) + 1;
console.log(`${recs.length} unique cons (${JSON.stringify(bySize)}); ${fresh.length} not yet researched; ${dropped.length} dropped`);
if (dropped.length) console.log(dropped.join('\n'));
