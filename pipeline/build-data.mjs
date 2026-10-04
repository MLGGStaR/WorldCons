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
import { execFile } from 'node:child_process';
import sharp from 'sharp';
import { checkFile, resolveCover } from './tools/check-research.mjs';
import { COUNTRIES } from '../js/geo.js';
import { slug, mergeTypos } from './lib/guests.mjs';

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

// At most a few requests at a time per host, so con sites don't start refusing us.
const hostSlots = new Map();
async function withHost(url, fn) {
  const host = new URL(url).hostname;
  if (!hostSlots.has(host)) hostSlots.set(host, { busy: 0, queue: [] });
  const h = hostSlots.get(host);
  if (h.busy >= 3) await new Promise((r) => h.queue.push(r));
  h.busy++;
  try {
    return await fn();
  } finally {
    h.busy--;
    const next = h.queue.shift();
    if (next) next();
  }
}

async function fetchNode(url, referer) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,*/*;q=0.8', ...(referer ? { referer } : {}) },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: res.status };
    return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// Some sites refuse Node's TLS fingerprint but serve curl (shipped with Windows) fine.
function fetchCurl(url, referer) {
  return new Promise((resolve) => {
    const args = ['-sL', '--max-time', '30', '-A', UA, '-H', 'Accept: image/avif,image/webp,image/*,*/*;q=0.8', ...(referer ? ['-e', referer] : []), '-w', '%{http_code}', '-o', '-', url];
    execFile('curl', args, { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout || stdout.length < 3) return resolve({ status: 0 });
      const status = Number(stdout.subarray(stdout.length - 3).toString());
      resolve(status >= 200 && status < 300 ? { status, buf: stdout.subarray(0, stdout.length - 3) } : { status });
    });
  });
}

// Download with an on-disk cache keyed by URL. Returns a Buffer or null. Failures are not
// cached, so the next build tries again.
async function download(url, referer) {
  if (!url || !/^https?:/.test(url)) return null;
  const file = join(IMG_CACHE, sha1(url));
  if (!REFETCH && existsSync(file)) {
    const buf = readFileSync(file);
    if (buf.length) return buf;
  }
  return withHost(url, async () => {
    for (const get of [fetchNode, fetchCurl, fetchCurl]) {
      const r = await get(url, referer);
      if (r.status === 404 || r.status === 410) return null;
      if (r.buf && r.buf.length >= 200) {
        writeFileSync(file, r.buf);
        return r.buf;
      }
      await new Promise((res) => setTimeout(res, 800));
    }
    return null;
  });
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
  // Cons with no announced upcoming edition: listed as "dates not announced yet".
  const tba = [];
  const seedFile = join(ROOT, 'pipeline', 'seed', 'series.json');
  const seed = new Map(existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')).map((s) => [s.id, s]) : []);

  for (const r of research) {
    if (r.status !== 'active') continue;
    if (!(r.editions || []).length) {
      const place = r.last || seed.get(r.id);
      if (!place || !place.city || !COUNTRIES[String(place.country || '').toUpperCase()]) continue;
      tba.push({
        id: r.id,
        series: r.id,
        name: r.name,
        short: r.short || '',
        organizer: r.organizer || '',
        tba: true,
        last: r.last ? { start: r.last.start, end: r.last.end } : null,
        venue: (r.last && r.last.venue) || '',
        city: place.city,
        region: place.region || '',
        country: String(place.country).toUpperCase(),
        types: r.types,
        url: r.url,
        blurb: r.blurb,
        checked: r.checked || TODAY,
        gs: 'none-yet',
        g: [],
        _cover: r.cover,
        _coverKey: r.cover && r.cover.key,
      });
      continue;
    }
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
    for (const c of [...cons, ...tba]) if (!bySeries.has(c.series)) bySeries.set(c.series, c);
    let artOk = 0;
    await pool([...bySeries.values()], 8, async (c) => {
      // The researcher's pick first, then the homepage's other images, so a dead or
      // undecodable cover never leaves the badge without art.
      const homeFile = (c._cover && c._cover.file) || `pipeline/cache/extract/${c.series}.home.json`;
      const x = loadExtract(homeFile);
      const tries = [];
      const add = (url, logo) => url && !tries.some((t) => t.url === url) && tries.push({ url, logo });
      add(resolveCover(c._cover), /^logo:/.test(c._coverKey || ''));
      if (x) {
        add(x.ogImage, false);
        add(x.twitterImage, false);
        for (const h of x.heroImages || []) if (h.w >= 300 && h.h >= 150) add(h.img, false);
        for (const l of x.logos || []) add(l.img, true);
      }
      const out = join(OUT_CON, `${c.series}.webp`);
      let lastErr = 'no image';
      for (const t of tries.slice(0, 6)) {
        const buf = await download(t.url, x ? x.finalUrl : c.url);
        if (!buf) continue;
        try {
          const info = await processConArt(buf, out, t.logo);
          for (const e of [...cons, ...tba].filter((k) => k.series === c.series)) {
            Object.assign(e, { img: `img/c/${c.series}.webp`, imgW: info.w, imgH: info.h, tint: info.tint, fit: info.fit });
          }
          sources.cons[c.series] = t.url;
          artOk++;
          return;
        } catch (err) {
          lastErr = err.message;
        }
      }
      if (tries.length) problems.push(`art ${c.series}: ${lastErr}`);
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
    // Keep whatever images already exist on disk, with the sizes and fit the last full
    // build measured for them.
    const prev = existsSync(join(OUT_DATA, 'cons.json')) ? JSON.parse(readFileSync(join(OUT_DATA, 'cons.json'), 'utf8')) : { cons: [], guests: {} };
    const prevArt = new Map(prev.cons.filter((c) => c.img).map((c) => [c.series, c]));
    for (const t of prev.tba || []) if (t.img) prevArt.set(t.series, t);
    for (const c of [...cons, ...tba]) {
      const p = prevArt.get(c.series);
      if (p && existsSync(join(OUT_CON, `${c.series}.webp`))) Object.assign(c, { img: p.img, imgW: p.imgW, imgH: p.imgH, tint: p.tint, fit: p.fit });
    }
    for (const gid of Object.keys(guestOut)) {
      if (existsSync(join(OUT_GUEST, `${gid}.webp`))) Object.assign(guestOut[gid], { p: `img/g/${gid}.webp`, s: `img/g/s/${gid}.webp` });
      if (prev.guests[gid] && prev.guests[gid].w) guestOut[gid].w = prev.guests[gid].w;
    }
  }

  // Flags for every country in the data.
  for (const cc of new Set([...cons, ...tba].map((c) => c.country))) {
    const src = join(FLAG_SRC, `${cc.toLowerCase()}.svg`);
    if (existsSync(src)) copyFileSync(src, join(OUT_FLAGS, `${cc.toLowerCase()}.svg`));
    if (!COUNTRIES[cc]) problems.push(`unknown country ${cc}`);
  }

  // Remove images no record points at any more.
  const keepCon = new Set([...cons, ...tba].map((c) => `${c.series}.webp`));
  for (const f of readdirSync(OUT_CON)) if (!keepCon.has(f)) rmSync(join(OUT_CON, f));
  const keepGuest = new Set(Object.keys(guestOut).map((g) => `${g}.webp`));
  for (const f of readdirSync(OUT_GUEST)) if (f.endsWith('.webp') && !keepGuest.has(f)) rmSync(join(OUT_GUEST, f));
  for (const f of readdirSync(OUT_GUEST_S)) if (!keepGuest.has(f)) rmSync(join(OUT_GUEST_S, f));

  for (const c of [...cons, ...tba]) {
    delete c._cover;
    delete c._coverKey;
  }
  tba.sort((a, b) => a.name.localeCompare(b.name));
  cons.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.name.localeCompare(b.name)));
  const generated = research.reduce((d, r) => (r.checked && r.checked > d ? r.checked : d), '') || TODAY;
  writeFileSync(join(OUT_DATA, 'cons.json'), JSON.stringify({ generated, cons, tba, guests: guestOut }));
  writeFileSync(join(OUT_DATA, 'sources.json'), JSON.stringify(sources, null, 1));

  const withGuests = cons.filter((c) => c.g.length).length;
  console.log(`cons: ${cons.length} editions from ${research.length} research files (${withGuests} with guests), ${tba.length} waiting on dates, guests: ${Object.keys(guestOut).length}`);
  if (merged.length) console.log(`merged near-duplicate guests:\n  ${merged.join('\n  ')}`);
  if (problems.length) console.log(`problems (${problems.length}):\n  ${problems.join('\n  ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
