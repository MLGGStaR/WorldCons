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

`extract.mjs` renders the page in Chromium (JavaScript, lazy images and "load more"
buttons included) and prints a compact summary. It saves the full result to
`pipeline/cache/extract/<id>.<mode>.json`; you cite that file and the `#numbers` it printed.
If a page shows a bot wall or comes back empty, retry once with `--channel msedge`.
WebSearch and WebFetch are fine for finding the official site, dates and the guest page.

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
   announced for the window, write the file with `"editions": []` and explain in `notes`.
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
   - Skip logos, sponsors, ads, banners, venue photos, exhibitors, artist-alley tables,
     vendors, panels and "TBA"/"more coming soon" tiles. Skip guests marked cancelled.
   - A guest who appears in two sections is picked once.
   - If guests are listed only as names with no photos, put them in `textOnlyGuests`
     as `["Name", "Known for", "cat"]` (the build step finds their photos elsewhere).
   - Only the current edition's guests. A page still showing last year's lineup is
     `"guests": "none-yet"`.
5. **Cover image:** from the homepage summary pick the key that best represents the
   event (`og`, `twitter`, `hero:N` or `logo:N`). Prefer official key art or a branded
   banner; avoid photos of crowds with unrelated text and avoid generic stock. If the
   only option is a logo, pick the logo.
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
