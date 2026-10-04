#!/usr/bin/env node
// Render many con homepages ahead of the research agents, so their first
// `extract.mjs <url> --mode home --save <id>` call is answered from the cache.
//   node pipeline/tools/prefetch.mjs pipeline/seed/series.json [--concurrency 10]
import { readFileSync, existsSync } from 'node:fs';
import { launch, extractWith, savedPath, saveResult } from './extract.mjs';

const args = process.argv.slice(2);
const file = args[0];
const ci = args.indexOf('--concurrency');
const N = ci >= 0 ? Number(args[ci + 1]) : 10;
const seed = JSON.parse(readFileSync(file, 'utf8'));
const todo = seed.filter((s) => {
  const p = savedPath(s.id, 'home');
  if (!existsSync(p)) return true;
  try {
    const r = JSON.parse(readFileSync(p, 'utf8'));
    return r.url !== s.url || r.error || !r.status || r.status >= 400;
  } catch {
    return true;
  }
});
console.log(`${todo.length} of ${seed.length} homepages to render`);

let browser = await launch();
let done = 0;
let failed = 0;
let i = 0;
async function worker() {
  while (i < todo.length) {
    const s = todo[i++];
    try {
      const r = await Promise.race([
        extractWith(browser, s.url, { mode: 'home' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 90000)),
      ]);
      saveResult(r, savedPath(s.id, 'home'));
      if (r.error || !r.status || r.status >= 400) failed++;
    } catch (e) {
      failed++;
      if (!browser.isConnected()) browser = await launch();
    }
    done++;
    if (done % 25 === 0) console.log(`${done}/${todo.length} (${failed} failed)`);
  }
}
await Promise.all(Array.from({ length: N }, worker));
await browser.close();
console.log(`done: ${done} rendered, ${failed} failed or blocked`);
