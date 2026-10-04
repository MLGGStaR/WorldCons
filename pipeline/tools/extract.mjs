#!/usr/bin/env node
// Render a convention web page in Chromium and report what the data pipeline needs:
// page metadata (og:image, JSON-LD events, date snippets, useful links) and every
// sizeable image together with the text of the card it sits in (guest candidates).
//
//   node pipeline/tools/extract.mjs <url> [--mode guests|home] [--save <slug>]
//        [--out file.json] [--shot file.png] [--channel msedge] [--max 1500] [--wait ms]
//
// --save <slug> writes the full result to pipeline/cache/extract/<slug>.<mode>.json and
// prints a compact, numbered summary instead of JSON (this is what research agents use:
// they pick guests by candidate number, the build step maps numbers back to image URLs).

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const flags = new Set(['mode', 'save', 'out', 'shot', 'channel', 'max', 'wait']);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const url = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && flags.has(argv[i - 1].replace(/^--/, ''))));
if (!url) {
  console.error('usage: extract.mjs <url> [--mode guests|home] [--save slug] [--out file] [--shot file] [--channel msedge]');
  process.exit(2);
}
const mode = opt('mode', 'guests');
const save = opt('save');
const out = opt('out') || (save ? join(ROOT, 'pipeline', 'cache', 'extract', `${save}.${mode}.json`) : null);
const shot = opt('shot');
const channel = opt('channel');
const maxCandidates = Number(opt('max', 1500));
const extraWait = Number(opt('wait', 0));

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    ...(channel ? { channel } : {}),
  });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => undefined }));
  const page = await context.newPage();
  let status = null;
  let error = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = resp ? resp.status() : null;
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    if (extraWait) await sleep(extraWait);
    const title = await page.title();
    if (/just a moment|attention required|access denied|checking your browser/i.test(title)) {
      await sleep(9000);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }
    await dismissOverlays(page);
    if (mode === 'guests') await expandAll(page);
    else await autoScroll(page, 10);
  } catch (e) {
    error = String(e.message || e).split('\n')[0];
  }

  let data = {};
  try {
    data = await page.evaluate(collect, { mode, maxCandidates });
  } catch (e) {
    error = error || String(e.message || e).split('\n')[0];
  }
  if (shot) {
    mkdirSync(dirname(shot), { recursive: true });
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  }
  await browser.close();

  const result = { url, status, error, mode, extractedAt: new Date().toISOString(), ...data };
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(result, null, 1));
  }
  if (save) printCompact(result, relative(ROOT, out).replace(/\\/g, '/'));
  else if (!out) process.stdout.write(JSON.stringify(result, null, 1) + '\n');
  else console.log(`wrote ${out}`);
}

const JUNK =
  /\b(buy (autographs?|photos?)(\s*[\/&]\s*(photo ops?|autographs?))?|view (bio|schedule|profile|details)|learn more|read more|more info|photo ops?|autographs?)\b/gi;
const squeeze = (s, n) => {
  if (!s) return '';
  const t = s.replace(JUNK, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

function printCompact(r, savedPath) {
  const lines = [];
  lines.push(`PAGE ${r.finalUrl || r.url}  status=${r.status}${r.error ? `  ERROR=${r.error}` : ''}`);
  lines.push(`TITLE ${r.title || ''}`);
  lines.push(`SAVED ${savedPath}`);
  if (r.jsonLdEvents && r.jsonLdEvents.length) {
    for (const e of r.jsonLdEvents.slice(0, 6)) {
      lines.push(`JSON-LD ${e.type}: "${squeeze(e.name, 90)}" ${e.startDate || '?'} -> ${e.endDate || '?'} @ ${squeeze(e.location, 90)}`);
    }
  }
  if (r.dateSnippets && r.dateSnippets.length) {
    lines.push('DATE TEXT:');
    for (const d of r.dateSnippets.slice(0, mode === 'home' ? 14 : 6)) lines.push(`  ~ ${d}`);
  }
  if (mode === 'home') {
    lines.push(`DESCRIPTION ${squeeze(r.description, 240)}`);
    lines.push('IMAGES (pick one key for the cover):');
    if (r.ogImage) lines.push(`  og      ${r.ogImage}`);
    if (r.twitterImage && r.twitterImage !== r.ogImage) lines.push(`  twitter ${r.twitterImage}`);
    (r.heroImages || []).forEach((h, i) => lines.push(`  hero:${i} [${h.w}x${h.h}] ${h.alt ? `alt="${squeeze(h.alt, 60)}" ` : ''}${h.img}`));
    (r.logos || []).forEach((h, i) => lines.push(`  logo:${i} [${h.w}x${h.h}] ${h.img}`));
    lines.push('LINKS:');
    for (const l of (r.links || []).slice(0, 60)) lines.push(`  ${squeeze(l.text, 50) || '(no text)'} -> ${l.href}`);
    lines.push(`TEXT ${squeeze(r.textSample, 900)}`);
  } else {
    const c = r.candidates || [];
    lines.push(`CANDIDATES ${c.length} (cite guests by #number; size is rendered px)`);
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    let sec = null;
    for (const x of c) {
      if ((x.section || '') !== sec) {
        sec = x.section || '';
        lines.push(`== section: ${sec || '(none)'}`);
      }
      const altClean = (x.alt || '').replace(/,?\s*will be (at|appearing)\b.*$/i, '');
      const text = squeeze(x.text, 110);
      // Skip alt when the card text already carries it (saves tokens on big pages).
      const altHead = norm(altClean.split(',')[0]);
      const showAlt = altClean && !(altHead && norm(text).includes(altHead));
      const altPart = showAlt ? ` alt="${squeeze(altClean, 80)}"` : '';
      const textPart = text ? ` text="${text}"` : '';
      lines.push(`#${x.i} [${x.w}x${x.h}]${altPart}${textPart}`);
    }
    const candLinks = new Set(c.map((x) => x.link).filter(Boolean));
    const guestLinks = (r.links || []).filter(
      (l) => !candLinks.has(l.href) && /guest|celeb|talent|line-?up|artist|creator|voice|cosplay/i.test(l.href + ' ' + l.text) && !/[?&](gtid|id)=/i.test(l.href),
    );
    if (guestLinks.length) {
      lines.push('OTHER GUEST-RELATED LINKS (other categories / pages may hold more guests):');
      for (const l of guestLinks.slice(0, 20)) lines.push(`  ${squeeze(l.text, 50) || '(no text)'} -> ${l.href}`);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}

async function dismissOverlays(page) {
  const labels = [/^accept( all)?( cookies)?$/i, /^(i )?agree$/i, /^got it$/i, /^allow all$/i, /^(no thanks|close)$/i];
  for (const re of labels) {
    const btn = page.getByRole('button', { name: re }).first();
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click({ timeout: 1500 }).catch(() => {});
      await sleep(300);
    }
  }
}

async function autoScroll(page, steps) {
  for (let i = 0; i < steps; i++) {
    const done = await page.evaluate(() => {
      window.scrollBy(0, Math.round(window.innerHeight * 0.9));
      return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
    });
    await sleep(250);
    if (done) break;
  }
}

async function expandAll(page) {
  // Scroll to the bottom repeatedly (infinite scroll + lazy images), clicking any
  // "load more" style button we pass, until the page stops growing.
  let lastHeight = 0;
  for (let round = 0; round < 30; round++) {
    await autoScroll(page, 60);
    const clicked = await page.evaluate(() => {
      const re = /^(load|show|view|see) (more|all)( guests?| results| celebrities| talent| creators)?$|^more guests$/i;
      const els = [...document.querySelectorAll('button, a[role=button], a.button, a.btn, .load-more, [class*="load-more"]')];
      const el = els.find((e) => re.test((e.innerText || '').trim()) && e.offsetParent !== null);
      if (el) {
        el.click();
        return true;
      }
      return false;
    });
    await sleep(clicked ? 1500 : 600);
    await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (!clicked && h === lastHeight) break;
    lastHeight = h;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
}

// Runs inside the page.
function collect({ mode, maxCandidates }) {
  const abs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  const clean = (s, n = 200) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const meta = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getAttribute('content') || el.getAttribute('href') : null;
  };

  // ---- metadata ---------------------------------------------------------------
  const jsonLd = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(s.textContent);
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (n['@graph']) walk(n['@graph']);
        const t = [].concat(n['@type'] || []).join(',');
        if (/Event|Festival|Exhibition/i.test(t)) {
          const loc = [].concat(n.location || [])[0];
          jsonLd.push({
            type: t,
            name: n.name,
            startDate: n.startDate,
            endDate: n.endDate,
            eventStatus: n.eventStatus,
            location: loc && (loc.name || (loc.address && (typeof loc.address === 'string' ? loc.address : JSON.stringify(loc.address)))),
            image: [].concat(n.image || [])[0],
            url: n.url,
          });
        }
      };
      walk(parsed);
    } catch {}
  }

  const metaInfo = {
    finalUrl: location.href,
    title: clean(document.title, 160),
    description: clean(meta('meta[name="description"]') || meta('meta[property="og:description"]'), 300),
    ogTitle: clean(meta('meta[property="og:title"]'), 160),
    ogImage: abs(meta('meta[property="og:image"]') || meta('meta[property="og:image:url"]') || meta('meta[property="og:image:secure_url"]') || '') || null,
    twitterImage: abs(meta('meta[name="twitter:image"]') || meta('meta[property="twitter:image"]') || meta('meta[name="twitter:image:src"]') || '') || null,
    icon: abs(meta('link[rel="apple-touch-icon"]') || meta('link[rel~="icon"]') || '') || null,
    jsonLdEvents: jsonLd.slice(0, 10),
  };
  if (metaInfo.ogImage === location.href) metaInfo.ogImage = null;
  if (metaInfo.twitterImage === location.href) metaInfo.twitterImage = null;

  // ---- image candidates -------------------------------------------------------
  const bestFromSrcset = (ss) => {
    if (!ss) return null;
    let best = null;
    let bestW = -1;
    for (const part of ss.split(/,\s+(?=\S)/)) {
      const [u, d] = part.trim().split(/\s+/);
      const w = d ? parseFloat(d) : 1;
      if (u && w > bestW) {
        best = u;
        bestW = w;
      }
    }
    return best;
  };
  const isPlaceholder = (u) => !u || /^data:/.test(u) || /blank\.(gif|png)|spacer\.|placeholder|lazy[-_]?load|1x1\./i.test(u);
  const imgUrl = (img) => {
    const attrs = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-image', 'data-bg', 'data-full'];
    let u = img.currentSrc || img.getAttribute('src');
    if (isPlaceholder(u)) {
      for (const a of attrs) {
        if (img.getAttribute(a)) {
          u = img.getAttribute(a);
          break;
        }
      }
    }
    if (isPlaceholder(u)) u = bestFromSrcset(img.getAttribute('data-srcset') || img.getAttribute('srcset'));
    if (isPlaceholder(u)) {
      const src = img.closest('picture') && img.closest('picture').querySelector('source[srcset], source[data-srcset]');
      if (src) u = bestFromSrcset(src.getAttribute('srcset') || src.getAttribute('data-srcset'));
    }
    return isPlaceholder(u) ? null : abs(u);
  };

  const items = [];
  for (const img of document.querySelectorAll('img')) {
    const r = img.getBoundingClientRect();
    const w = Math.round(r.width) || img.naturalWidth || 0;
    const h = Math.round(r.height) || img.naturalHeight || 0;
    const u = imgUrl(img);
    if (!u) continue;
    items.push({ el: img, url: u, w, h, alt: clean(img.getAttribute('alt'), 140), title: clean(img.getAttribute('title'), 120) });
  }
  // CSS background images on block elements (common for guest "cards").
  for (const el of document.querySelectorAll('div, a, span, figure, section, li, header')) {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || !bg.includes('url(')) continue;
    const m = bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (!m || isPlaceholder(m[1])) continue;
    const r = el.getBoundingClientRect();
    items.push({ el, url: abs(m[1]), w: Math.round(r.width), h: Math.round(r.height), alt: clean(el.getAttribute('aria-label'), 120), title: '', bg: true });
  }

  const sizeable = items.filter((it) => (it.w >= 60 && it.h >= 60) || (it.w === 0 && it.h === 0));

  // Section heading that precedes an element (e.g. "Celebrity Guests", "Comic Creators").
  const headingFor = (el) => {
    let node = el;
    for (let hops = 0; node && hops < 400; hops++) {
      if (node.previousElementSibling) {
        node = node.previousElementSibling;
        const hs = node.matches('h1,h2,h3,h4') ? [node] : [...node.querySelectorAll('h1,h2,h3,h4')];
        const last = hs[hs.length - 1];
        if (last && clean(last.innerText, 80)) return clean(last.innerText, 80);
      } else {
        node = node.parentElement;
      }
    }
    return '';
  };

  const cardFor = (it) => {
    // Climb while the ancestor holds no other candidate image; that ancestor is the card.
    let card = it.el;
    for (let depth = 0; depth < 8 && card.parentElement; depth++) {
      const p = card.parentElement;
      const holdsAnother = sizeable.some(
        (o) => o.el !== it.el && o.url !== it.url && p.contains(o.el) && !o.el.contains(it.el) && !it.el.contains(o.el),
      );
      if (holdsAnother) break;
      card = p;
      if (p.tagName === 'BODY') break;
    }
    const text = clean(card.innerText, 240) || clean(card.textContent, 240);
    const a = it.el.closest('a') || card.querySelector('a');
    return { text, link: a ? a.href : null };
  };

  const seen = new Set();
  const candidates = [];
  for (const it of sizeable) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    const { text, link } = cardFor(it);
    candidates.push({
      i: candidates.length,
      img: it.url,
      w: it.w,
      h: it.h,
      alt: it.alt || undefined,
      title: it.title || undefined,
      text: text || undefined,
      link: link && link !== location.href ? link : undefined,
      section: mode === 'guests' ? headingFor(it.el) || undefined : undefined,
      bg: it.bg || undefined,
    });
    if (candidates.length >= maxCandidates) break;
  }

  // ---- links + date snippets --------------------------------------------------
  const linkRe = /guest|celebr|talent|lineup|line-up|artist|creator|voice|cosplay|special|featured|autograph|photo-?op|ticket|badge|register|attend|dates?|schedule|venue|location|hotel/i;
  const links = [];
  const seenLinks = new Set();
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href;
    if (!href || seenLinks.has(href) || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    const text = clean(a.innerText || a.getAttribute('aria-label') || '', 60);
    if (!linkRe.test(href) && !linkRe.test(text)) continue;
    seenLinks.add(href);
    links.push({ text, href });
    if (links.length >= 90) break;
  }

  const body = document.body ? document.body.innerText : '';
  const M = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const monthRe = new RegExp(
    `${M}\\.?\\s*\\d{1,2}(?:st|nd|rd|th)?(?:\\s*[-–—&,]\\s*(?:${M}\\.?\\s*)?\\d{1,2}(?:st|nd|rd|th)?)*,?\\s*(?:20\\d\\d)?` +
      `|\\d{1,2}(?:st|nd|rd|th)?\\s*(?:[-–—&]\\s*\\d{1,2}(?:st|nd|rd|th)?\\s*)?${M}\\.?\\s*(?:20\\d\\d)?` +
      `|\\b20\\d\\d[-/.]\\d{1,2}[-/.]\\d{1,2}\\b|\\b\\d{1,2}[./]\\d{1,2}[./]20\\d\\d\\b`,
    'gi',
  );
  const dateSnippets = [];
  const seenDates = new Set();
  for (const m of body.matchAll(monthRe)) {
    const s = clean(m[0], 60);
    if (s.length < 5 || seenDates.has(s)) continue;
    seenDates.add(s);
    dateSnippets.push(clean(body.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70), 180));
    if (dateSnippets.length >= 25) break;
  }

  const result = { ...metaInfo, links, dateSnippets };
  if (mode === 'guests') {
    result.candidates = candidates;
  } else {
    result.heroImages = candidates
      .filter((c) => c.w * c.h > 0 && !/logo/i.test(c.img))
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, 8)
      .map(({ img, w, h, alt }) => ({ img, w, h, alt }));
    result.logos = items
      .filter((it) => /logo/i.test(it.url + ' ' + (it.alt || '') + ' ' + (typeof it.el.className === 'string' ? it.el.className : '')))
      .slice(0, 5)
      .map((it) => ({ img: it.url, w: it.w, h: it.h, alt: it.alt }));
    result.textSample = clean(body, 2500);
  }
  return result;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
