// What the daily refresh asks its agents to do, one prompt per task file. Each agent is a
// separate headless Claude Code run (see run.mjs); these prompts are all it is told.

const head = (today) => `You are a WorldCons data agent running unattended as part of the site's daily refresh. Work in C:/Users/S0000005749/Desktop/WorldCons and run every command from that folder. Read pipeline/RESEARCH.md first: its rules on accuracy, stale lineups, picks, tools and the file format apply to everything you do. Today is ${today}.
Hard rules: never guess (when something cannot be confirmed from the official site, leave it as it is and say so in notes); never run git in any form (the refresh commits for you); only edit the pipeline/research/<id>.json files named in your list; never ask questions, nobody is watching. When you finish, reply with a short plain report.`;

const finish = `Then set the file's "checked" to today, add one sentence to its notes saying what changed and on what evidence, and run \`node pipeline/tools/check-research.mjs pipeline/research/<id>.json\` and \`node pipeline/tools/audit-picks.mjs --only <id>\` until both are clean.`;

const BODY = {
  update: (file, today) => `Your list: ${file}. One line per lineup: con id | edition start | the extraction its picks use | TODAY's render of the same guest page | new cards in today's render | picked guests not found on the page today.

Today's render is already saved, so its numbers are fixed. Print it with \`node pipeline/tools/extract.mjs --print <today's file> > pipeline/.tmp/refresh-<id>.txt\` and Read the whole output file (never pipe it through head). When a card's text does not name the guest, screenshot it with \`node pipeline/tools/card-shot.mjs <today's file> <n,n>\` and Read the PNGs.

For each line:
1. Open pipeline/research/<id>.json and find the edition with that start date.
2. New cards: add each one that is a guest of THIS edition: a person or a group appearing as a guest. Not sponsors, vendors, exhibitors, logos, ads, artwork, merchandise, or galleries of past years. RESEARCH.md's stale-lineup rules apply: a card counts only if the page presents it for this edition. Add them as picks in a lineup entry whose "file" is today's file (add that entry; never renumber existing picks), with known-for and cat as RESEARCH.md describes.
3. Not found today: when a picked guest is no longer on the page, or is listed as cancelled or no longer attending, remove that pick. Some pages show only a rotating or random selection of their guests: if a fresh render (\`extract.mjs <url> --mode guests --fresh --out pipeline/.tmp/refresh-<id>-again.json\`) shows a different selection again, remove only guests who appear in neither render and are not on the con's other guest pages. If most of the lineup is gone because the page now shows a different edition or was emptied, decide from the page and the con's news whether this edition still has an announced lineup; if not, set "guests" to "none-yet" and remove "lineup" and "textOnlyGuests".
4. ${finish}
Report per id: "added N, removed M (evidence)" or "unchanged (why)".`,

  announce: (file, today) => `Your list: ${file}. One line per edition: con id | edition start | guest page | TODAY's render of it | new cards.

These editions had no guests announced; today their guest page shows new cards. Print today's render with \`node pipeline/tools/extract.mjs --print <today's file> > pipeline/.tmp/refresh-<id>.txt\` and Read the whole output file; use card-shot.mjs for cards whose text does not name the guest.
For each line, decide whether guests are now announced for THIS edition. Last year's lineup, past galleries and "coming soon" tiles do not count (RESEARCH.md's stale-lineup rules). If they are: set "guests" to "announced" and add a lineup entry whose "file" is today's file, with picks by number, known-for and cat. If they are not, leave the lineup alone.
${finish}
Report per id: "announced N guests (evidence)" or "not yet (why)".`,

  dates: (file, today) => `Your list: ${file}. One line per con: con id | homepage | TODAY's render of it | new date text on the page.

These cons have no upcoming edition in their research file: either the dates were never announced, or their last edition has ended. Their homepage shows new date text today. For each line, print today's render with \`node pipeline/tools/extract.mjs --print <today's file>\` and confirm on the official site (WebFetch is fine; at most one web search) whether an edition ending on or after ${today} has been announced.
- If it has: add it exactly as RESEARCH.md describes (dates with an evidence quote, venue, city, region, country, tickets, guestsPage; guests too if announced for this edition). Move a finished edition into the top-level "last" object, so the file only holds upcoming editions.
- If the text is not a new edition (old dates, other events, a news post), change nothing except checked and a notes sentence.
${finish}
Report per id: "dated <start>" or "unchanged (why)".`,
};

export function promptFor(kind, file, today) {
  if (!BODY[kind]) throw new Error(`unknown refresh task kind: ${kind}`);
  return `${head(today)}\n\n${BODY[kind](file, today)}`;
}
