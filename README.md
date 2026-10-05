# WorldCons

Every fan convention worldwide (comic, anime, gaming, tabletop, sci-fi, horror, pop
culture, toys, cosplay, furry), sorted by date, with every announced guest and their
photo.

Live site: https://mlggstar.github.io/WorldCons/

## What it does

- Upcoming cons by start date, grouped by month, each shown as a con badge with its
  key art, dates, place, type ribbons and a strip of guest faces.
- Filters: when (upcoming / years / all), month ruler, continent, country, US state
  (plus Canadian provinces and Australian states), con type, "with guests", sort by
  date, name or guest count. Every filter takes several values (any of them within a
  filter, all filters together: comics or anime, in Japan or Korea, in October or May);
  the most specific place wins in each branch (Europe + United States + California =
  all of Europe plus California). Every view is a shareable URL.
- Search across cons, cities and guests; guest suggestions show their photo.
- Con page: dates, venue, map, official site, tickets, and the full guest wall
  (photo credentials, grouped by actors, voice actors, comics, authors …).
- Guest page: every upcoming con a guest is booked for.
- Lanyard: clip cons to keep them on this device.
- Installable PWA that updates itself (version.json check + network-first service worker).

## How the data is made

Static site, no backend. The data is built by `pipeline/` and refreshed every day (see below):

1. `pipeline/tools/extract.mjs` renders a con's homepage or guest page in Chromium and
   lists dates, images and numbered guest candidates.
2. Research agents follow `pipeline/RESEARCH.md` and write one file per con to
   `pipeline/research/<id>.json` (dates with evidence, venue, guest picks by number).
   `pipeline/tools/check-research.mjs` validates every file.
3. `npm run build:data` merges the research into `data/cons.json`, downloads each
   con's cover and every guest photo, crops them (`img/c`, `img/g`, `img/g/s`) and
   records each image's source URL in `data/sources.json`. Guests with no con photo
   fall back to their Wikipedia page image.
4. `node pipeline/stamp.mjs` stamps a new build id so installed copies update.

Dates and guests come from each convention's official website. Guest photos belong to
their owners and are shown to identify who is appearing.

### Daily automatic refresh

The data refreshes itself once a day. The Windows scheduled task "WorldCons daily refresh"
(10:17 local time; if the PC was off or asleep it runs as soon as it can) starts
`pipeline/refresh/run.mjs`:

1. `pipeline/refresh/plan.mjs` (no AI) re-renders the guest pages behind every upcoming
   lineup, the guest pages of editions still waiting on guests, and a seventh of the
   homepages of cons waiting on dates. It compares them with the extraction the research
   picked from and with everything earlier runs saw (`pipeline/cache/refresh/seen.json`), then
   writes task files for what changed: new guest cards, guests gone from the page, guests
   appearing, new date text.
2. Each task file goes to a headless Claude Code agent (`claude -p`, Sonnet, three at a time,
   at most 8 files a day; the rest wait for the next day). The agents follow `RESEARCH.md`
   (`pipeline/refresh/prompts.mjs` holds their instructions) and only edit research files.
3. Edits that fail `check-research.mjs` or the picks audit are put back. `build-data.mjs`
   rebuilds the data and images, safety gates refuse any big drop in cons, guests or photos,
   and the tests run.
4. The result is committed and pushed, and GitHub Pages publishes it. Any failure leaves
   the published site as it was, and the changes are found again the next day.

Logs are in `pipeline/logs/` (`refresh-<date>.log`, `last-run.json`). Run it by hand with
`node pipeline/refresh/run.mjs` (`--no-agents`, `--no-push`, `--reuse-plan` to reuse today's
scan). Install or move the task with
`powershell -ExecutionPolicy Bypass -File pipeline/refresh/install-task.ps1 -At 10:17`.
The PC needs to be on at some point in the day; a run skips itself if the working tree has
uncommitted changes, so it never mixes with work in progress.

### Re-researching from scratch

The daily refresh keeps known cons current. To add new cons or redo the research:

1. `node pipeline/tools/make-seed.mjs <discovery.json>` merges a con list into
   `pipeline/seed/series.json` (skip if the list is unchanged).
2. `node pipeline/tools/prefetch.mjs pipeline/seed/todo.json` renders homepages ahead.
3. `node pipeline/tools/make-batches.mjs` writes `pipeline/seed/batches/batch-NN.txt`, then
   run the `pipeline/workflows/research.js` workflow over those batch numbers (research
   files that should be redone must be deleted first; existing ones are skipped).
4. `node pipeline/tools/audit-guests.mjs --reextract` flags lineups that may be incomplete;
   `pipeline/workflows/fixup.js` rechecks them, backfills last-held dates, finds missing
   photos (written to `pipeline/overrides/photos-*.json`) and researches leftovers.
5. Stale lineups: cons leave last year's guests up for months, so every lineup for a
   show more than a few months out goes through the fix-up `verify` and then `refute`
   kinds (a skeptic that keeps a guest only with per-guest proof for this edition).
   `node pipeline/tools/stale-scan.mjs --before <date>` flags nearer shows whose guest
   page or photo uploads carry an earlier year.
6. Wrong faces: `node pipeline/tools/audit-picks.mjs` checks every pick's card names that
   guest (`--fix` re-points picks to the card clearly labelled with the name). Cards whose
   name is only inside the image go through the fix-up `picks` kind, which screenshots
   them with `pipeline/tools/card-shot.mjs`; checked ones are listed in
   `pipeline/overrides/picks-verified.json`.
7. `npm run build:data`, `npm test`, `node pipeline/tools/interact.mjs`,
   `node pipeline/tools/build-og.mjs`, `node pipeline/stamp.mjs`, then commit and push.

`pipeline/cache/` (rendered pages and downloaded originals) stays on the machine that ran
the research; the committed `data/` and `img/` are everything the site needs, and
`data/sources.json` records where every image came from.

## Develop

```
npm install
npm test                     # model logic (filters, dates, search, URL state)
npm run serve                # http://localhost:8080/
node pipeline/tools/shoot.mjs <outDir> "list=#/" "con=#/con/<id>"   # screenshots
```
