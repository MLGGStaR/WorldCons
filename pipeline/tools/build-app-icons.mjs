#!/usr/bin/env node
// Draws the WorldCons app icon (a badge on a lanyard) and renders the PNG sizes.
//   node pipeline/tools/build-app-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'icons');
mkdirSync(OUT, { recursive: true });

const INK = '#121418';
const mark = (s = 1) => {
  const t = (256 * (1 - s)).toFixed(1);
  return `<g transform="translate(${t} ${t}) scale(${s})">
    <path d="M136 -10 256 178 376 -10" fill="none" stroke="#f4f5f7" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="256" cy="206" r="24" fill="none" stroke="#f4f5f7" stroke-width="20"/>
    <rect x="138" y="246" width="236" height="214" rx="28" fill="#ffffff"/>
    <rect x="224" y="264" width="64" height="13" rx="6.5" fill="${INK}"/>
    <rect x="162" y="296" width="188" height="78" rx="12" fill="#d9ab32"/>
    <rect x="162" y="392" width="132" height="18" rx="9" fill="${INK}"/>
    <rect x="162" y="422" width="86" height="14" rx="7" fill="#5a616c"/>
  </g>`;
};
const svg = (radius, s = 1) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${radius}" fill="${INK}"/>${mark(s)}</svg>`;

writeFileSync(join(OUT, 'icon.svg'), svg(112));
const render = (s, size, radius, scale = 1) => sharp(Buffer.from(svg(radius, scale))).resize(size, size).png().toFile(join(OUT, s));
await render('icon-192.png', 192, 0);
await render('icon-512.png', 512, 0);
await render('icon-maskable-512.png', 512, 0, 0.78);
await render('apple-touch-icon.png', 180, 0);
console.log('icons written');
