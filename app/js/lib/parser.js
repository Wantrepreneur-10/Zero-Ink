// Built-in order parser: turns "2 masala dosas, a mango lasi and garlic nan" into menu line items.
// Used when the AI key isn't configured (and as a fallback if the AI call fails). Pure: no DOM, no network.

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, dozen: 12, single: 1, double: 2 };

export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function wordSim(a, b) {
  a = stem(a); b = stem(b);
  if (a === b) return 1;
  if (a.length > 3 && (b.startsWith(a) || a.startsWith(b))) return 0.85;
  const s = 1 - lev(a, b) / Math.max(a.length, b.length);
  return s >= 0.6 ? s : 0;
}

/** Similarity 0..1 between what the cashier said and a menu item name. */
export function scoreItem(query, name) {
  const q = norm(query).split(' ').filter(Boolean), n = norm(name).split(' ').filter(Boolean);
  if (!q.length || !n.length) return 0;
  const best = (w, list) => Math.max(0, ...list.map((x) => wordSim(w, x)));
  const hit = q.reduce((s, w) => s + best(w, n), 0) / q.length;   // how much of the query matched
  const cov = n.reduce((s, x) => s + best(x, q), 0) / n.length;   // how much of the name was covered
  return hit * 0.6 + cov * 0.4;
}

/**
 * @param {string} text  free-form order
 * @param {{name:string, price:number, active?:boolean}[]} menu
 * @returns {{items:{name:string, qty:number, price:number}[], unmatched:string[]}}
 */
export function localParse(text, menu) {
  const chunks = String(text).toLowerCase()
    .replace(/\band\b|\bplus\b|\bwith\b|\n|;|&/g, ',')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const items = [], unmatched = [];

  for (let c of chunks) {
    let qty = 1, price = null;

    const pm = c.match(/\$\s?(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s?(?:dollars|bucks)/);
    if (pm) { price = parseFloat(pm[1] || pm[2]); c = c.replace(pm[0], ' ').trim(); }

    const lead = c.match(/^(\d+)\s*(?:x|×)?\s+(.*)$/), tail = c.match(/^(.*?)\s*(?:x|×)\s*(\d+)$/);
    if (lead) { qty = +lead[1]; c = lead[2]; }
    else if (tail) { qty = +tail[2]; c = tail[1]; }
    else {
      const w = c.split(' ');
      if (NUM_WORDS[w[0]] && w.length > 1) { qty = NUM_WORDS[w[0]]; c = w.slice(1).join(' '); }
    }
    c = c.replace(/\b(orders? of|plates? of|cups? of|glass(es)? of|of|please|the|some)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c) continue;

    let best = null, bestScore = 0;
    for (const it of menu) {
      if (it.active === false) continue;
      const s = scoreItem(c, it.name);
      if (s > bestScore) { bestScore = s; best = it; }
    }
    if (best && bestScore >= 0.55) items.push({ name: best.name, qty, price: Number(best.price) });
    else if (price != null) items.push({ name: c.replace(/\b\w/g, (x) => x.toUpperCase()), qty, price });
    else unmatched.push(c);
  }
  return { items, unmatched };
}
