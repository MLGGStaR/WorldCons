export const meta = {
  name: 'worldcons-fixup',
  description: 'Clean-up pass after research: recheck suspicious guest lists, backfill last editions, find missing guest photos, research leftovers',
  phases: [{ title: 'Fix-up', detail: 'one agent per task file in pipeline/seed/fixup', model: 'sonnet' }],
}

// args: { tasks: [{ kind: 'recheck' | 'tba' | 'photos' | 'research', file: 'pipeline/seed/fixup/<name>.txt' }] }
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
