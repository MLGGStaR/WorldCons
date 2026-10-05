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
import { slug, mergeTypos, faceCrop, framedFaces, subjectBox, clearOfText } from './lib/guests.mjs';

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

// Mean luminance of the pixels that differ from the plate colour (the logo's ink), or null.
async function inkLuminance(buf, edge) {
  const { data, info } = await sharp(buf).flatten({ background: hex(edge) }).resize(96, 96, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const d = Math.abs(data[i] - edge.r) + Math.abs(data[i + 1] - edge.g) + Math.abs(data[i + 2] - edge.b);
    if (d > 60) {
      sum += luminance({ r: data[i], g: data[i + 1], b: data[i + 2] });
      n++;
    }
  }
  return n ? sum / n : null;
}

// Mean luminance of the opaque pixels of an image with transparency.
async function opaqueLuminance(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().resize(96, 96, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue;
    sum += luminance({ r: data[i], g: data[i + 1], b: data[i + 2] });
    n++;
  }
  return n ? sum / n : 0.5;
}

// Make the plate colour transparent, with a soft edge so anti-aliased outlines stay smooth.
async function keyOut(buf, edge) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.abs(data[i] - edge.r) + Math.abs(data[i + 1] - edge.g) + Math.abs(data[i + 2] - edge.b);
    if (d < 36) data[i + 3] = 0;
    else if (d < 90) data[i + 3] = Math.round(data[i + 3] * ((d - 36) / 54));
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function processConArt(buf, outFile, forceContain) {
  let meta = await sharp(buf, { animated: false }).metadata();
  if (!meta.width || !meta.height) throw new Error('not an image');
  const alpha = await hasMeaningfulAlpha(buf);
  // A logo sitting on a big flat plate (e.g. a share image that is a small logo on black):
  // trim the plate so the logo fills the badge window, then show it contained on that colour.
  let plate = false;
  let plateTint = null;
  let plateEdge = null;
  if (!alpha) {
    const edge = await edgeColour(buf);
    plateTint = hex(edge);
    plateEdge = edge;
    // Night photos are mostly near-black too: a real plate is flat, so the picture as a
    // whole carries little information (entropy around 1-3 bits; photos run 6-7).
    const { entropy } = await sharp(buf, { animated: false }).flatten({ background: '#ffffff' }).resize(256, 256, { fit: 'inside' }).stats();
    if (entropy < 4.5 && (await flatness(buf, edge)) > 0.6) {
      const trimmed = await sharp(buf).flatten({ background: hex(edge) }).trim({ background: hex(edge), threshold: 24 }).png().toBuffer().catch(() => null);
      if (trimmed) {
        buf = trimmed;
        meta = await sharp(buf).metadata();
        plate = true;
      }
    }
  }
  // Only logos are contained (transparent artwork, a logo on a flat plate, or a cover the
  // researcher marked as a logo). Photographs and posters fill the badge window.
  let transparent = alpha;
  if (plate) {
    // A light logo that barely stands off its own plate (white on pale grey) would vanish on
    // the badge: key the plate out and give the logo a ground that contrasts with it instead.
    // Darker ink on a light plate is a poster or a normal logo and keeps its plate. The plate
    // colour comes from the untrimmed image: after the trim the border is the logo itself.
    const logoLum = await inkLuminance(buf, plateEdge);
    const plateLum = luminance(plateEdge);
    if (logoLum !== null && logoLum > plateLum && logoLum - plateLum < 0.3) {
      buf = await keyOut(buf, plateEdge);
      transparent = true;
    }
  }
  const contain = forceContain || transparent || plate;
  let tint;
  if (contain) {
    if (transparent) {
      const lum = await opaqueLuminance(buf);
      tint = lum > 0.55 ? '#1f2329' : '#f3f4f6';
    } else tint = plate ? plateTint : hex(await edgeColour(buf));
    const img = sharp(buf).resize(720, 377, { fit: 'inside', withoutEnlargement: plate });
    const out = await (transparent ? img : img.flatten({ background: tint })).webp({ quality: 80, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
    writeFileSync(outFile, out.data);
    return { w: out.info.width, h: out.info.height, tint, fit: 'contain' };
  }
  const st = await sharp(buf).stats();
  tint = hex(st.dominant);
  const out = await sharp(buf).resize(720, 377, { fit: 'cover', position: 'attention' }).flatten({ background: '#ffffff' }).webp({ quality: 74 }).toBuffer({ resolveWithObject: true });
  writeFileSync(outFile, out.data);
  return { w: out.info.width, h: out.info.height, tint, fit: 'cover' };
}

// Where to crop a guest photo: around the face (and faces framed with it), clear of printed
// text when the picture is a con promo tile. det/text are the detectors' results for the
// EXIF-oriented image; null when no face was found.
function planCrop(det, text) {
  const faces = det && det.w ? (det.faces || []).filter((f) => f[4] >= 0.8) : [];
  if (!faces.length) return null;
  const W = det.w;
  const H = det.h;
  const boxes = text && text.w === W && text.h === H ? text.boxes || [] : [];
  // A face that is small in its picture usually sits inside a promo tile (lettering under the
  // chin, frames, logos around it): frame it tighter and lower so the credential is the person.
  const share = faces[0][2] / W;
  const [frac, minW, anchor] = share < 0.22 ? [0.7, 120, 0.5] : share < 0.32 ? [0.62, 160, 0.5] : [0.42, 200, 0.42];
  const subject = subjectBox(framedFaces(W, H, faces));
  const big0 = faceCrop(W, H, faces, frac, minW, anchor);
  const small0 = faceCrop(W, H, faces, 0.62, 90);
  const big = clearOfText(W, H, subject, big0, boxes, anchor);
  const small = clearOfText(W, H, subject, small0, boxes, 0.42, 40);
  // A plain photo carries no printed text anywhere; promo graphics do, even outside the crop.
  const textArea = boxes.reduce((s, x) => s + x[2] * x[3], 0);
  const plain = textArea < 0.004 * W * H;
  return { W, H, big: big || big0, small: small || small0, textFree: !!big, plain, share, faceW: faces[0][2], faceArea: faces[0][2] * faces[0][3] };
}

async function processGuestPhoto(buf, id, plan) {
  // Bake in EXIF orientation first so pixel boxes from the detectors line up.
  const oriented = await sharp(buf, { animated: false }).rotate().flatten({ background: '#e9ebee' }).png().toBuffer();
  const meta = await sharp(oriented).metadata();
  if (!meta.width || !meta.height || meta.width < 60 || meta.height < 60) throw new Error('too small');
  const fits = plan && plan.W === meta.width && plan.H === meta.height;
  let big;
  let small;
  if (fits) {
    big = await sharp(oriented).extract(plan.big).resize(240, 300).webp({ quality: 78 }).toBuffer();
    small = await sharp(oriented).extract(plan.small).resize(60, 76).webp({ quality: 72 }).toBuffer();
  } else {
    // No face found (artwork, logo, book cover): keep the top of tall images, let sharp
    // find the subject in wide ones.
    const position = meta.width / meta.height < 0.8 ? 'north' : 'attention';
    big = await sharp(oriented).resize(240, 300, { fit: 'cover', position }).webp({ quality: 76 }).toBuffer();
    small = await sharp(oriented).resize(60, 76, { fit: 'cover', position }).webp({ quality: 70 }).toBuffer();
  }
  writeFileSync(join(OUT_GUEST, `${id}.webp`), big);
  writeFileSync(join(OUT_GUEST_S, `${id}.webp`), small);
  return { w: meta.width, h: meta.height, face: !!fits };
}

// ---- face and text detection (pipeline/tools/faces.py, text.py; OpenCV), cached per image -------

const MODELS = join(ROOT, 'pipeline', 'models');
const DETECTORS = {
  faces: { script: 'faces.py', model: join(MODELS, 'face_detection_yunet_2023mar.onnx'), cache: join(CACHE, 'faces.json') },
  text: { script: 'text.py', model: join(MODELS, 'text_detection_en_ppocrv3_2023may.onnx'), cache: join(CACHE, 'text.json') },
};
const detCache = {};
const detQueue = {};
let detRun = 0;

// Calls are serialised per detector: the per-guest Wikipedia fallback runs from parallel workers.
function detect(kind, items) {
  const run = (detQueue[kind] || Promise.resolve()).then(() => detectNow(kind, items));
  detQueue[kind] = run.catch(() => {});
  return run;
}
const detectFaces = (items) => detect('faces', items);
const detectText = (items) => detect('text', items);

async function detectNow(kind, items) {
  const d = DETECTORS[kind];
  if (!detCache[kind]) detCache[kind] = existsSync(d.cache) ? JSON.parse(readFileSync(d.cache, 'utf8')) : {};
  const cache = detCache[kind];
  const todo = items.filter((i) => !cache[i.key]);
  if (!todo.length || !existsSync(d.model)) return cache;
  // A big first run is split over a few processes.
  const parts = todo.length > 400 ? 4 : 1;
  const size = Math.ceil(todo.length / parts);
  await Promise.all(
    Array.from({ length: parts }, async (_, p) => {
      const chunk = todo.slice(p * size, (p + 1) * size);
      if (!chunk.length) return;
      const n = detRun++;
      const inFile = join(CACHE, `${kind}-in-${n}.json`);
      const outFile = join(CACHE, `${kind}-out-${n}.json`);
      writeFileSync(inFile, JSON.stringify(chunk.map((i) => ({ id: i.key, file: i.file }))));
      rmSync(outFile, { force: true });
      await new Promise((resolve) =>
        execFile('python', [join(ROOT, 'pipeline', 'tools', d.script), d.model, inFile, outFile], { maxBuffer: 1 << 26 }, (err) => {
          if (err) console.log(`${kind} detection unavailable (${String(err.message).split('\n')[0]}); using plain crops`);
          resolve();
        }),
      );
      try {
        if (existsSync(outFile)) Object.assign(cache, JSON.parse(readFileSync(outFile, 'utf8')));
      } catch (e) {
        console.log(`${kind} results unreadable (${e.message}); those photos use plain crops`);
      }
      rmSync(inFile, { force: true });
      rmSync(outFile, { force: true });
    }),
  );
  writeFileSync(d.cache, JSON.stringify(cache));
  return cache;
}

// ---- Wikipedia fallback for guests without a con photo ---------------------------------------

const PERSONISH =
  /actor|actress|voice|artist|illustrator|cartoonist|writer|author|novelist|comedian|cosplayer|wrestler|singer|musician|rapper|director|producer|presenter|host|youtuber|streamer|model|athlete|player|animator|manga|creator|designer|puppeteer|stunt|dancer|personality|journalist|podcaster|composer|editor|filmmaker|screenwriter/i;

// Search answers are cached (pipeline/cache/wiki-search.json) so a rate-limited build never
// loses a photo an earlier build found; network failures are retried, never cached.
const WIKI_CACHE = join(CACHE, 'wiki-search.json');
let wikiCache = null;
const saveWikiCache = () => wikiCache && writeFileSync(WIKI_CACHE, JSON.stringify(wikiCache));

// The page must describe someone in the guest's line of work: a comics guest never takes the
// photo of a footballer who shares the name.
const ROLE = {
  actor: /actor|actress|performer|comedian|stunt|presenter/i,
  voice: /voice|actor|actress|singer|performer|presenter/i,
  comics: /comic|cartoon|illustrat|artist|writer|author|manga|colou?rist|inker|letterer|editor|novelist/i,
  animation: /anim|director|artist|manga|storyboard|producer|voice|illustrat/i,
  author: /writer|author|novelist|poet|journalist|editor|screenwriter|essayist|historian/i,
  cosplay: /cosplay|model|costume|performer|youtuber|streamer|influencer|personality/i,
  creator: /creator|youtuber|streamer|director|producer|artist|designer|writer|podcaster|personality|host|comedian|filmmaker/i,
  gaming: /game|gaming|streamer|youtuber|e-?sports|designer|programmer/i,
  // "other" guests are matched only with a known-for line, and only to fan-world professions.
  other: /actor|actress|director|filmmaker|writer|author|novelist|artist|illustrator|editor|screenwriter|producer|comedian|designer|publisher|cartoonist|animator|composer|presenter|personality/i,
  music: /singer|musician|band|rapper|composer|dj|songwriter|guitarist|drummer|vocalist|group|idol/i,
  sports: /wrestler|player|athlete|boxer|fighter|olympi|racing|driver|skater|footballer|coach/i,
};

async function wikipediaSearch(q) {
  if (!wikiCache) wikiCache = existsSync(WIKI_CACHE) ? JSON.parse(readFileSync(WIKI_CACHE, 'utf8')) : {};
  if (q in wikiCache) return wikiCache[q];
  const api =
    'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&generator=search&gsrlimit=4' +
    `&gsrsearch=${encodeURIComponent(q)}&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=500&origin=*`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(api, { headers: { 'user-agent': 'WorldConsBot/1.0 (https://github.com/MLGGStaR/WorldCons)' } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return [];
      const json = await res.json();
      const pages = ((json.query && json.query.pages) || [])
        .sort((a, c) => a.index - c.index)
        .map((p) => ({ title: p.title, description: p.description || '', thumb: p.thumbnail ? p.thumbnail.source : '' }));
      wikiCache[q] = pages;
      return pages;
    } catch {
      // offline or rate-limited: wait and try again, then give up for this build
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return [];
}

// A page about someone who has died (a lifespan or "died" in the description) is a namesake,
// never the guest.
const DEAD = /\(\s*(?:c\.\s*)?\d{3,4}\s*[–-]\s*\d{3,4}\s*\)|\bdied\b|\bdeceased\b/i;

async function wikipediaPhoto(name, known, cat) {
  if (cat === 'other' && !known) return null; // too little to tell namesakes apart
  const pages = await wikipediaSearch(`${name} ${known || ''}`.trim());
  const want = slug(name);
  const role = ROLE[cat] || PERSONISH;
  for (const p of pages) {
    if (slug(p.title.replace(/\s*\(.*\)\s*$/, '')) !== want) continue;
    if (!p.thumb || !PERSONISH.test(p.description) || !role.test(p.description)) continue;
    if (DEAD.test(p.description)) continue;
    return { img: p.thumb, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}` };
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
    // Edition ids depend only on the edition's own dates: series-YYYY, or series-YYYY-MM
    // (series-YYYY-MM-DD) for every edition of a year (month) that has several, so ids
    // don't shuffle when an earlier edition drops out of the data.
    const sameYear = (e) => (r.editions || []).filter((x) => x.start.slice(0, 4) === e.start.slice(0, 4)).length;
    const sameMonth = (e) => (r.editions || []).filter((x) => x.start.slice(0, 7) === e.start.slice(0, 7)).length;
    for (const e of r.editions || []) {
      let id = sameYear(e) === 1 ? `${r.id}-${e.start.slice(0, 4)}` : sameMonth(e) === 1 ? `${r.id}-${e.start.slice(0, 7)}` : `${r.id}-${e.start}`;
      if (ids.has(id)) id = `${id}-${ids.size}`;
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
          // An SVG beside a name is a flag or a social icon, never the person.
          const usable = cand && cand.img && !/\.svg(\?|#|$)/i.test(cand.img);
          addGuest(name, known, cat, usable ? { url: cand.img, w: cand.w, h: cand.h, referer: x.finalUrl || x.url } : null);
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
      // A share image on another host (a domain not live yet, a CDN that refuses bots) is
      // often also served from the page's own host under the same path.
      const sameHost = (url) => {
        try {
          const u = new URL(url);
          const page = new URL(x.finalUrl || x.url);
          return u.host !== page.host ? new URL(u.pathname + u.search, page.origin).href : null;
        } catch {
          return null;
        }
      };
      add(resolveCover(c._cover), /^logo:/.test(c._coverKey || ''));
      if (x) {
        for (const url of [x.ogImage, x.twitterImage]) {
          add(url, false);
          if (url) add(sameHost(url), false);
        }
        for (const h of x.heroImages || []) if (h.w >= 300 && h.h >= 150) add(h.img, false);
        // Sponsor and partner strips are other companies' logos, never the con's.
        for (const l of x.logos || []) if (!/sponsor|partner|exhibitor|vendor|supporter/i.test(`${l.img} ${l.alt || ''}`)) add(l.img, true);
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
    // Hand-checked photos for guests whose con page had none: { "<guest-id>": { "url", "source" } }.
    // Every pipeline/overrides/photos*.json is merged (one file per agent avoids write races).
    const overrideDir = join(ROOT, 'pipeline', 'overrides');
    const overrides = {};
    if (existsSync(overrideDir)) {
      for (const f of readdirSync(overrideDir).filter((f) => /^photos.*\.json$/.test(f))) {
        try {
          Object.assign(overrides, JSON.parse(readFileSync(join(overrideDir, f), 'utf8')));
        } catch (e) {
          problems.push(`overrides/${f}: ${e.message}`);
        }
      }
    }
    // 1. Every candidate photo of every guest: the cons' own (largest first) plus overrides.
    const cands = new Map();
    for (const [gid, g] of entries) {
      const list = [...g.photos].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 4);
      if (overrides[gid] && overrides[gid].url) list.push({ url: overrides[gid].url, w: 1, h: 1, referer: overrides[gid].source || '' });
      cands.set(gid, list.map((p) => ({ ...p, key: sha1(p.url) })));
    }
    const allCands = [...cands.values()].flat();
    await pool(allCands, 12, async (c) => {
      c.buf = await download(c.url, c.referer);
    });
    // 2. Faces and printed text in all of them, one batch each.
    const batch = allCands.filter((c) => c.buf).map((c) => ({ key: c.key, file: join(IMG_CACHE, c.key) }));
    const faces = await detectFaces(batch);
    const texts = await detectText(batch);
    // 3. Per guest: a photo with a real face beats artwork, logos and book covers; then a face
    //    big enough to stay sharp, a crop with no printed name or logo in it, a plain photo
    //    rather than a promo graphic, a portrait rather than a small face, and the biggest face.
    const rank = (r) => [
      r.plan ? 1 : 0,
      r.plan && r.plan.faceW >= 60 ? 1 : 0,
      r.plan && r.plan.textFree ? 1 : 0,
      r.plan && r.plan.plain ? 1 : 0,
      r.plan && r.plan.share >= 0.25 ? 1 : 0,
      r.plan ? r.plan.faceArea : 0,
      r.area,
    ];
    const byRank = (a, b) => {
      const x = rank(a);
      const y = rank(b);
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i];
      return 0;
    };
    const clean = (r) => !!(r && r.plan && r.plan.faceW >= 60 && r.plan.textFree && r.plan.plain);
    const ranked = new Map();
    for (const [gid] of entries) {
      ranked.set(
        gid,
        cands
          .get(gid)
          .filter((c) => c.buf)
          .map((c) => {
            const det = faces[c.key];
            return { c, plan: planCrop(det, texts[c.key]), area: det && det.w ? det.w * det.h : c.w * c.h };
          })
          .sort(byRank),
      );
    }
    // 4. Guests whose best con photo is not a clean portrait (no face, printed text in the
    //    frame, a promo graphic) also get their Wikipedia photo as a candidate, in one batch.
    const wiki = [];
    await pool(
      entries.filter(([gid]) => !clean(ranked.get(gid)[0])),
      8,
      async ([gid]) => {
        const g = guestOut[gid];
        const hit = await wikipediaPhoto(g.n, g.k, g.c);
        const buf = hit && (await download(hit.img, 'https://en.wikipedia.org/'));
        if (buf) wiki.push({ gid, c: { buf, url: hit.img, key: sha1(hit.img), page: hit.page } });
      },
    );
    const wbatch = wiki.map((w) => ({ key: w.c.key, file: join(IMG_CACHE, w.c.key) }));
    const wfaces = await detectFaces(wbatch);
    const wtexts = await detectText(wbatch);
    for (const w of wiki) {
      const det = wfaces[w.c.key];
      const plan = planCrop(det, wtexts[w.c.key]);
      const list = ranked.get(w.gid);
      if (plan || !list.length) {
        list.push({ c: w.c, plan, area: det && det.w ? det.w * det.h : 0 });
        list.sort(byRank);
      }
    }
    // 5. Crop each guest's winner (falling back down the list if an image will not decode).
    let withFace = 0;
    let textCleared = 0;
    await pool(entries, 10, async ([gid]) => {
      for (const r of ranked.get(gid)) {
        try {
          const info = await processGuestPhoto(r.c.buf, gid, r.plan);
          guestOut[gid].p = `img/g/${gid}.webp`;
          guestOut[gid].s = `img/g/s/${gid}.webp`;
          if (r.c.page) guestOut[gid].w = r.c.page;
          sources.guests[gid] = r.c.url;
          if (info.face) withFace++;
          if (info.face && r.plan.textFree) textCleared++;
          if (r.c.page) fromWiki++;
          else fromCon++;
          return;
        } catch {
          /* try the next photo */
        }
      }
      none++;
    });
    console.log(
      `guest photos: ${fromCon} from con pages, ${fromWiki} from Wikipedia, ${none} without a photo (of ${entries.length}); ${withFace} cropped around a detected face, ${textCleared} of them clear of printed text`,
    );
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
  saveWikiCache();

  const withGuests = cons.filter((c) => c.g.length).length;
  console.log(`cons: ${cons.length} editions from ${research.length} research files (${withGuests} with guests), ${tba.length} waiting on dates, guests: ${Object.keys(guestOut).length}`);
  if (merged.length) console.log(`merged near-duplicate guests:\n  ${merged.join('\n  ')}`);
  if (problems.length) console.log(`problems (${problems.length}):\n  ${problems.join('\n  ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
