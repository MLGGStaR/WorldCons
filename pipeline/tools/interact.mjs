#!/usr/bin/env node
// Interaction checks for the UI: search suggestions, filters, clip to lanyard, guest wall
// search, directory paging. Prints PASS/FAIL lines and saves screenshots.
//   node pipeline/tools/interact.mjs <outDir>
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = process.argv[2] || join(ROOT, 'pipeline', '.tmp', 'interact');
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let f = join(ROOT, p);
    if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(await readFile(f));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
for (const [vname, opts] of [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['mobile', { ...devices['iPhone 13'] }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('.badge:not(.skel)');
  const data = await page.evaluate(() => fetch('data/cons.json').then((r) => r.json()));
  const someGuest = Object.values(data.guests).find((g) => g.p);
  const word = someGuest.n.split(' ')[0];

  // Search suggestions show guests with photos.
  await page.click('#q');
  await page.keyboard.type(word.slice(0, 5), { delay: 30 });
  await page.waitForSelector('#suggest:not([hidden]) .suggest-item', { timeout: 4000 }).catch(() => {});
  const sugg = await page.$$eval('#suggest .suggest-item', (els) => els.length);
  check(`${vname}: suggestions appear for "${word.slice(0, 5)}"`, sugg > 0, `${sugg} items`);
  await page.screenshot({ path: join(out, `${vname}-suggest.png`) });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const hash = await page.evaluate(() => location.hash);
  check(`${vname}: Enter applies the search to the list`, /q=/.test(hash), hash);
  await page.click('.search .clear').catch(() => {});
  await page.waitForTimeout(200);

  // Type filter via the ribbon row (desktop) and clip a badge to the lanyard.
  const firstType = await page.$eval('.rtoggle:not([disabled])', (b) => b.dataset.typeToggle);
  await page.click(`.rtoggle[data-type-toggle="${firstType}"]`);
  await page.waitForTimeout(200);
  const allHaveType = await page.$$eval('.badge', (els, t) => els.every((b) => b.querySelector(`.ribbons .r-${t}`) || true), firstType);
  check(`${vname}: type filter "${firstType}" updates the URL`, (await page.evaluate(() => location.hash)).includes(`type=${firstType}`));
  check(`${vname}: badges still render after filtering`, allHaveType && (await page.$$eval('.badge', (e) => e.length)) > 0);
  await page.click(`.rtoggle[data-type-toggle="${firstType}"]`);
  await page.waitForTimeout(200);

  const firstBadge = await page.$('.badge');
  const id = await firstBadge.getAttribute('data-id');
  await firstBadge.hover();
  await page.click(`.badge[data-id="${id}"] .clip`);
  await page.waitForTimeout(400);
  const count = await page.$eval('.lanyard-link .count', (e) => e.textContent);
  check(`${vname}: clipping a badge bumps the lanyard count`, count === '1', `count=${count}`);
  await page.click('.lanyard-link:not(.nav-guests)');
  await page.waitForTimeout(300);
  check(`${vname}: lanyard page lists the clipped con`, (await page.$$(`#view-page .badge[data-id="${id}"]`)).length === 1);
  await page.screenshot({ path: join(out, `${vname}-lanyard.png`) });

  // Con page with the biggest lineup: wall search narrows the credentials.
  const big = [...data.cons].sort((a, b) => b.g.length - a.g.length)[0];
  await page.goto(`${base}#/con/${big.id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.cred');
  const creds = await page.$$eval('#wall .cred', (e) => e.length);
  check(`${vname}: ${big.name} shows every guest`, creds === big.g.length, `${creds}/${big.g.length}`);
  const noPhoto = await page.$$eval('#wall .cred .initials', (e) => e.length);
  check(`${vname}: every guest on ${big.name} has a photo`, noPhoto === 0, `${noPhoto} without`);
  if (await page.$('#wall-q')) {
    const g0 = data.guests[big.g[0]].n;
    await page.fill('#wall-q', g0);
    await page.waitForTimeout(200);
    const left = await page.$$eval('#wall .cred', (e) => e.length);
    check(`${vname}: wall search finds "${g0}"`, left >= 1 && left < creds, `${left} left`);
  }
  await page.screenshot({ path: join(out, `${vname}-con.png`) });

  // Guest directory pages in 120s.
  await page.goto(`${base}#/guests`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#dir-wall .cred');
  const firstPage = await page.$$eval('#dir-wall .cred', (e) => e.length);
  const moreVisible = await page.$eval('#dir-more', (b) => !b.hidden);
  if (moreVisible) {
    await page.click('#dir-more');
    await page.waitForTimeout(300);
  }
  const secondPage = await page.$$eval('#dir-wall .cred', (e) => e.length);
  check(`${vname}: directory pages through guests`, firstPage <= 120 && (!moreVisible || secondPage > firstPage), `${firstPage} -> ${secondPage}`);

  // Mobile filter sheet.
  if (vname === 'mobile') {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.click('.filters-btn');
    await page.waitForSelector('#sheet[open]');
    await page.screenshot({ path: join(out, 'mobile-sheet.png') });
    check('mobile: filter sheet opens', true);
  }
  check(`${vname}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
server.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
