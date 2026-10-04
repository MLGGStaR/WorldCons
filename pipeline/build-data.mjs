#!/usr/bin/env node
// Build data/cons.json and the image set from pipeline/research/*.json.
//
//   node pipeline/build-data.mjs [--only id,id] [--no-images] [--refetch]
//
// For every research file that passes check-research, each edition becomes one con
// record. Guest photos are downloaded from the con's own guest page (candidate image
// picked by the researcher), cropped to a 4:5 credential photo and a small face thumb;
// guests without a usable photo fall back to Wikipedia's page image. Con art comes from
// the homepage image the researcher picked. Every image keeps its source URL in
// data/sources.json (provenance).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { checkFile, resolveCover } from './tools/check-research.mjs';
import { COUNTRIES } from '../js/geo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH = join(ROOT, 'pipeline', 'research');
const CACHE = join(ROOT, 'pipeline', 'cache');
const IMG_CACHE = join(CACHE, 'img');
const OUT_DATA = join(ROOT, 'data');
const OUT_CON = join(ROOT, 'img', 'c');
const OUT_GUEST = join(ROOT, 'img', 'g');
const OUT_GUEST_S = join(ROOT, 'img', 'g', 's');
const OUT_FLAGS = join(ROOT, 'img', 'flags');
const FLAG_SRC = join(ROOT, 'node_modules', 'flag-icons', 'flags', '4x3');

const argv = process.argv.slice(2);
const only = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 ? new Set(argv[i + 1].split(',')) : null;
})();
const NO_IMAGES = argv.includes('--no-images');
const REFETCH = argv.includes('--refetch');
const TODAY = new Date().toISOString().slice(0, 10);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

for (const d of [OUT_DATA, OUT_CON, OUT_GUEST, OUT_GUEST_S, OUT_FLAGS, IMG_CACHE]) mkdirSync(d, { recursive: true });

// ---- helpers ------------------------------------------------------------------------------

export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const sha1 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const extractCache = new Map();
function loadExtract(file) {
  if (!extractCache.has(file)) {
    const p = join(ROOT, file);
    extractCache.set(file, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return extractCache.get(file);
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}

// Download with an on-disk cache keyed by URL. Returns a Buffer or null.
async function download(url, referer) {
  if (!url || !/^https?:/.test(url)) return null;
  const file = join(IMG_CACHE, sha1(url));
  if (!REFETCH && existsSync(file)) {
    const buf = readFileSync(file);
    return buf.length ? buf : null;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,*/*;q=0.8', ...(referer ? { referer } : {}) },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) break;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) break;
      writeFileSync(file, buf);
      return buf;
    } catch {
      /* retry once */
    }
  }
  writeFileSync(file, Buffer.alloc(0)); // remember the failure (rerun with --refetch)
  return null;
}

const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// Average colour of the 2px frame of an image (used behind contained logos).
async function edgeColour(buf) {
  const { data, info } = await sharp(buf).flatten({ background: '#ffffff' }).resize(48, 48, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x > 1 && y > 1 && x < info.width - 2 && y < info.height - 2) continue;
      const i = (y * info.width + x) * info.channels;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return { r: r / n, g: g / n, b: b / n };
}

async function hasMeaningfulAlpha(buf) {
  const meta = await sharp(buf).metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await sharp(buf).resize(40, 40, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] < 200) transparent++;
  return transparent / (info.width * info.height) > 0.08;
}

const luminance = ({ r, g, b }) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// Share of pixels within a small distance of the frame colour: high = a logo on a plate.
async function flatness(buf, edge) {
  const { data, info } = await sharp(buf).flatten({ background: '#ffffff' }).resize(64, 64, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let flat = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (Math.abs(data[i] - edge.r) + Math.abs(data[i + 1] - edge.g) + Math.abs(data[i + 2] - edge.b) < 36) flat++;
  }
  return flat / (info.width * info.height);
}

async function processConArt(buf, outFile, forceContain) {
  let meta = await sharp(buf, { animated: false }).metadata();
  if (!meta.width || !meta.height) throw new Error('not an image');
  const alpha = await hasMeaningfulAlpha(buf);
  // A logo sitting on a big flat plate (e.g. a share image that is a small logo on black):
  // trim the plate so the logo fills the badge window, then show it contained on that colour.
  let plate = false;
  let plateTint = null;
  if (!alpha) {
    const edge = await edgeColour(buf);
    plateTint = hex(edge);
    if ((await flatness(buf, edge)) > 0.6) {
      const trimmed = await sharp(buf).flatten({ background: hex(edge) }).trim({ background: hex(edge), threshold: 24 }).png().toBuffer().catch(() => null);
      if (trimmed) {
        buf = trimmed;
        meta = await sharp(buf).metadata();
        plate = true;
      }
    }
  }
  const aspect = meta.width / meta.height;
  const contain = forceContain || alpha || plate || aspect < 1.45 || aspect > 2.5;
  let tint;
  if (contain) {
    if (alpha) {
      // Transparent logo: pick a ground that contrasts with the artwork itself.
      const st = await sharp(buf).stats();
      const logoLum = luminance(st.dominant);
      tint = logoLum > 0.6 ? '#1f2329' : '#f3f4f6';
    } else tint = plate ? plateTint : hex(await edgeColour(buf));
    const img = sharp(buf).resize(720, 377, { fit: 'inside', withoutEnlargement: plate });
    const out = await (alpha ? img : img.flatten({ background: tint })).webp({ quality: 80, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
    writeFileSync(outFile, out.data);
    return { w: out.info.width, h: out.info.height, tint, fit: 'contain' };
  }
  const st = await sharp(buf).stats();
  tint = hex(st.dominant);
  const out = await sharp(buf).resize(720, 377, { fit: 'cover', position: 'attention' }).flatten({ background: '#ffffff' }).webp({ quality: 74 }).toBuffer({ resolveWithObject: true });
  writeFileSync(outFile, out.data);
  return { w: out.info.width, h: out.info.height, tint, fit: 'cover' };
}

async function processGuestPhoto(buf, id) {
  const meta = await sharp(buf, { animated: false }).metadata();
  if (!meta.width || !meta.height || meta.width < 60 || meta.height < 60) throw new Error('too small');
  const aspect = meta.width / meta.height;
  // Taller than 4:5: keep the top (faces sit high in headshots). Wider: let sharp find the subject.
  const position = aspect < 0.8 ? 'north' : 'attention';
  const base = sharp(buf).flatten({ background: '#e9ebee' });
  const big = await base.clone().resize(240, 300, { fit: 'cover', position }).webp({ quality: 76 }).toBuffer();
  const small = await base.clone().resize(60, 76, { fit: 'cover', position }).webp({ quality: 70 }).toBuffer();
  writeFileSync(join(OUT_GUEST, `${id}.webp`), big);
  writeFileSync(join(OUT_GUEST_S, `${id}.webp`), small);
  return { w: meta.width, h: meta.height };
}

// ---- Wikipedia fallback for guests without a con photo ---------------------------------------

const PERSONISH =
  /actor|actress|voice|artist|illustrator|cartoonist|writer|author|novelist|comedian|cosplayer|wrestler|singer|musician|rapper|director|producer|presenter|host|youtuber|streamer|model|athlete|player|animator|manga|creator|designer|puppeteer|stunt|dancer|personality|journalist|podcaster|composer|editor|filmmaker|screenwriter/i;

async function wikipediaPhoto(name, known) {
  const q = `${name} ${known || ''}`.trim();
  const api =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&generator=search&gsrlimit=4' +
    `&gsrsearch=${encodeURIComponent(q)}&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=500&origin=*`;
  try {
    const res = await fetch(api, { headers: { 'user-agent': 'WorldConsBot/1.0 (https://github.com/MLGGStaR/WorldCons)' } });
    if (!res.ok) return null;
    const json = await res.json();
    const pages = ((json.query && json.query.pages) || []).sort((a, b) => a.index - b.index);
    const want = slug(name);
    for (const p of pages) {
      const titleSlug = slug(p.title.replace(/\s*\(.*\)\s*$/, ''));
      if (titleSlug !== want) continue;
      if (!p.thumbnail || !PERSONISH.test(p.description || '')) continue;
      return { img: p.thumbnail.source, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` };
    }
  } catch {
    /* offline or rate-limited: no fallback */
  }
  return null;
}

// ---- main --------------------------------------------------------------------------------------

async function main() {
  const files = readdirSync(RESEARCH)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !only || only.has(f.replace(/\.json$/, '')));
  const problems = [];
  const research = [];
  for (const f of files) {
    const path = join(RESEARCH, f);
    const { errors } = checkFile(path);
    if (errors.length) {
      problems.push(`${f}: ${errors.join(' | ')}`);
      continue;
    }
    research.push(JSON.parse(readFileSync(path, 'utf8')));
  }

  const cons = [];
  const guests = new Map(); // id -> { names: Map, cats: Map, knowns: Map, photos: [{url, w, h, referer, con}] }
  const sources = { cons: {}, guests: {} };
  const ids = new Set();

  for (const r of research) {
    if (r.status !== 'active') continue;
    for (const e of r.editions || []) {
      let id = `${r.id}-${e.start.slice(0, 4)}`;
      if (ids.has(id)) id = `${r.id}-${e.start.slice(0, 7)}`;
      ids.add(id);
      const lineup = [];
      const perConKnown = {};
      const seen = new Set();
      const addGuest = (name, known, cat, photo) => {
        const clean = String(name).replace(/\s+/g, ' ').trim();
        const gid = slug(clean);
        if (!gid || seen.has(gid)) return;
        seen.add(gid);
        lineup.push(gid);
        if (!guests.has(gid)) guests.set(gid, { names: new Map(), cats: new Map(), knowns: new Map(), photos: [] });
        const g = guests.get(gid);
        g.names.set(clean, (g.names.get(clean) || 0) + 1);
        g.cats.set(cat, (g.cats.get(cat) || 0) + 1);
        if (known) {
          g.knowns.set(known, (g.knowns.get(known) || 0) + 1);
          perConKnown[gid] = known;
        }
        if (photo) g.photos.push({ ...photo, con: id });
      };
      for (const l of e.lineup || []) {
        const x = loadExtract(l.file);
        for (const [i, name, known, cat] of l.picks || []) {
          const cand = x && x.candidates[i];
          addGuest(name, known, cat, cand ? { url: cand.img, w: cand.w, h: cand.h, referer: x.finalUrl || x.url } : null);
        }
      }
      for (const [name, known, cat] of e.textOnlyGuests || []) addGuest(name, known, cat, null);

      cons.push({
        id,
        series: r.id,
        name: r.name,
        short: r.short || '',
        organizer: r.organizer || '',
        start: e.start,
        end: e.end,
        dp: e.dates === 'month' ? 'm' : 'd',
        venue: e.venue || '',
        city: e.city,
        region: e.region || '',
        country: e.country,
        types: r.types,
        url: r.url,
        tickets: e.tickets || '',
        guestsPage: e.guestsPage || '',
        gs: e.guests,
        blurb: r.blurb,
        checked: r.checked || TODAY,
        g: lineup,
        _known: perConKnown,
        _cover: r.cover,
        _coverKey: r.cover && r.cover.key,
      });
    }
  }

  // Merge near-duplicate guest names (typos like "Kristen Kreuk" / "Kristin Kreuk").
  const merged = mergeTypos(guests, cons);

  // Finalise guest records.
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
  const guestOut = {};
  for (const [gid, g] of guests) {
    const name = top(g.names)[0];
    const cat = top(g.cats)[0];
    const known = g.knowns.size ? top(g.knowns)[0] : '';
    guestOut[gid] = { n: name, c: cat, k: known };
  }
  for (const c of cons) {
    const k = {};
    for (const [gid, known] of Object.entries(c._known)) if (guestOut[gid] && known && known !== guestOut[gid].k) k[gid] = known;
    if (Object.keys(k).length) c.k = k;
    delete c._known;
  }

  // ---- images ----
  if (!NO_IMAGES) {
    // Con art: one image per series, reused by every edition.
    const bySeries = new Map();
    for (const c of cons) if (!bySeries.has(c.series)) bySeries.set(c.series, c);
    let artOk = 0;
    await pool([...bySeries.values()], 8, async (c) => {
      const url = resolveCover(c._cover);
      const x = c._cover && loadExtract(c._cover.file);
      const out = join(OUT_CON, `${c.series}.webp`);
      const buf = await download(url, x ? x.finalUrl : c.url);
      if (!buf) return;
      try {
        const info = await processConArt(buf, out, /^logo:/.test(c._coverKey || ''));
        for (const e of cons.filter((k) => k.series === c.series)) {
          Object.assign(e, { img: `img/c/${c.series}.webp`, imgW: info.w, imgH: info.h, tint: info.tint, fit: info.fit });
        }
        sources.cons[c.series] = url;
        artOk++;
      } catch (err) {
        problems.push(`art ${c.series}: ${err.message}`);
      }
    });
    console.log(`con art: ${artOk}/${bySeries.size}`);

    // Guest photos: try the con photos (largest first), then Wikipedia.
    const entries = [...guests.entries()];
    let fromCon = 0, fromWiki = 0, none = 0;
    await pool(entries, 10, async ([gid, g]) => {
      const photos = [...g.photos].sort((a, b) => b.w * b.h - a.w * a.h);
      for (const p of photos) {
        const buf = await download(p.url, p.referer);
        if (!buf) continue;
        try {
          await processGuestPhoto(buf, gid);
          guestOut[gid].p = `img/g/${gid}.webp`;
          guestOut[gid].s = `img/g/s/${gid}.webp`;
          sources.guests[gid] = p.url;
          fromCon++;
          return;
        } catch {
          /* try the next photo */
        }
      }
      const wiki = await wikipediaPhoto(guestOut[gid].n, guestOut[gid].k);
      if (wiki) {
        const buf = await download(wiki.img, 'https://en.wikipedia.org/');
        if (buf) {
          try {
            await processGuestPhoto(buf, gid);
            guestOut[gid].p = `img/g/${gid}.webp`;
            guestOut[gid].s = `img/g/s/${gid}.webp`;
            guestOut[gid].w = wiki.page;
            sources.guests[gid] = wiki.img;
            fromWiki++;
            return;
          } catch {}
        }
      }
      none++;
    });
    console.log(`guest photos: ${fromCon} from con pages, ${fromWiki} from Wikipedia, ${none} without a photo (of ${entries.length})`);
  } else {
    // Keep whatever images already exist on disk.
    for (const c of cons) if (existsSync(join(OUT_CON, `${c.series}.webp`))) c.img = `img/c/${c.series}.webp`;
    for (const gid of Object.keys(guestOut)) {
      if (existsSync(join(OUT_GUEST, `${gid}.webp`))) Object.assign(guestOut[gid], { p: `img/g/${gid}.webp`, s: `img/g/s/${gid}.webp` });
    }
  }

  // Flags for every country in the data.
  for (const cc of new Set(cons.map((c) => c.country))) {
    const src = join(FLAG_SRC, `${cc.toLowerCase()}.svg`);
    if (existsSync(src)) copyFileSync(src, join(OUT_FLAGS, `${cc.toLowerCase()}.svg`));
    if (!COUNTRIES[cc]) problems.push(`unknown country ${cc}`);
  }

  // Remove images no record points at any more.
  const keepCon = new Set(cons.map((c) => `${c.series}.webp`));
  for (const f of readdirSync(OUT_CON)) if (!keepCon.has(f)) rmSync(join(OUT_CON, f));
  const keepGuest = new Set(Object.keys(guestOut).map((g) => `${g}.webp`));
  for (const f of readdirSync(OUT_GUEST)) if (f.endsWith('.webp') && !keepGuest.has(f)) rmSync(join(OUT_GUEST, f));
  for (const f of readdirSync(OUT_GUEST_S)) if (!keepGuest.has(f)) rmSync(join(OUT_GUEST_S, f));

  for (const c of cons) {
    delete c._cover;
    delete c._coverKey;
  }
  cons.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.name.localeCompare(b.name)));
  const generated = research.reduce((d, r) => (r.checked && r.checked > d ? r.checked : d), '') || TODAY;
  writeFileSync(join(OUT_DATA, 'cons.json'), JSON.stringify({ generated, cons, guests: guestOut }));
  writeFileSync(join(OUT_DATA, 'sources.json'), JSON.stringify(sources, null, 1));

  const withGuests = cons.filter((c) => c.g.length).length;
  console.log(`cons: ${cons.length} editions from ${research.length} research files (${withGuests} with guests), guests: ${Object.keys(guestOut).length}`);
  if (merged.length) console.log(`merged near-duplicate guests:\n  ${merged.join('\n  ')}`);
  if (problems.length) console.log(`problems (${problems.length}):\n  ${problems.join('\n  ')}`);
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function mergeTypos(guests, cons) {
  const log = [];
  const ids = [...guests.keys()].filter((id) => id.length >= 10).sort();
  const count = (id) => [...guests.get(id).names.values()].reduce((a, b) => a + b, 0);
  const catOf = (id) => [...guests.get(id).cats.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const byLen = new Map();
  for (const id of ids) {
    const k = id.length;
    for (const l of [k - 1, k, k + 1]) for (const other of byLen.get(l) || []) {
      if (!guests.has(other) || !guests.has(id) || other === id) continue;
      // Same first letter of each word and the same category guard against real namesakes.
      if (other.split('-').map((w) => w[0]).join('') !== id.split('-').map((w) => w[0]).join('')) continue;
      if (catOf(other) !== catOf(id)) continue;
      if (editDistance(other, id) !== 1) continue;
      const [keep, drop] = count(other) >= count(id) ? [other, id] : [id, other];
      const a = guests.get(keep);
      const b = guests.get(drop);
      for (const [k, v] of b.names) a.names.set(k, (a.names.get(k) || 0) + v);
      for (const [k, v] of b.cats) a.cats.set(k, (a.cats.get(k) || 0) + v);
      for (const [k, v] of b.knowns) a.knowns.set(k, (a.knowns.get(k) || 0) + v);
      a.photos.push(...b.photos);
      guests.delete(drop);
      for (const c of cons) {
        if (!c.g.includes(drop)) continue;
        c.g = c.g.includes(keep) ? c.g.filter((x) => x !== drop) : c.g.map((x) => (x === drop ? keep : x));
        if (c._known[drop]) {
          c._known[keep] = c._known[keep] || c._known[drop];
          delete c._known[drop];
        }
      }
      log.push(`${drop} -> ${keep}`);
    }
    if (!byLen.has(id.length)) byLen.set(id.length, []);
    byLen.get(id.length).push(id);
  }
  return log;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
