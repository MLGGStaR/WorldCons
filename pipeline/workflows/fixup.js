export const meta = {
  name: 'worldcons-fixup',
  description: 'Clean-up pass after research: recheck suspicious guest lists, backfill last editions, find missing guest photos, research leftovers',
  phases: [{ title: 'Fix-up', detail: 'one agent per task file in pipeline/seed/fixup', model: 'sonnet' }],
}

// args: { tasks: [{ kind: 'recheck' | 'tba' | 'photos' | 'verify' | 'refute' | 'picks' | 'research', file: 'pipeline/seed/fixup/<name>.txt' }] }
const TASKS = args.tasks

const SCHEMA = {
  type: 'object',
  properties: {
    done: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, outcome: { type: 'string' } }, required: ['item', 'outcome'] } },
    problems: { type: 'string' },
  },
  required: ['done', 'problems'],
}

const HEAD = `You are a WorldCons data agent. Work in C:/Users/S0000005749/Desktop/WorldCons and run every command from that folder. Read pipeline/RESEARCH.md first; its rules on accuracy, tools and file format apply to everything you do. Never guess: when something cannot be confirmed from an official source, leave it as it is and say so.`

const BODY = {
  recheck: (file) => `Your list: ${file} (one convention id per line, with the reason it was flagged).

These cons have an announced guest lineup that may be incomplete: the guest page may paginate, or the earlier pass may have read a truncated listing. For each id:
1. Open pipeline/research/<id>.json and look at each lineup entry (file, picks).
2. Re-render the same guest page(s) with the current extractor, saving under a new name: \`node pipeline/tools/extract.mjs <guestsPage> --mode guests --save <id>-v2 > pipeline/.tmp/<id>-v2.txt\` (then -v2b, -v2c for more pages). Read the whole output file.
3. If real guests are missing from the picks, rebuild that edition's lineup from the new extraction file(s) so it lists every real guest (picks reference the new file's #numbers). Keep known-for and cat values you already had for guests that stay.
4. If the original picks were already complete (the extra images are galleries, sponsors, exhibitors or ads), change nothing.
5. Run check-research on the file until it passes.
Report per id: "updated (N -> M guests)" or "unchanged (why)".`,
  tba: (file) => `Your list: ${file} (one convention id per line).

These cons have no upcoming edition in their research file and no "last" edition recorded. For each id:
1. Open pipeline/research/<id>.json and read its notes.
2. Check the official site (extract.mjs home mode with --fresh) and, if needed, one web search: have dates for an edition ending on or after 2026-10-05 and starting on or before 2027-12-31 been announced since? If yes, add the edition exactly as RESEARCH.md describes (guests too if announced) and remove "last" if present.
3. Otherwise add the top-level "last" object for the most recent edition you can confirm: {"start","end","city","region","country","venue"} (venue may be ""). If even that cannot be confirmed, leave the file unchanged.
4. Run check-research on the file until it passes.
Report per id: "dated <start>", "last <start>", or "unchanged (why)".`,
  photos: (file) => `Your list: ${file} (one guest per line: guest id | name | known for | category | con id | con guest page).

These guests appear on a con lineup but we have no photo of them. For each guest, find a real, recent photo of THAT person from an official or reputable source, in this order: the con's own guest detail page or guest list (render it with extract.mjs --mode guests and look for their card), the guest's official website or official social profile image, Wikimedia Commons / Wikipedia. Only use an image you are sure shows that person (match name and role). Logos, posters, group shots and character art do not count, except for bands, studios or groups, where an official group photo or logo is fine.
Write your results to pipeline/overrides/photos-${file.replace(/^.*\//, '').replace(/\.txt$/, '')}.json as one JSON object: { "<guest id>": { "url": "<direct image URL>", "source": "<page where you found it>" } }. Check each URL returns an image (curl -sI). Skip guests you cannot find; never guess.
Report per guest: "found (source)" or "not found".`,
  verify: (file) => `Your list: ${file} (one edition per line: id | edition start date | guest page | number of guests picked).

Each of these upcoming editions has a guest lineup in its research file, but cons often leave LAST year's lineup on their guest page for months after the show. A fan who travels for a guest who is not coming is the worst failure this site can have, so be a skeptic. For each line:
1. Open pipeline/research/<id>.json and find the edition with that start date.
2. Decide whether its lineup is really announced for THIS edition. Look at the guest page again (extract.mjs --mode guests --fresh, redirect to a file and read it, or WebFetch) and the con's news/announcements.
   Evidence it is CURRENT: the page or its heading names this edition's year or dates; an official announcement or news post dated after the previous edition ended names these guests for this edition; guest cards carry this edition's dates.
   Evidence it is STALE: the page, URL or heading names an earlier year; a "Cancellations"/"Canceled" section or autograph and photo-op schedules for dates already past; the homepage says the last show is "complete" or "see you next year"; the previous edition ended recently and nothing announces guests for the next one.
3. When unsure, treat it as stale. Stale: set that edition's "guests" to "none-yet" and remove its "lineup" and "textOnlyGuests" (keep the dates and everything else). Partly current (for example a "first guests announced" post): keep only the guests named for this edition, re-picking them from a fresh extraction if needed.
4. Add one sentence to notes with the decision and the evidence, then run check-research until it passes.
Report per id: "current (evidence)", "stale -> none-yet (evidence)" or "trimmed N -> M (evidence)".`,
  refute: (file) => `Your list: ${file} (one edition per line: id | edition start date | guest page | the first reviewer's evidence for calling it current).

A first reviewer judged each of these lineups CURRENT for the upcoming edition. Your job is to try to REFUTE that, because showing a guest who is not coming is the worst failure this site can have.
Template-level dates do NOT prove a guest list is new: con sites put next year's dates in their header, page title and countdown the day after a show, while last year's guest grid stays up for months. Count as proof only:
  (a) per-guest evidence tied to this edition: image filenames, alt text or card labels with this edition's year; autograph or photo-op listings for this edition's dates; a guest's own page saying they are joining this edition;
  (b) an official announcement (news post, newsletter, social post) dated after the previous edition ended that names these guests for this edition;
  (c) this is the con's first edition.
Signs of staleness: "Canceled"/"Cancellations" sections on a show still months away; guest image files dated before the previous edition ended (e.g. /2026/03/ in the URL); the previous edition ended in the last 6 months and these names match its published lineup (check coverage of that edition); "complete" / "see you next year" on the homepage; "coming soon" tiles.
For each line: open pipeline/research/<id>.json, re-check the guest page fresh (extract.mjs --mode guests --fresh, redirect to a file, read it, and look at the image URLs in pipeline/cache/extract/<id>*.json), plus at most 2 searches. If you find proof for every guest, keep the lineup. Proof for only some: keep only those. No proof: set that edition's "guests" to "none-yet" and remove "lineup" and "textOnlyGuests". Add one sentence of evidence to notes and run check-research until it passes.
Report per id: "upheld (proof)", "refuted -> none-yet (evidence)" or "trimmed N -> M (evidence)".`,
  picks: (file) => `Your list: ${file} (one line per lineup: con id | saved extraction file | the picks to check as "number name ; number name ...").

Each pick pairs a guest name with a candidate image from the saved extraction, but these cards carry no caption text the build can check, so a pick may show someone else's photo. A wrong face under a guest's name is the worst failure this site can have. For each line:
1. Run \`node pipeline/tools/card-shot.mjs <extraction file> <numbers comma-separated> > pipeline/.tmp/cards-<id>.txt\`, read that file, then Read every PNG it lists. The picked image is outlined in magenta; the screenshot includes its neighbours and captions.
2. Decide from what is printed: the name on the image itself, the caption under or beside it, or the card layout. Never judge identity from a face; only from names and layout on the page.
   - The outlined image is that guest's photo or promo tile: confirmed, change nothing.
   - It belongs to another guest: find the right card (card-shot the neighbouring numbers, and look at pipeline/cache/extract/<file> candidates) and change the number in the research file's lineup picks.
   - It is not a picture of that guest at all (logo, flag, artwork, group shot of others) or you cannot tell: move the guest from the lineup "picks" to the edition's "textOnlyGuests" as [name, known, cat] so they stay listed without a photo.
   - A card the tool could not find on the page: check the candidates and the page another way (WebFetch the page, look at the image URL); if still unsure, move the guest to textOnlyGuests.
3. Run check-research on each file you changed until it passes, then run \`node pipeline/tools/audit-picks.mjs --only <id>\` and make sure nothing you confirmed is reported as a mismatch you could have fixed.
Report per pick: "confirmed (what the card shows)", "re-pointed N -> M (evidence)" or "text-only (why)".`,
  research: (file) => `Your list: ${file} (one convention per line: id | name | url | place | types | organizer | note; the URL, place and types come from a quick discovery pass and may be wrong).

Follow RESEARCH.md for each convention, in order: write pipeline/research/<id>.json and run check-research until it passes. If a convention is defunct, on hiatus, trade-only or a duplicate, still write its file with "status": "inactive" and the reason.
Report per id: written / inactive / failed with a short note.`,
}

phase('Fix-up')
const results = await parallel(
  TASKS.map((t, i) => () =>
    agent(`${HEAD}\n\n${BODY[t.kind](t.file)}`, { label: `fixup ${t.kind} ${i + 1}`, phase: 'Fix-up', schema: SCHEMA, model: 'sonnet' }).then(
      (r) => r && { task: t, ...r },
    ),
  ),
)
const ok = results.filter(Boolean)
log(`${ok.length}/${TASKS.length} fix-up tasks returned`)
return ok
