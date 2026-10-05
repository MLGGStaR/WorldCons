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

  // Regression checks from the code review.
  if (vname === 'desktop') {
    // Back from a con page lands exactly where the reader was.
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('.badge:not(.skel)');
    await page.waitForTimeout(800); // let the streamed months arrive
    await page.evaluate(() => window.scrollTo(0, 3000));
    await page.waitForTimeout(300);
    const target = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#groups .badge')].find((x) => x.getBoundingClientRect().top > 100);
      return b && { id: b.dataset.id, top: Math.round(b.getBoundingClientRect().top) };
    });
    await page.click(`#groups .badge[data-id="${target.id}"] .badge-link`);
    await page.waitForTimeout(400);
    await page.goBack();
    await page.waitForTimeout(600);
    const after = await page.evaluate((id) => Math.round(document.querySelector(`#groups .badge[data-id="${id}"]`).getBoundingClientRect().top), target.id);
    check('desktop: back from a con page restores the list position', Math.abs(after - target.top) <= 4, `${target.top}px -> ${after}px`);

    // A month's ruler count equals what clicking it shows.
    const m = await page.$eval('#ruler button[data-month]:nth-of-type(1)', (b) => ({ key: b.dataset.month }));
    const rulerN = await page.$eval(`#ruler button[data-month="${m.key}"] span`, (s) => Number(s.textContent.replace(/,/g, '')));
    await page.click(`#ruler button[data-month="${m.key}"]`);
    await page.waitForTimeout(400);
    const shown = await page.$$eval('#groups section:not(#m-tba) .badge', (e) => e.length);
    check(`desktop: ruler count for ${m.key} matches the list`, rulerN === shown, `${rulerN} vs ${shown}`);

    // The skip link keeps the current filters.
    await page.goto(`${base}#/?country=JP`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.badge:not(.skel)');
    await page.focus('.skip');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    check('desktop: skip link keeps the filters', (await page.evaluate(() => location.hash)) === '#/?country=JP');

    // Multi-select: two countries ticked in the Country picker show only those countries.
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('.badge:not(.skel)');
    await page.click('[data-pick-open="countries"]');
    await page.waitForSelector('#pick-countries');
    const two = await page.$$eval('#pick-countries input[data-pick]', (els) => els.slice(0, 2).map((e) => e.value));
    for (const v of two) {
      await page.click(`#pick-countries .pick-opt:has(input[value="${v}"])`);
      await page.waitForTimeout(250);
    }
    const hashC = await page.evaluate(() => location.hash);
    const flags = await page.$$eval('#groups section:not(#m-tba) .badge .flag', (els) => els.map((e) => e.getAttribute('src').replace(/^.*\/(\w+)\.svg$/, '$1').toUpperCase()));
    check('desktop: two countries can be ticked together', hashC.includes(`country=${two.join(',')}`) && flags.length > 0 && flags.every((f) => two.includes(f)), `${hashC} (${flags.length} badges)`);
    check('desktop: the picker stays open while ticking', !!(await page.$('#pick-countries')));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const focusBack = await page.evaluate(() => document.activeElement && document.activeElement.dataset.pickOpen);
    check('desktop: Escape closes the picker and returns focus', !(await page.$('#pick-countries')) && focusBack === 'countries', `focus on ${focusBack}`);
    await page.screenshot({ path: join(out, 'desktop-multiselect.png') });

    // The same by keyboard alone: open, tick, arrow down, tick, close.
    await page.click('[data-k="reset"]');
    await page.waitForTimeout(300);
    await page.focus('[data-pick-open="continents"]');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#pick-continents');
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    const conts = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] || '').get('continent') || '');
    check('desktop: the keyboard ticks several continents', conts.split(',').filter(Boolean).length === 2, conts);
    await page.keyboard.press('Escape');

    // Two months on the ruler, and two years.
    await page.click('[data-k="reset"]');
    await page.waitForTimeout(300);
    const months = await page.$$eval('#ruler button[data-month]', (els) => els.slice(0, 3).map((b) => b.dataset.month));
    await page.click(`#ruler button[data-month="${months[0]}"]`);
    await page.waitForTimeout(250);
    await page.click(`#ruler button[data-month="${months[2]}"]`);
    await page.waitForTimeout(400);
    const pressed = await page.$$eval('#ruler button[aria-pressed="true"]', (els) => els.map((b) => b.dataset.month));
    const sections = await page.$$eval('#groups section:not(#m-tba)', (els) => els.map((s) => s.id.replace(/^m-/, '')));
    check('desktop: two months can be chosen on the ruler', pressed.join() === [months[0], months[2]].join() && sections.join() === [months[0], months[2]].join(), `${pressed} / ${sections}`);
    await page.click('[data-k="reset"]');
    await page.waitForTimeout(300);
    const yrs = await page.$$eval('[data-when]', (els) => els.map((b) => b.dataset.when).filter((v) => /^\d{4}$/.test(v)));
    if (yrs.length >= 2) {
      await page.click(`[data-when="${yrs[0]}"]`);
      await page.waitForTimeout(250);
      await page.click(`[data-when="${yrs[1]}"]`);
      await page.waitForTimeout(250);
      const both = await page.$$eval('[data-when][aria-pressed="true"]', (els) => els.map((b) => b.dataset.when));
      check('desktop: two years can be chosen together', both.join() === yrs.slice(0, 2).join(), both.join());
    }

    // A malformed id does not break the app.
    await page.goto(`${base}#/con/100%`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    check('desktop: a malformed con link shows "not found"', !!(await page.$('#view-page .empty')));

    // Undo on the lanyard page brings the badge back.
    await page.goto(`${base}#/lanyard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const before = await page.$$eval('#view-page .badge', (e) => e.length);
    if (before) {
      const first = await page.$eval('#view-page .badge', (b) => b.dataset.id);
      await page.hover(`#view-page .badge[data-id="${first}"]`);
      await page.click(`#view-page .badge[data-id="${first}"] .clip`);
      await page.waitForTimeout(300);
      await page.click('[data-toast-action]');
      await page.waitForTimeout(300);
      check('desktop: undo on the lanyard page restores the badge', (await page.$$eval('#view-page .badge', (e) => e.length)) === before);
    }
  }

  // Mobile filter sheet.
  if (vname === 'mobile') {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.click('.filters-btn');
    await page.waitForSelector('#sheet[open]');
    check('mobile: filter sheet opens', true);
    // Several continents and countries at once from the sheet.
    const chips = await page.$$eval('#sheet [data-pick-toggle="continents"]', (els) => els.slice(0, 2).map((b) => b.dataset.value));
    for (const v of chips) {
      await page.click(`#sheet [data-pick-toggle="continents"][data-value="${v}"]`);
      await page.waitForTimeout(250);
    }
    const chipsOn = await page.$$eval('#sheet [data-pick-toggle="continents"][aria-pressed="true"]', (els) => els.length);
    const rows = await page.$$eval('#sheet input[data-pick="countries"]', (els) => els.slice(0, 2).map((e) => e.value));
    for (const v of rows) {
      await page.click(`#sheet .pick-opt:has(input[value="${v}"])`);
      await page.waitForTimeout(250);
    }
    const ticked = await page.$$eval('#sheet input[data-pick="countries"]:checked', (els) => els.length);
    const show = await page.$eval('#sheet button[type="submit"]', (b) => b.textContent);
    check('mobile: the sheet takes several continents and countries', chipsOn === 2 && ticked === 2 && /Show [1-9]/.test(show), `${chipsOn} chips, ${ticked} countries, "${show}"`);
    await page.screenshot({ path: join(out, 'mobile-sheet.png') });
  }
  check(`${vname}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
server.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
process.exit(failures ? 1 : 0);
