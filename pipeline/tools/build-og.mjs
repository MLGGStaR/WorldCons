#!/usr/bin/env node
// Render icons/og.png (1200x630 link preview) from the real data: wordmark, counts and a
// wall of guest credentials from the biggest upcoming lineups.
//   node pipeline/tools/build-og.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addPngText } from '../lib/png-text.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const data = JSON.parse(readFileSync(join(ROOT, 'data', 'cons.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const upcoming = data.cons.filter((c) => c.end >= today);
const countries = new Set(upcoming.map((c) => c.country)).size;
const guestIds = new Set(upcoming.flatMap((c) => c.g));

// Guests from the biggest lineups, one per con first so the wall mixes fandoms.
const picks = [];
const seen = new Set();
const byLineup = [...upcoming].sort((a, b) => b.g.length - a.g.length);
for (let round = 0; picks.length < 12 && round < 6; round++) {
  for (const c of byLineup) {
    const id = c.g.filter((g) => data.guests[g] && data.guests[g].p && !seen.has(g))[round];
    if (id && !seen.has(id)) {
      seen.add(id);
      picks.push(data.guests[id]);
      if (picks.length >= 12) break;
    }
  }
}

const fontUrl = pathToFileURL(join(ROOT, 'fonts', 'archivo-latin.woff2')).href;
const imgUrl = (p) => pathToFileURL(join(ROOT, p)).href;
const fmt = (n) => n.toLocaleString('en-US');
const html = `<!doctype html><html><head><style>
@font-face { font-family: Archivo; src: url('${fontUrl}') format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #121418; color: #f4f5f7; font-family: Archivo, sans-serif; overflow: hidden; position: relative; }
.copy { position: absolute; left: 64px; top: 70px; width: 470px; }
.mark { width: 64px; height: 74px; margin-bottom: 30px; }
h1 { font-size: 52px; font-weight: 900; font-stretch: 125%; letter-spacing: .005em; line-height: 1; }
h1 b { color: #d9ab32; font-weight: 900; }
p { font-size: 30px; font-weight: 600; line-height: 1.25; margin-top: 22px; color: #e6e8ec; }
.stats { margin-top: 34px; font-size: 22px; font-weight: 600; color: #9aa2ad; }
.wall { position: absolute; right: -70px; top: -40px; width: 620px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; transform: rotate(-6deg); }
.cred { background: #fff; border-radius: 12px; padding: 16px 8px 10px; position: relative; }
.cred::before { content: ''; position: absolute; top: 6px; left: 50%; width: 26px; height: 5px; margin-left: -13px; border-radius: 3px; background: #121418; }
.cred img { width: 100%; aspect-ratio: 4/5; object-fit: cover; border-radius: 6px; display: block; }
.band { margin-top: 7px; background: #121418; color: #fff; border-radius: 4px; text-align: center; font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; padding: 4px 2px 3px; font-stretch: 112%; }
.name { color: #121418; font-size: 15px; font-weight: 750; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head><body>
<div class="copy">
  <svg class="mark" viewBox="0 0 26 30" fill="none" stroke="#f4f5f7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5 13 11l9-9.5"/><circle cx="13" cy="12.6" r="1.6"/><rect x="5" y="15.5" width="16" height="13" rx="2.4"/><path d="M9.5 21h7M9.5 24.5h4.5"/></svg>
  <h1>WORLD<b>CONS</b></h1>
  <p>Every fan convention, sorted by date, with every guest's photo.</p>
  <div class="stats">${fmt(upcoming.length)} cons · ${countries} countries · ${fmt(guestIds.size)} guests</div>
</div>
<div class="wall">${picks
  .map((g) => `<div class="cred"><img src="${imgUrl(g.p)}"><div class="band">${{ actor: 'Actor', voice: 'Voice actor', comics: 'Comics', author: 'Author', animation: 'Animation', cosplay: 'Cosplay', creator: 'Creator', gaming: 'Gaming', music: 'Music', sports: 'Sports' }[g.c] || 'Guest'}</div><div class="name">${g.n}</div></div>`)
  .join('')}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// Load from a file:// page so the local font and photos are allowed to load.
mkdirSync(join(ROOT, 'pipeline', '.tmp'), { recursive: true });
const tmp = join(ROOT, 'pipeline', '.tmp', 'og.html');
writeFileSync(tmp, html);
await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(ROOT, 'icons', 'og.png') });
addPngText(
  join(ROOT, 'icons', 'og.png'),
  `Origin: rendered by pipeline/tools/build-og.mjs from data/cons.json on ${today} (wordmark, counts and guest credentials from official con guest pages; per-photo sources in data/sources.json). No generated imagery.`,
);
await browser.close();
console.log(`icons/og.png: ${upcoming.length} cons, ${countries} countries, ${guestIds.size} guests, ${picks.length} faces`);
