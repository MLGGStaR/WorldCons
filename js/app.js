// WorldCons app: routing, rendering and interaction. Data logic lives in model.js.

import { SPRITE, icon } from './icons.js';
import { CONTINENTS, REGIONS, countryName, continentOf, regionName } from './geo.js';
import * as M from './model.js';
import { BUILD } from './version.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const num = (n) => n.toLocaleString('en-US');
// Links that come from scraped data: only plain web addresses become clickable.
const safeHref = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? esc(u) : '#');
const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

const SHORT_TYPE = {
  comics: 'Comics', anime: 'Anime', games: 'Games', tabletop: 'Tabletop', scifi: 'Sci-Fi',
  horror: 'Horror', pop: 'Pop', toys: 'Toys', cosplay: 'Cosplay', furry: 'Furry',
};
const CAT_ORDER = ['actor', 'voice', 'animation', 'comics', 'author', 'creator', 'cosplay', 'gaming', 'music', 'sports', 'other'];
const CAT_PLURAL = {
  actor: 'Actors', voice: 'Voice actors', animation: 'Anime & animation', comics: 'Comics', author: 'Authors',
  creator: 'Creators', cosplay: 'Cosplayers', gaming: 'Gaming', music: 'Music', sports: 'Wrestling & sports', other: 'More guests',
};
const LS_SAVED = 'wc.lanyard.v1';
const LS_THEME = 'wc.theme';

const S = {
  ready: false,
  failed: false,
  generated: '',
  cons: [],
  guests: {},
  byId: new Map(),
  series: new Map(),
  index: new Map(),
  f: M.queryToFilters(''),
  today: M.isoToday(),
  saved: new Set(),
  view: 'list',
  listScroll: 0,
  wall: { cat: '', q: '' },
};

// ---- storage ----------------------------------------------------------------------------

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or full storage: the lanyard just won't persist */
  }
}

// ---- small renderers ----------------------------------------------------------------------

const conHref = (c) => `#/con/${encodeURIComponent(c.id)}`;
const guestHref = (id) => `#/guest/${encodeURIComponent(id)}`;
const listHref = (f = S.f) => {
  const qs = M.filtersToQuery(f);
  return qs ? `#/?${qs}` : '#/';
};

function placeText(c, long = false) {
  const showRegion = REGIONS[c.country] && c.region;
  const bits = [c.city];
  if (showRegion) bits.push(c.region);
  if (long || !showRegion) bits.push(countryName(c.country));
  return bits.filter(Boolean).join(', ');
}

function flagImg(cc) {
  return `<img class="flag" src="img/flags/${esc(cc.toLowerCase())}.svg" alt="" width="18" height="14" loading="lazy" decoding="async">`;
}

function initials(name) {
  const w = String(name || '').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}

function whenChip(c) {
  if (c.tba) return `<span class="when-chip tba">Dates TBA</span>`;
  const ph = M.phase(c, S.today);
  const cls = ph === 'live' ? ' live' : ph === 'past' ? ' past' : '';
  return `<span class="when-chip${cls}">${esc(M.countdown(c, S.today))}</span>`;
}

function artHTML(c, eager = false) {
  const inner = c.img
    ? `<img src="${esc(c.img)}" alt="" width="${c.imgW || 640}" height="${c.imgH || 335}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : `<div class="noimg">${esc(c.short || c.name)}</div>`;
  return `<figure class="art${c.fit === 'contain' ? ' is-logo' : ''}" style="--tint:${esc(c.tint || '#2a2f38')}">${inner}${whenChip(c)}</figure>`;
}

function facesHTML(c) {
  const ids = c.g || [];
  if (!ids.length) {
    const msg = c.gs === 'none' ? 'No guest program' : c.gs === 'unavailable' ? 'Guests on the official site' : 'Guests not announced yet';
    return `<div class="faces tba"><span class="slots"><i></i><i></i><i></i></span><span>${msg}</span></div>`;
  }
  const withPhoto = ids.filter((id) => S.guests[id] && S.guests[id].s);
  const show = (withPhoto.length >= 5 ? withPhoto : [...withPhoto, ...ids.filter((id) => !withPhoto.includes(id))]).slice(0, 5);
  const faces = show
    .map((id) => {
      const g = S.guests[id] || { n: id };
      return g.s
        ? `<li><img src="${esc(g.s)}" alt="${esc(g.n)}" title="${esc(g.n)}" width="30" height="38" loading="lazy" decoding="async"></li>`
        : `<li><span class="ph" title="${esc(g.n)}"></span></li>`;
    })
    .join('');
  return `<div class="faces"><ul aria-hidden="true">${faces}</ul><span class="more">${plural(ids.length, 'guest')}<small>${esc(
    S.guests[ids[0]] ? S.guests[ids[0]].n : '',
  )}${ids.length > 1 ? ' & more' : ''}</small></span></div>`;
}

function clipButton(c) {
  const on = S.saved.has(c.id);
  return `<button class="clip" type="button" data-clip="${esc(c.id)}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Clip'} ${esc(c.name)} ${on ? 'from' : 'to'} your lanyard">${icon('clip')}<span class="tip">${on ? 'On your lanyard' : 'Clip to lanyard'}</span></button>`;
}

function ribbonsHTML(c, asLinks = false) {
  return `<div class="ribbons">${(c.types || [])
    .slice(0, 3)
    .map((t) =>
      asLinks
        ? `<a class="ribbon r-${t}" href="${listHref({ ...M.DEFAULT_FILTERS, types: [t] })}" title="All ${esc(M.TYPES[t])} cons">${SHORT_TYPE[t]}</a>`
        : `<button class="ribbon r-${t}" type="button" data-type="${t}" title="Show only ${esc(M.TYPES[t])} cons">${SHORT_TYPE[t]}</button>`,
    )
    .join('')}</div>`;
}

function lastHeld(c) {
  return c.last ? `Last held ${M.formatRange(c.last.start, c.last.end)}` : 'Next dates to be announced';
}

function tbaBadgeHTML(c) {
  return `<article class="badge is-tba" data-id="${esc(c.id)}">
  <a class="badge-link" href="${conHref(c)}" aria-label="${esc(`${c.name}, dates not announced yet, ${placeText(c, true)}`)}"></a>
  ${clipButton(c)}
  ${artHTML(c)}
  <div class="badge-body">
    <h3 class="con-name">${esc(c.name)}</h3>
    <p class="con-when"><span>Dates TBA</span><span class="days">${c.last ? 'Returning' : ''}</span></p>
    <p class="con-where">${flagImg(c.country)}<span>${esc(placeText(c))}${c.venue ? ` · ${esc(c.venue)}` : ''}</span></p>
    <div class="faces tba"><span class="slots"><i></i><i></i><i></i></span><span>${esc(lastHeld(c))}</span></div>
  </div>
  ${ribbonsHTML(c)}
</article>`;
}

function badgeHTML(c) {
  if (c.tba) return tbaBadgeHTML(c);
  const ph = M.phase(c, S.today);
  const days = M.dayCount(c);
  const range = M.formatRange(c.start, c.end, c.dp);
  return `<article class="badge${ph === 'past' ? ' is-past' : ''}" data-id="${esc(c.id)}">
  <a class="badge-link" href="${conHref(c)}" aria-label="${esc(`${c.name}, ${range}, ${placeText(c, true)}`)}"></a>
  ${clipButton(c)}
  ${artHTML(c)}
  <div class="badge-body">
    <h3 class="con-name">${esc(c.name)}</h3>
    <p class="con-when"><span>${esc(range)}</span><span class="days">${c.dp === 'm' ? 'TBA' : plural(days, 'day')}</span></p>
    <p class="con-where">${flagImg(c.country)}<span>${esc(placeText(c))}${c.venue ? ` · ${esc(c.venue)}` : ''}</span></p>
    ${facesHTML(c)}
  </div>
  ${ribbonsHTML(c)}
</article>`;
}

function credHTML(id, opts = {}) {
  const g = S.guests[id] || { n: id, c: 'other' };
  const known = opts.known ?? g.k;
  const upcoming = (S.index.get(id) || []).filter((c) => M.phase(c, S.today) !== 'past');
  // On a con page the line counts the guest's other cons; in the directory, all of them.
  const more = opts.static
    ? ''
    : opts.exclude
      ? upcoming.some((c) => c.id !== opts.exclude)
        ? `+${plural(upcoming.filter((c) => c.id !== opts.exclude).length, 'more con')}`
        : ''
      : plural(upcoming.length, 'upcoming con');
  const tag = opts.static ? 'div' : 'a';
  const href = opts.static ? '' : ` href="${guestHref(id)}"`;
  const photo = g.p
    ? `<img src="${esc(g.p)}" alt="${esc(g.n)}" width="240" height="300" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async">`
    : `<span class="initials" aria-hidden="true">${esc(initials(g.n))}</span>`;
  const NameTag = opts.h1 ? 'h1' : 'b';
  return `<${tag} class="cred"${href}>
  <span class="cred-photo">${photo}</span>
  <span class="cred-band">${esc(M.CATS[g.c] || 'Guest')}</span>
  <${NameTag} class="cred-name">${esc(g.n)}</${NameTag}>
  ${known ? `<span class="cred-known">${esc(known)}</span>` : ''}
  ${more ? `<span class="cred-more">${more}</span>` : ''}
  ${opts.extra || ''}
</${tag}>`;
}

function skeletonGrid(n = 8) {
  const one = `<article class="badge skel" aria-hidden="true"><div class="art"></div><div class="badge-body"><div class="line w1"></div><div class="line w2"></div><div class="line w3"></div></div></article>`;
  return `<section class="month"><div class="grid">${one.repeat(n)}</div></section>`;
}

// ---- list view ------------------------------------------------------------------------------

function keepFocus(container, render) {
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset.k : null;
  render();
  if (key) {
    const again = container.querySelector(`[data-k="${CSS.escape(key)}"]`);
    if (again) again.focus({ preventScroll: true });
  }
}

function selectHTML(k, label, options, value, placeholder, disabled = false) {
  const opts = [`<option value="">${esc(placeholder)}</option>`]
    .concat(options.map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)} (${num(o.n)})</option>`))
    .join('');
  return `<label class="select${value ? ' is-set' : ''}"><span class="sr-only">${esc(label)}</span><select data-k="${k}"${disabled ? ' disabled' : ''}>${opts}</select>${icon('chevron-down')}</label>`;
}

// Keep the chosen value listed even when the other filters leave it with zero cons.
const ensure = (list, value, label) => (value && !list.some((o) => o.value === value) ? [...list, { value, label, n: 0 }] : list);

function placeOptions(fx) {
  const f = S.f;
  return {
    continents: ensure(fx.continents, f.continent, CONTINENTS[f.continent]),
    countries: ensure(fx.countries, f.country, countryName(f.country)),
    regions: ensure(fx.regions, f.region, regionName(f.country, f.region)),
  };
}

function placeSelects(fx) {
  const f = S.f;
  const { continents, countries, regions } = placeOptions(fx);
  const regionWord = f.country === 'US' ? 'state' : f.country === 'CA' ? 'province' : 'state';
  return [
    selectHTML('continent', 'Continent', continents, f.continent, 'All continents'),
    selectHTML('country', 'Country', countries, f.country, f.continent ? `All of ${CONTINENTS[f.continent]}` : 'All countries'),
    REGIONS[f.country] ? selectHTML('region', regionWord, regions, f.region, `Any ${regionWord}`) : '',
  ].join('');
}

function activeFilterCount() {
  const f = S.f;
  return [f.continent, f.country, f.region, f.guests].filter(Boolean).length;
}

function renderControls(fx) {
  const f = S.f;
  const years = M.yearsIn(S.cons).filter((y) => y >= Number(S.today.slice(0, 4)));
  const when = [['upcoming', 'Upcoming'], ...years.map((y) => [String(y), String(y)]), ['all', 'All']];
  const anyFilter = M.filtersToQuery({ ...f, sort: 'date' }) !== '';
  const nPlace = activeFilterCount();
  const el = $('#controls');
  keepFocus(el, () => {
    el.innerHTML = `
      <div class="seg" role="group" aria-label="When">${when
        .map(([v, label]) => `<button type="button" data-k="when-${v}" data-when="${v}" aria-pressed="${f.when === v}">${label}</button>`)
        .join('')}</div>
      <span class="place">${placeSelects(fx)}</span>
      <button type="button" class="toggle guests-toggle" data-k="guests" aria-pressed="${f.guests}"><span class="box">${icon('check')}</span>With guests</button>
      <button type="button" class="toggle filters-btn" data-k="sheet" aria-haspopup="dialog">${icon('sliders-horizontal')}Filters${nPlace ? ` · ${nPlace}` : ''}</button>
      <span class="spacer"></span>
      ${anyFilter ? `<button type="button" class="reset" data-k="reset">Clear filters</button>` : ''}
      <label class="select sort"><span class="sr-only">Sort</span><select data-k="sort">
        <option value="date"${f.sort === 'date' ? ' selected' : ''}>Sort: Date</option>
        <option value="guests"${f.sort === 'guests' ? ' selected' : ''}>Sort: Most guests</option>
        <option value="name"${f.sort === 'name' ? ' selected' : ''}>Sort: Name</option>
      </select>${icon('arrow-up-down')}</label>`;
  });
}

function renderRibbonRow(fx) {
  const set = new Set(S.f.types);
  const el = $('#ribbon-row');
  keepFocus(el, () => {
    el.innerHTML = fx.types
      .map(
        (t) =>
          `<button type="button" class="rtoggle r-${t.value}" data-k="type-${t.value}" data-type-toggle="${t.value}" aria-pressed="${set.has(t.value)}"${
            !t.n && !set.has(t.value) ? ' disabled' : ''
          } title="${esc(t.label)}"><span class="swatch"></span>${esc(SHORT_TYPE[t.value])}<span class="n">${num(t.n)}</span></button>`,
      )
      .join('');
  });
}

function renderRuler(fx) {
  const el = $('#ruler');
  const months = fx.months;
  if (!months.length) {
    el.innerHTML = '';
    return;
  }
  const max = Math.max(...months.map((m) => m.n));
  let year = '';
  const items = [];
  for (const m of months) {
    const y = m.key.slice(0, 4);
    if (y !== year) {
      year = y;
      items.push(`<li class="year" aria-hidden="true">${y}</li>`);
    }
    const on = S.f.month === m.key;
    items.push(
      `<li><button type="button" data-k="m-${m.key}" data-month="${m.key}" aria-pressed="${on}" aria-label="${esc(M.monthLabel(m.key))}: ${plural(m.n, 'con')}"><b>${M.monthShort(
        m.key,
      )}</b><span>${num(m.n)}</span><span class="bar"><i style="width:${Math.max(12, Math.round((m.n / max) * 100))}%"></i></span></button></li>`,
    );
  }
  keepFocus(el, () => {
    el.innerHTML = `<ol>${items.join('')}</ol>`;
  });
  const sel = el.querySelector('[aria-pressed="true"]');
  if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function renderResults(list) {
  const guests = new Set();
  for (const c of list) for (const id of c.g || []) guests.add(id);
  const countries = new Set(list.map((c) => c.country));
  const desc = M.describeFilters(S.f);
  const what = S.f.when === 'upcoming' ? 'upcoming conventions' : 'conventions';
  const tbaN = M.showsTBA(S.f) ? M.filterTBA(S.tba, S.guests, S.f).length : 0;
  const tbaPart = tbaN ? ` · <a href="#m-tba" data-jump="m-tba">${plural(tbaN, 'more con')} waiting on dates</a>` : '';
  $('#results').innerHTML = list.length
    ? `<strong>${num(list.length)} ${list.length === 1 ? what.replace(/s$/, '') : what}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}<span>${plural(
        countries.size,
        'country',
        'countries',
      )} · ${plural(guests.size, 'guest')} announced${tbaPart}</span>`
    : tbaN
      ? `<strong>No dated conventions match</strong><span>${plural(tbaN, 'con')} waiting on dates</span>`
      : '';
}

function renderGroups(list) {
  const el = $('#groups');
  if (!list.length) {
    const tbaOnly = M.showsTBA(S.f) ? M.filterTBA(S.tba, S.guests, S.f) : [];
    if (tbaOnly.length) {
      el.innerHTML = tbaSection(tbaOnly);
      return;
    }
    el.innerHTML = `<div class="empty">${icon('search')}<h2>No conventions match</h2><p>Try a wider date range, another place, or fewer types.</p><button type="button" class="btn" data-k="reset" data-reset>Clear all filters</button></div>`;
    return;
  }
  let sections;
  if (S.f.sort !== 'date') {
    const title = S.f.sort === 'name' ? 'A to Z' : 'Most guests first';
    // Long flat lists are cut into blocks of 24 so they can stream in like months do.
    sections = [];
    for (let i = 0; i < list.length; i += 24) {
      const head = i === 0 ? `<div class="month-head"><h2>${title}</h2></div>` : '';
      sections.push(`<section class="month">${head}<div class="grid">${list.slice(i, i + 24).map(badgeHTML).join('')}</div></section>`);
    }
  } else {
    const tba = M.showsTBA(S.f) ? M.filterTBA(S.tba, S.guests, S.f) : [];
    sections = M.groupByMonth(list).map(
      (g) =>
        `<section class="month" id="m-${g.key}" aria-labelledby="mh-${g.key}"><div class="month-head"><h2 id="mh-${g.key}">${esc(g.label)}</h2><span>${plural(
          g.items.length,
          'con',
        )}</span></div><div class="grid">${g.items.map(badgeHTML).join('')}</div></section>`,
    );
    if (tba.length) sections.push(tbaSection(tba));
  }
  streamSections(el, sections);
}

// Paint the first screens at once and append the rest in small idle-time chunks, so a
// filter tap stays quick on phones. A newer render cancels an unfinished one.
let stream = null;
function streamSections(el, sections) {
  const s = { el, sections, i: 0 };
  stream = s;
  let html = '';
  let badges = 0;
  while (s.i < sections.length && (S.syncRender || badges < 28)) {
    html += sections[s.i];
    badges += (sections[s.i].match(/class="badge/g) || []).length;
    s.i++;
  }
  el.innerHTML = html;
  const next = () => {
    if (stream !== s || s.i >= sections.length) return;
    el.insertAdjacentHTML('beforeend', sections.slice(s.i, s.i + 2).join(''));
    s.i += 2;
    if (s.i < sections.length) (window.requestIdleCallback || ((f) => setTimeout(f, 16)))(next);
  };
  if (s.i < sections.length) setTimeout(next, 0);
}

// Append whatever is still waiting (before jumping to a section near the end).
function flushStream() {
  if (!stream || stream.i >= stream.sections.length) return;
  stream.el.insertAdjacentHTML('beforeend', stream.sections.slice(stream.i).join(''));
  stream.i = stream.sections.length;
}

function tbaSection(tba) {
  return `<section class="month" id="m-tba" aria-labelledby="mh-tba"><div class="month-head"><h2 id="mh-tba">Dates not announced yet</h2><span>${plural(
    tba.length,
    'con',
  )}</span></div><p class="tba-note">These cons have run before and haven't announced their next dates. Clip one to your lanyard to keep an eye on it.</p><div class="grid">${tba
    .map(badgeHTML)
    .join('')}</div></section>`;
}

function renderList() {
  if (S.failed) {
    $('#controls').innerHTML = '';
    $('#ribbon-row').innerHTML = '';
    $('#ruler').innerHTML = '';
    $('#results').innerHTML = '';
    $('#groups').innerHTML = `<div class="empty">${icon('info')}<h2>The convention list didn't load</h2><p>Check your connection and try again.</p><button type="button" class="btn" data-retry>Try again</button></div>`;
    return;
  }
  if (!S.ready) {
    $('#groups').innerHTML = skeletonGrid();
    return;
  }
  const list = M.sortCons(M.applyFilters(S.cons, S.guests, S.f, S.today), S.f.sort);
  const fx = M.facets(S.cons, S.guests, S.f, S.today);
  renderControls(fx);
  renderRibbonRow(fx);
  renderRuler(fx);
  renderResults(list);
  renderGroups(list);
  if ($('#sheet').open) renderSheet();
  S.listKey = listKeyNow();
}

// What the rendered list depends on; when unchanged, returning to the list reuses it.
function listKeyNow() {
  return `${listHref()}|${S.today}|${S.generated}|${S.cons.length}`;
}

function setFilters(patch, { toTop = true } = {}) {
  const f = { ...S.f, ...patch };
  if ('continent' in patch && f.country && continentOf(f.country) !== f.continent && f.continent) f.country = '';
  if ('continent' in patch || 'country' in patch) f.region = patch.region || '';
  if ('country' in patch && patch.country) f.continent = continentOf(patch.country) || f.continent;
  S.f = f;
  const href = listHref(f);
  if (S.view === 'list') history.replaceState(null, '', href);
  else location.hash = href;
  renderList();
  if (toTop) {
    const top = $('#view-list').offsetTop;
    if (scrollY > top + 10) scrollTo({ top: 0 });
  }
  syncSearchBox();
}

// ---- mobile filter sheet ------------------------------------------------------------------

function renderSheet() {
  const fx = M.facets(S.cons, S.guests, S.f, S.today);
  const n = M.applyFilters(S.cons, S.guests, S.f, S.today).length;
  const f = S.f;
  const form = $('#sheet-form');
  const opts = placeOptions(fx);
  keepFocus(form, () => {
    form.innerHTML = `<div class="sheet-grip"></div>
      <div class="row"><h2 id="sheet-title">Filters</h2><button type="button" class="reset" data-k="sreset" data-sheet-reset>Reset</button></div>
      <label>Continent${selectHTML('continent', 'Continent', opts.continents, f.continent, 'All continents')}</label>
      <label>Country${selectHTML('country', 'Country', opts.countries, f.country, 'All countries')}</label>
      ${REGIONS[f.country] ? `<label>${f.country === 'CA' ? 'Province' : 'State'}${selectHTML('region', 'State', opts.regions, f.region, 'Any')}</label>` : ''}
      <button type="button" class="toggle" data-k="guests" aria-pressed="${f.guests}"><span class="box">${icon('check')}</span>Only cons with guests announced</button>
      <label>Sort<span class="select"><select data-k="sort">
        <option value="date"${f.sort === 'date' ? ' selected' : ''}>Date, soonest first</option>
        <option value="guests"${f.sort === 'guests' ? ' selected' : ''}>Most guests</option>
        <option value="name"${f.sort === 'name' ? ' selected' : ''}>Name</option>
      </select>${icon('chevron-down')}</span></label>
      <button type="submit" class="btn" value="done">Show ${plural(n, 'convention')}</button>`;
  });
}

// ---- con page -----------------------------------------------------------------------------------

function renderCon(id) {
  const c = S.byId.get(id);
  const page = $('#view-page');
  if (!c) {
    page.innerHTML = notFound('That convention isn’t in the list', 'It may have finished, changed its name, or the link is wrong.');
    document.title = 'Not found · WorldCons';
    return;
  }
  S.wall = { cat: '', q: '' };
  const days = c.tba ? 0 : M.dayCount(c);
  const others = (S.series.get(c.series) || []).filter((x) => x.id !== c.id);
  const mapQ = encodeURIComponent([c.venue, c.city, regionName(c.country, c.region), countryName(c.country)].filter(Boolean).join(', '));
  const saved = S.saved.has(c.id);
  const sub = [c.short, c.organizer].filter(Boolean).join(' · ');
  page.innerHTML = `<a class="back" href="${listHref()}">${icon('arrow-left')}All conventions</a>
  <div class="con-page">
    <aside class="con-card">
      <article class="badge" data-id="${esc(c.id)}">
        ${clipButton(c)}
        ${artHTML(c, true)}
        <div class="badge-body">
          <h1>${esc(c.name)}</h1>
          ${sub ? `<p class="sub">${esc(sub)}</p>` : ''}
          <div class="facts">
            <div class="fact">${icon('calendar-days')}<div>${
              c.tba
                ? `<b>Next dates not announced yet</b>${c.last ? `Last held ${esc(M.formatLong(c.last.start, c.last.end))}` : 'Check the official site for news'}`
                : `<b>${esc(M.formatLong(c.start, c.end, c.dp))}</b>${
                    c.dp === 'm' ? 'Exact dates not announced yet' : `${plural(days, 'day')} · ${esc(M.countdown(c, S.today))}`
                  }`
            }</div></div>
            <div class="fact">${icon('map-pin')}<div>${c.venue ? `<b>${esc(c.venue)}</b>` : ''}${esc(placeText(c, true))} · <a href="https://www.google.com/maps/search/?api=1&query=${mapQ}" target="_blank" rel="noopener">Map</a></div></div>
            ${(c.g || []).length ? `<div class="fact">${icon('users')}<div><b>${plural(c.g.length, 'guest')} announced</b><a href="#wall-title" data-jump="wall-title">See every guest</a></div></div>` : ''}
          </div>
          ${c.blurb ? `<p class="blurb">${esc(c.blurb)}</p>` : ''}
          <div class="actions">
            <a class="btn" href="${safeHref(c.url)}" target="_blank" rel="noopener">Official site${icon('arrow-up-right')}</a>
            ${c.tickets ? `<a class="btn ghost" href="${safeHref(c.tickets)}" target="_blank" rel="noopener">${icon('ticket')}Tickets</a>` : ''}
            <button type="button" class="btn ghost" data-clip="${esc(c.id)}" aria-pressed="${saved}">${icon('lanyard')}<span>${saved ? 'On your lanyard' : 'Clip to lanyard'}</span></button>
            ${c.dp === 'd' ? `<button type="button" class="btn ghost" data-ics="${esc(c.id)}">${icon('calendar-days')}Add to calendar</button>` : ''}
            <button type="button" class="btn ghost" data-share="${esc(c.id)}">${icon('share-2')}Share</button>
          </div>
          <p class="checked">${checkedLine(c)}</p>
        </div>
        ${ribbonsHTML(c, true)}
      </article>
      ${
        others.length
          ? `<div class="also"><h2>Other dates</h2>${others
              .map((o) => `<a href="${conHref(o)}">${esc(M.formatRange(o.start, o.end, o.dp))}<span>${esc(o.city)}</span></a>`)
              .join('')}</div>`
          : ''
      }
    </aside>
    <section class="wall-wrap" aria-labelledby="wall-title">${wallFrame(c)}</section>
  </div>`;
  document.title = `${c.name}${c.tba ? '' : ` ${c.start.slice(0, 4)}`} · WorldCons`;
  renderWall(c);
}

function checkedLine(c) {
  const when = c.checked ? `Checked ${esc(M.formatDay(c.checked))}` : 'Checked recently';
  if (c.gs === 'announced' && c.guestsPage)
    return `${when} against the <a href="${safeHref(c.guestsPage)}" target="_blank" rel="noopener">official guest list</a>. Guests can cancel; confirm with the con.`;
  return `${when} on the <a href="${safeHref(c.url)}" target="_blank" rel="noopener">official site</a>.`;
}

function wallFrame(c) {
  const ids = c.g || [];
  if (!ids.length) {
    const msg = c.tba
      ? ['No lineup yet', 'Guests usually follow once the dates are out. Clip it to your lanyard to keep an eye on it.']
      : c.gs === 'none'
        ? ['No guest lineup', 'This event doesn’t book celebrity or creator guests.']
        : c.gs === 'unavailable'
          ? ['Lineup on the official site', 'The guest list couldn’t be read automatically. It’s on the con’s own site.']
          : ['Guests not announced yet', 'Cons usually announce guests in waves in the months before the show. Clip it to your lanyard and check back.'];
    return `<div class="wall-empty"><span class="slots" aria-hidden="true"><i></i><i></i><i></i><i></i></span><h3 id="wall-title">${msg[0]}</h3><p>${msg[1]}</p>${
      c.gs === 'unavailable' && c.guestsPage ? `<a class="btn ghost" href="${safeHref(c.guestsPage)}" target="_blank" rel="noopener">See the guest page${icon('arrow-up-right')}</a>` : ''
    }</div>`;
  }
  return `<div class="wall-head"><h2 id="wall-title">Guests<small>${num(ids.length)}</small></h2>${
    ids.length > 12
      ? `<div class="wall-search">${icon('search')}<input type="search" id="wall-q" placeholder="Find a guest at this con" aria-label="Find a guest at this con" autocomplete="off"></div>`
      : ''
  }</div><div class="cats" id="wall-cats" role="group" aria-label="Guest type"></div><div class="wall" id="wall"></div>`;
}

function renderWall(c) {
  const wall = $('#wall');
  if (!wall) return;
  const ids = c.g || [];
  const known = c.k || {};
  const counts = new Map();
  for (const id of ids) {
    const cat = (S.guests[id] || {}).c || 'other';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  const cats = CAT_ORDER.filter((k) => counts.get(k));
  const catsEl = $('#wall-cats');
  if (cats.length > 1) {
    keepFocus(catsEl, () => {
      catsEl.innerHTML = [`<button type="button" data-k="cat-" data-cat="" aria-pressed="${!S.wall.cat}">All<span>${num(ids.length)}</span></button>`]
        .concat(
          cats.map(
            (k) => `<button type="button" data-k="cat-${k}" data-cat="${k}" aria-pressed="${S.wall.cat === k}">${CAT_PLURAL[k]}<span>${num(counts.get(k))}</span></button>`,
          ),
        )
        .join('');
    });
  } else catsEl.innerHTML = '';

  const q = M.fold(S.wall.q);
  const match = (id) => {
    const g = S.guests[id] || { n: id };
    if (S.wall.cat && (g.c || 'other') !== S.wall.cat) return false;
    return !q || M.fold(`${g.n} ${known[id] || g.k || ''}`).includes(q);
  };
  const shown = ids.filter(match);
  if (!shown.length) {
    wall.innerHTML = `<p class="wall-section">No guest matches “${esc(S.wall.q)}”.</p>`;
    return;
  }
  const cred = (id) => credHTML(id, { known: known[id], exclude: c.id });
  // Big lineups read better in sections; small ones keep the con's own order.
  const otherShare = (counts.get('other') || 0) / ids.length;
  if (!S.wall.cat && cats.length > 1 && ids.length >= 16 && !q && otherShare < 0.4) {
    wall.innerHTML = cats
      .map((k) => {
        const inCat = shown.filter((id) => ((S.guests[id] || {}).c || 'other') === k);
        return inCat.length ? `<h3 class="wall-section">${CAT_PLURAL[k]}<span>${num(inCat.length)}</span></h3>${inCat.map(cred).join('')}` : '';
      })
      .join('');
  } else {
    wall.innerHTML = shown.map(cred).join('');
  }
}

// ---- guest page ---------------------------------------------------------------------------------

function renderGuest(id) {
  const g = S.guests[id];
  const page = $('#view-page');
  if (!g) {
    page.innerHTML = notFound('We don’t have that guest', 'They may have been removed from every upcoming lineup.');
    document.title = 'Not found · WorldCons';
    return;
  }
  const cons = S.index.get(id) || [];
  const upcoming = cons.filter((c) => M.phase(c, S.today) !== 'past');
  const past = cons.filter((c) => M.phase(c, S.today) === 'past');
  const links = g.w ? `<span class="guest-links"><a href="${safeHref(g.w)}" target="_blank" rel="noopener">Wikipedia</a></span>` : '';
  page.innerHTML = `<a class="back" href="${listHref()}">${icon('arrow-left')}All conventions</a>
  <div class="guest-page">
    ${credHTML(id, { static: true, eager: true, h1: true, extra: links })}
    <section aria-labelledby="gp-title">
      <h2 class="page-title" id="gp-title">${
        upcoming.length ? `Appearing at ${plural(upcoming.length, 'convention')}` : 'No upcoming appearances listed'
      }</h2>
      <p class="page-sub">${
        upcoming.length
          ? `Where to meet ${esc(g.n)}, soonest first. Guests sometimes cancel, so check the con’s page before you go.`
          : `${esc(g.n)} isn’t on any upcoming lineup we track right now.`
      }</p>
      <div class="grid">${upcoming.map(badgeHTML).join('')}</div>
      ${past.length ? `<h2 class="page-title" style="margin-top:56px;font-size:22px">Earlier this season</h2><div class="grid" style="margin-top:18px">${past.map(badgeHTML).join('')}</div>` : ''}
    </section>
  </div>`;
  document.title = `${g.n} · WorldCons`;
}

// ---- guest directory ----------------------------------------------------------------------------------

const DIR_PAGE = 120;

function directoryOrder() {
  // Every guest on an upcoming lineup, most-booked first.
  if (!S.dirOrder || S.dirOrderDay !== S.today) {
    S.dirOrder = Object.keys(S.guests)
      .map((id) => [id, (S.index.get(id) || []).filter((c) => M.phase(c, S.today) !== 'past').length])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || S.guests[a[0]].n.localeCompare(S.guests[b[0]].n));
    S.dirOrderDay = S.today;
  }
  return S.dirOrder;
}

function renderDirectory(qs) {
  const p = new URLSearchParams(qs || '');
  const cat = CAT_ORDER.includes(p.get('cat')) ? p.get('cat') : '';
  S.dir = { cat, q: (p.get('q') || '').slice(0, 60), shown: DIR_PAGE };
  // Back from a guest page: show as many guests as before so the scroll position exists.
  if (S.dirState && S.dirState.qs === dirQuery()) S.dir.shown = S.dirState.shown;
  const total = directoryOrder().length;
  $('#view-page').innerHTML = `<a class="back" href="${listHref()}">${icon('arrow-left')}All conventions</a>
    <h1 class="page-title">Guests</h1>
    <p class="page-sub">${plural(total, 'guest')} booked at upcoming conventions, most-booked first. Open anyone to see where to meet them.</p>
    <div class="wall-head dir-head"><div class="cats" id="dir-cats" role="group" aria-label="Guest type"></div>
      <div class="wall-search">${icon('search')}<input type="search" id="dir-q" placeholder="Find a guest" aria-label="Find a guest" autocomplete="off" value="${esc(S.dir.q)}"></div></div>
    <div class="wall" id="dir-wall"></div>
    <div class="more-wrap"><button type="button" class="btn ghost" id="dir-more" hidden></button></div>`;
  document.title = 'Guests · WorldCons';
  renderDirWall();
}

function dirMatches() {
  const fq = M.fold(S.dir.q);
  return directoryOrder().filter(([id]) => {
    const g = S.guests[id];
    return !fq || M.fold(`${g.n} ${g.k || ''}`).includes(fq);
  });
}

function renderDirWall(append = false) {
  const wall = $('#dir-wall');
  if (!wall) return;
  const byQuery = dirMatches();
  const counts = new Map();
  for (const [id] of byQuery) counts.set(S.guests[id].c, (counts.get(S.guests[id].c) || 0) + 1);
  const list = S.dir.cat ? byQuery.filter(([id]) => S.guests[id].c === S.dir.cat) : byQuery;
  if (!append) {
    keepFocus($('#dir-cats'), () => {
      $('#dir-cats').innerHTML = [`<button type="button" data-k="dcat-" data-dcat="" aria-pressed="${!S.dir.cat}">All<span>${num(byQuery.length)}</span></button>`]
        .concat(
          CAT_ORDER.filter((k) => counts.get(k)).map(
            (k) => `<button type="button" data-k="dcat-${k}" data-dcat="${k}" aria-pressed="${S.dir.cat === k}">${CAT_PLURAL[k]}<span>${num(counts.get(k))}</span></button>`,
          ),
        )
        .join('');
    });
    wall.innerHTML = list.length
      ? list.slice(0, S.dir.shown).map(([id]) => credHTML(id)).join('')
      : `<p class="wall-section">No guest matches “${esc(S.dir.q)}”.</p>`;
  } else {
    wall.insertAdjacentHTML('beforeend', list.slice(S.dir.shown - DIR_PAGE, S.dir.shown).map(([id]) => credHTML(id)).join(''));
  }
  const more = $('#dir-more');
  const left = list.length - S.dir.shown;
  more.hidden = left <= 0;
  more.textContent = `Show ${num(Math.min(DIR_PAGE, left))} more of ${num(list.length)}`;
}

function dirQuery() {
  const p = new URLSearchParams();
  if (S.dir && S.dir.cat) p.set('cat', S.dir.cat);
  if (S.dir && S.dir.q) p.set('q', S.dir.q);
  return p.toString();
}

function syncDirectoryHash() {
  const qs = dirQuery();
  history.replaceState(null, '', `#/guests${qs ? `?${qs}` : ''}`);
}

// ---- lanyard ----------------------------------------------------------------------------------------

function renderLanyard() {
  const page = $('#view-page');
  const saved = [...S.saved].map((id) => S.byId.get(id)).filter(Boolean);
  const list = [...M.sortCons(saved.filter((c) => !c.tba)), ...saved.filter((c) => c.tba)];
  const stale = [...S.saved].filter((id) => !S.byId.has(id)).length;
  document.title = 'Your lanyard · WorldCons';
  if (!list.length) {
    page.innerHTML = `<a class="back" href="${listHref()}">${icon('arrow-left')}All conventions</a>
    <div class="empty">${icon('lanyard')}<h2>Nothing on your lanyard yet</h2><p>Tap the slot at the top of any badge, or “Clip to lanyard” on a con’s page, to keep it here. It’s saved on this device.</p><a class="btn" href="${listHref()}">Browse conventions</a></div>`;
    return;
  }
  page.innerHTML = `<a class="back" href="${listHref()}">${icon('arrow-left')}All conventions</a>
    <h1 class="page-title">Your lanyard</h1>
    <p class="page-sub">${plural(list.length, 'convention')} clipped, soonest first. Saved on this device.${
      stale ? ` ${plural(stale, 'older con')} dropped off the list.` : ''
    }</p>
    <div class="grid">${list.map(badgeHTML).join('')}</div>`;
}

function notFound(title, body) {
  return `<a class="back" href="${listHref()}">${icon('arrow-left')}All conventions</a><div class="empty">${icon('info')}<h2>${esc(title)}</h2><p>${esc(body)}</p><a class="btn" href="${listHref()}">Browse conventions</a></div>`;
}

// ---- lanyard (saving) ---------------------------------------------------------------------------------

let toastTimer = 0;
function toast(html, action) {
  const el = $('#toast');
  el.innerHTML = html + (action ? `<button type="button" data-toast-action>${esc(action.label)}</button>` : '');
  el.classList.add('show');
  el.inert = false;
  el._action = action ? action.run : null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 4200);
}

function hideToast() {
  const el = $('#toast');
  el.classList.remove('show');
  el.inert = true;
}

function setSaved(id, on, { silent = false } = {}) {
  if (on) S.saved.add(id);
  else S.saved.delete(id);
  store(LS_SAVED, [...S.saved]);
  updateLanyardCount(true);
  const c = S.byId.get(id);
  for (const b of $$(`[data-clip="${CSS.escape(id)}"]`)) {
    b.setAttribute('aria-pressed', String(on));
    if (b.classList.contains('clip')) {
      b.setAttribute('aria-label', `${on ? 'Remove' : 'Clip'} ${c ? c.name : ''} ${on ? 'from' : 'to'} your lanyard`);
      const tip = b.querySelector('.tip');
      if (tip) tip.textContent = on ? 'On your lanyard' : 'Clip to lanyard';
    } else {
      const span = b.querySelector('span');
      if (span) span.textContent = on ? 'On your lanyard' : 'Clip to lanyard';
    }
  }
  if (on) {
    for (const badge of $$(`.badge[data-id="${CSS.escape(id)}"]`)) {
      badge.classList.remove('swing');
      void badge.offsetWidth;
      badge.classList.add('swing');
    }
  }
  if (!silent && c) {
    toast(on ? `Clipped ${esc(c.name)} to your lanyard` : `Removed ${esc(c.name)}`, { label: 'Undo', run: () => setSaved(id, !on, { silent: true }) });
  }
  if (S.view === 'lanyard') renderLanyard();
}

function updateLanyardCount(bump = false) {
  const n = [...S.saved].filter((id) => S.byId.has(id) || !S.ready).length;
  const el = $('.lanyard-link .count');
  el.textContent = n;
  el.dataset.n = String(n);
  if (bump) {
    const link = $('.lanyard-link');
    link.classList.remove('bump');
    void link.offsetWidth;
    link.classList.add('bump');
  }
}

async function share(id) {
  const c = S.byId.get(id);
  if (!c) return;
  const url = new URL(conHref(c), location.href.split('#')[0]).href;
  const text = `${c.name} · ${c.tba ? 'dates TBA' : M.formatRange(c.start, c.end, c.dp)} · ${placeText(c, true)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: c.name, text, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('Couldn’t share. Copy the address bar instead.');
  }
}

function downloadICS(id) {
  const c = S.byId.get(id);
  if (!c) return;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const blob = new Blob([M.toICS(c, placeText(c, true), now)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${c.id}.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---- search + suggestions --------------------------------------------------------------------------------

const qInput = $('#q');
const suggestEl = $('#suggest');
let suggestItems = [];
let suggestIndex = -1;

function syncSearchBox() {
  if (document.activeElement !== qInput) qInput.value = S.view === 'list' ? S.f.q : '';
  $('.search .clear').hidden = !qInput.value;
}

function conMatches(q, limit) {
  const words = M.fold(q).split(' ').filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const c of S.cons) {
    if (M.phase(c, S.today) === 'past') continue;
    const hay = ` ${M.fold([c.name, c.short, c.city, regionName(c.country, c.region), countryName(c.country)].join(' '))} `;
    if (words.every((w) => hay.includes(` ${w}`))) out.push(c);
  }
  const tba = S.tba.filter((c) => {
    const hay = ` ${M.fold([c.name, c.short, c.city, regionName(c.country, c.region), countryName(c.country)].join(' '))} `;
    return words.every((w) => hay.includes(` ${w}`));
  });
  return [...M.sortCons(out), ...tba].slice(0, limit);
}

function renderSuggest() {
  const q = qInput.value.trim();
  if (!S.ready || q.length < 2) return closeSuggest();
  const guests = M.searchGuests(S.guests, S.index, q, 5);
  const cons = conMatches(q, 5);
  const all = M.applyFilters(S.cons, S.guests, { ...M.DEFAULT_FILTERS, types: [], q }, S.today).length;
  suggestItems = [];
  let html = '';
  if (guests.length) {
    html += `<div class="suggest-head">Guests</div>`;
    for (const h of guests) {
      const n = (h.g && S.index.get(h.id) ? S.index.get(h.id).filter((c) => M.phase(c, S.today) !== 'past').length : 0) || 0;
      suggestItems.push({ href: guestHref(h.id) });
      html += `<a class="suggest-item" role="option" id="sg-${suggestItems.length - 1}" href="${guestHref(h.id)}" aria-selected="false">${
        h.g.s ? `<img src="${esc(h.g.s)}" alt="" width="34" height="42">` : `<span class="ph"></span>`
      }<span><b>${esc(h.g.n)}</b><small>${esc(M.CATS[h.g.c] || 'Guest')}${h.g.k ? ` · ${esc(h.g.k)}` : ''} · ${plural(n, 'upcoming con')}</small></span></a>`;
    }
  }
  if (cons.length) {
    html += `<div class="suggest-head">Conventions</div>`;
    for (const c of cons) {
      suggestItems.push({ href: conHref(c) });
      html += `<a class="suggest-item" role="option" id="sg-${suggestItems.length - 1}" href="${conHref(c)}" aria-selected="false">${
        c.img ? `<img class="thumb-wide" src="${esc(c.img)}" alt="" width="56" height="30">` : `<span class="ph thumb-wide"></span>`
      }<span><b>${esc(c.name)}</b><small>${esc(c.tba ? 'Dates TBA' : M.formatRange(c.start, c.end, c.dp))} · ${esc(placeText(c))}</small></span></a>`;
    }
  }
  suggestItems.push({ apply: true });
  html += `<button type="button" class="suggest-all" role="option" id="sg-${suggestItems.length - 1}" aria-selected="false" data-apply-search>${
    all ? `Show all ${plural(all, 'convention')} matching “${esc(q)}”` : cons.length ? `Search all conventions for “${esc(q)}”` : `No conventions match “${esc(q)}”`
  }</button>`;
  suggestEl.innerHTML = html;
  suggestEl.hidden = false;
  qInput.setAttribute('aria-expanded', 'true');
  suggestIndex = -1;
}

function closeSuggest() {
  suggestEl.hidden = true;
  suggestEl.innerHTML = '';
  qInput.setAttribute('aria-expanded', 'false');
  qInput.removeAttribute('aria-activedescendant');
  suggestItems = [];
  suggestIndex = -1;
}

function moveSuggest(delta) {
  if (!suggestItems.length) return;
  suggestIndex = (suggestIndex + delta + suggestItems.length) % suggestItems.length;
  $$('[role="option"]', suggestEl).forEach((el, i) => el.setAttribute('aria-selected', String(i === suggestIndex)));
  const active = $(`#sg-${suggestIndex}`);
  if (active) {
    qInput.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView({ block: 'nearest' });
  }
}

function applySearch() {
  const q = qInput.value.trim();
  closeSuggest();
  qInput.blur();
  if (S.view !== 'list') {
    S.f = { ...M.DEFAULT_FILTERS, types: [], q };
    location.hash = listHref(S.f);
  } else setFilters({ q });
}

let suggestTimer = 0;
qInput.addEventListener('input', () => {
  $('.search .clear').hidden = !qInput.value;
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(renderSuggest, 70);
  if (!qInput.value && S.view === 'list' && S.f.q) setFilters({ q: '' }, { toTop: false });
});
qInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (suggestEl.hidden) renderSuggest();
    moveSuggest(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveSuggest(-1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = suggestItems[suggestIndex];
    if (item && item.href) {
      closeSuggest();
      qInput.blur();
      location.hash = item.href;
    } else applySearch();
  } else if (e.key === 'Escape') {
    if (!suggestEl.hidden) closeSuggest();
    else qInput.blur();
  }
});
qInput.addEventListener('focus', () => {
  if (qInput.value.trim().length >= 2) renderSuggest();
});
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.search')) closeSuggest();
});
$('.search .clear').addEventListener('click', () => {
  qInput.value = '';
  $('.search .clear').hidden = true;
  closeSuggest();
  if (S.view === 'list') setFilters({ q: '' }, { toTop: false });
  qInput.focus();
});
// "/" focuses search, like most catalogue sites.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, select, textarea')) {
    e.preventDefault();
    qInput.focus();
  }
});

// ---- events -------------------------------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const t = e.target;
  const clip = t.closest('[data-clip]');
  if (clip) {
    e.preventDefault();
    const id = clip.dataset.clip;
    setSaved(id, !S.saved.has(id));
    return;
  }
  const when = t.closest('[data-when]');
  if (when) return setFilters({ when: when.dataset.when, month: '' });
  const month = t.closest('[data-month]');
  if (month) return setFilters({ month: S.f.month === month.dataset.month ? '' : month.dataset.month });
  const typeToggle = t.closest('[data-type-toggle]');
  if (typeToggle) {
    const v = typeToggle.dataset.typeToggle;
    const set = new Set(S.f.types);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    return setFilters({ types: [...set] }, { toTop: false });
  }
  const ribbon = t.closest('button.ribbon[data-type]');
  if (ribbon) return setFilters({ types: [ribbon.dataset.type] });
  if (t.closest('[data-k="guests"]')) return setFilters({ guests: !S.f.guests }, { toTop: false });
  if (t.closest('[data-k="reset"]') || t.closest('[data-reset]')) {
    qInput.value = '';
    return setFilters({ ...M.DEFAULT_FILTERS, types: [] });
  }
  if (t.closest('[data-sheet-reset]')) return setFilters({ continent: '', country: '', region: '', guests: false });
  if (t.closest('[data-k="sheet"]')) {
    renderSheet();
    $('#sheet').showModal();
    return;
  }
  const dcat = t.closest('[data-dcat]');
  if (dcat) {
    S.dir.cat = dcat.dataset.dcat;
    S.dir.shown = DIR_PAGE;
    syncDirectoryHash();
    renderDirWall();
    return;
  }
  if (t.closest('#dir-more')) {
    S.dir.shown += DIR_PAGE;
    renderDirWall(true);
    return;
  }
  const cat = t.closest('[data-cat]');
  if (cat) {
    S.wall.cat = cat.dataset.cat;
    const c = S.byId.get(decodeURIComponent(location.hash.split('/')[2] || ''));
    if (c) renderWall(c);
    return;
  }
  const jump = t.closest('[data-jump]');
  if (jump) {
    e.preventDefault();
    flushStream();
    const target = document.getElementById(jump.dataset.jump);
    // An instant jump: smooth scrolling over sections the browser hasn't laid out yet
    // (content-visibility) stops short of the target.
    if (target) target.scrollIntoView({ behavior: 'auto', block: 'start' });
    return;
  }
  const shareBtn = t.closest('[data-share]');
  if (shareBtn) return share(shareBtn.dataset.share);
  const icsBtn = t.closest('[data-ics]');
  if (icsBtn) return downloadICS(icsBtn.dataset.ics);
  if (t.closest('[data-apply-search]')) return applySearch();
  if (t.closest('[data-toast-action]')) {
    const el = $('#toast');
    if (el._action) el._action();
    hideToast();
    return;
  }
  if (t.closest('[data-retry]')) {
    S.failed = false;
    renderList();
    loadData();
    return;
  }
  if (t.closest('#theme-btn')) cycleTheme();
  if (t.closest('#update-btn')) checkForUpdate(true);
});

document.addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-k]');
  if (!sel) return;
  const k = sel.dataset.k;
  if (k === 'sort') return setFilters({ sort: sel.value }, { toTop: false });
  if (k === 'continent') return setFilters({ continent: sel.value });
  if (k === 'country') return setFilters({ country: sel.value });
  if (k === 'region') return setFilters({ region: sel.value });
});

let dirTimer = 0;
let wallTimer = 0;
document.addEventListener('input', (e) => {
  if (e.target.id === 'dir-q') {
    clearTimeout(dirTimer);
    dirTimer = setTimeout(() => {
      S.dir.q = e.target.value.trim();
      S.dir.shown = DIR_PAGE;
      syncDirectoryHash();
      renderDirWall();
    }, 120);
    return;
  }
  if (e.target.id === 'wall-q') {
    clearTimeout(wallTimer);
    wallTimer = setTimeout(() => {
      S.wall.q = e.target.value;
      const r = parseHash();
      const c = r.view === 'con' && S.byId.get(r.id);
      if (c) renderWall(c);
    }, 120);
  }
});

$('#sheet').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.close();
});
// The filters button is re-rendered while the sheet is open, so put focus back on the new one.
$('#sheet').addEventListener('close', () => {
  const b = $('.filters-btn');
  if (b) b.focus({ preventScroll: true });
});
// The skip link moves focus without touching the route (its #main is not a route).
$('.skip').addEventListener('click', (e) => {
  e.preventDefault();
  $('#main').focus();
});

// ---- routing -------------------------------------------------------------------------------------------------

const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a malformed escape such as "100%" stays as typed (and simply isn't found)
  }
};

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'con' && parts[1]) return { view: 'con', id: decode(parts[1]) };
  if (parts[0] === 'guest' && parts[1]) return { view: 'guest', id: decode(parts[1]) };
  if (parts[0] === 'lanyard') return { view: 'lanyard' };
  if (parts[0] === 'guests') return { view: 'guests', qs };
  return { view: 'list', qs };
}

function renderPage(r) {
  const pageEl = $('#view-page');
  S.pageRendered = S.ready;
  if (!S.ready) pageEl.innerHTML = S.failed ? notFound('The convention list didn’t load', 'Check your connection and reload.') : skeletonGrid(4);
  else if (r.view === 'con') renderCon(r.id);
  else if (r.view === 'guest') renderGuest(r.id);
  else if (r.view === 'guests') renderDirectory(r.qs);
  else renderLanyard();
}

// Navigation: a new hash route. In-page anchors (#main, #wall-title) are not routes.
function route() {
  const hash = location.hash;
  if (hash && !hash.startsWith('#/')) return;
  const r = parseHash();
  const prev = S.view;
  if (prev === 'list' && r.view !== 'list') S.listState = { href: listHref(), y: scrollY };
  if (prev === 'guests' && r.view !== 'guests' && S.dir) S.dirState = { qs: dirQuery(), shown: S.dir.shown, y: scrollY };
  S.view = r.view;
  closeSuggest();
  $('.nav-guests').setAttribute('aria-current', r.view === 'guests' ? 'page' : 'false');
  $('.lanyard-link:not(.nav-guests)').setAttribute('aria-current', r.view === 'lanyard' ? 'page' : 'false');
  const listEl = $('#view-list');
  const pageEl = $('#view-page');
  if (r.view === 'list') {
    S.f = M.queryToFilters(r.qs);
    pageEl.hidden = true;
    pageEl.innerHTML = '';
    listEl.hidden = false;
    // Coming back to the same list: keep the rendered badges so the scroll position lands
    // exactly where it was (re-rendering resets the skipped-section placeholders).
    const back = prev !== 'list' && S.listState && S.listState.href === listHref();
    if (!(back && S.listKey === listKeyNow())) renderList();
    document.title = 'WorldCons · every fan convention and every guest';
    if (prev !== 'list') requestAnimationFrame(() => scrollTo(0, back ? S.listState.y : 0));
  } else {
    listEl.hidden = true;
    pageEl.hidden = false;
    renderPage(r);
    if (r.view === 'guests' && S.dirState && S.dirState.qs === dirQuery() && S.ready) {
      const { y } = S.dirState;
      requestAnimationFrame(() => scrollTo(0, y));
    } else scrollTo(0, 0);
    $('#main').focus({ preventScroll: true });
  }
  syncSearchBox();
}

// Data arrived or the day rolled over: refresh what is on screen without moving the
// reader (no scroll jump, no focus change, typed search text kept).
function refreshView() {
  if (S.view === 'list') {
    const y = scrollY;
    S.syncRender = true; // the whole list at once, so the old scroll position still exists
    renderList();
    S.syncRender = false;
    scrollTo(0, y);
  } else if (!S.pageRendered) {
    renderPage(parseHash());
  }
  syncSearchBox();
}

window.addEventListener('hashchange', route);

// ---- theme + updates ---------------------------------------------------------------------------------------

function themeLabel() {
  const t = document.documentElement.dataset.theme || 'auto';
  $('#theme-btn').textContent = `Theme: ${t}`;
}
function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const cur = document.documentElement.dataset.theme || 'auto';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  if (next === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try {
    if (next === 'auto') localStorage.removeItem(LS_THEME);
    else localStorage.setItem(LS_THEME, next);
  } catch {}
  themeLabel();
}

async function checkForUpdate(manual = false) {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    const { build } = await r.json();
    if (build && build !== BUILD) {
      let tried = '';
      try {
        tried = sessionStorage.getItem('wc.updateTried') || '';
        sessionStorage.setItem('wc.updateTried', build);
      } catch {}
      if (tried === build && !manual) return; // already reloaded once for this build
      const url = new URL(location.href);
      url.searchParams.set('v', build);
      location.replace(url.href);
    } else if (manual) toast('You have the latest version');
  } catch {
    if (manual) toast('Couldn’t check for updates. Are you offline?');
  }
}

function stripVersionParam() {
  const url = new URL(location.href);
  if (url.searchParams.has('v')) {
    url.searchParams.delete('v');
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  }
}

// ---- data -----------------------------------------------------------------------------------------------------

async function loadData() {
  try {
    const r = await fetch('data/cons.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    S.generated = data.generated || '';
    S.guests = data.guests || {};
    S.cons = data.cons || [];
    S.tba = data.tba || [];
    S.byId = new Map([...S.cons, ...S.tba].map((c) => [c.id, c]));
    S.series = new Map();
    for (const c of M.sortCons(S.cons)) {
      if (!S.series.has(c.series)) S.series.set(c.series, []);
      S.series.get(c.series).push(c);
    }
    S.index = M.buildGuestIndex(S.cons);
    S.ready = true;
    S.failed = false;
    if (S.generated) {
      $('#foot-data').innerHTML = `Data checked ${esc(M.formatDay(S.generated))}. Dates and guests come from each convention's official website. Plans change, so confirm with the con before you travel. Guest photos belong to their owners and are shown to identify who is appearing.`;
    }
  } catch (e) {
    console.error('data load failed', e);
    S.failed = true;
  }
  if (S.ready) remapSaved();
  updateLanyardCount();
  refreshView();
}

// A clipped con keeps its place on the lanyard when its id changes: an undated con
// (id = series) gets dates (id = series-year), or a show moves to another month.
function remapSaved() {
  const editions = (series) => S.series.get(series) || [];
  let changed = false;
  const next = new Set();
  for (const id of S.saved) {
    if (S.byId.has(id)) {
      next.add(id);
      continue;
    }
    const m = /^(.*?)-(\d{4})(?:-\d{2}){0,2}$/.exec(id);
    const series = S.series.has(id) || S.tba.some((c) => c.id === id) ? id : m ? m[1] : id;
    const year = m ? m[2] : '';
    const list = editions(series);
    const hit =
      list.find((c) => c.start.startsWith(year)) ||
      list.find((c) => M.phase(c, S.today) !== 'past') ||
      list[0] ||
      S.byId.get(series);
    if (hit) {
      next.add(hit.id);
      changed = true;
    } else next.add(id); // keep it; the lanyard page reports cons that dropped off
  }
  if (changed) {
    S.saved = next;
    store(LS_SAVED, [...next]);
  }
}

// ---- boot ----------------------------------------------------------------------------------------------------------

document.body.insertAdjacentHTML('afterbegin', SPRITE);
const narrow = matchMedia('(max-width: 760px)');
const setPlaceholder = () => (qInput.placeholder = narrow.matches ? 'Search' : 'Search cons, cities, guests');
setPlaceholder();
narrow.addEventListener('change', setPlaceholder);
S.saved = new Set(load(LS_SAVED, []));
stripVersionParam();
themeLabel();
$('.foot').insertAdjacentHTML('beforeend', `<p>Version ${esc(BUILD)} · <button type="button" id="update-btn">Check for updates</button></p>`);
updateLanyardCount();
route();
loadData();

// Midnight rollover: countdowns and "upcoming" depend on today's date.
setInterval(() => {
  const t = M.isoToday();
  if (t !== S.today) {
    S.today = t;
    if (S.ready) refreshView();
  }
}, 60_000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});
checkForUpdate();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
