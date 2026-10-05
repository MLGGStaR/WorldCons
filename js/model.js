// Pure data logic for WorldCons: dates, filtering, sorting, grouping, search and URL
// state. No DOM here, so it runs under `node --test` as well as in the browser.

import { COUNTRIES, CONTINENTS, REGIONS, countryName, continentOf, regionName } from './geo.js';

export const TYPES = {
  comics: 'Comics',
  anime: 'Anime & Manga',
  games: 'Video Games',
  tabletop: 'Tabletop',
  scifi: 'Sci-Fi & Fantasy',
  horror: 'Horror',
  pop: 'Pop Culture',
  toys: 'Toys & Collectibles',
  cosplay: 'Cosplay',
  furry: 'Furry',
};

export const CATS = {
  actor: 'Actor',
  voice: 'Voice actor',
  comics: 'Comics',
  animation: 'Animation',
  author: 'Author',
  cosplay: 'Cosplay',
  creator: 'Creator',
  gaming: 'Gaming',
  music: 'Music',
  sports: 'Sports',
  other: 'Guest',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = MONTHS.map((m) => m.slice(0, 3));
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- dates (all ISO "YYYY-MM-DD" strings, compared as calendar days) ---------------

export function isoToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const parts = (iso) => iso.split('-').map(Number);
const dayNumber = (iso) => {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d) / 864e5;
};

export function daysBetween(a, b) {
  return dayNumber(b) - dayNumber(a);
}

export function dayCount(con) {
  return daysBetween(con.start, con.end) + 1;
}

export function weekday(iso) {
  const [y, m, d] = parts(iso);
  return WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function monthLabel(key, short = false) {
  const [y, m] = key.split('-').map(Number);
  return short ? `${MON[m - 1]} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(key) {
  return MON[Number(key.slice(5, 7)) - 1];
}

/** "Oct 8–11, 2026" · "Oct 30 – Nov 1, 2026" · "Dec 30, 2026 – Jan 2, 2027" · "June 2027" */
export function formatRange(start, end, precision = 'd') {
  const [y1, m1, d1] = parts(start);
  const [y2, m2, d2] = parts(end);
  if (precision === 'm') return `${MONTHS[m1 - 1]} ${y1}`;
  if (start === end) return `${MON[m1 - 1]} ${d1}, ${y1}`;
  if (y1 !== y2) return `${MON[m1 - 1]} ${d1}, ${y1} – ${MON[m2 - 1]} ${d2}, ${y2}`;
  if (m1 !== m2) return `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}, ${y1}`;
  return `${MON[m1 - 1]} ${d1}–${d2}, ${y1}`;
}

/** "Thu, Oct 8 – Sun, Oct 11, 2026" */
export function formatLong(start, end, precision = 'd') {
  const [y1, m1, d1] = parts(start);
  const [y2, m2, d2] = parts(end);
  if (precision === 'm') return `${MONTHS[m1 - 1]} ${y1}`;
  const a = `${weekday(start)}, ${MON[m1 - 1]} ${d1}`;
  if (start === end) return `${a}, ${y1}`;
  const b = `${weekday(end)}, ${MON[m2 - 1]} ${d2}`;
  return y1 === y2 ? `${a} – ${b}, ${y1}` : `${a}, ${y1} – ${b}, ${y2}`;
}

/** "October 5, 2026" */
export function formatDay(iso) {
  const [y, m, d] = parts(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Compact date block parts for the badge: { mon: "OCT", days: "8–11", year: 2026, span: "Thu–Sun" } */
export function dateBlock(con) {
  const [y1, m1, d1] = parts(con.start);
  const [, m2, d2] = parts(con.end);
  if (con.dp === 'm') return { mon: MON[m1 - 1], days: 'TBA', year: y1, span: 'Dates to come' };
  const days = con.start === con.end ? `${d1}` : m1 === m2 ? `${d1}–${d2}` : `${d1}–${MON[m2 - 1]} ${d2}`;
  const span = con.start === con.end ? weekday(con.start) : `${weekday(con.start)}–${weekday(con.end)}`;
  return { mon: MON[m1 - 1], days, year: y1, span };
}

/** Where a con sits relative to today: past | live | soon (≤14 days) | upcoming. */
export function phase(con, today) {
  if (con.end < today) return 'past';
  // Only the month is known: never claim it is on now.
  if (con.dp === 'm') return 'upcoming';
  if (con.start <= today) return 'live';
  if (con.dp !== 'm' && daysBetween(today, con.start) <= 14) return 'soon';
  return 'upcoming';
}

export function countdown(con, today) {
  const p = phase(con, today);
  if (p === 'past') return 'Ended';
  if (p === 'live') {
    const n = dayCount(con);
    return n > 1 ? `On now · day ${daysBetween(con.start, today) + 1} of ${n}` : 'On today';
  }
  if (con.dp === 'm') return `${monthLabel(monthKey(con.start))}, dates to come`;
  const d = daysBetween(today, con.start);
  if (d === 1) return 'Tomorrow';
  if (d < 14) return `In ${d} days`;
  if (d < 60) return `In ${Math.round(d / 7)} weeks`;
  const months = Math.round(d / 30.44);
  return `In ${months} months`;
}

// ---- text search -------------------------------------------------------------------

// Letters that don't decompose into a base letter plus an accent.
const FOLD_MAP = { ø: 'o', ł: 'l', đ: 'd', ð: 'd', ß: 'ss', þ: 'th', æ: 'ae', œ: 'oe', ı: 'i' };

/** Lowercase, strip accents, keep letters and digits of every script (Cyrillic, CJK…). */
export function fold(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[øłđðßþæœı]/g, (ch) => FOLD_MAP[ch])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Search haystack for a con (name, place, guests). Cached on the object. */
export function haystack(con, guests) {
  if (con._hay) return con._hay;
  const g = (con.g || []).map((id) => (guests[id] ? guests[id].n : '')).join(' ');
  con._hay = ` ${fold(
    [con.name, con.short, con.city, regionName(con.country, con.region), countryName(con.country), con.venue, con.organizer, g].join(' '),
  )} `;
  return con._hay;
}

export function matchesQuery(con, guests, q) {
  const words = fold(q).split(' ').filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(con, guests);
  return words.every((w) => hay.includes(` ${w}`));
}

/** Guests whose name matches q, with how many listed cons they are booked for. */
export function searchGuests(guests, index, q, limit = 6) {
  const words = fold(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const [id, g] of Object.entries(guests)) {
    const name = ` ${fold(g.n)} `;
    if (!words.every((w) => name.includes(` ${w}`))) continue;
    const starts = name.startsWith(` ${words[0]}`) ? 0 : 1;
    out.push({ id, g, cons: (index.get(id) || []).length, starts });
  }
  out.sort((a, b) => a.starts - b.starts || b.cons - a.cons || a.g.n.localeCompare(b.g.n));
  return out.slice(0, limit);
}

/** gid -> [con, …] sorted by date. */
export function buildGuestIndex(cons) {
  const index = new Map();
  for (const c of [...cons].sort(byDate)) {
    for (const id of c.g || []) {
      if (!index.has(id)) index.set(id, []);
      index.get(id).push(c);
    }
  }
  return index;
}

// ---- filters -----------------------------------------------------------------------
//
// Every filter takes several values. A con matches when it fits ANY chosen value of a filter
// and EVERY filter that has values: comics or anime, in Japan or Korea, in October or May.

export const DEFAULT_FILTERS = Object.freeze({
  when: 'upcoming', // upcoming | all | years (then `years` holds the chosen years)
  years: [], // ['2026', '2027']
  months: [], // ['2026-10', '2026-12']
  continents: [], // ['EU', 'AS']
  countries: [], // ['US', 'CA']
  regions: [], // ['US-CA', 'CA-ON']: country code, a dash, the state or province code
  types: [],
  q: '',
  guests: false, // only cons with announced guests
  sort: 'date', // date | name | guests
});

/** A filter state with nothing chosen (fresh arrays, safe to change). */
export function blankFilters() {
  return { ...DEFAULT_FILTERS, years: [], months: [], continents: [], countries: [], regions: [], types: [] };
}

export function yearsIn(cons) {
  return [...new Set(cons.flatMap((c) => [Number(c.start.slice(0, 4)), Number(c.end.slice(0, 4))]))].sort();
}

// A con belongs to the month it starts in: the same rule the month ruler counts with and
// the list groups by, so a month's count always matches what clicking it shows.
const overlapsYear = (c, y) => Number(c.start.slice(0, 4)) <= y && Number(c.end.slice(0, 4)) >= y;

export const regionKey = (country, region) => `${country}-${region}`;

// The place filters form a tree (continent > country > state or province). A chosen place
// counts as a whole unless something inside it is chosen too: Europe + the United States +
// California means every European con, plus the US cons in California.
export function placeMatch(c, f) {
  const conts = f.continents || [];
  const countries = f.countries || [];
  const regions = f.regions || [];
  if (!conts.length && !countries.length && !regions.length) return true;
  if (countries.includes(c.country)) {
    const inside = regions.filter((r) => r.startsWith(`${c.country}-`));
    return !inside.length || inside.includes(regionKey(c.country, c.region));
  }
  const cont = continentOf(c.country);
  return conts.includes(cont) && !countries.some((k) => continentOf(k) === cont);
}

/**
 * Apply filters. `skip` names one filter to ignore, which is how facet counts are made
 * (e.g. counts per type are computed with every filter except the type filter).
 */
export function applyFilters(cons, guests, f, today, skip = '') {
  const types = new Set(f.types || []);
  const months = new Set(f.months || []);
  const years = (f.years || []).map(Number);
  return cons.filter((c) => {
    if (skip !== 'when') {
      if (f.when === 'upcoming' && c.end < today) return false;
      if (f.when === 'years' && years.length && !years.some((y) => overlapsYear(c, y))) return false;
    }
    if (skip !== 'month' && months.size && !months.has(monthKey(c.start))) return false;
    if (skip !== 'place' && !placeMatch(c, f)) return false;
    if (skip !== 'types' && types.size && !(c.types || []).some((t) => types.has(t))) return false;
    if (skip !== 'guests' && f.guests && !(c.g && c.g.length)) return false;
    if (skip !== 'q' && f.q && !matchesQuery(c, guests, f.q)) return false;
    return true;
  });
}

export function byDate(a, b) {
  return a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : a.name.localeCompare(b.name);
}

export function sortCons(list, sort = 'date') {
  const out = [...list];
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name) || byDate(a, b));
  else if (sort === 'guests') out.sort((a, b) => (b.g || []).length - (a.g || []).length || byDate(a, b));
  else out.sort(byDate);
  return out;
}

/** Group a date-sorted list by start month: [{ key, label, items }]. */
export function groupByMonth(list) {
  const groups = [];
  let cur = null;
  for (const c of list) {
    const key = monthKey(c.start);
    if (!cur || cur.key !== key) {
      cur = { key, label: monthLabel(key), items: [] };
      groups.push(cur);
    }
    cur.items.push(c);
  }
  return groups;
}

/** Counts per start month for the month ruler, over the list as filtered without `month`. */
export function monthCounts(list) {
  const counts = new Map();
  for (const c of list) counts.set(monthKey(c.start), (counts.get(monthKey(c.start)) || 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, n]) => ({ key, n }));
}

/**
 * Facet options with counts, given the current filters. Each count is what choosing that
 * option on its own would show with the other filters as they are.
 */
export function facets(cons, guests, f, today) {
  const placeBase = applyFilters(cons, guests, f, today, 'place');
  const continents = countBy(placeBase, (c) => continentOf(c.country));
  const conts = f.continents || [];
  const inContinents = conts.length ? placeBase.filter((c) => conts.includes(continentOf(c.country))) : placeBase;
  const countries = countBy(inContinents, (c) => c.country);
  // States and provinces of every chosen country that has them, grouped by country.
  const regions = [];
  for (const k of f.countries || []) {
    if (!REGIONS[k]) continue;
    const counts = countBy(
      placeBase.filter((c) => c.country === k && c.region),
      (c) => c.region,
    );
    regions.push(
      ...[...counts.entries()]
        .map(([r, n]) => ({ value: regionKey(k, r), label: regionName(k, r), group: countryName(k), country: k, n }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
  }
  const types = new Map();
  for (const c of applyFilters(cons, guests, f, today, 'types')) for (const t of c.types || []) types.set(t, (types.get(t) || 0) + 1);
  return {
    continents: Object.keys(CONTINENTS)
      .filter((k) => continents.get(k))
      .map((k) => ({ value: k, label: CONTINENTS[k], n: continents.get(k) })),
    countries: [...countries.entries()]
      .map(([value, n]) => ({ value, label: countryName(value), n }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    regions,
    types: Object.keys(TYPES).map((k) => ({ value: k, label: TYPES[k], n: types.get(k) || 0 })),
    months: monthCounts(applyFilters(cons, guests, f, today, 'month')),
  };
}

function countBy(list, key) {
  const m = new Map();
  for (const c of list) {
    const k = key(c);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

// ---- URL state ---------------------------------------------------------------------

const uniq = (xs) => [...new Set(xs)];
const listParam = (p, name) =>
  (p.get(name) || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function filtersToQuery(f) {
  const p = new URLSearchParams();
  if (f.when === 'all') p.set('when', 'all');
  else if (f.when === 'years' && (f.years || []).length) p.set('when', f.years.join(','));
  if ((f.months || []).length) p.set('month', f.months.join(','));
  if ((f.continents || []).length) p.set('continent', f.continents.join(','));
  if ((f.countries || []).length) p.set('country', f.countries.join(','));
  if ((f.regions || []).length) p.set('region', f.regions.join(','));
  if ((f.types || []).length) p.set('type', f.types.join(','));
  if (f.q) p.set('q', f.q);
  if (f.guests) p.set('guests', '1');
  if (f.sort && f.sort !== DEFAULT_FILTERS.sort) p.set('sort', f.sort);
  // Commas are legal in a query string and keep shared links readable.
  return p.toString().replace(/%2C/gi, ',');
}

export function queryToFilters(qs) {
  const p = new URLSearchParams(qs || '');
  const f = blankFilters();
  const when = (p.get('when') || '').trim();
  if (when === 'all') f.when = 'all';
  else {
    const years = uniq(when.split(',').filter((y) => /^\d{4}$/.test(y))).sort();
    if (years.length) {
      f.when = 'years';
      f.years = years;
    }
  }
  f.months = uniq(listParam(p, 'month').filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m))).sort();
  f.continents = uniq(listParam(p, 'continent').map((k) => k.toUpperCase()).filter((k) => CONTINENTS[k]));
  f.countries = uniq(listParam(p, 'country').map((k) => k.toUpperCase()).filter((k) => COUNTRIES[k]));
  // Regions are COUNTRY-REGION. Older links had a bare code next to a single country.
  f.regions = uniq(
    listParam(p, 'region')
      .map((r) => r.toUpperCase())
      .map((r) => (r.includes('-') ? r : f.countries.length === 1 ? regionKey(f.countries[0], r) : ''))
      .filter((r) => {
        const i = r.indexOf('-');
        const k = r.slice(0, i);
        return i > 0 && REGIONS[k] && REGIONS[k][r.slice(i + 1)];
      }),
  );
  // A chosen state implies its country.
  for (const r of f.regions) {
    const k = r.slice(0, r.indexOf('-'));
    if (!f.countries.includes(k)) f.countries.push(k);
  }
  f.types = uniq(listParam(p, 'type').filter((t) => TYPES[t]));
  f.q = (p.get('q') || '').slice(0, 80);
  f.guests = p.get('guests') === '1';
  const sort = p.get('sort');
  if (['date', 'name', 'guests'].includes(sort)) f.sort = sort;
  return f;
}

// "a", "a or b", "a, b or c"; long lists end with "and N more".
function joinOr(xs, noun = 'items') {
  if (xs.length > 4) return `${xs.slice(0, 3).join(', ')} and ${xs.length - 3} more ${noun}`;
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
}

/** The chosen places as people say them, most specific first within each branch. */
export function placeNames(f) {
  const out = [];
  for (const k of f.continents || []) if (!(f.countries || []).some((c) => continentOf(c) === k)) out.push(CONTINENTS[k]);
  for (const c of f.countries || []) {
    const regs = (f.regions || []).filter((r) => r.startsWith(`${c}-`));
    if (regs.length) out.push(...regs.map((r) => regionName(c, r.slice(c.length + 1))));
    else out.push(countryName(c));
  }
  return out;
}

/** Plain-language summary of the active filters, for the results line. */
export function describeFilters(f) {
  const bits = [];
  if ((f.types || []).length) bits.push(joinOr(f.types.map((t) => TYPES[t]), 'types'));
  const places = placeNames(f);
  if (places.length) bits.push(`in ${joinOr(places, 'places')}`);
  if ((f.months || []).length) bits.push(`in ${joinOr(f.months.map((m) => monthLabel(m)), 'months')}`);
  else if (f.when === 'years' && (f.years || []).length) bits.push(`in ${joinOr(f.years, 'years')}`);
  if (f.guests) bits.push('with guests announced');
  if (f.q) bits.push(`matching “${f.q}”`);
  return bits.join(' ');
}

// ---- calendar export -----------------------------------------------------------------

const icsText = (s) => String(s || '').replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n');

function nextDay(iso) {
  const [y, m, d] = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

/** An all-day iCalendar event for a con (end date is exclusive in iCal). */
export function toICS(con, place, stamp = '20260101T000000Z') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WorldCons//Convention tracker//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${con.id}@worldcons`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${con.start.replace(/-/g, '')}`,
    `DTEND;VALUE=DATE:${nextDay(con.end).replace(/-/g, '')}`,
    `SUMMARY:${icsText(con.name)}`,
    `LOCATION:${icsText([con.venue, place].filter(Boolean).join(', '))}`,
    con.url ? `URL:${con.url}` : '',
    `DESCRIPTION:${icsText([con.blurb, con.url].filter(Boolean).join('\n'))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n') + '\r\n';
}

// ---- cons whose next dates are not announced ----------------------------------------

/** Whether the "dates not announced yet" section belongs in this view. */
export function showsTBA(f) {
  return (f.when === 'upcoming' || f.when === 'all') && !(f.months || []).length && !f.guests && f.sort === 'date';
}

/** Filter undated cons by place, type and text (date filters don't apply to them). */
export function filterTBA(tba, guests, f) {
  const types = new Set(f.types || []);
  return tba.filter((c) => {
    if (!placeMatch(c, f)) return false;
    if (types.size && !(c.types || []).some((t) => types.has(t))) return false;
    if (f.q && !matchesQuery(c, guests, f.q)) return false;
    return true;
  });
}

/** The ISO date n days after iso. */
export function addDays(iso, n) {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
