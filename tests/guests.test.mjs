import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slug, editDistance, mergeTypos, isTypoPair } from '../pipeline/lib/guests.mjs';

test('slug folds accents, punctuation and initials', () => {
  assert.equal(slug('Eiichirō Oda'), 'eiichiro-oda');
  assert.equal(slug('A.J. Beckles'), 'aj-beckles');
  assert.equal(slug('Robert Downey Jr.'), 'robert-downey-jr');
  assert.equal(slug("Conan O'Brien"), 'conan-obrien');
  assert.equal(slug('Simon & Garfunkel'), 'simon-and-garfunkel');
  assert.equal(slug('  '), '');
});

test('editDistance is exact for small edits and caps the rest', () => {
  assert.equal(editDistance('kristen-kreuk', 'kristin-kreuk'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('abc', 'abcde'), 2);
});

const guestRec = (name, cat, n = 1) => ({
  names: new Map([[name, n]]),
  cats: new Map([[cat, n]]),
  knowns: new Map(),
  photos: [{ url: `https://x/${slug(name)}.jpg`, w: 100, h: 120 }],
});

test('mergeTypos folds a one-letter typo into the better-attested spelling', () => {
  const guests = new Map([
    ['kristin-kreuk', guestRec('Kristin Kreuk', 'actor', 3)],
    ['kristen-kreuk', guestRec('Kristen Kreuk', 'actor', 1)],
  ]);
  const cons = [
    { g: ['kristen-kreuk'], _known: { 'kristen-kreuk': 'Smallville' } },
    { g: ['kristin-kreuk'], _known: {} },
  ];
  const log = mergeTypos(guests, cons);
  assert.deepEqual(log, ['kristen-kreuk -> kristin-kreuk']);
  assert.ok(!guests.has('kristen-kreuk'));
  assert.equal(guests.get('kristin-kreuk').photos.length, 2);
  assert.deepEqual(cons[0].g, ['kristin-kreuk']);
  assert.equal(cons[0]._known['kristin-kreuk'], 'Smallville');
});

test('mergeTypos leaves different people alone', () => {
  const guests = new Map([
    ['matt-smith', guestRec('Matt Smith', 'actor')],
    ['matt-smyth', guestRec('Matt Smyth', 'actor')],
    ['jonathan-frakes', guestRec('Jonathan Frakes', 'actor')],
    ['jonathan-franks', guestRec('Jonathan Franks', 'comics')], // other category
    ['sean-astin-jr', guestRec('Sean Astin Jr', 'actor')],
  ]);
  const cons = [{ g: [...guests.keys()], _known: {} }];
  const log = mergeTypos(guests, cons);
  assert.deepEqual(log, []);
  assert.equal(guests.size, 5);
});

test('isTypoPair accepts vowel slips and doubled letters only', () => {
  assert.ok(isTypoPair('kristen-kreuk', 'kristin-kreuk'));
  assert.ok(isTypoPair('sean-phillips', 'sean-philips'));
  assert.ok(isTypoPair('matthew-lillard', 'mathew-lillard'));
  assert.ok(!isTypoPair('matt-smith', 'matt-smyth'));
  assert.ok(!isTypoPair('john-harris', 'john-morris'));
  assert.ok(!isTypoPair('dan-fogler', 'dan-fowler'));
  assert.ok(!isTypoPair('same-name', 'same-name'));
});
