#!/usr/bin/env node
// Flag guest lineups that may be last year's: the guest page URL names an earlier year, or
// most picked photos carry an earlier year in their file name or upload path (/2025/11/).
//   node pipeline/tools/stale-scan.mjs [--before 2027-04-01]
// Prints one line per flagged edition: id | start | guest page | reason.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const bi = process.argv.indexOf('--before');
const BEFORE = bi >= 0 ? process.argv[bi + 1] : '9999-12-31';
const cache = new Map();
const load = (f) => {
  if (!cache.has(f)) {
    try {
      cache.set(f, JSON.parse(readFileSync(join(ROOT, f), 'utf8')).candidates || []);
    } catch {
      cache.set(f, []);
    }
  }
  return cache.get(f);
};

for (const f of readdirSync(join(ROOT, 'pipeline', 'research')).filter((x) => x.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'research', f), 'utf8'));
  for (const e of r.editions || []) {
    if (!(e.lineup || []).length || e.start >= BEFORE) continue;
    const year = Number(e.start.slice(0, 4));
    const page = e.guestsPage || r.guestsPage || '';
    const reasons = [];
    const pageYears = (page.match(/(?<!\d)(20\d\d)(?!\d)/g) || []).map(Number);
    if (pageYears.length && Math.max(...pageYears) < year) reasons.push(`guest page URL says ${Math.max(...pageYears)}`);
    let old = 0;
    let dated = 0;
    let n = 0;
    for (const l of e.lineup) {
      const cands = load(l.file);
      for (const [i] of l.picks || []) {
        const c = cands[i];
        if (!c || !c.img) continue;
        n++;
        let path = c.img;
        try {
          path = decodeURIComponent(new URL(c.img).pathname);
        } catch {
          /* keep raw */
        }
        // Upload folders (/2026/03/) and year tags in the file name ("2025-GC-", "_26_").
        const up = /\/(20\d\d)\/(0[1-9]|1[0-2])\//.exec(path);
        const nameYears = (path.split('/').pop().match(/(?<![\d])(20[12]\d)(?![\d])/g) || []).map(Number);
        const tagYear = up ? Number(up[1]) + (Number(up[2]) - 1) / 12 : nameYears.length ? Math.max(...nameYears) : null;
        if (tagYear === null) continue;
        dated++;
        // Older than about 13 months before the show: most likely the previous edition's.
        const showAt = year + (Number(e.start.slice(5, 7)) - 1) / 12;
        if (showAt - tagYear > 13 / 12 || (nameYears.length && Math.max(...nameYears) < year && !up)) old++;
      }
    }
    if (dated >= 3 && old / dated >= 0.5) reasons.push(`${old}/${dated} dated photos look older than this edition`);
    if (reasons.length) console.log(`${r.id} | ${e.start} | ${page} | ${reasons.join('; ')} (${n} picks)`);
  }
}
