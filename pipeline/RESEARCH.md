# Convention research procedure

You are filling the WorldCons database: one JSON file per convention in
`pipeline/research/<id>.json`. Today is **2026-10-05**. Work from the folder
`C:/Users/S0000005749/Desktop/WorldCons` (run every command from there).

Accuracy beats coverage. Never guess a date, a venue or a guest. If you cannot confirm
something from an official source, leave it out and say so in `notes`.

## Tools

```
node pipeline/tools/extract.mjs <url> --mode home   --save <id>      # homepage: dates, JSON-LD, images, links
node pipeline/tools/extract.mjs <url> --mode guests --save <id>      # guest page: numbered image candidates
node pipeline/tools/extract.mjs <url> --mode guests --save <id>-2    # a second guest page (use -2, -3 …)
node pipeline/tools/check-research.mjs pipeline/research/<id>.json   # validate the file you wrote
```

`extract.mjs` renders the page in Chromium (JavaScript, lazy images, "load more" buttons
in most languages, and numbered or "next" pagination: a `PAGINATION walked N pages`
line tells you it merged several pages) and prints a compact summary.

**Never let a guest list get cut off.** Shell output is truncated after about 30,000
characters, and big lineups are longer than that. For guests mode always redirect to a
file and read all of it with the Read tool (use offset/limit for long files):
`node pipeline/tools/extract.mjs <url> --mode guests --save <id> > pipeline/.tmp/<id>-guests.txt`
Never pipe it through `head`. When an `alt` is missing from a candidate line, the name
is simply the start of its `text` (the printer drops alt text that repeats the card). It saves the full result to
`pipeline/cache/extract/<id>.<mode>.json`; you cite that file and the `#numbers` it printed.
Most homepages were rendered in advance, so the first home call usually answers
instantly from that cache (same URL, under a day old); add `--fresh` to force a new render.
If a page shows a bot wall or comes back empty, retry once with `--channel msedge`.
WebSearch and WebFetch are fine for finding the official site, dates and the guest page.

**Picks are numbers inside one saved file.** A saved extraction that a research file
already cites is never overwritten: a new render of it is saved as `<id>-v2` (then -v3 …)
and a `NOTE` line says so. Always pick from the numbers of the file on the `SAVED` line and
point the lineup's `file` at that same file. Each pick must be the person's own photo or
promo tile: never a flag, a social icon or an SVG, never the artwork shown next to them.
When a card's text does not name the guest (the name is printed inside the image, or the
file name is a hash), check it with
`node pipeline/tools/card-shot.mjs <saved file> <n,n,...>` and Read the PNGs (the pick is
outlined in magenta). `node pipeline/tools/audit-picks.mjs --only <id>` reports picks
whose card carries another name.

Budget: about 10 tool calls per convention. Do not rabbit-hole; when something cannot
be confirmed, record what you know, explain in `notes`, and move on. WebSearch is shared
by every research agent in this run, so use at most 2 searches per convention; prefer
the con's own site (rendered with extract.mjs) and WebFetch.

Special cases:
- **Two shows a year** under one brand in one city (MCM London May + October, Comiket
  summer + winter): one file, one edition per show.
- **No website, only Facebook/Instagram:** search once for a real site. If there is none,
  use the social page as `url`; dates still need an official announcement you actually
  saw (quote it in `evidence`); skip guests and the cover (`"cover": null` is allowed
  only in this case, and only when no image is reachable).
- **Multi-city brands** (FAN EXPO, GalaxyCon, Supanova, Oz Comic-Con, Comic Con India,
  Creation, Days of the Dead …): each file is one city. Use that city's own page for
  dates, guests and cover, never another city's.
- **Trade-only or invite-only** events are `"status": "inactive"` with the reason.

## Steps for each convention

1. **Find the official site.** The URL you were given may be stale. Use the con's own
   site, not ticket resellers, Facebook or aggregator sites (FanCons, AnimeCons,
   ConventionScene…). Aggregators may only point you to the official site.
2. **Homepage pass:** `extract.mjs <home> --mode home --save <id>`. Read the JSON-LD,
   the date text and the links. JSON-LD is often stale (last year's event), so trust the
   visible page text and the con's own news over it.
3. **Editions.** Record every edition that ends on or after 2026-10-05 and starts on or
   before 2027-12-31 and whose dates the con has announced. That is usually the next
   edition, sometimes the one after it too. If the con only names a month ("June 2027"),
   use `"dates": "month"` with the first and last day of that month. If nothing is
   announced for the window, write the file with `"editions": []`, explain in `notes`,
   and add the most recent edition you can confirm as a top-level
   `"last": {"start": "2026-07-31", "end": "2026-08-02", "city": "Vancouver", "region": "BC", "country": "CA", "venue": "Vancouver Convention Centre"}`
   (venue may be ""). The site lists these cons as "dates not announced yet".
   If the con is defunct, cancelled or on hiatus, set `"status": "inactive"` with the
   reason and the last year it ran.
4. **Guests** (only for editions whose guests are announced): find the page that lists
   **all** guests (prefer "All Guests" over a category page; if guests are split by
   category pages, extract each one with `-2`, `-3` …). Run `--mode guests` and pick
   every real person from the numbered candidates:
   - Picks are `[#number, "Name", "Known for", "cat"]`.
   - Name: the person's real name in normal capitalisation ("ADRIANNE PALICKI" ->
     "Adrianne Palicki"). Groups/bands/duos are fine as one guest.
   - Known for: 2–6 words from the card ("The Walking Dead", "Voice of Goku in Dragon
     Ball Z", "Batman artist"). Leave "" if the card says nothing.
   - cat: `actor` (film/TV), `voice` (voice actor), `comics` (comic writer/artist),
     `animation` (anime/animation industry, mangaka, directors), `author` (prose
     authors), `cosplay`, `creator` (YouTubers, streamers, influencers, podcasters),
     `gaming` (game developers, esports), `music`, `sports` (wrestlers, athletes),
     `other`.
   - Use these `cat` definitions even when the con labels someone differently (a voice
     actor the site files under "Gaming" is `voice`). Careful: guest `cat` says
     `gaming`, but the con-level `types` list says `games`.
   - Cards that carry only a name: pick everyone anyway, use `cat` from what you know
     for sure or `other`, leave known-for "", and say so in notes. Never guess.
   - Skip logos, sponsors, ads, banners, venue photos, exhibitors, artist-alley tables,
     vendors, panels and "TBA"/"more coming soon" tiles. Skip guests marked cancelled.
   - A guest who appears in two sections is picked once.
   - If guests are listed only as names with no photos, put them in `textOnlyGuests`
     as `["Name", "Known for", "cat"]` (the build step finds their photos elsewhere).
   - Only the current edition's guests. **Cons leave last year's lineup on their guest
     page for months.** A page still showing last year's lineup is `"guests": "none-yet"`.
     Treat a lineup as stale when the page, URL or heading names an earlier year, when
     it has a "Cancellations"/"Canceled" section or autograph schedules for dates that
     have passed, when the homepage says the last show is "complete" / "see you next
     year", or when the previous edition ended recently and nothing announces guests for
     the next one. Keep a lineup only with positive evidence it is for this edition (its
     year or dates on the page, or an announcement made after the last show). When
     unsure: `none-yet`. Quote the evidence in `notes`.
5. **Cover image:** from the homepage summary pick the key that best represents the
   event (`og`, `twitter`, `hero:N` or `logo:N`). Best: official key art or a branded
   banner for this edition (file names with keyart, key-art, banner, header, hero,
   slider, poster; wide, 900px+). `og` is usually right. A logo is fine when it is all
   there is (the build trims logos and shows them on their own colour). Avoid photos of
   crowds or venues, sponsor banners, ticket graphics, generic stock, and images for a
   different city's edition of a multi-city brand.
6. **Write** `pipeline/research/<id>.json`, then run `check-research.mjs` on it and fix
   every error it reports before moving on.

## File format

```json
{
  "id": "holiday-matsuri",
  "name": "Holiday Matsuri",
  "short": "",
  "url": "https://holidaymatsuri.com/",
  "organizer": "HMConventions",
  "status": "active",
  "types": ["anime", "cosplay", "games"],
  "blurb": "Florida's largest anime convention: a holiday-themed weekend of anime, cosplay and gaming in Orlando.",
  "cover": { "file": "pipeline/cache/extract/holiday-matsuri.home.json", "key": "og" },
  "editions": [
    {
      "start": "2026-12-18",
      "end": "2026-12-20",
      "dates": "confirmed",
      "venue": "Orange County Convention Center",
      "city": "Orlando",
      "region": "FL",
      "country": "US",
      "tickets": "https://app.holidaymatsuri.com/",
      "guestsPage": "https://holidaymatsuri.com/guests",
      "guests": "announced",
      "lineup": [
        {
          "file": "pipeline/cache/extract/holiday-matsuri.guests.json",
          "picks": [
            [1, "Suzie Yeung", "Voice actor", "voice"],
            [2, "Max Mittelman", "Voice actor", "voice"]
          ]
        }
      ],
      "textOnlyGuests": [],
      "evidence": "Homepage text: 'ORLANDO, FL - DEC. 18-20, 2026'"
    }
  ],
  "checked": "2026-10-05",
  "notes": ""
}
```

Field rules:

- `id`: lowercase kebab-case, unique, stable; the one you were given unless it is wrong.
  Multi-city brands get one file per city (`supanova-melbourne`, `fan-expo-dallas`).
- `short`: the common abbreviation when there is one ("NYCC", "SDCC", "MCM"), else "".
- `types`: one to four of `comics`, `anime`, `games` (video games), `tabletop`,
  `scifi` (sci-fi & fantasy), `horror`, `pop` (pop culture / celebrity media),
  `toys` (toys & collectibles), `cosplay`, `furry`. Put the main one first.
- `blurb`: one factual sentence in your own words (max 200 characters). No hype words
  ("ultimate", "epic"), no attendance numbers unless the con publishes them.
- `dates`: `confirmed` (exact days announced) or `month` (only the month is known).
- `region`: US state / Canadian province / Australian state code where it applies
  (`CA`, `ON`, `NSW`), otherwise "".
- `country`: ISO 3166-1 alpha-2 (`US`, `GB`, `JP`, `DE`, `AE`, `AU`, `BR`).
- `guests`: `announced` (lineup captured), `none-yet` (not announced yet), `none`
  (this kind of event does not book guests, e.g. a trade show or a con with no guest
  program), or `unavailable` (a lineup exists but could not be read — explain in notes).
- `evidence`: where the dates came from, quoted briefly.
- `status`: `active` or `inactive`.
