#!/usr/bin/env node
// Check that every lineup pick still points at the right card: the guest's name should
// appear in the text, alt, link or image file name of the candidate it references. A
// saved extraction that was re-rendered and renumbered pairs names with the wrong photos.
//   node pipeline/tools/audit-picks.mjs [--fix] [--only id,id]
// --fix re-points a pick when exactly one card of that con's extractions is clearly labelled
// with the guest's name (alt text, image file name, guest-page link or a short caption).
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fold } from '../../js/model.js';
import { checkFile } from './check-research.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESEARCH = join(ROOT, 'pipeline', 'research');
const EXTRACT = 'pipeline/cache/extract';
const FIX = process.argv.includes('--fix');
const oi = process.argv.indexOf('--only');
const ONLY = oi >= 0 ? new Set(process.argv[oi + 1].split(',')) : null;

// Cards a person checked by eye (the name is only inside the image): { id: { "file#n": "Name (how)" } }.
const VERIFIED_FILE = join(ROOT, 'pipeline', 'overrides', 'picks-verified.json');
const VERIFIED = existsSync(VERIFIED_FILE) ? JSON.parse(readFileSync(VERIFIED_FILE, 'utf8')) : {};
const verified = (id, file, n, name) => {
  const note = (VERIFIED[id] || {})[`${file}#${n}`];
  return !!note && note.startsWith(`${name} (`);
};

const extractions = new Map();
function load(file) {
  if (!extractions.has(file)) {
    const p = join(ROOT, file);
    let cands = null;
    try {
      cands = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).candidates || [] : null;
    } catch {
      cands = null;
    }
    extractions.set(file, cands);
  }
  return extractions.get(file);
}

const decode = (s) => {
  try {
    return decodeURIComponent(s || '');
  } catch {
    return s || '';
  }
};
const fileName = (c) => decode((c.img || '').split('/').pop());
const hayOf = (c) => fold(`${c.text || ''} ${c.alt || ''} ${decode(c.link)} ${fileName(c)}`);
// Tokens of the name worth matching on (initials and particles carry no signal).
const tokensOf = (name) => fold(name).split(' ').filter((t) => t.length >= 3 || /[^\x00-\x7f]/.test(t));
const has = (hay, t) => hay.includes(t) || hay.replace(/ /g, '').includes(t);
const fully = (name, hay) => {
  const toks = tokensOf(name);
  return !toks.length || toks.every((t) => has(hay, t));
};
const partly = (name, hay) => {
  const toks = tokensOf(name);
  return !toks.length || toks.some((t) => has(hay, t));
};
// The pick fits its card when the card carries the whole name, or part of it (a stage name,
// a surname) and no other guest of the lineup fits that card better.
const fits = (name, c, picks) => {
  const hay = hayOf(c);
  if (fully(name, hay)) return true;
  return partly(name, hay) && !picks.some(([, other]) => other !== name && fully(other, hay) && tokensOf(other).length);
};
// A card labelled with this guest and nobody else: every name token in its alt text, image
// file name or link, or in a caption not much longer than the name itself.
const isIcon = (c) => /\.svg(\?|#|$)/i.test(c.img || '');
function labelled(name, c) {
  const toks = tokensOf(name);
  if (!toks.length || !c.img || isIcon(c)) return false;
  const every = (h) => toks.every((t) => has(h, t));
  const text = fold(c.text);
  return every(fold(c.alt)) || every(fold(fileName(c))) || every(fold(decode(c.link))) || (every(text) && text.length <= fold(name).length + 40);
}

// Candidate files for a con: the lineup's own file first, then its other saved extractions.
function siblings(id, own) {
  const dir = join(ROOT, EXTRACT);
  const others = readdirSync(dir)
    .filter((f) => f.endsWith('.guests.json') && (f.startsWith(`${id}.`) || f.startsWith(`${id}-`)))
    .map((f) => `${EXTRACT}/${f}`)
    .filter((f) => f !== own);
  return [own, ...others];
}

function relocate(id, own, name) {
  for (const file of siblings(id, own)) {
    const cands = load(file) || [];
    let hits = cands.map((c, i) => [i, c]).filter(([, c]) => labelled(name, c));
    // News widgets repeat a guest as a small thumbnail and galleries add unrendered artwork:
    // the portrait is the card that was laid out at a real size.
    const big = hits.filter(([, c]) => c.w >= 120 && c.h >= 120);
    if (big.length) hits = big;
    const one = (list) => list.length && new Set(list.map(([, c]) => c.img)).size === 1;
    if (one(hits)) return { file, n: hits[0][0] };
    // A guest page that also shows the guest's work: the portrait is the file named as one.
    const portrait = hits.filter(([, c]) => /main|portrait|profile|headshot|guest/i.test(fileName(c)) && !/work|gallery|artwork/i.test(fileName(c)));
    if (one(portrait)) return { file, n: portrait[0][0] };
    if (hits.length) return null; // several different cards carry the name: leave it for a person
  }
  return null;
}

let total = 0;
let bad = 0;
let fixed = 0;
const report = [];
for (const f of readdirSync(RESEARCH).filter((x) => x.endsWith('.json'))) {
  const id = f.replace(/\.json$/, '');
  if (ONLY && !ONLY.has(id)) continue;
  const path = join(RESEARCH, f);
  const r = JSON.parse(readFileSync(path, 'utf8'));
  let changed = false;
  for (const e of r.editions || []) {
    const moves = []; // [fromLineup, pickIndex, {file, n}]
    for (const l of e.lineup || []) {
      const cands = load(l.file) || [];
      const wrong = [];
      (l.picks || []).forEach(([n, name], k) => {
        total++;
        const c = cands[n];
        if (c && c.img && !isIcon(c) && (fits(name, c, l.picks) || verified(id, l.file, n, name))) return;
        const why = !c ? 'no such candidate' : isIcon(c) ? `card image is an icon (${fileName(c).slice(0, 50)})` : `card reads "${(c.text || c.alt || fileName(c)).slice(0, 70)}"`;
        const to = relocate(id, l.file, name);
        if (to && !(to.file === l.file && to.n === n)) moves.push([l, k, to, name, why]);
        else {
          bad++;
          wrong.push(`#${n} ${name}: ${why}`);
        }
      });
      if (wrong.length) report.push(`${f} ${e.start} ${l.file} (${(l.picks || []).length} picks):\n    ${wrong.join('\n    ')}`);
    }
    if (!moves.length) continue;
    // Apply the moves only when no two picks would end up on the same card.
    const taken = new Map();
    for (const l of e.lineup) l.picks.forEach(([n], k) => taken.set(`${l.file}#${n}`, `${l.file}#${k}`));
    const keyOf = (l, k) => `${l.file}#${k}`;
    const moving = new Set(moves.map(([l, k]) => keyOf(l, k)));
    const ok = moves.filter(([, , to]) => {
      const holder = taken.get(`${to.file}#${to.n}`);
      return !holder || moving.has(holder);
    });
    const dest = new Set();
    const clean = ok.filter(([, , to]) => {
      const key = `${to.file}#${to.n}`;
      if (dest.has(key)) return false;
      dest.add(key);
      return true;
    });
    for (const [l, k, to, name, why] of moves) {
      if (!clean.includes(moves.find((m) => m[0] === l && m[1] === k))) {
        bad++;
        report.push(`${f} ${e.start}: ${name} (${why}) could move to ${to.file}#${to.n} but that card is taken`);
      }
    }
    if (!FIX) {
      for (const [l, k, to, name, why] of clean) {
        bad++;
        report.push(`${f} ${e.start}: ${name} (${why}) -> fixable to ${to.file}#${to.n}`);
      }
      continue;
    }
    for (const [l, k, to, name] of clean) {
      const pick = l.picks[k];
      if (to.file === l.file) pick[0] = to.n;
      else {
        l.picks[k] = null;
        let target = e.lineup.find((x) => x.file === to.file);
        if (!target) e.lineup.push((target = { file: to.file, picks: [] }));
        target.picks.push([to.n, ...pick.slice(1)]);
      }
      fixed++;
      report.push(`${f} ${e.start}: fixed ${name} -> ${to.file}#${to.n}`);
    }
    for (const l of e.lineup) l.picks = l.picks.filter(Boolean);
    e.lineup = e.lineup.filter((l) => l.picks.length);
    changed = true;
  }
  if (changed && FIX) {
    writeFileSync(path, JSON.stringify(r, null, 2) + '\n');
    const { errors } = checkFile(path);
    if (errors.length) report.push(`${f}: check-research after fix: ${errors.join(' | ')}`);
  }
}
console.log(report.join('\n'));
console.log(`${total} picks checked: ${bad} still do not match their card${FIX ? `, ${fixed} re-pointed` : ''}`);
process.exit(bad ? 1 : 0);
