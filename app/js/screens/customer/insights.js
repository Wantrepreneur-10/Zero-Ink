// Customer insights: ask-your-receipts, spending by category, top places.
import { state } from '../../state.js';
import { $, esc, money, r2, icons } from '../../lib/utils.js';
import { registerActions } from '../../lib/actions.js';
import { ai, aiChip } from '../../lib/ai.js';
import { CATS, catOf, guessCat } from '../../lib/categories.js';
import { localAnswer } from '../../lib/answer.js';
import { loadReceipts } from './home.js';

const SUGGESTIONS = ['What did I spend this month?', 'Biggest purchase?', 'How much at Naan and Dosa?', 'Spending last week?'];

export async function renderInsights() {
  $('view').innerHTML = `
    <div class="top"><div class="top-title">Insights</div>${aiChip()}</div>
    <div class="card ai-card">
      <div class="card-t">${icons.spark} Ask your receipts</div>
      <div class="ask"><input class="inp" id="q" placeholder="How much did I spend on food this month?" data-enter="ask"><button class="iconbtn go" data-action="ask" aria-label="Ask">${icons.arrow}</button></div>
      <div class="sugs">${SUGGESTIONS.map((s) => `<button class="sug" data-action="askSuggestion">${s}</button>`).join('')}</div>
      <div class="answer" id="ans"></div>
    </div>
    <div class="card"><div class="card-t">This month by category</div><div id="cats"><div class="empty"><span class="spin sm"></span></div></div></div>
    <div class="card"><div class="card-t">Where you spend most</div><div id="tops"></div></div>`;
  if (!state.receipts.length) await loadReceipts();
  paintCategories();
  paintTopPlaces();
}

function paintCategories() {
  const now = new Date();
  const month = state.receipts.filter((r) => { const d = new Date(r.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const by = {};
  month.forEach((r) => { const c = catOf(r); by[c] = (by[c] || 0) + Number(r.amount || 0); });
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  $('cats').innerHTML = total
    ? Object.entries(by).sort((a, b) => b[1] - a[1]).map(([c, v]) => `
        <div class="catrow"><span class="e">${CATS[c][0]}</span><span class="n">${c}</span>
        <span class="meter"><i style="width:${Math.max(4, (v / total) * 100)}%;background:${CATS[c][1]}"></i></span><span class="v">${money(v)}</span></div>`).join('')
    : '<div class="empty">Nothing yet this month.</div>';
}

function paintTopPlaces() {
  const st = {};
  state.receipts.forEach((r) => { st[r.merchant_name] ??= { v: 0, n: 0 }; st[r.merchant_name].v += Number(r.amount || 0); st[r.merchant_name].n++; });
  const top = Object.entries(st).sort((a, b) => b[1].v - a[1].v).slice(0, 5);
  $('tops').innerHTML = top.length
    ? top.map(([n, o]) => `<div class="rrow"><div class="ricon">${CATS[guessCat(n)][0]}</div><div class="rinfo"><div class="rname">${esc(n)}</div><div class="rmeta">${o.n} visit${o.n > 1 ? 's' : ''}</div></div><div class="ramt">${money(o.v)}</div></div>`).join('')
    : '<div class="empty">Your top places will show here.</div>';
}

async function ask() {
  const q = $('q').value.trim(); if (!q) return;
  const a = $('ans');
  a.classList.add('show');
  a.innerHTML = '<span class="spin sm"></span> Thinking…';
  if (!state.receipts.length) await loadReceipts();
  let answer = null;
  if (state.AI) {
    const rows = state.receipts.slice(0, 400).map((r) => ({ date: r.created_at.slice(0, 10), store: r.merchant_name, category: catOf(r), amount: r2(r.amount), items: r.items }));
    const res = await ai({ mode: 'ask', question: q, receipts: rows, today: new Date().toISOString().slice(0, 10) });
    if (res.ai && res.answer) answer = res.answer;
  }
  a.textContent = answer || localAnswer(q, state.receipts);
}

registerActions({
  ask,
  askSuggestion: (el) => { $('q').value = el.textContent; ask(); },
});
