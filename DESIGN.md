---
name: WorldCons
description: Every fan convention worldwide as a laminated badge, every guest as a photo credential.
colors:
  ink: "#121418"
  on-ink: "#ffffff"
  ground: "#e6e9ee"
  card: "#ffffff"
  card-2: "#f4f6f8"
  ink-2: "#353a43"
  ink-3: "#5a616c"
  line: "#d2d7de"
  skeleton: "#edf0f3"
  strap: "#121418"
  strap-ink: "#f4f5f7"
  strap-2: "#2a2e35"
  live-green: "#0f7a45"
  r-comics: "#b8232b"
  r-anime: "#b51a5c"
  r-games: "#157046"
  r-tabletop: "#9a4706"
  r-scifi: "#2a3d9c"
  r-horror: "#1f1b24"
  r-pop: "#d9ab32"
  r-toys: "#0b6e77"
  r-cosplay: "#7239aa"
  r-furry: "#7e5228"
  r-ink: "#ffffff"
  r-ink-pop: "#1d1500"
  r-ink-horror: "#e8d39c"
  ground-dark: "#17181a"
  card-dark: "#232427"
  card-2-dark: "#2c2d31"
  ink-dark: "#f2f3f5"
  on-ink-dark: "#121418"
  ink-2-dark: "#cdd0d5"
  ink-3-dark: "#a2a6ad"
  line-dark: "#36383d"
  skeleton-dark: "#22262c"
  strap-dark: "#0b0b0c"
  strap-ink-dark: "#f2f3f5"
  strap-2-dark: "#232427"
  r-horror-dark: "#463c52"
typography:
  wordmark:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "19px"
    fontWeight: 900
    letterSpacing: "0.01em"
    fontVariation: "'wdth' 125"
  display:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 880
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 116"
  display-month:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 850
    lineHeight: 1.1
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 118"
  headline:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 850
    lineHeight: 1.2
    fontVariation: "'wdth' 112"
  title:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "19px"
    fontWeight: 820
    lineHeight: 1.12
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 116"
  title-sm:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 750
    lineHeight: 1.2
  body:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
  label-ribbon:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 104"
  label-band:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 800
    letterSpacing: "0.09em"
    fontVariation: "'wdth' 112"
  meta:
    fontFamily: "Archivo, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
rounded:
  print: "4px"
  photo: "6px"
  window: "8px"
  tile: "10px"
  credential: "12px"
  badge: "14px"
  sheet: "20px"
  pill: "999px"
spacing:
  gutter: "clamp(16px, 3vw, 32px)"
  strap-height: "64px"
  page-max: "1480px"
  control-gap: "8px"
  wall-gap: "16px"
  badge-col-gap: "22px"
  page-col-gap: "40px"
  badge-row-gap: "54px"
components:
  strap:
    backgroundColor: "{colors.strap}"
    textColor: "{colors.strap-ink}"
    height: "64px"
    padding: "0 clamp(16px, 3vw, 32px)"
  strap-search:
    backgroundColor: "{colors.strap-2}"
    textColor: "{colors.strap-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "42px"
    padding: "0 40px 0 42px"
  strap-search-focus:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
  nav-link:
    textColor: "{colors.strap-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 14px 0 12px"
  nav-link-active:
    backgroundColor: "{colors.strap-2}"
  lanyard-count:
    backgroundColor: "{colors.strap-ink}"
    textColor: "{colors.strap}"
    rounded: "{rounded.pill}"
    height: "22px"
    padding: "0 6px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 18px"
  button-ghost-pressed:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
  segment-track:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.pill}"
    padding: "3px"
  segment:
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "34px"
    padding: "0 14px"
  segment-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  filter-pill:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 34px 0 14px"
  filter-pill-set:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "34px"
    padding: "0 12px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  input-search:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 14px 0 38px"
  type-toggle:
    textColor: "{colors.ink}"
    typography: "{typography.label-ribbon}"
    height: "42px"
    padding: "0 14px 7px"
  ruler-month:
    textColor: "{colors.ink-2}"
    typography: "{typography.title-sm}"
    rounded: "{rounded.tile}"
    height: "46px"
    padding: "4px 8px"
  ruler-month-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  badge:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.badge}"
    padding: "24px 12px 14px"
  badge-art:
    backgroundColor: "{colors.skeleton}"
    rounded: "{rounded.window}"
  when-chip:
    backgroundColor: "rgb(18 20 24 / 0.82)"
    textColor: "#ffffff"
    typography: "{typography.meta}"
    rounded: "{rounded.pill}"
    height: "24px"
    padding: "0 9px"
  when-chip-live:
    backgroundColor: "{colors.live-green}"
  ribbon:
    backgroundColor: "{colors.r-comics}"
    textColor: "{colors.r-ink}"
    typography: "{typography.label-ribbon}"
    height: "32px"
    padding: "8px 8px 0"
  day-box:
    textColor: "{colors.ink}"
    typography: "{typography.label-ribbon}"
    rounded: "{rounded.print}"
    padding: "5px 0 4px"
  face-thumb:
    backgroundColor: "{colors.skeleton}"
    rounded: "{rounded.print}"
    width: "30px"
    height: "38px"
  credential:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.credential}"
    padding: "18px 8px 10px"
  credential-photo:
    backgroundColor: "{colors.skeleton}"
    rounded: "{rounded.photo}"
  credential-band:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.label-band}"
    rounded: "{rounded.print}"
    padding: "4px 4px 3px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.credential}"
    padding: "12px 16px"
  filter-sheet:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "10px 18px 18px"
---

# Design System: WorldCons

## Overview

**Creative North Star: "The Credential Hall"**

WorldCons is a convention hall seen from the badge-pickup desk. A cool grey ground, a black strap across the top that carries the wordmark, and every convention hanging in the hall as a white laminated badge: a punched lanyard slot, inset key art, a heavy wide-set name, a tabular date line, a strip of guest faces. Con types are satin ribbons hanging from each badge's bottom edge. Guests wear 4:5 photo credentials in the same laminate, with their role printed in an ink band at the foot. Clipping a con to your lanyard is the one personal act, and the badge swings on its slot when you do it.

The hierarchy works like a type specimen: one family (Archivo), one ink, and every level separated by size, weight and the width axis, never by colour. Colour lives in exactly two places: the photographs and key art (faces are the headline, so a guest is never a bare name) and the ten flat satin ribbon colours. Ink is the only action colour, and pressing anything fills it with ink. Density is generous for a directory: four badges across at desktop width, roomy rows so the ribbons can hang, and names that never overflow.

Confirmed rejections: the Eventbrite card with a pin icon and a filter sidebar; the dark gamer-neon default and the glassy, holographic neon-dark look the owner has already turned down; the kraft-paper, rubber-stamp, condensed-type costume. Dark mode is a neutral charcoal hall, and the laminates in it stay white.

**Key Characteristics:**
- A cool hall-grey ground under a black strap; white laminated badges and credentials that stay white in both themes.
- A punched lanyard slot on every laminate, and a punched corner on every ended con.
- One variable family, Archivo, set wide (100–125% width) and heavy for names, with tabular numerals everywhere.
- Ten flat satin ribbon colours for con types, and they appear only on ribbons.
- Ink is the only action colour, and it flips with the theme so it is always the hall's opposite.
- Faces on every badge: a strip of photo thumbnails, or dashed empty slots with a plain sentence.
- Soft ambient shadows on laminates; flat, hairline-edged pill controls.

## Colors

A cool grey-and-ink print palette with one action colour and ten satin ribbon colours that only ever appear as ribbons.

### Primary
- **Badge Ink** (#121418): the only action colour. It fills every pressed, selected and primary state (When segments, a set place select, the guests toggle, ruler months, guest-type chips, the primary button), sets body text, draws the 2px focus ring on the hall and the laminates, prints the credential role band and outlines the day boxes. **On Ink** (#ffffff) is the text on it.
- **Hall Light** (#f2f3f5): Badge Ink's dark-mode value, so pressed controls become near-white pills on the charcoal hall; On Ink flips to #121418 with it.

### Secondary
The satin ribbons, one per con type. Each is flat and carries its label at 4.5:1 or better.
- **Comics Red** (#b8232b), **Anime Magenta** (#b51a5c), **Games Green** (#157046), **Tabletop Rust** (#9a4706), **Sci-Fi Blue** (#2a3d9c), **Toys Teal** (#0b6e77), **Cosplay Violet** (#7239aa), **Furry Brown** (#7e5228): labels in **Ribbon White** (#ffffff).
- **Pop Gold** (#d9ab32): label in **Pop Ink** (#1d1500). Its one job outside a ribbon is printing the CONS half of the wordmark on the strap.
- **Horror Black** (#1f1b24): label in **Horror Parchment** (#e8d39c). On the dark hall it lifts to **Horror Dusk** (#463c52), because a black ribbon would vanish on charcoal.

### Tertiary
- **Live Green** (#0f7a45): the "On now" countdown chip, with a pale mint dot. It is the only status colour, and it stays the same in both themes because the chip sits on the key art inside the laminate.

### Neutral
- **Hall Grey** (#e6e9ee): the page ground. It also shows through every punched slot and corner, because a punch is a hole through to the hall. Dark: **Charcoal Hall** (#17181a).
- **Laminate White** (#ffffff): badges, credentials, the suggestion panel, the filter sheet, the When track, the filter pills and the chips. In dark mode the badges and credentials stay Laminate White; the pills, panels and sheet move to **Charcoal Card** (#232427).
- **Laminate Tint** (#f4f6f8): the hovered or keyboard-selected row in search suggestions. Dark: #2c2d31.
- **Slate Ink** (#353a43): secondary text: place lines, unpressed segment and chip labels, blurbs, text buttons. Dark: #cdd0d5.
- **Pencil Grey** (#5a616c): tertiary text: counts, day counts, known-for lines, ruler years, subtitles, the footer. Dark: #a2a6ad.
- **Hairline** (#d2d7de): 1px pill borders, the ruler's bottom rule, dashed empty photo slots, the footer rule. Dark: #36383d.
- **Skeleton Grey** (#edf0f3): photo, face and art placeholders and the loading shimmer. Dark: #22262c (outside the laminates).
- **Strap Black** (#121418), **Strap Ink** (#f4f5f7), **Strap Raised** (#2a2e35): the header band, its text and focus rings, and its search field and active nav fill. Dark: #0b0b0c, #f2f3f5, #232427.

### Named Rules
**The One Ink Rule.** Ink is the only action colour. Every pressed, selected or primary state is a solid ink fill with on-ink text; the one exception is a type ribbon toggle, which presses into its own satin colour. There is no brand accent and no blue link colour.

**The Ribbon-Only Rule.** A con-type colour appears only on a satin ribbon or a type ribbon toggle, never as text, icon, border or background anywhere else. The wordmark's CONS in Pop Gold is the single standing exception.

**The Laminate Rule.** Badges and credentials keep their printed palette in every theme: Laminate White, Badge Ink at #121418, the light Hairline and Skeleton Grey. Dark mode darkens the hall, the strap and the controls, never a laminate.

## Typography

**Display Font:** Archivo, self-hosted variable (width 62–125%, weight 100–900), with system-ui, -apple-system, Segoe UI, Roboto, sans-serif
**Body Font:** Archivo (the same file)
**Label/Mono Font:** none; printed labels are Archivo in uppercase at 104–112% width

**Character:** One grotesque does every job, the way a printed badge does: heavy and wide for names, plain at 15px for reading, small and wide in uppercase for the printed labels. Width is part of the hierarchy: the more important the line, the wider it is set.

### Hierarchy
- **Wordmark** (900, 19px, 125% width, +0.01em): WORLDCONS on the strap. The same widest, heaviest voice sets a con's short name on its no-image art plate (24px, uppercase, white).
- **Display** (880, 30px, line-height 1.06–1.1, 116% width, −0.01em): the con page title (wrapped with balance), the "Guests" wall heading and page titles. 24px on phones.
- **Display Month** (850, 30px, 1.1, 118% width, −0.01em): month headings over the badge grid, with the con count beside them in Label weight and Pencil Grey. 24px on phones.
- **Headline** (800–850, 24px, 112% width): a guest's name on their own credential, and empty-state headings.
- **Title** (820, 19px, 1.12, 116% width, −0.005em): con names on badges, clamped to three lines with balanced wrapping. The filter sheet and empty-wall headings use 19px at 800–850 and 112%.
- **Title Small** (750, 15px, 1.2): credential names, wall section heads, the result count. Ruler months use it in uppercase at 112% width and +0.02em.
- **Body** (400, 15px, 1.5, tabular numerals): running text and place lines; blurbs at 1.55; long notes capped at 70ch.
- **Label** (600, 15px): every control label. Buttons and the badge date line run at 650, and the con page date line at 750.
- **Ribbon Label** (800, 12px, line-height 1, 104% width, +0.04–0.05em, uppercase): satin ribbons, type toggles, day boxes.
- **Band Label** (800, 12px, 112% width, +0.09em, uppercase): the role band on a credential.
- **Meta** (500–650, 12px, 1.3): day counts (600, uppercase, +0.05em, Pencil Grey), face-strip captions, "+2 more cons", known-for lines (400), countdown chips (650).

### Named Rules
**The Specimen Rule.** Hierarchy comes from size, weight and width, never from colour: headings print in ink, and the ramp is fixed at five sizes (12, 15, 19, 24, 30px) on a 1.25 ratio. The phone search field's 16px exists only to stop iOS from zooming.

**The Wide Rule.** Archivo never runs narrower than 100%. Printed labels sit at 104%, small heads at 112%, names at 116%, month heads at 118%, the wordmark at 125%.

**The Tabular Line Rule.** Numerals are tabular everywhere (the body sets them). A date line prints the range on the left and the day count right-aligned in 12px uppercase Pencil Grey, so counts line up down a grid.

## Layout

Content runs to 1480px, centred, inside a gutter of clamp(16px, 3vw, 32px). The strap is sticky at 64px (58px on phones); the month ruler sticks directly beneath it, and anchor jumps are offset by both.

**List view**, top to bottom: a wrapping controls row (When segments, place selects, the guests toggle, a spacer, Clear filters, Sort), the type ribbon row, the sticky month ruler, a one-line results summary, then month sections. Each month heading has 30px above and 18px below it, so it belongs to the badges it labels (10px and 2px on phones). The badge grid auto-fills columns of at least 286px, which gives four across at 1440px, with a 54px row gap and a 22px column gap (50px and 16px on phones).

**Con page**: two columns, a sticky badge column of minmax(300px, 400px) beside the guest wall, 40px apart. The badge column scrolls on its own when it is taller than the viewport. At 1080px and below it narrows to 280–340px with a 28px gap. At 760px and below it becomes a single column in the order badge, guest wall, then notes (blurb, tickets, calendar, share, last-checked line, other dates).

**Guest page**: a 260px sticky credential column beside a badge grid (220px at 1080px and below; stacked at 760px and below, with the credential centred at up to 280px).

**Walls** of guest credentials auto-fill columns of at least 150px with a 16px gap (132px and 12px on phones; exactly two columns at 420px and below). Lineups of 16 or more with mixed roles group under role headings.

**Phones** (760px and below): the place selects, guests toggle, sort and clear collapse into one Filters pill that opens a bottom sheet in thumb reach. The strap drops its text labels to icons plus the count. The ribbon row and chip rows become single-line horizontal scrollers that bleed to the screen edge. Key art goes to 2.2:1 so the first badge lands whole in the first viewport.

Breakpoints are 1080px, 760px and 420px, plus a no-hover query that keeps the clip faintly visible on touch screens.

### Named Rules
**The Hanging Room Rule.** Badge grids keep a 54px row gap (50px on phones), because up to three 32px ribbons hang below every badge. Any surface that shows badges leaves that room under them.

**The Registered Badge Rule.** Every badge prints the same fields in the same order (art window, name, date line, place line, face strip), with the face strip pinned to the foot, so badges in a row register edge to edge and line for line.

**The No-Sidebar Rule.** Filters live in a wrapping row above the content on wide screens and in a bottom sheet on phones, never in a sidebar.

## Elevation & Depth

A hybrid. Laminates sit on the hall with a soft two-layer ambient shadow and lift when hovered. Controls stay flat, edged with a hairline. The real depth cues are physical: punched holes and ribbon folds, drawn with inset shadows.

### Shadow Vocabulary
- **Laminate rest** (`box-shadow: 0 1px 1px rgb(18 20 24 / 0.05), 0 10px 24px -14px rgb(18 20 24 / 0.32)`): badges, credentials, "Other dates" links, the empty-wall card. Dark: `0 1px 1px rgb(0 0 0 / 0.3), 0 12px 26px -14px rgb(0 0 0 / 0.7)`.
- **Laminate lift** (`box-shadow: 0 2px 3px rgb(18 20 24 / 0.06), 0 18px 34px -16px rgb(18 20 24 / 0.38)`): a hovered badge or credential (with a 3px rise), the suggestion panel, the toast. Dark: `0 2px 3px rgb(0 0 0 / 0.35), 0 20px 36px -16px rgb(0 0 0 / 0.8)`.
- **Punch** (`box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.22)`): the lanyard slot; 0.25 for the corner punch on an ended con.
- **Ribbon fold** (`box-shadow: inset 0 6px 5px -4px rgb(0 0 0 / 0.38)`): the top edge of every hanging ribbon, where it tucks under the badge; 0.35 on a pressed type toggle.
- **Art hairline** (`box-shadow: inset 0 0 0 1px rgb(18 20 24 / 0.08)`): keeps pale logo plates from melting into the white badge.

### Named Rules
**The Flat Controls Rule.** Pills, segments, chips and selects never cast a drop shadow; they are edged with a 1px line (Hairline on the hall, Strap Raised on the strap, an inset 1px ring on the When track). Elevation belongs to laminates and the two popovers, the suggestion panel and the toast.

**The Punch Rule.** A punch is a hole through the laminate to the hall: it takes the ground colour of the current theme and an inset shadow, never a fill of its own.

## Shapes

Corners step down from the object to its printed details. Badges are 14px and credentials 12px. Inset windows are 8px for key art and 6px for guest photos. Printed details are 4px: face thumbnails, the role band, day boxes, the lanyard slot. Flags are 2px. Ruler months and suggestion rows are 10px, and the filter sheet has 20px top corners. Every control is a full pill; the build writes the radius as half the control height (17px on 34px, 20px on 40px, 21px on 42px, 22px on 44px).

Recurring silhouettes:
- **The notched ribbon tail:** a straight-cut ribbon with a centred V notch, 7px on hanging ribbons and 8px on type toggles.
- **The lanyard slot:** a 40×7px rounded slot centred 9px from the top of a badge; 26×5px at 7px on a credential (36×7px on the guest page's large credential).
- **The corner punch:** a 12px circle, 14px in from the top right of an ended con's badge, which also drops to 72% opacity.
- **Fixed ratios:** key art 1.91:1 (2.2:1 on phones), guest photos 4:5, face thumbnails 30×38px.
- **Strokes:** 1px Hairline on pill borders; 1.5px for printed day boxes (ink), dashed empty photo slots (Hairline) and the guests-toggle checkbox (Pencil Grey, 6px radius).

## Components

### Strap (Navigation)
The black lanyard strap across the top of every view.
- **Structure:** 64px (58px on phones), Strap Black, sticky. Three columns: the wordmark left (a 26×30px lanyard-badge mark plus WORLD**CONS**), search in the centre (up to 560px), the Guests and Lanyard pills on the right.
- **Search:** a 42px pill filled and bordered in Strap Raised, with Strap Ink text and a 62% placeholder. On focus it becomes a laminate: a white fill with ink text. Suggestions drop below as a 14px-radius panel (Laminate White, or Charcoal Card in dark mode) with the lift shadow; rows are at least 48px tall with 34×42px photo or 56×30px art thumbnails, and the selected row turns Laminate Tint.
- **Nav pills:** 40px, a Strap Raised hairline, Label type. Hover and the current page fill Strap Raised. The Lanyard pill carries a 22px Strap Ink disc with Strap Black numerals at 12px/800, outlined when the count is zero; the disc bumps to 1.35× (peaking at 30% of a 0.5s ease-out) whenever a con is clipped or removed.
- **Focus:** rings on the strap are drawn in Strap Ink (the 2px outline at a 2px offset); the suggestion panel switches them back to ink.
- **Phones:** icon-only pills, and the wordmark shrinks to its mark.

### Buttons
- **Shape:** full pill (22px radius on a 44px button).
- **Primary:** Badge Ink fill, On Ink text, 15px at 650, 0 18px padding, 44px tall, with an optional trailing 17px icon (an up-right arrow for external links).
- **Hover / Focus:** rises 1px over 0.15s on the ease-out curve and settles on press; focus is the global 2px ink outline at a 2px offset.
- **Ghost:** transparent with a Hairline border and ink text; the border darkens to Pencil Grey on hover. Pressed (for example "On your lanyard") fills Laminate White with an ink border.
- **Text actions:** Clear filters, Reset and the footer controls are underlined text buttons in Slate Ink, never pills.

### Chips
- **When segments:** a Laminate White pill track (3px padding, inset 1px Hairline ring) holding 34px pill segments in Label type and Slate Ink; pressed fills ink.
- **Place selects and the guests toggle:** 40px Laminate White pills with a Hairline border; on hover the border goes Pencil Grey. When set or pressed they fill ink and the chevron or checkbox flips to On Ink. Disabled sits at 45%.
- **Guest-type chips:** 34px pills with a Hairline border, Label type in Slate Ink and the count at 500 in Pencil Grey. Pressed fills ink, with the count at 75%.

### Inputs / Fields
- **Style:** a 40px pill with a Hairline border, a Laminate White fill, 15px text and a 17px search icon set 12px in, in Pencil Grey.
- **Focus:** a 2px ink outline flush to the edge (0 offset) while the border goes transparent.
- **Filter sheet fields:** 46px tall, 12px radius, full width, under 12px/700 Pencil Grey labels.

### Month Ruler
- Sticky under the strap, on the hall ground at 92% opacity with a light blur and a Hairline bottom rule; a horizontal scroller with no visible scrollbar.
- **Years:** 12px, 800, 112% width, Pencil Grey, separated by a Hairline.
- **Months:** 52×46px buttons with a 10px radius: the three-letter month in Title Small uppercase, the count in 12px Pencil Grey, and a 22×3px count bar (minimum 12%) at 70% opacity. Hover fills Laminate White; pressed fills ink.

### Type Ribbon Toggles
- The badge's own satin ribbon, used as a filter: 42px tall (38px on phones), a notched tail, the label in Ribbon Label at +0.05em, and its count at 600 in Pencil Grey.
- **Rest:** the ribbon colour mixed 15% into the card, with a 3px solid top band in the full ribbon colour. **Hover:** a 26% mix and a 1px drop. **Pressed:** the full satin colour, ribbon-ink text and the fold shadow along the top. **Disabled** (no cons): 40%.
- The ribbon shape is drawn behind the button, so the focus ring is never clipped.

### Badge (signature)
A white laminated con badge hanging in the hall.
- **Body:** Laminate White, 14px radius, the laminate rest shadow, 24px 12px 14px padding (26px 16px 18px on the con page). On hover it lifts 3px into the lift shadow over 0.25s.
- **Slot and clip:** the punched slot sits top centre with the clip button over it. The 22px clip icon appears at 45% on hover, stays at 40% on touch screens, and goes solid once clipped; a tooltip ("Clip to lanyard" or "On your lanyard") shows in a small ink chip. Clipping swings the badge from its slot (−4°, 2.6°, −1.2°, then rest, over 0.9s).
- **Art window:** 1.91:1, 8px radius, the art hairline. Photos fill the window; logos sit contained (10% by 14% inset) on their own brand plate colour; with no art, the con's short name sits on its plate in the wordmark voice.
- **Fields** (6px apart): the name in Title (clamped to three lines); the date line (range on the left at 650, day count on the right in Meta uppercase); the place line (flag, then "City, Region · Venue" in Slate Ink on one line with an ellipsis); the face strip pinned to the foot, showing up to five 30×38px photos, then "455 guests" over the first guest's name "& more". With no lineup it shows three dashed empty slots and a plain sentence ("Guests not announced yet").
- **States:** an ended con drops to 72% opacity and gets the corner punch. Loading shows skeleton art and bars that shimmer to 55% over 1.4s.
- **Con page variant:** the same badge, larger, printing its own fields: the name in Display, a Pencil Grey subtitle (short name · organiser), the long tabular date line, the day strip, a flag | venue and place | Map row, a face strip linking to the wall, then Official site (primary) and Clip to lanyard (ghost). It has no icon rows.

### Satin Ribbons
- Up to three per badge, hanging from the bottom edge 18px in from each side and 5px apart. Each is 32px tall with 8px side padding, the label at the top in Ribbon Label, a 7px notched tail and the fold shadow along the top edge.
- Each type sets its own colour and ink. On a badge they are buttons that filter to that type (brightening 8% on hover); on the con page they are links to that type's list.
- **Focus:** an inset 2px ring in the ribbon's label ink, kept together with the fold shadow, in place of the outline, because the notched shape clips anything drawn outside it.

### Guest Credential
A 4:5 photo ID in the same laminate.
- **Body:** Laminate White, 12px radius, the laminate rest shadow, 18px 8px 10px padding and a 26×5px punched slot. As a link it lifts 3px into the lift shadow on hover.
- **Photo:** 4:5, 6px radius, filled. With no photo, the guest's initials sit on Skeleton Grey at 30px, 850, 120% width, in Pencil Grey.
- **Text:** the name in Title Small (balanced), the known-for line at 12px in Pencil Grey (clamped to two lines), and "+N more cons" at 12px, 650, in Slate Ink, pinned to the bottom.
- **Role band:** printed at the foot in ink with On Ink text, Band Label, 4px radius. It is left off inside role-grouped walls, where the section heading already names the role.
- **Guest page variant:** 260px wide and sticky, the name in Headline, the known-for line at 15px (clamped to four lines).

### Countdown Chip
- A 24px pill set 8px into the top left of the key art: an 82% ink scrim with white 12px/650 text ("In 3 days"). Live, it turns Live Green with a 7px mint dot ("On now · day 4 of 4"). Past cons use a 60% scrim and undated cons 62%.

### Day Strip
- On the con page, under the date line of a two-to-seven-day con: one box per day (THU, FRI, SAT, SUN), up to 64px wide each, with a 1.5px ink border, 4px radius and Ribbon Label type.

### Toast and Filter Sheet
- **Toast:** an ink fill with On Ink 15px/600 text, 12px radius, 12px 16px padding and the lift shadow, at the bottom centre. It rises 20px into place over 0.3s, and its action is an underlined text button at 750.
- **Filter sheet (phones):** a bottom dialog up to 560px wide in Laminate White with 20px top corners and a 40×5px grip. It holds the place selects, the guests toggle and sort, and ends with a full-width primary button reading "Show N conventions". It slides up 40px over 0.32s over a 50% near-black backdrop.

### Icons
- Line icons at 18px (16–17px inside controls, 22px for the clip) with a 2px stroke, round caps and joins, in currentColor: Lucide, plus a lanyard and a clip drawn in the same stroke language. The wordmark's mark is a lanyard badge.

## Do's and Don'ts

### Do:
- **Do** print every con as a badge with its fields in the registered order (art window, name, date line, place line, face strip), with up to three satin ribbons hanging from the bottom edge.
- **Do** give every guest a 4:5 photo credential; when a photo is missing, set their initials on Skeleton Grey. A guest is never a bare name.
- **Do** keep badges and credentials Laminate White with #121418 ink in both themes, and let only the hall, the strap and the controls change with the theme.
- **Do** fill every pressed, selected or primary state with ink and On Ink text; a type ribbon toggle presses into its own satin colour instead.
- **Do** set ribbon labels at 12px, 800, uppercase, in Ribbon White, except Pop (#1d1500) and Horror (#e8d39c), so every label clears 4.5:1.
- **Do** clamp con names at three balanced lines, ellipsise place lines on one line and clamp known-for lines at two, so nothing overflows a laminate.
- **Do** mark an ended con with 72% opacity and the corner punch.
- **Do** show an unannounced lineup as dashed empty photo slots with a plain sentence, never as an empty area.
- **Do** keep a visible 2px focus outline at a 2px offset on everything focusable: ink on the hall and the laminates, Strap Ink on the strap. A hanging ribbon takes an inset 2px ring in its label ink instead, because its notched shape clips anything outside it.
- **Do** collapse every transition and animation to an instant under reduced motion.

### Don't:
- **Don't** add a brand accent, a coloured link or a coloured primary button: ink is the only action colour.
- **Don't** use a ribbon colour for text, icons, borders or backgrounds outside a ribbon or a type toggle; the wordmark's CONS in Pop Gold is the only exception.
- **Don't** mark a place with a map-pin icon; print its country flag (18×13.5px, 2px radius, with a faint hairline ring).
- **Don't** put filters in a sidebar; use the wrapping controls row, and on phones the bottom sheet.
- **Don't** turn dark mode into gamer neon: no glows, no neon tint on the hall or the strap, and never a dark badge or credential.
- **Don't** set Archivo narrower than 100% width or add a second family; condensed type, kraft paper and rubber stamps are rejected looks.
- **Don't** tighten a badge grid's row gap below 54px (50px on phones); the ribbons need that room to hang.
- **Don't** give pills, segments, chips or selects a drop shadow.
- **Don't** add font sizes off the 12/15/19/24/30px ramp; the 16px phone search field is the only exception.
