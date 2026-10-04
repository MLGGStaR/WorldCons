#!/usr/bin/env node
// Find guest lists that may be incomplete.
//   node pipeline/tools/audit-guests.mjs [--reextract] [--concurrency 6]
// Checks every announced lineup in pipeline/research:
//  - truncation: the compact listing the agent read was longer than the shell shows
//    (~30k chars) and no pick came from its tail;
//  - coverage: far fewer picks than person-sized image candidates;
//  - pagination (with --reextract): rendering the guest page again with the current
//    extractor (which walks pagers and "load more") finds many more candidates.
// Prints one line per suspect and writes pipeline/seed/audit.json.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, extractWith } from './extract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const REEXTRACT = args.includes('--reextract');
const ci = args.indexOf('--concurrency');
const N = ci >= 0 ? Number(args[ci + 1]) : 6;

const personSized = (c) => c.w >= 90 && c.h >= 90 && c.h / c.w > 0.55 && c.h / c.w < 2.2;
// Rough length of the compact listing extract.mjs prints for a guests page.
const listingLength = (x) => (x.candidates || []).reduce((n, c) => n + 30 + Math.min(110, (c.text || '').length) + Math.min(80, (c.alt || '').length), 600);

const suspects = [];
const recheck = [];
for (const f of readdirSync(join(ROOT, 'pipeline', 'research')).filter((f) => f.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(join(ROOT, 'pipeline', 'research', f), 'utf8'));
  for (const e of r.editions || []) {
    for (const l of e.lineup || []) {
      const path = join(ROOT, l.file);
      if (!existsSync(path)) continue;
      const x = JSON.parse(readFileSync(path, 'utf8'));
      const cands = x.candidates || [];
      const picks = l.picks || [];
      const maxIdx = Math.max(-1, ...picks.map((p) => p[0]));
      const persons = cands.filter(personSized).length;
      const reasons = [];
      const len = listingLength(x);
      if (len > 30000 && maxIdx < cands.length * 0.8) reasons.push(`listing ~${Math.round(len / 1000)}k chars, last pick #${maxIdx} of ${cands.length}`);
      if (persons >= 12 && picks.length < persons * 0.5) reasons.push(`${picks.length} picks vs ${persons} person-sized images`);
      if (reasons.length) suspects.push({ id: r.id, file: l.file, url: x.url, picks: picks.length, candidates: cands.length, reasons });
      if (!x.pagination) recheck.push({ id: r.id, file: l.file, url: x.url, picks: picks.length, candidates: cands.length });
    }
  }
}

if (REEXTRACT) {
  let browser = await launch();
  let i = 0;
  async function worker() {
    while (i < recheck.length) {
      const job = recheck[i++];
      try {
        const x = await Promise.race([
          extractWith(browser, job.url, { mode: 'guests' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 240000)),
        ]);
        const now = (x.candidates || []).length;
        if (now > job.candidates * 1.3 + 8) {
          suspects.push({ ...job, reasons: [`page now renders ${now} candidates (saved: ${job.candidates})${x.pagination ? `, ${x.pagination.pages} pages` : ''}`] });
        }
      } catch {
        if (!browser.isConnected()) browser = await launch();
      }
    }
  }
  await Promise.all(Array.from({ length: N }, worker));
  await browser.close();
}

const byId = new Map();
for (const s of suspects) {
  if (!byId.has(s.id)) byId.set(s.id, { id: s.id, items: [] });
  byId.get(s.id).items.push(s);
}
const out = [...byId.values()];
writeFileSync(join(ROOT, 'pipeline', 'seed', 'audit.json'), JSON.stringify(out, null, 1));
for (const s of out) console.log(`${s.id}: ${s.items.map((i) => `${i.reasons.join('; ')} [${i.file}]`).join(' | ')}`);
console.log(`${out.length} cons to re-check (of ${recheck.length + 0} lineup pages${REEXTRACT ? ', re-rendered' : ''})`);
