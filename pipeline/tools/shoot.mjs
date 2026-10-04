#!/usr/bin/env node
// Screenshot the site for review. Starts a local server on a free port.
//   node pipeline/tools/shoot.mjs <outDir> [route ...]
// Each route is "name=#/hash" and is captured at desktop (1440x900) and mobile (390x844).
// Add --full for full-page captures, --dark for the dark theme, --console to print browser logs.
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const outDir = args[0];
const full = args.includes('--full');
const dark = args.includes('--dark');
const showConsole = args.includes('--console');
const onlyMobile = args.includes('--mobile');
const onlyDesktop = args.includes('--desktop');
const routes = args.slice(1).filter((a) => !a.startsWith('--')).map((r) => { const i = r.indexOf('='); return [r.slice(0, i), r.slice(i + 1)]; });
if (!outDir || !routes.length) {
  console.error('usage: shoot.mjs <outDir> name=#/route ... [--full] [--dark] [--mobile|--desktop]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(ROOT, p);
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const variants = [];
if (!onlyMobile) variants.push(['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }]);
if (!onlyDesktop) variants.push(['mobile', { ...devices['iPhone 13'], deviceScaleFactor: 2 }]);
for (const [vname, opts] of variants) {
  const ctx = await browser.newContext({ ...opts, colorScheme: dark ? 'dark' : 'light' });
  for (const [name, hash] of routes) {
    const page = await ctx.newPage();
    page.on('console', (m) => showConsole && console.log(`[${vname}] ${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => console.log(`[${vname}] PAGE ERROR: ${e.message}`));
    await page.goto(base + (hash || ''), { waitUntil: 'networkidle' });
    // Full-page captures need every section painted (the app skips off-screen ones).
    if (full) await page.addStyleTag({ content: '.month, .cred { content-visibility: visible !important; }' });
    await page.waitForFunction(() => !document.querySelector('.skel'), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(async () => {
      // Load lazy images in the first screens, then return to the top.
      for (let y = 0; y < 3; y++) {
        window.scrollBy(0, window.innerHeight);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    const file = join(outDir, `${name}-${vname}${dark ? '-dark' : ''}.png`);
    await page.screenshot({ path: file, fullPage: full });
    console.log(file, await page.evaluate(() => location.hash + " :: " + document.title));
    await page.close();
  }
  await ctx.close();
}
await browser.close();
server.close();
