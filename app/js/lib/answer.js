// Built-in "Ask your receipts" answers for when the AI key isn't configured. Pure function.
import { catOf } from './categories.js';
import { norm } from './parser.js';

const money = (n) => '$' + (Math.round(n * 100) / 100).toFixed(2);
const DAY = 864e5;
const sod = (d) => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };

function timeRange(s, now) {
  if (/today/.test(s)) return [sod(now), null, 'today'];
  if (/yesterday/.test(s)) { const to = sod(now); return [new Date(to - DAY), to, 'yesterday']; }
  if (/last week/.test(s)) { const to = sod(now); to.setDate(to.getDate() - to.getDay()); return [new Date(to - 7 * DAY), to, 'last week']; }
  if (/week/.test(s)) { const f = sod(now); f.setDate(f.getDate() - f.getDay()); return [f, null, 'this week']; }
  if (/last month/.test(s)) return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1), 'last month'];
  if (/month/.test(s)) return [new Date(now.getFullYear(), now.getMonth(), 1), null, 'this month'];
  if (/year/.test(s)) return [new Date(now.getFullYear(), 0, 1), null, 'this year'];
  return [null, null, 'so far'];
}

const CAT_WORDS = { Dining: /food|eat|dining|restaurant|lunch|dinner/, Coffee: /coffee|cafe/, Groceries: /grocer/, Fuel: /gas|fuel/, Health: /health|pharm/, Shopping: /shop/ };

export function localAnswer(question, receipts, now = new Date()) {
  const s = question.toLowerCase();
  const [from, to, label] = timeRange(s, now);
  let rows = receipts.filter((r) => { const d = new Date(r.created_at); return (!from || d >= from) && (!to || d < to); });

  let where = '';
  const stores = [...new Set(receipts.map((r) => r.merchant_name))];
  const store = stores.find((n) => s.includes(n.toLowerCase()))
    || stores.find((n) => norm(n).split(' ').some((w) => w.length > 3 && s.includes(w)));
  if (store) { rows = rows.filter((r) => r.merchant_name === store); where = ' at ' + store; }
  else {
    const c = Object.keys(CAT_WORDS).find((k) => CAT_WORDS[k].test(s));
    if (c) { rows = rows.filter((r) => catOf(r) === c); where = ' on ' + c.toLowerCase(); }
  }

  if (!rows.length) return `I don't see any receipts${where} ${label}.`;
  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const n = rows.length, rec = `receipt${n > 1 ? 's' : ''}`;

  if (/biggest|largest|most expensive|highest/.test(s)) {
    const b = rows.reduce((a, r) => (Number(r.amount) > Number(a.amount) ? r : a));
    return `Your biggest purchase${where} ${label} was ${money(Number(b.amount))} at ${b.merchant_name} on ${new Date(b.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}.`;
  }
  if (/how many|count|times|visits/.test(s)) return `${n} ${rec}${where} ${label}, totaling ${money(total)}.`;
  return `You spent ${money(total)}${where} ${label} across ${n} ${rec} (avg ${money(total / n)}).`;
}
