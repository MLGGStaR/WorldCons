#!/usr/bin/env node
// Daily refresh, step 1 (no AI). Re-render the guest pages behind every upcoming lineup, the
// guest pages of upcoming editions still waiting on guests, and (a seventh of them a day) the
// homepages of cons waiting on dates. Compare with the extraction the research picked from
// and with everything earlier runs saw, then write task files for the agents. Research files
// are never edited here.
//   node pipeline/refresh/plan.mjs [--date YYYY-MM-DD] [--concurrency 8] [--max-lines 48]
// Writes pipeline/seed/refresh/<date>/<kind>-NN.txt and plan.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch, extractWith, saveResult } from '../tools/extract.mjs';
import { fold } from '../../js/model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const TODAY = opt('date', new Date().toISOString().slice(0, 10));
const STAMP = TODAY.replace(/-/g, '');
const YEAR = Number(TODAY.slice(0, 4));
const CONCURRENCY = Number(opt('concurrency', 8));
const MAX_LINES = Number(opt('max-lines', 48)); // con lines handed to agents per day
const PER_FILE = 6;
const STATE = join(ROOT, 'pipeline', 'cache', 'refresh');
const SEEN_FILE = join(STATE, 'seen.json');
const OUT = join(ROOT, 'pipeline', 'seed', 'refresh', TODAY);
const EXTRACT = 'pipeline/cache/extract';
mkdirSync(join(STATE, 'fresh'), { recursive: true });
mkdirSync(OUT, { recursive: true });

// Everything a page has ever shown, per URL: image keys for guest pages, date text for
// homepages. A card counts as new only the first time it appears.
const seen = existsSync(SEEN_FILE) ? JSON.parse(readFileSync(SEEN_FILE, 'utf8')) : {};
const saveSeen = () => writeFileSync(SEEN_FILE, JSON.stringify(seen));
const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const rel = (p) => p.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');

// ---- what a card is ----------------------------------------------------------------------------

const decode = (s) => {
  try {
    return decodeURIComponent(s || '');
  } catch {
    return s || '';
  }
};
// The part of an image URL that survives CDN resizing and re-uploads of the same file.
function keyOf(url) {
  const u = String(url || '');
  const wix = /\/media\/([^/]+?)(?:\.\w+)?(?:\/|$)/.exec(u);
  if (wix) return wix[1];
  return decode(u.split(/[?#]/)[0].split('/').pop())
    .replace(/=[swh]\d+.*$/, '')
    .replace(/\.\w+$/, '')
    .replace(/-\d+x\d+$/, '')
    .replace(/-(scaled|e\d+)$/, '')
    .toLowerCase();
}
const isIcon = (c) => /\.svg(\?|#|$)/i.test(c.img || '');
const labelOf = (c) => String(c.text || c.alt || '').replace(/\s+/g, ' ').trim();
const bigEnough = (c) => c.w >= 120 && c.h >= 120;
const hayOf = (c) => fold(`${c.text || ''} ${c.alt || ''} ${decode(c.link)} ${decode((c.img || '').split('/').pop())}`);
const tokensOf = (name) => fold(name).split(' ').filter((t) => t.length >= 3 || /[^\x00-\x7f]/.test(t));
const named = (name, hay) => {
  const toks = tokensOf(name);
  const squashed = hay.replace(/ /g, '');
  return toks.length > 0 && toks.every((t) => hay.includes(t) || squashed.includes(t));
};
const rendered = (x) => x && !x.error && x.status && x.status < 400 && (x.candidates || []).length > 0;
const quote = (s, n = 60) => `"${String(s).slice(0, n).replace(/"/g, "'")}"`;

// ---- jobs ---------------------------------------------------------------------------------------

const research = readdirSync(join(ROOT, 'pipeline', 'research'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'pipeline', 'research', f), 'utf8')))
  .filter((r) => r.status === 'active');

const dayIndex = Math.floor(Date.parse(TODAY) / 864e5);
const jobs = [];
for (const r of research) {
  const upcoming = (r.editions || []).filter((e) => e.end >= TODAY);
  for (const e of upcoming) {
    if (e.guests === 'announced') {
      for (const l of e.lineup || []) {
        let old = null;
        try {
          old = JSON.parse(readFileSync(join(ROOT, l.file), 'utf8'));
        } catch {
          continue;
        }
        if (!old.url) continue;
        jobs.push({ kind: 'update', id: r.id, start: e.start, url: old.url, mode: 'guests', file: l.file, old, picks: l.picks || [] });
      }
    } else if (e.guests === 'none-yet' && /^https?:/.test(e.guestsPage || '')) {
      jobs.push({ kind: 'announce', id: r.id, start: e.start, url: e.guestsPage, mode: 'guests' });
    }
  }
  // No upcoming edition (dates not announced, or the last one has ended): homepage, weekly.
  if (!upcoming.length && /^https?:/.test(r.url || '') && parseInt(sha(r.id), 16) % 7 === dayIndex % 7) {
    jobs.push({ kind: 'dates', id: r.id, url: r.url, mode: 'home' });
  }
}

// ---- render (each URL once) ----------------------------------------------------------------------

const urls = [...new Map(jobs.map((j) => [`${j.mode} ${j.url}`, { url: j.url, mode: j.mode }])).values()];
console.log(`refresh plan ${TODAY}: ${jobs.length} checks over ${urls.length} pages`);
const fresh = new Map();
let browser = await launch();
let next = 0;
let done = 0;
async function worker() {
  while (next < urls.length) {
    const u = urls[next++];
    let x = null;
    try {
      x = await Promise.race([
        extractWith(browser, u.url, { mode: u.mode }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 180000)),
      ]);
    } catch (e) {
      x = { url: u.url, mode: u.mode, error: String(e.message || e), candidates: [] };
      if (!browser.isConnected()) browser = await launch();
    }
    fresh.set(`${u.mode} ${u.url}`, x);
    saveResult(x, join(STATE, 'fresh', `${sha(u.url)}.${u.mode}.json`));
    if (++done % 50 === 0) console.log(`  ${done}/${urls.length} rendered`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close().catch(() => {});

// ---- compare --------------------------------------------------------------------------------------

const tasks = { update: [], announce: [], dates: [] };
// Several lineup files can come from one page: a card picked in any of them is not new.
const oldKeysByUrl = new Map();
for (const j of jobs.filter((x) => x.kind === 'update')) {
  const set = oldKeysByUrl.get(j.url) || new Set();
  for (const c of j.old.candidates || []) set.add(keyOf(c.img));
  oldKeysByUrl.set(j.url, set);
}
let unreachable = 0;
let baselined = 0;

for (const j of jobs) {
  const x = fresh.get(`${j.mode} ${j.url}`);
  if (j.mode === 'home') {
    if (!x || x.error || !x.status || x.status >= 400) {
      unreachable++;
      continue;
    }
    const snips = [...(x.dateSnippets || []).map((s) => fold(s).replace(/\s+/g, ' ').trim()), ...(x.jsonLdEvents || []).map((e) => `jsonld ${e.startDate || ''} ${e.name || ''}`)];
    const before = seen[`home ${j.url}`];
    if (!before) {
      seen[`home ${j.url}`] = snips;
      baselined++;
      continue;
    }
    // New date text that names this year or a later one.
    const fresh2 = snips.filter((s) => !before.includes(s) && (s.match(/20\d\d/g) || []).some((y) => Number(y) >= YEAR));
    if (!fresh2.length) {
      seen[`home ${j.url}`] = [...new Set([...before, ...snips])];
      continue;
    }
    const file = `${EXTRACT}/${j.id}-r${STAMP}.home.json`;
    saveResult(x, join(ROOT, file));
    tasks.dates.push({
      start: '9999',
      line: `${j.id} | ${j.url} | ${file} | new date text: ${fresh2.slice(0, 3).map((s) => quote(s, 140)).join(' ; ')}`,
      seenKey: `home ${j.url}`,
      items: [...new Set([...before, ...snips])],
    });
    continue;
  }

  if (!rendered(x)) {
    unreachable++;
    continue;
  }
  const cands = x.candidates || [];
  const keys = cands.map((c) => keyOf(c.img));
  const seenKey = `guests ${j.url}`;
  const known = new Set([...(seen[seenKey] || []), ...(oldKeysByUrl.get(j.url) || [])]);
  if (j.kind === 'announce' && !seen[seenKey]) {
    // First look at this page: remember it, judge changes from tomorrow on.
    seen[seenKey] = [...new Set(keys)];
    baselined++;
    continue;
  }
  const newCards = cands
    .map((c, i) => [i, c])
    .filter(([, c]) => !known.has(keyOf(c.img)) && !isIcon(c) && (labelOf(c) || bigEnough(c)));
  let missing = [];
  if (j.kind === 'update') {
    const hay = cands.map(hayOf).join(' | ');
    const freshKeys = new Set(keys);
    missing = j.picks.filter(([n, name]) => {
      const oc = (j.old.candidates || [])[n];
      return !(oc && freshKeys.has(keyOf(oc.img))) && !named(name, hay);
    });
  }
  const worth = j.kind === 'announce' ? newCards.some(([, c]) => labelOf(c)) || newCards.length >= 2 : newCards.length > 0 || missing.length > 0;
  if (!worth) {
    seen[seenKey] = [...new Set([...(seen[seenKey] || []), ...keys])];
    continue;
  }
  // Freeze today's render under a dated name: the agent picks by its numbers.
  const stem = j.kind === 'update' ? basename(j.file).replace(/\.guests\.json$/, '') : j.id;
  const file = `${EXTRACT}/${stem}-r${STAMP}.guests.json`;
  if (!existsSync(join(ROOT, file))) saveResult(x, join(ROOT, file));
  const newList = newCards.slice(0, 40).map(([i, c]) => `#${i} ${labelOf(c) ? quote(labelOf(c), 50) : '(image only)'}`);
  const more = newCards.length > 40 ? ` and ${newCards.length - 40} more` : '';
  if (j.kind === 'update') {
    const note = missing.length > j.picks.length * 0.6 ? ' (MOST of the lineup is gone from the page: check whether it now shows another edition or was emptied)' : '';
    tasks.update.push({
      start: j.start,
      line: `${j.id} | ${j.start} | ${j.file} | ${file} | new cards: ${newList.join(', ') || 'none'}${more} | not found today: ${missing.map(([, name]) => name).join('; ') || 'none'}${note}`,
      seenKey,
      items: [...new Set([...(seen[seenKey] || []), ...keys])],
    });
  } else {
    tasks.announce.push({
      start: j.start,
      line: `${j.id} | ${j.start} | ${j.url} | ${file} | new cards: ${newList.join(', ')}${more}`,
      seenKey,
      items: [...new Set([...(seen[seenKey] || []), ...keys])],
    });
  }
}

// ---- task files (soonest shows first; what does not fit waits for tomorrow) ----------------------

const files = [];
let budget = MAX_LINES;
let overflow = 0;
for (const kind of ['update', 'announce', 'dates']) {
  const list = tasks[kind].sort((a, b) => (a.start < b.start ? -1 : 1));
  const take = list.slice(0, Math.max(0, budget));
  overflow += list.length - take.length;
  budget -= take.length;
  for (let k = 0; k < take.length; k += PER_FILE) {
    const chunk = take.slice(k, k + PER_FILE);
    const name = `${kind}-${String(files.filter((f) => f.kind === kind).length + 1).padStart(2, '0')}.txt`;
    writeFileSync(join(OUT, name), chunk.map((t) => t.line).join('\n') + '\n');
    // What these pages showed, remembered only once the agent has run (a failed run is
    // detected again tomorrow).
    const remember = {};
    for (const t of chunk) remember[t.seenKey] = t.items;
    files.push({ kind, file: rel(join(OUT, name)), lines: chunk.length, remember });
  }
}
saveSeen();
const plan = {
  date: TODAY,
  checks: jobs.length,
  pages: urls.length,
  unreachable,
  baselined,
  found: { update: tasks.update.length, announce: tasks.announce.length, dates: tasks.dates.length },
  overflow,
  files,
};
writeFileSync(join(OUT, 'plan.json'), JSON.stringify(plan, null, 1));
console.log(
  `pages ${urls.length} (${unreachable} unreachable, ${baselined} first looks) -> lineups changed ${tasks.update.length}, guests appearing ${tasks.announce.length}, date text ${tasks.dates.length}; ${files.length} task files${overflow ? `, ${overflow} lines wait for tomorrow` : ''}`,
);
