import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRange, dateBlock, phase, countdown, applyFilters, sortCons, groupByMonth, facets,
  filtersToQuery, queryToFilters, blankFilters, buildGuestIndex, searchGuests, matchesQuery,
  describeFilters, monthCounts, fold, toICS, placeMatch,
} from '../js/model.js';

const guests = {
  'hayden-christensen': { n: 'Hayden Christensen', c: 'actor', k: 'Star Wars' },
  'max-mittelman': { n: 'Max Mittelman', c: 'voice', k: '' },
  'frank-miller': { n: 'Frank Miller', c: 'comics', k: 'Sin City' },
  'eiichiro-oda': { n: 'Eiichirō Oda', c: 'animation', k: 'One Piece' },
};

const con = (o) => ({ dp: 'd', types: ['comics'], g: [], region: '', ...o });
const CONS = [
  con({ id: 'nycc', name: 'New York Comic Con', short: 'NYCC', start: '2026-10-08', end: '2026-10-11', city: 'New York', region: 'NY', country: 'US', types: ['comics', 'pop'], g: ['hayden-christensen', 'frank-miller'] }),
  con({ id: 'hm', name: 'Holiday Matsuri', start: '2026-12-18', end: '2026-12-20', city: 'Orlando', region: 'FL', country: 'US', types: ['anime', 'cosplay'], g: ['max-mittelman'] }),
  con({ id: 'lucca', name: 'Lucca Comics & Games', start: '2026-10-28', end: '2026-11-01', city: 'Lucca', country: 'IT', types: ['comics', 'games'] }),
  con({ id: 'tcc', name: 'Tokyo Comic Con', start: '2026-12-04', end: '2026-12-06', city: 'Chiba', country: 'JP', types: ['pop', 'comics'], g: ['eiichiro-oda'] }),
  con({ id: 'old', name: 'Past Con', start: '2026-09-01', end: '2026-09-03', city: 'Austin', region: 'TX', country: 'US' }),
  con({ id: 'june', name: 'Summer Fest', start: '2027-06-01', end: '2027-06-30', dp: 'm', city: 'Sydney', region: 'NSW', country: 'AU', types: ['games'] }),
];
const TODAY = '2026-10-05';
const F = (o = {}) => ({ ...blankFilters(), ...o });
const ids = (list) => list.map((c) => c.id).sort();

test('formatRange covers same month, cross-month, cross-year and month precision', () => {
  assert.equal(formatRange('2026-10-08', '2026-10-11'), 'Oct 8–11, 2026');
  assert.equal(formatRange('2026-10-30', '2026-11-01'), 'Oct 30 – Nov 1, 2026');
  assert.equal(formatRange('2026-12-30', '2027-01-02'), 'Dec 30, 2026 – Jan 2, 2027');
  assert.equal(formatRange('2026-10-08', '2026-10-08'), 'Oct 8, 2026');
  assert.equal(formatRange('2027-06-01', '2027-06-30', 'm'), 'June 2027');
});

test('dateBlock gives badge parts with weekdays', () => {
  assert.deepEqual(dateBlock(CONS[0]), { mon: 'Oct', days: '8–11', year: 2026, span: 'Thu–Sun' });
  assert.deepEqual(dateBlock(CONS[2]), { mon: 'Oct', days: '28–Nov 1', year: 2026, span: 'Wed–Sun' });
  assert.equal(dateBlock(CONS[5]).days, 'TBA');
});

test('phase and countdown read the calendar, not the clock', () => {
  assert.equal(phase(CONS[4], TODAY), 'past');
  assert.equal(phase(CONS[0], TODAY), 'soon');
  assert.equal(countdown(CONS[0], TODAY), 'In 3 days');
  assert.equal(phase(CONS[0], '2026-10-09'), 'live');
  assert.equal(countdown(CONS[0], '2026-10-09'), 'On now · day 2 of 4');
  assert.equal(countdown(CONS[0], '2026-10-07'), 'Tomorrow');
  assert.equal(countdown(CONS[1], TODAY), 'In 2 months');
  assert.equal(countdown(CONS[2], TODAY), 'In 3 weeks');
  assert.equal(countdown(CONS[5], TODAY), 'June 2027, dates to come');
  assert.equal(countdown(CONS[4], TODAY), 'Ended');
});

test('default view hides past cons and sorts by start date', () => {
  const list = sortCons(applyFilters(CONS, guests, F(), TODAY));
  assert.deepEqual(list.map((c) => c.id), ['nycc', 'lucca', 'tcc', 'hm', 'june']);
});

test('year filter includes past cons of that year; years combine; all shows everything', () => {
  assert.ok(applyFilters(CONS, guests, F({ when: 'years', years: ['2026'] }), TODAY).some((c) => c.id === 'old'));
  assert.ok(!applyFilters(CONS, guests, F({ when: 'years', years: ['2026'] }), TODAY).some((c) => c.id === 'june'));
  assert.equal(applyFilters(CONS, guests, F({ when: 'years', years: ['2026', '2027'] }), TODAY).length, CONS.length);
  assert.equal(applyFilters(CONS, guests, F({ when: 'all' }), TODAY).length, CONS.length);
});

test('month filter matches cons starting in the month (same rule as the ruler counts)', () => {
  assert.deepEqual(applyFilters(CONS, guests, F({ months: ['2026-11'] }), TODAY).map((c) => c.id), []);
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ months: ['2026-10'] }), TODAY)), ['lucca', 'nycc']);
  // Several months: any of them.
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ months: ['2026-10', '2027-06'] }), TODAY)), ['june', 'lucca', 'nycc']);
  const fx = facets(CONS, guests, F(), TODAY);
  assert.equal(fx.months.find((m) => m.key === '2026-10').n, 2);
});

test('a con with only its month announced is never "on now"', () => {
  assert.equal(phase(CONS[5], '2027-06-15'), 'upcoming');
  assert.equal(phase(CONS[5], '2027-07-01'), 'past');
});

test('search folds accents and keeps non-Latin scripts', () => {
  assert.equal(fold('Łódź'), 'lodz');
  assert.equal(fold('Ærø Ætt Straße'), 'aero aett strasse');
  assert.equal(fold('Москва'), 'москва');
  assert.equal(fold('東京 コミコン'), '東京 コミコン');
  assert.ok(!matchesQuery(CONS[0], guests, 'Москва'));
});

test('place filters: continent, country, US state', () => {
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ continents: ['EU'] }), TODAY)), ['lucca']);
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ countries: ['US'] }), TODAY)), ['hm', 'nycc']);
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ countries: ['US'], regions: ['US-FL'] }), TODAY)), ['hm']);
});

test('place filters take several values, the most specific choice winning in each branch', () => {
  // Any of the chosen countries, continents or states.
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ countries: ['IT', 'JP'] }), TODAY)), ['lucca', 'tcc']);
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ continents: ['EU', 'OC'] }), TODAY)), ['june', 'lucca']);
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ countries: ['US'], regions: ['US-FL', 'US-NY'] }), TODAY)), ['hm', 'nycc']);
  // A continent counts as a whole unless one of its countries is chosen: Europe + the US
  // (in North America) gives every European con plus the US ones.
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ continents: ['EU'], countries: ['US'] }), TODAY)), ['hm', 'lucca', 'nycc']);
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ continents: ['EU', 'AS'], countries: ['JP'] }), TODAY)), ['lucca', 'tcc']);
  // A state narrows only its own country: Florida + Japan.
  assert.deepEqual(ids(applyFilters(CONS, guests, F({ countries: ['US', 'JP'], regions: ['US-FL'] }), TODAY)), ['hm', 'tcc']);
  assert.ok(placeMatch(CONS[0], F()));
});

test('filters combine: any value within a filter, every filter together', () => {
  const f = F({ countries: ['US', 'IT'], types: ['anime', 'games'], months: ['2026-10', '2026-12'] });
  assert.deepEqual(ids(applyFilters(CONS, guests, f, TODAY)), ['hm', 'lucca']);
});

test('type filter is any-of', () => {
  const ids = applyFilters(CONS, guests, F({ types: ['anime', 'games'] }), TODAY).map((c) => c.id).sort();
  assert.deepEqual(ids, ['hm', 'june', 'lucca']);
});

test('search finds cons by guest name, city, country and ignores accents', () => {
  assert.ok(matchesQuery(CONS[0], guests, 'hayden'));
  assert.ok(matchesQuery(CONS[3], guests, 'eiichiro oda'));
  assert.ok(matchesQuery(CONS[2], guests, 'italy'));
  assert.ok(matchesQuery(CONS[1], guests, 'orlando'));
  assert.ok(matchesQuery(CONS[1], guests, 'florida'));
  assert.ok(!matchesQuery(CONS[1], guests, 'hayden'));
  assert.ok(matchesQuery(CONS[0], guests, 'nycc'));
  assert.equal(fold('Eiichirō Oda!'), 'eiichiro oda');
});

test('guests-only filter keeps cons with a lineup', () => {
  assert.deepEqual(applyFilters(CONS, guests, F({ guests: true }), TODAY).map((c) => c.id).sort(), ['hm', 'nycc', 'tcc']);
});

test('sorting by name and by guest count', () => {
  const up = applyFilters(CONS, guests, F(), TODAY);
  assert.equal(sortCons(up, 'name')[0].id, 'hm');
  assert.equal(sortCons(up, 'guests')[0].id, 'nycc');
});

test('groupByMonth groups a date-sorted list', () => {
  const groups = groupByMonth(sortCons(applyFilters(CONS, guests, F(), TODAY)));
  assert.deepEqual(groups.map((g) => [g.key, g.items.length]), [['2026-10', 2], ['2026-12', 2], ['2027-06', 1]]);
  assert.equal(groups[0].label, 'October 2026');
});

test('facets count every option without their own filter', () => {
  const fx = facets(CONS, guests, F({ continents: ['NA'], types: ['anime'] }), TODAY);
  assert.deepEqual(fx.continents.map((c) => c.value), ['NA']);
  const t = Object.fromEntries(fx.types.map((x) => [x.value, x.n]));
  assert.equal(t.comics, 1);
  assert.equal(t.anime, 1);
  assert.deepEqual(fx.months, [{ key: '2026-12', n: 1 }]);
  const us = facets(CONS, guests, F({ countries: ['US'] }), TODAY);
  assert.deepEqual(us.regions.map((r) => r.value), ['US-FL', 'US-NY']);
  assert.equal(us.regions[0].group, 'United States');
  // With several countries chosen, every chosen country's states are offered, each grouped.
  const two = facets(CONS, guests, F({ countries: ['US', 'AU'], when: 'all' }), TODAY);
  assert.deepEqual(two.regions.map((r) => r.value), ['US-FL', 'US-NY', 'US-TX', 'AU-NSW']);
  // The country counts ignore the country filter itself (so other countries stay choosable).
  assert.deepEqual(us.countries.map((c) => c.value).sort(), ['AU', 'IT', 'JP', 'US']);
});

test('monthCounts orders months', () => {
  assert.deepEqual(monthCounts(CONS.slice(0, 3)).map((m) => m.key), ['2026-10', '2026-12']);
});

test('URL state round-trips and rejects junk', () => {
  const f = F({
    when: 'years', years: ['2026', '2027'], months: ['2027-03', '2027-05'], continents: ['EU', 'AS'], countries: ['DE', 'US'],
    regions: ['US-CA', 'US-TX'], types: ['anime', 'comics'], q: 'oda', guests: true, sort: 'guests',
  });
  assert.deepEqual(queryToFilters(filtersToQuery(f)), f);
  assert.equal(filtersToQuery(F()), '');
  // Lists stay readable in shared links.
  assert.match(filtersToQuery(F({ countries: ['US', 'CA'] })), /^country=US,CA$/);
  const junk = queryToFilters('when=yesterday&country=ZZ,jp&type=nope,anime&sort=hack&region=XX,US-ZZ&month=2026-13,2026-11');
  assert.equal(junk.when, 'upcoming');
  assert.deepEqual(junk.countries, ['JP']);
  assert.deepEqual(junk.types, ['anime']);
  assert.equal(junk.sort, 'date');
  assert.deepEqual(junk.regions, []);
  assert.deepEqual(junk.months, ['2026-11']);
  // Links made before multi-select still open the same view.
  assert.deepEqual(queryToFilters('country=us&region=ca').regions, ['US-CA']);
  const old = queryToFilters('when=2027&month=2027-03&continent=EU');
  assert.deepEqual([old.when, old.years, old.months, old.continents], ['years', ['2027'], ['2027-03'], ['EU']]);
  // A chosen state brings its country along.
  assert.deepEqual(queryToFilters('region=US-FL').countries, ['US']);
});

test('guest index and guest search', () => {
  const index = buildGuestIndex(CONS);
  assert.deepEqual(index.get('hayden-christensen').map((c) => c.id), ['nycc']);
  const hits = searchGuests(guests, index, 'mil');
  assert.deepEqual(hits.map((h) => h.id), ['frank-miller']);
  assert.deepEqual(searchGuests(guests, index, 'max').map((h) => h.id), ['max-mittelman']);
  assert.deepEqual(searchGuests(guests, index, ''), []);
});

test('toICS makes an all-day event with an exclusive end and escaped text', () => {
  const ics = toICS({ ...CONS[0], venue: 'Javits Center', blurb: 'Comics, film; and more', url: 'https://example.com/' }, 'New York, NY', '20261005T000000Z');
  assert.match(ics, /DTSTART;VALUE=DATE:20261008\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261012\r\n/);
  assert.match(ics, /SUMMARY:New York Comic Con\r\n/);
  assert.match(ics, /LOCATION:Javits Center\\, New York\\, NY\r\n/);
  assert.match(ics, /DESCRIPTION:Comics\\, film\\; and more\\nhttps:\/\/example.com\/\r\n/);
  const dec31 = toICS({ ...CONS[0], start: '2026-12-31', end: '2026-12-31' }, '');
  assert.match(dec31, /DTEND;VALUE=DATE:20270101/);
});

test('describeFilters reads like a sentence', () => {
  assert.equal(describeFilters(F({ types: ['anime'], countries: ['JP'], when: 'years', years: ['2027'] })), 'Anime & Manga in Japan in 2027');
  assert.equal(describeFilters(F()), '');
  assert.equal(
    describeFilters(F({ types: ['comics', 'anime'], continents: ['EU'], countries: ['US', 'JP'], regions: ['US-CA', 'US-TX'], months: ['2026-10', '2026-12'] })),
    'Comics or Anime & Manga in Europe, California, Texas or Japan in October 2026 or December 2026',
  );
  assert.equal(describeFilters(F({ countries: ['US', 'CA', 'MX', 'JP', 'DE'] })), 'in United States, Canada, Mexico and 2 more places');
});

test('undated cons: shown only in open date views and filtered by place/type/text', async () => {
  const { showsTBA, filterTBA } = await import('../js/model.js');
  const tba = [
    { id: 'blizzcon', name: 'BlizzCon', city: 'Anaheim', region: 'CA', country: 'US', types: ['games'], tba: true, g: [] },
    { id: 'connichi', name: 'Connichi', city: 'Wiesbaden', region: '', country: 'DE', types: ['anime'], tba: true, g: [] },
  ];
  assert.ok(showsTBA(F()));
  assert.ok(!showsTBA(F({ months: ['2026-11'] })));
  assert.ok(!showsTBA(F({ when: 'years', years: ['2027'] })));
  assert.ok(!showsTBA(F({ guests: true })));
  assert.ok(!showsTBA(F({ sort: 'name' })));
  assert.deepEqual(filterTBA(tba, guests, F({ continents: ['EU'] })).map((c) => c.id), ['connichi']);
  assert.deepEqual(ids(filterTBA(tba, guests, F({ countries: ['US', 'DE'] }))), ['blizzcon', 'connichi']);
  assert.deepEqual(filterTBA(tba, guests, F({ countries: ['US'], regions: ['US-CA'] })).map((c) => c.id), ['blizzcon']);
  assert.deepEqual(filterTBA(tba, guests, F({ types: ['games'] })).map((c) => c.id), ['blizzcon']);
  assert.deepEqual(filterTBA(tba, guests, F({ q: 'anaheim' })).map((c) => c.id), ['blizzcon']);
});
