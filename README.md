# WorldCons

Every fan convention worldwide (comic, anime, gaming, tabletop, sci-fi, horror, pop
culture, toys, cosplay, furry), sorted by date, with every announced guest and their
photo.

Live site: https://mlggstar.github.io/WorldCons/

## What it does

- Upcoming cons by start date, grouped by month, each shown as a con badge with its
  key art, dates, place, type ribbons and a strip of guest faces.
- Filters: when (upcoming / year / all), month ruler, continent, country, US state
  (plus Canadian provinces and Australian states), con type, "with guests", sort by
  date, name or guest count. Every view is a shareable URL.
- Search across cons, cities and guests; guest suggestions show their photo.
- Con page: dates, venue, map, official site, tickets, and the full guest wall
  (photo credentials, grouped by actors, voice actors, comics, authors …).
- Guest page: every upcoming con a guest is booked for.
- Lanyard: clip cons to keep them on this device.
- Installable PWA that updates itself (version.json check + network-first service worker).

## How the data is made

Static site, no backend. The data is a dated snapshot built by `pipeline/`:

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

## Develop

```
npm install
npm test                     # model logic (filters, dates, search, URL state)
npm run serve                # http://localhost:8080/
node pipeline/tools/shoot.mjs <outDir> "list=#/" "con=#/con/<id>"   # screenshots
```
