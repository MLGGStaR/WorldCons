# Product

<!-- impeccable:product-schema 1 -->

> Interview substitution: the owner has a standing rule to never be asked questions
> and to always proceed. Facts below marked *(inferred)* come from the original brief
> and from the owner's earlier projects, not from an interview.

## Platform

web

## Stack

Delegated *(inferred)*: static HTML, CSS and vanilla JavaScript ES modules with no
framework or build step, deployed on GitHub Pages from `MLGGStaR/WorldCons`. A Node data
pipeline (`pipeline/`) produces `data/*.json` and optimized WebP images that are
committed to the repo. The owner's other sites use the same pattern (ShipTrack,
Blackjack), and they install sites on their iPhone home screen, so it ships as a
self-updating PWA.

## Users

Fans who go to pop-culture conventions (comics, anime, gaming, sci-fi, horror, toys)
and plan trips around them. They want to know what is coming up, where, and above all
**who will be there** (actors, voice actors, comic creators, cosplayers) so they can
plan autographs, photo ops and travel. The owner is one of them: they are based in the
UAE and earlier built a UAE-only con calendar *(inferred from Desktop/Cons)*.

## Product Purpose

A worldwide convention tracker: every con on one chronological list, filterable by
year, month, continent, country, US state and con type, searchable by guest. Opening a
con shows its details, its official link, and its full guest list with a photo for
every guest. Success: a fan can answer "what cons are coming up near me / that I care
about, and who is going?" faster and more pleasantly than on FanCons.com.

## Positioning

Guest-first. FanCons.com is a text-heavy, ad-cluttered directory. WorldCons puts every
guest's face on the page, always, and lets a fan go from a person ("where is this
actor appearing next?") to every con they are booked for.

## Operating Context

- Browsing on a phone (often installed to the home screen) and on desktop.
- Planning months ahead; checking back as cons announce guests.
- Sharing a filtered view or a con page with friends, so every view needs a URL.

## Capabilities and Constraints

- No backend. Data is a dated snapshot gathered from official convention websites;
  guest photos come from the con's own guest pages, with Wikipedia/Wikimedia or TMDB as
  fallbacks, stored locally as small thumbnails.
- FanCons.com is behind a Cloudflare wall and is not a data source; nothing is copied
  from it.
- Guest lists change constantly; every con records when its guests were last checked.
- Cons whose guests are not announced say so plainly instead of showing an empty grid.
- Con types: Comics, Anime & Manga, Video Games, Tabletop, Sci-Fi & Fantasy, Horror,
  Pop Culture & Media, Toys & Collectibles, Cosplay, Furry.

## Brand Commitments

- Name: **WorldCons**.
- Brief: "a simple and nice UI", "better than FanCons", "images of the guests".
- Owner's taste from past projects *(inferred)*: rejected a glassy neon-dark/holographic
  look as "looks AI"; rejected a kraft-paper/stamp/condensed-type look as "extremely
  bad"; liked a confident print-like comic look. Avoid generic AI aesthetics and avoid
  costume gimmicks.

## Evidence on Hand

- Real convention data and guest photos gathered by the pipeline (see `data/`).
- No testimonials, partners, attendance claims or press exist; none may be invented.
  Attendance figures appear only when the con itself publishes them.

## Product Principles

1. Faces are the headline: a guest is never a bare name.
2. Chronology first: the default view is upcoming cons by start date.
3. Every view is a URL: filters, con pages and guest pages can be shared and bookmarked.
4. Say what is known: show dates, guests and "last checked" honestly, and mark
   anything unconfirmed.
5. Fast on a phone: small images, lazy loading, no layout jank.

## Accessibility & Inclusion

WCAG 2.2 AA contrast and keyboard access for all filters and dialogs; every photo has
the guest's name as alt text; respects reduced motion.
