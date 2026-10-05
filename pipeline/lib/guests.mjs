// Guest identity helpers shared by the data build and its tests.

export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Spelling slips that con sites make with the same person's name: one vowel swapped
// (Kristen/Kristin) or one letter doubled or undoubled (Phillips/Philips). Anything else,
// such as Smith/Smyth, is treated as a different person.
export function isTypoPair(a, b) {
  if (a === b) return false;
  if (a.length === b.length) {
    const diff = [...a].map((ch, i) => (ch === b[i] ? -1 : i)).filter((i) => i >= 0);
    return diff.length === 1 && 'aeiou'.includes(a[diff[0]]) && 'aeiou'.includes(b[diff[0]]);
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  if (long.length - short.length !== 1) return false;
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) return (i > 0 && long[i] === long[i - 1]) || long[i] === long[i + 1];
  }
  return false;
}

export function mergeTypos(guests, cons) {
  const log = [];
  const ids = [...guests.keys()].filter((id) => id.length >= 10).sort();
  const count = (id) => [...guests.get(id).names.values()].reduce((a, b) => a + b, 0);
  const catOf = (id) => [...guests.get(id).cats.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const byLen = new Map();
  for (const id of ids) {
    const k = id.length;
    for (const l of [k - 1, k, k + 1]) for (const other of byLen.get(l) || []) {
      if (!guests.has(other) || !guests.has(id) || other === id) continue;
      // Same first letter of each word and the same category guard against real namesakes.
      if (other.split('-').map((w) => w[0]).join('') !== id.split('-').map((w) => w[0]).join('')) continue;
      if (catOf(other) !== catOf(id)) continue;
      if (!isTypoPair(other, id)) continue;
      const [keep, drop] = count(other) >= count(id) ? [other, id] : [id, other];
      const a = guests.get(keep);
      const b = guests.get(drop);
      for (const [k, v] of b.names) a.names.set(k, (a.names.get(k) || 0) + v);
      for (const [k, v] of b.cats) a.cats.set(k, (a.cats.get(k) || 0) + v);
      for (const [k, v] of b.knowns) a.knowns.set(k, (a.knowns.get(k) || 0) + v);
      a.photos.push(...b.photos);
      guests.delete(drop);
      for (const c of cons) {
        if (!c.g.includes(drop)) continue;
        c.g = c.g.includes(keep) ? c.g.filter((x) => x !== drop) : c.g.map((x) => (x === drop ? keep : x));
        if (c._known[drop]) {
          c._known[keep] = c._known[keep] || c._known[drop];
          delete c._known[drop];
        }
      }
      log.push(`${drop} -> ${keep}`);
    }
    if (!byLen.has(id.length)) byLen.set(id.length, []);
    byLen.get(id.length).push(id);
  }
  return log;
}

// A 4:5 crop around the detected face(s) (YuNet boxes [x, y, w, h, score] in oriented
// pixels). Faces of similar size are framed together (duos, bands); the face sits a little
// above the middle, like an ID photo. faceFrac = face width / crop width.
export function faceCrop(W, H, faces, faceFrac, minW) {
  const main = faces[0];
  let peers = faces.filter((f) => f[2] * f[3] >= 0.5 * main[2] * main[3]).slice(0, 4);
  // A group that cannot fit in one 4:5 frame would be cut through; frame the main face.
  const span = Math.max(...peers.map((f) => f[0] + f[2])) - Math.min(...peers.map((f) => f[0]));
  if (peers.length > 1 && span / 0.8 > Math.min(W, H * 0.8)) peers = [main];
  const x0 = Math.min(...peers.map((f) => f[0]));
  const y0 = Math.min(...peers.map((f) => f[1]));
  const x1 = Math.max(...peers.map((f) => f[0] + f[2]));
  const y1 = Math.max(...peers.map((f) => f[1] + f[3]));
  let cw = peers.length > 1 ? (x1 - x0) / 0.8 : (x1 - x0) / faceFrac;
  cw = Math.max(cw, Math.min(minW, W, H * 0.8));
  let ch = cw / 0.8;
  if (ch > H) {
    ch = H;
    cw = ch * 0.8;
  }
  if (cw > W) {
    cw = W;
    ch = cw / 0.8;
  }
  const width = Math.max(1, Math.floor(cw));
  const height = Math.max(1, Math.floor(ch));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const left = Math.round(Math.min(Math.max(cx - width / 2, 0), W - width));
  const top = Math.round(Math.min(Math.max(cy - height * 0.42, 0), H - height));
  return { left, top, width, height };
}
