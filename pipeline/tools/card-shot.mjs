#!/usr/bin/env node
// Screenshot picked guest cards with the text around them, to check which name sits with
// which photo when a card's own text does not say (image-only cards, hashed file names).
//   node pipeline/tools/card-shot.mjs <saved extraction .json> <n,n,...> [--out dir]
// Writes <out>/<extraction name>-<n>.png (default out: pipeline/.tmp/cards) and prints one
// line per number: the file written, or why the card could not be found on the page.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, dismissOverlays, expandAll } from './extract.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const oi = argv.indexOf('--out');
const OUT = oi >= 0 ? argv[oi + 1] : join(ROOT, 'pipeline', '.tmp', 'cards');
const [fileArg, numsArg] = argv.filter((a, i) => !a.startsWith('--') && !(oi >= 0 && i === oi + 1));
if (!fileArg || !numsArg) {
  console.error('usage: card-shot.mjs <saved extraction .json> <n,n,...> [--out dir]');
  process.exit(2);
}
const file = isAbsolute(fileArg) ? fileArg : join(ROOT, fileArg);
const x = JSON.parse(readFileSync(file, 'utf8'));
const nums = numsArg.split(',').map(Number);
const stem = basename(file).replace(/\.json$/, '');
mkdirSync(OUT, { recursive: true });

// The part of an image URL that survives CDN resizing: the file name without extension,
// size suffix (-300x200) or Wix transform path.
const keyOf = (url) => {
  const wix = /\/media\/([^/]+?)(?:\.\w+)?(?:\/|$)/.exec(url || '');
  if (wix) return wix[1];
  return decodeURIComponent((url || '').split(/[?#]/)[0].split('/').pop() || '')
    .replace(/=[swh]\d+.*$/, '') // Google-hosted images: =w1280, =s0, =w800-h600
    .replace(/\.\w+$/, '')
    .replace(/-\d+x\d+$/, '')
    .replace(/-scaled$/, '');
};

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
try {
  await page.goto(x.finalUrl || x.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await dismissOverlays(page);
  await expandAll(page);
} catch (e) {
  console.log(`page did not load: ${String(e.message || e).split('\n')[0]}`);
}

for (const n of nums) {
  const c = x.candidates[n];
  if (!c) {
    console.log(`#${n}: no such candidate`);
    continue;
  }
  const key = keyOf(c.img);
  const handle = await page.evaluateHandle((k) => {
    const all = [...document.querySelectorAll('img, picture source, [style*="background"]')];
    const hits = all
      .filter((el) => {
        const s = `${el.currentSrc || ''} ${el.getAttribute('src') || ''} ${el.getAttribute('srcset') || ''} ${el.getAttribute('data-src') || ''} ${el.style ? el.style.backgroundImage : ''}`;
        return s.includes(k);
      })
      .map((el) => (el.tagName === 'SOURCE' ? el.parentElement.querySelector('img') || el.parentElement : el));
    // Lightboxes and sliders keep hidden copies of the same image: take one that is laid out.
    const shown = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 20 && r.height > 20 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    return hits.find(shown) || hits[0] || null;
  }, key);
  const el = handle.asElement();
  if (!el) {
    console.log(`#${n}: not found on the first page (${key})`);
    continue;
  }
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  const box = await el.boundingBox();
  if (!box || box.width < 4 || box.height < 4) {
    console.log(`#${n}: image is hidden on the page (${key})`);
    continue;
  }
  // The card plus its neighbours: captions sit below, beside or above a photo.
  const vw = 1366;
  const left = Math.max(0, box.x - box.width * 0.6);
  const right = Math.min(vw, box.x + box.width * 1.6);
  const top = Math.max(0, box.y - Math.min(160, box.height * 0.5));
  const bottom = box.y + box.height + Math.min(260, Math.max(120, box.height * 0.8));
  const clip = { x: left, y: top, width: right - left, height: Math.min(900 - top, bottom - top) };
  const out = join(OUT, `${stem}-${n}.png`);
  // Mark the picked image so the reviewer can tell it from its neighbours.
  await el.evaluate((node) => {
    node.style.outline = '6px solid #ff00aa';
    node.style.outlineOffset = '-6px';
  });
  await page.screenshot({ path: out, clip });
  await el.evaluate((node) => {
    node.style.outline = '';
  });
  console.log(`#${n}: ${out.replace(/\\/g, '/')}`);
}
await browser.close();
