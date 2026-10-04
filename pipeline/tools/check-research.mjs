#!/usr/bin/env node
// Validate research files written by agents (see pipeline/RESEARCH.md).
//   node pipeline/tools/check-research.mjs pipeline/research/<id>.json [...more]
//   node pipeline/tools/check-research.mjs --all
// Prints OK or a list of problems per file; exits 1 when any file has errors.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES, REGIONS } from '../../js/geo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TYPES = ['comics', 'anime', 'games', 'tabletop', 'scifi', 'horror', 'pop', 'toys', 'cosplay', 'furry'];
export const CATS = ['actor', 'voice', 'comics', 'animation', 'author', 'cosplay', 'creator', 'gaming', 'music', 'sports', 'other'];
const GUEST_STATES = ['announced', 'none-yet', 'none', 'unavailable'];
const WINDOW_START = '2026-10-05';
const WINDOW_END = '2027-12-31';

const extractCache = new Map();
function loadExtract(file) {
  if (!extractCache.has(file)) {
    const p = join(ROOT, file);
    extractCache.set(file, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return extractCache.get(file);
}

export function resolveCover(cover) {
  if (!cover || !cover.file || !cover.key) return null;
  const x = loadExtract(cover.file);
  if (!x) return null;
  const key = cover.key;
  if (key === 'og') return x.ogImage || null;
  if (key === 'twitter') return x.twitterImage || null;
  const m = /^(hero|logo):(\d+)$/.exec(key);
  if (!m) return null;
  const list = m[1] === 'hero' ? x.heroImages : x.logos;
  return (list && list[Number(m[2])] && list[Number(m[2])].img) || null;
}

export function checkFile(path) {
  const errors = [];
  const warn = [];
  let d;
  try {
    d = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { errors: [`not valid JSON: ${e.message}`], warn };
  }
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
  const id = basename(path, '.json');
  if (d.id !== id) errors.push(`id "${d.id}" must match the file name "${id}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.id || '')) errors.push('id must be lowercase kebab-case');
  if (!d.name) errors.push('name is required');
  if (!/^https?:\/\//.test(d.url || '')) errors.push('url must be the official http(s) URL');
  if (!['active', 'inactive'].includes(d.status)) errors.push('status must be "active" or "inactive"');
  if (!Array.isArray(d.types) || !d.types.length) errors.push('types must be a non-empty array');
  else for (const t of d.types) if (!TYPES.includes(t)) errors.push(`unknown type "${t}" (use ${TYPES.join(', ')})`);
  if (d.types && d.types.length > 4) warn.push('more than 4 types');
  if (typeof d.blurb !== 'string' || !d.blurb.trim()) errors.push('blurb is required');
  else if (d.blurb.length > 220) errors.push(`blurb is ${d.blurb.length} chars (max 200)`);
  if (d.checked && !isDate(d.checked)) errors.push('checked must be YYYY-MM-DD');
  if (d.status === 'active') {
    if (!d.cover) errors.push('cover {file, key} is required');
    else if (!loadExtract(d.cover.file)) errors.push(`cover.file not found: ${d.cover.file}`);
    else if (!resolveCover(d.cover)) errors.push(`cover.key "${d.cover.key}" does not resolve to an image in ${d.cover.file}`);
  }
  if (!Array.isArray(d.editions)) errors.push('editions must be an array (use [] when nothing is announced)');
  for (const [n, e] of (d.editions || []).entries()) {
    const at = `editions[${n}]`;
    if (!isDate(e.start) || !isDate(e.end)) {
      errors.push(`${at}: start/end must be YYYY-MM-DD`);
      continue;
    }
    if (e.start > e.end) errors.push(`${at}: start is after end`);
    const days = (Date.parse(e.end) - Date.parse(e.start)) / 864e5;
    if (e.dates === 'confirmed' && days > 16) errors.push(`${at}: ${days + 1} days long — check the dates`);
    if (e.end < WINDOW_START) errors.push(`${at}: ended before ${WINDOW_START}; only list upcoming editions`);
    if (e.start > WINDOW_END) errors.push(`${at}: starts after ${WINDOW_END}; leave it out`);
    if (!['confirmed', 'month'].includes(e.dates)) errors.push(`${at}: dates must be "confirmed" or "month"`);
    if (!e.city) errors.push(`${at}: city is required`);
    if (!COUNTRIES[e.country]) errors.push(`${at}: country "${e.country}" is not an ISO 3166-1 alpha-2 code`);
    const regions = REGIONS[e.country];
    if (regions && !regions[e.region]) errors.push(`${at}: region "${e.region}" is not a valid ${e.country} state/province code`);
    if (e.country === 'US' && !e.region) errors.push(`${at}: US editions need the two-letter state in region`);
    if (!GUEST_STATES.includes(e.guests)) errors.push(`${at}: guests must be one of ${GUEST_STATES.join(', ')}`);
    if (!e.evidence) warn.push(`${at}: evidence is empty`);
    const names = new Set();
    let count = 0;
    for (const [k, l] of (e.lineup || []).entries()) {
      const x = loadExtract(l.file || '');
      if (!x) {
        errors.push(`${at}.lineup[${k}]: file not found: ${l.file}`);
        continue;
      }
      const cands = x.candidates || [];
      for (const p of l.picks || []) {
        if (!Array.isArray(p) || p.length < 4) {
          errors.push(`${at}.lineup[${k}]: pick ${JSON.stringify(p)} must be [#, "Name", "Known for", "cat"]`);
          continue;
        }
        const [i, name, , cat] = p;
        if (!cands[i] || !cands[i].img) errors.push(`${at}.lineup[${k}]: #${i} is not a candidate in ${l.file}`);
        if (!name || typeof name !== 'string') errors.push(`${at}: pick #${i} has no name`);
        else if (name === name.toUpperCase() && /[A-Z]{3}/.test(name)) errors.push(`${at}: "${name}" should be in normal capitalisation`);
        if (!CATS.includes(cat)) errors.push(`${at}: "${name}" has unknown cat "${cat}" (use ${CATS.join(', ')})`);
        const key = (name || '').toLowerCase();
        if (names.has(key)) errors.push(`${at}: "${name}" is picked twice`);
        names.add(key);
        count++;
      }
    }
    for (const g of e.textOnlyGuests || []) {
      if (!Array.isArray(g) || g.length < 3) errors.push(`${at}: textOnlyGuests entries must be ["Name", "Known for", "cat"]`);
      else if (!CATS.includes(g[2])) errors.push(`${at}: "${g[0]}" has unknown cat "${g[2]}"`);
      else {
        if (names.has(g[0].toLowerCase())) errors.push(`${at}: "${g[0]}" is both picked and text-only`);
        names.add(g[0].toLowerCase());
        count++;
      }
    }
    if (e.guests === 'announced' && !count) errors.push(`${at}: guests is "announced" but no guests were picked`);
    if (e.guests !== 'announced' && count) errors.push(`${at}: guests were picked but guests is "${e.guests}"`);
  }
  if (d.status === 'active' && (!d.editions || !d.editions.length) && !d.notes) {
    errors.push('no editions listed: explain in notes what is known about the next date');
  }
  return { errors, warn };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  let files = process.argv.slice(2);
  if (files.includes('--all')) {
    const dir = join(ROOT, 'pipeline', 'research');
    files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
  }
  let bad = 0;
  for (const f of files) {
    const { errors, warn } = checkFile(f);
    if (errors.length) {
      bad++;
      console.log(`✗ ${basename(f)}`);
      for (const e of errors) console.log(`   - ${e}`);
    } else if (!process.argv.includes('--quiet')) {
      console.log(`✓ ${basename(f)}${warn.length ? `  (warnings: ${warn.join('; ')})` : ''}`);
    }
  }
  if (files.length > 1) console.log(`${files.length - bad}/${files.length} files OK`);
  process.exit(bad ? 1 : 0);
}
