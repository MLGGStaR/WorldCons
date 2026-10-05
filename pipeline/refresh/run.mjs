#!/usr/bin/env node
// The daily refresh, end to end. The Windows scheduled task "WorldCons daily refresh"
// (pipeline/refresh/install-task.ps1) runs it; it is safe to run by hand too.
//   node pipeline/refresh/run.mjs [--no-agents] [--no-push] [--reuse-plan] [--max-files 8]
//
// 1. plan.mjs re-renders the con pages (no AI) and writes task files for what changed.
// 2. Each task file goes to a headless Claude Code agent (claude -p), three at a time.
// 3. Research edits that fail validation or the picks audit are put back as they were.
// 4. build-data.mjs rebuilds the data and images; safety gates compare the result with the
//    published data; the tests run.
// 5. Commit and push; GitHub Pages publishes. Any failure leaves the published site as it was,
//    and what changed is detected again the next day.
// Log: pipeline/logs/refresh-<date>.log
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { promptFor } from './prompts.mjs';
import { checkFile } from '../tools/check-research.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const TODAY = new Date().toISOString().slice(0, 10);
const MAX_FILES = Number(opt('max-files', 8));
const PARALLEL = 3;
const AGENT_TIMEOUT = 50 * 60e3;
const MODEL = opt('model', 'sonnet');
const STATE = join(ROOT, 'pipeline', 'cache', 'refresh');
const LOCK = join(STATE, 'run.lock');
const SEEN = join(STATE, 'seen.json');
const LOGS = join(ROOT, 'pipeline', 'logs');
mkdirSync(STATE, { recursive: true });
mkdirSync(LOGS, { recursive: true });
const LOG = join(LOGS, `refresh-${TODAY}.log`);

const log = (...parts) => {
  const line = `[${new Date().toISOString().slice(11, 19)}] ${parts.join(' ')}`;
  console.log(line);
  appendFileSync(LOG, line + '\n');
};

function run(cmd, args, { allowFail = false, timeout = 3 * 3600e3 } = {}) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', timeout, maxBuffer: 1 << 28, windowsHide: true });
  appendFileSync(LOG, `$ ${cmd === process.execPath ? 'node' : cmd} ${args.join(' ')}\n${(r.stdout || '').slice(-20000)}${(r.stderr || '').slice(-5000)}\n`);
  if ((r.status !== 0 || r.error) && !allowFail) {
    throw new Error(`${cmd === process.execPath ? 'node' : cmd} ${args.join(' ')} failed (${r.status ?? r.error}): ${String(r.stderr || r.stdout || '').trim().slice(-300)}`);
  }
  return r;
}
const git = (...args) => run('git', args);
const node = (...args) => run(process.execPath, args);
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

// ---- lock -------------------------------------------------------------------------------------------

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
// Returns 'ok', 'busy' (another run is going), or 'crashed' (an earlier run died mid-way).
function takeLock() {
  let state = 'ok';
  if (existsSync(LOCK)) {
    let l = {};
    try {
      l = JSON.parse(readFileSync(LOCK, 'utf8'));
    } catch {
      /* unreadable lock: treat as crashed */
    }
    if (l.pid && alive(l.pid) && Date.now() - (l.at || 0) < 8 * 3600e3) return 'busy';
    state = 'crashed';
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: Date.now() }));
  return state;
}
const releaseLock = () => rmSync(LOCK, { force: true });

// Put the working tree back to the last commit. Only ever called on a tree that was clean
// when this run started, so it only discards this run's own changes.
function rollback() {
  git('reset', '-q', '--hard', 'HEAD');
  run('git', ['clean', '-q', '-fd', '--', 'data', 'img', 'icons', 'pipeline/research', 'pipeline/overrides'], { allowFail: true });
}

// ---- agents -------------------------------------------------------------------------------------------

function findClaude() {
  const found = [];
  const ext = join(homedir(), '.vscode', 'extensions');
  if (existsSync(ext)) {
    for (const d of readdirSync(ext)) if (/^anthropic\.claude-code-[\d.]+-win32-x64$/.test(d)) found.push(join(ext, d, 'resources', 'native-binary', 'claude.exe'));
  }
  const app = join(homedir(), 'AppData', 'Roaming', 'Claude', 'claude-code');
  if (existsSync(app)) for (const d of readdirSync(app)) found.push(join(app, d, 'claude.exe'));
  const ver = (p) => (p.match(/(\d+)\.(\d+)\.(\d+)/) || [0, 0, 0, 0]).slice(1).map(Number);
  const newest = found.filter((p) => existsSync(p)).sort((a, b) => {
    const x = ver(a);
    const y = ver(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i];
    return 0;
  });
  return newest[0] || 'claude';
}

function runAgent(claude, task) {
  return new Promise((resolve) => {
    const args = ['-p', '--model', MODEL, '--output-format', 'json', '--max-turns', '200', '--permission-mode', 'bypassPermissions'];
    const child = spawn(claude, args, { cwd: ROOT, windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => {
      log(`agent ${task.file}: timed out, stopping it`);
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    }, AGENT_TIMEOUT);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, report: `could not start claude: ${e.message}` });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let res = null;
      try {
        res = JSON.parse(out.trim());
      } catch {
        /* not JSON: the run died */
      }
      const report = res ? String(res.result || '') : out.slice(-3000);
      appendFileSync(LOG, `--- agent ${task.file} (exit ${code})\n${report}\n${err.slice(-2000)}\n`);
      resolve({ ok: code === 0 && !!res && !res.is_error, report });
    });
    child.stdin.end(promptFor(task.kind, task.file, TODAY));
  });
}

async function runAgents(tasks) {
  const claude = findClaude();
  log(`agents: ${tasks.length} task files with ${claude.replace(homedir(), '~')}`);
  const done = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, tasks.length) }, async () => {
      while (next < tasks.length) {
        const t = tasks[next++];
        const r = await runAgent(claude, t);
        log(`agent ${t.file}: ${r.ok ? 'done' : 'FAILED'} - ${r.report.replace(/\s+/g, ' ').slice(0, 300)}`);
        if (r.ok) done.push(t);
      }
    }),
  );
  return done;
}

// ---- checks -------------------------------------------------------------------------------------------

// Agents may only change research files; anything else they touched is put back, and a research
// file that fails validation or carries a picks mismatch goes back to its committed version.
function vetEdits() {
  for (const f of lines(git('diff', '--name-only').stdout)) {
    if (!f.startsWith('pipeline/research/')) {
      log(`put back ${f} (outside research)`);
      git('checkout', '--', f);
    }
  }
  for (const f of lines(git('ls-files', '--others', '--exclude-standard').stdout)) {
    if (!f.startsWith('pipeline/research/')) {
      log(`removed ${f} (outside research)`);
      rmSync(join(ROOT, f), { force: true });
    }
  }
  const changed = lines(git('diff', '--name-only', '--', 'pipeline/research').stdout);
  const added = lines(git('ls-files', '--others', '--exclude-standard', '--', 'pipeline/research').stdout);
  const undo = (f, why) => {
    log(`put back ${f}: ${why}`);
    if (added.includes(f)) rmSync(join(ROOT, f), { force: true });
    else git('checkout', '--', f);
  };
  for (const f of [...changed, ...added]) {
    const { errors } = checkFile(join(ROOT, f));
    if (errors.length) undo(f, errors.slice(0, 3).join(' | '));
  }
  node('pipeline/tools/audit-picks.mjs', '--fix');
  const audit = run(process.execPath, ['pipeline/tools/audit-picks.mjs'], { allowFail: true });
  if (audit.status !== 0) {
    const bad = new Set(lines(audit.stdout).map((l) => (/^([a-z0-9-]+)\.json\b/.exec(l) || [])[1]).filter(Boolean));
    for (const id of bad) {
      const f = `pipeline/research/${id}.json`;
      if (changed.includes(f) || added.includes(f)) undo(f, 'a pick does not match its card');
    }
    if (run(process.execPath, ['pipeline/tools/audit-picks.mjs'], { allowFail: true }).status !== 0) throw new Error('picks audit still failing');
  }
  return { changed: lines(git('diff', '--name-only', '--', 'pipeline/research').stdout).length, added: lines(git('ls-files', '--others', '--exclude-standard', '--', 'pipeline/research').stdout).length };
}

const count = (d) => ({
  upcoming: d.cons.filter((c) => c.end >= TODAY).length,
  guests: Object.keys(d.guests).length,
  photos: Object.values(d.guests).filter((g) => g.p).length,
  tba: (d.tba || []).length,
});

// A broken render or a confused agent can wipe out whole lineups; never publish a big drop.
function gates(before, after) {
  const problems = [];
  if (after.upcoming < before.upcoming * 0.95) problems.push(`upcoming cons ${before.upcoming} -> ${after.upcoming}`);
  if (after.guests < before.guests * 0.92) problems.push(`guests ${before.guests} -> ${after.guests}`);
  if (after.photos < before.photos * 0.92) problems.push(`guest photos ${before.photos} -> ${after.photos}`);
  return problems;
}

// ---- main -----------------------------------------------------------------------------------------------

async function main() {
  const lock = takeLock();
  if (lock === 'busy') {
    log('another refresh is still running; skipping');
    return;
  }
  try {
    const dirty = lines(git('status', '--porcelain').stdout);
    if (dirty.length && lock === 'crashed') {
      log(`an earlier refresh stopped half-way; putting back its ${dirty.length} changes`);
      rollback();
    } else if (dirty.length) {
      log(`the working tree has changes that are not committed (${dirty.slice(0, 3).join(', ')}); skipping today so they are not mixed in`);
      return;
    }
    git('pull', '-q', '--rebase', 'origin', 'main');
    const beforeData = JSON.parse(readFileSync(join(ROOT, 'data', 'cons.json'), 'utf8'));
    const before = count(beforeData);

    // 1. What changed on the con sites (--reuse-plan picks up today's plan if it already ran).
    const planFile = join(ROOT, 'pipeline', 'seed', 'refresh', TODAY, 'plan.json');
    if (!(has('--reuse-plan') && existsSync(planFile))) node('pipeline/refresh/plan.mjs', '--date', TODAY, '--max-lines', String(MAX_FILES * 6));
    const plan = JSON.parse(readFileSync(planFile, 'utf8'));
    log(`plan: ${plan.pages} pages, ${plan.unreachable} unreachable; lineups changed ${plan.found.update}, guests appearing ${plan.found.announce}, date text ${plan.found.dates}${plan.overflow ? `; ${plan.overflow} wait for tomorrow` : ''}`);

    // 2. Agents on the changes.
    let done = [];
    if (plan.files.length && !has('--no-agents')) done = await runAgents(plan.files.slice(0, MAX_FILES));
    const vetted = vetEdits();
    log(`research: ${vetted.changed} files updated, ${vetted.added} added`);

    // 3. Rebuild and check.
    node('pipeline/build-data.mjs');
    const afterData = JSON.parse(readFileSync(join(ROOT, 'data', 'cons.json'), 'utf8'));
    const after = count(afterData);
    const problems = gates(before, after);
    if (problems.length) throw new Error(`safety gates: ${problems.join('; ')}`);
    for (const t of readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'))) node('--test', `tests/${t}`);
    const big = (a, b) => Math.abs(a - b) / Math.max(1, b) >= 0.03;
    if (new Date().getUTCDay() === 1 || big(after.upcoming, before.upcoming) || big(after.guests, before.guests)) node('pipeline/tools/build-og.mjs');

    // 4. Publish.
    git('add', '-A');
    if (!lines(git('diff', '--cached', '--name-only').stdout).length) {
      log('nothing changed today');
    } else {
      const ids = (d) => new Set(Object.keys(d.guests));
      const a = ids(beforeData);
      const b = ids(afterData);
      const plus = [...b].filter((x) => !a.has(x)).length;
      const minus = [...a].filter((x) => !b.has(x)).length;
      const eds = (d) => new Set(d.cons.map((c) => c.id));
      const newEds = [...eds(afterData)].filter((x) => !eds(beforeData).has(x)).length;
      const msg = [
        `Daily refresh ${TODAY}: +${plus} guests, -${minus}, ${newEds} new editions`,
        '',
        `Checked ${plan.pages} con pages (${plan.unreachable} unreachable). Changes found: ${plan.found.update} lineups, ${plan.found.announce} pages with new guests, ${plan.found.dates} with new dates; ${done.length}/${Math.min(plan.files.length, MAX_FILES)} agent tasks finished.`,
        `Now ${after.upcoming} upcoming cons, ${after.tba} waiting on dates, ${after.guests} guests (${after.photos} with photos).`,
        '',
        'Co-Authored-By: Claude <noreply@anthropic.com>',
        '',
      ].join('\n');
      const msgFile = join(STATE, 'commit-msg.txt');
      writeFileSync(msgFile, msg);
      git('commit', '-q', '-F', msgFile);
      if (has('--no-push')) log('committed (not pushed: --no-push)');
      else {
        try {
          git('push', '-q', 'origin', 'main');
        } catch {
          git('pull', '-q', '--rebase', 'origin', 'main');
          git('push', '-q', 'origin', 'main');
        }
        log(`published: ${msg.split('\n')[0]}`);
      }
    }
    // 5. Only now remember what the agents handled; anything that failed is found again tomorrow.
    if (!has('--no-push')) {
      const seen = existsSync(SEEN) ? JSON.parse(readFileSync(SEEN, 'utf8')) : {};
      for (const t of done) Object.assign(seen, t.remember);
      writeFileSync(SEEN, JSON.stringify(seen));
    }
    writeFileSync(join(LOGS, 'last-run.json'), JSON.stringify({ date: TODAY, ok: true, before, after, plan: plan.found, agents: done.length }, null, 1));
  } catch (e) {
    log(`FAILED: ${e.message}`);
    try {
      rollback();
      log('rolled back; the published site is unchanged');
    } catch (e2) {
      log(`rollback failed too: ${e2.message}`);
    }
    writeFileSync(join(LOGS, 'last-run.json'), JSON.stringify({ date: TODAY, ok: false, error: e.message }, null, 1));
    process.exitCode = 1;
  } finally {
    releaseLock();
  }
}

await main();
