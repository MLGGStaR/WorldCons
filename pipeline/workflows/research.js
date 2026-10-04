export const meta = {
  name: 'worldcons-research',
  description: 'Research each convention batch: dates, venue, cover image and every announced guest with a photo',
  phases: [{ title: 'Research', detail: 'one agent per batch of cons, following pipeline/RESEARCH.md', model: 'sonnet' }],
}

// args: { batches: [1, 2, 3, ...] }  -> pipeline/seed/batches/batch-NN.txt (written by make-batches)
const NUMS = args.batches

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['written', 'inactive', 'failed'] },
          editions: { type: 'integer' },
          guests: { type: 'integer' },
          note: { type: 'string' },
        },
        required: ['id', 'status', 'editions', 'guests', 'note'],
      },
    },
    toolProblems: { type: 'string' },
  },
  required: ['results', 'toolProblems'],
}

const pad = (n) => String(n).padStart(2, '0')
const prompt = (n) => `You are a WorldCons research agent. Work in C:/Users/S0000005749/Desktop/WorldCons and run every command from that folder.

1. Read pipeline/RESEARCH.md completely.
2. Read your work list: pipeline/seed/batches/batch-${pad(n)}.txt (one convention per line: id | name | url | place | types | organizer | note). The URL, place and types come from a quick discovery pass and may be wrong: verify them.
3. Follow RESEARCH.md for each convention in that list, in order. For each one, write pipeline/research/<id>.json and run \`node pipeline/tools/check-research.mjs pipeline/research/<id>.json\` until it passes. Keep the given id unless it is clearly wrong (then explain in the file's notes).

If a convention is defunct, on hiatus, trade-only, or a duplicate of another entry in your list, still write its file with "status": "inactive" and the reason in notes.

When every convention in your list has a file, return one result per convention (status written/inactive/failed, number of editions written, number of guests picked across editions, a short note), plus any problems you hit with the tools (empty string if none).`

phase('Research')
const results = await parallel(
  NUMS.map((n) => () =>
    agent(prompt(n), { label: `research batch ${pad(n)}`, phase: 'Research', schema: SCHEMA, model: 'sonnet' }).then(
      (r) => r && { batch: n, ...r },
    ),
  ),
)
const ok = results.filter(Boolean)
const all = ok.flatMap((r) => r.results)
log(`${all.filter((r) => r.status === 'written').length} written, ${all.filter((r) => r.status === 'inactive').length} inactive, ${all.filter((r) => r.status === 'failed').length} failed; ${NUMS.length - ok.length} batches returned nothing`)
return ok
