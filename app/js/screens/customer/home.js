// Customer home: 4-digit code, monthly totals, receipt list, receipt detail sheet.
import { sb } from '../../lib/supabase.js';
import { state } from '../../state.js';
import { $, esc, money, timeAgo } from '../../lib/utils.js';
import { registerActions } from '../../lib/actions.js';
import { aiChip } from '../../lib/ai.js';
import { CATS, catOf } from '../../lib/categories.js';

export async function loadReceipts() {
  const { data } = await sb.from('receipts').select('*')
    .eq('customer_id', state.profile.id).order('created_at', { ascending: false }).limit(500);
  state.receipts = data || [];
}

export async function renderHome() {
  const p = state.profile, first = (p.full_name || 'there').split(' ')[0];
  $('view').innerHTML = `
    <div class="top"><div class="top-title">Hi, ${esc(first)}</div>${aiChip()}</div>
    <div class="codebig"><div class="k">Your Zero Ink code</div><div class="c">${esc(p.code || '----')}</div><div class="h">Say these four digits at checkout. Your receipt lands here.</div></div>
    <div class="stats three">
      <div class="stat hl"><div class="v" id="s-m">—</div><div class="l">This month</div></div>
      <div class="stat"><div class="v" id="s-c">—</div><div class="l">Receipts</div></div>
      <div class="stat"><div class="v" id="s-p">—</div><div class="l">Paper saved</div></div>
    </div>
    <div class="card"><div class="card-t">Recent receipts</div><div id="rx"><div class="empty"><span class="spin sm"></span></div></div></div>`;
  await loadReceipts();
  paintHome();
}

export function paintHome() {
  const box = $('rx'); if (!box) return;
  const list = state.receipts, now = new Date();
  const month = list.filter((r) => { const d = new Date(r.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  $('s-m').textContent = money(month.reduce((s, r) => s + Number(r.amount || 0), 0));
  $('s-c').textContent = list.length;
  $('s-p').textContent = list.length + (list.length === 1 ? ' slip' : ' slips');
  if (!list.length) {
    box.innerHTML = `<div class="empty"><div class="ei">🧾</div><div class="et">No receipts yet</div>Give code <b style="color:var(--mint)">${esc(state.profile.code)}</b> at checkout.<br>It appears here the moment it's sent.</div>`;
    return;
  }
  box.innerHTML = list.slice(0, 60).map((r) => `
    <div class="rrow tap" data-action="openReceipt" data-id="${r.id}">
      <div class="ricon">${CATS[catOf(r)][0]}</div>
      <div class="rinfo"><div class="rname">${esc(r.merchant_name)}</div><div class="rmeta">${esc(r.items || '')} · ${timeAgo(r.created_at)}</div></div>
      <div class="ramt">${money(r.amount)}</div>
    </div>`).join('');
}

function openReceipt(el) {
  const r = state.receipts.find((x) => x.id === el.dataset.id); if (!r) return;
  const lines = Array.isArray(r.line_items) && r.line_items.length
    ? r.line_items
    : (r.items || '').split(',').map((s) => ({ name: s.trim() })).filter((x) => x.name);
  const d = new Date(r.created_at);
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.dataset.action = 'closeSheet';
  bg.innerHTML = `<div class="sheet">
    <div class="slip">
      <div class="h">${esc(r.merchant_name)}</div>
      <div class="d">${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
      ${lines.map((i) => `<div class="r"><span>${i.qty > 1 ? i.qty + ' × ' : ''}${esc(i.name)}</span><span>${i.price != null ? money((i.qty || 1) * i.price) : ''}</span></div>`).join('')}
      <hr>
      ${r.subtotal != null ? `<div class="r"><span>Subtotal</span><span>${money(r.subtotal)}</span></div><div class="r"><span>Tax</span><span>${money(r.tax || 0)}</span></div>` : ''}
      <div class="r t"><span>TOTAL</span><span>${money(r.amount)}</span></div>
      <div class="f">Delivered by Zero Ink · no paper printed<br>Ref ${esc(String(r.id).slice(0, 8).toUpperCase())}</div>
    </div>
    <div class="muted" style="font-size:12px;text-align:center;margin-bottom:10px">Category: ${CATS[catOf(r)][0]} ${catOf(r)}</div>
    <button class="btn ghost" data-action="closeSheet">Close</button></div>`;
  document.body.appendChild(bg);
}

registerActions({
  openReceipt,
  closeSheet: (el, e) => {
    // Background tap closes; taps inside the slip bubble up here too, so only close on the backdrop itself or the button.
    if (el.classList.contains('sheet-bg') && e.target !== el) return;
    el.closest('.sheet-bg')?.remove();
  },
});
