// Merchant register: smart/voice order entry, tap-to-add menu, cart, code entry, send.
import { sb } from '../../lib/supabase.js';
import { state } from '../../state.js';
import { $, esc, money, r2, timeAgo, toast, icons } from '../../lib/utils.js';
import { registerActions } from '../../lib/actions.js';
import { ai, aiChip } from '../../lib/ai.js';
import { guessCat } from '../../lib/categories.js';
import { localParse } from '../../lib/parser.js';
import { openTab } from '../../shell.js';

export async function loadMenu() {
  const { data } = await sb.from('menu_items').select('*').eq('merchant_id', state.profile.id).order('category').order('name');
  state.menu = data || [];
}

export function cartTotals(cart = state.cart, taxRate = Number(state.profile?.tax_rate) || 0) {
  // An order loaded from the POS keeps the POS's own totals so both systems agree to the cent.
  if (state.posOrder && cart === state.cart) {
    const o = state.posOrder;
    return { sub: r2(o.subtotal ?? o.total), tax: r2(o.tax), total: r2(o.total) };
  }
  const sub = r2(cart.reduce((s, i) => s + i.qty * i.price, 0));
  const tax = r2((sub * taxRate) / 100);
  return { sub, tax, total: r2(sub + tax) };
}

const voiceSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const readCode = () => [0, 1, 2, 3].map((i) => $('c' + i)?.value || '').join('');

export async function renderRegister() {
  if (!state.menu.length) await loadMenu();
  const active = state.menu.filter((m) => m.active);
  const cats = ['All', ...new Set(active.map((m) => m.category || 'Other'))];
  if (!cats.includes(state.menuCat)) state.menuCat = 'All';
  const voice = voiceSupported();

  $('view').innerHTML = `
    <div class="top"><div class="top-title">${esc(state.profile.full_name || 'Register')}<div class="top-sub">New receipt</div></div>${aiChip()}</div>

    <div id="posq"></div>

    <div class="card ai-card">
      <div class="card-t">${icons.spark} Smart order entry</div>
      <div class="smart">
        <textarea class="inp" id="smart" rows="1" placeholder="2 masala dosa, a mango lassi and garlic naan" data-enter="smartAdd"></textarea>
        ${voice ? `<button class="iconbtn" id="micb" data-action="listen" aria-label="Speak order">${icons.mic}</button>` : ''}
        <button class="iconbtn go" data-action="smartAdd" aria-label="Add">${icons.arrow}</button>
      </div>
      <div class="hint" id="smart-hint">Type or ${voice ? '<b>tap the mic</b> and say' : 'dictate'} the order the way you'd say it. Typos and plurals are fine.</div>
      <div id="unm"></div>
    </div>

    <div class="card">
      <div class="card-t">Tap to add</div>
      ${state.menu.length
        ? `<div class="chips">${cats.map((c) => `<button class="chip ${c === state.menuCat ? 'on' : ''}" data-action="pickCategory" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div><div class="grid" id="tiles"></div>`
        : `<div class="empty" style="padding:12px">Add your menu once and orders become one tap.<br><button class="btn small" style="margin-top:10px" data-action="goMenu">Set up menu</button></div>`}
    </div>

    <div class="card">
      <div class="card-t">Order</div>
      <div class="lines" id="lines"></div>
      <div class="addrow"><input class="inp" id="cname" placeholder="Custom item" style="flex:1"><input class="inp pr" id="cprice" placeholder="0.00" inputmode="decimal" data-enter="addCustom"><button data-action="addCustom">+</button></div>
      <div class="totals" id="totals"></div>
      <div class="lbl" style="text-align:center;margin-top:10px">Customer's 4-digit code</div>
      <div class="codein">${[0, 1, 2, 3].map((i) => `<input id="c${i}" data-i="${i}" maxlength="1" inputmode="numeric" pattern="[0-9]*" data-input="codeInput" data-keydown="codeKey">`).join('')}</div>
      <div class="who" id="who"></div>
      <div id="usual"></div>
      <button class="btn" id="send" data-action="sendReceipt">Send receipt</button>
    </div>

    <div class="card"><div class="card-t">Just sent</div><div id="sent"></div></div>`;
  paintTiles(); paintCart(); loadSent(); loadPosOrders();
}

/* ---------- orders arriving from the POS ---------- */
async function loadPosOrders() {
  const { data } = await sb.from('pos_orders').select('*').eq('merchant_id', state.profile.id).eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(20);
  state.posOrders = data || [];
  paintPosOrders();
}

function paintPosOrders() {
  const box = $('posq'); if (!box) return;
  const list = state.posOrders.filter((o) => o.id !== state.posOrder?.id);
  box.innerHTML = list.length ? `<div class="card pos-card">
    <div class="card-t"><span class="live"></span> From your POS<span class="sp"></span><span class="muted" style="font-size:12px;font-weight:500;font-family:var(--fb)">${list.length} waiting</span></div>
    ${list.map((o) => `<div class="rrow tap" data-action="loadPosOrder" data-id="${o.id}">
      <div class="rinfo"><div class="rname">${esc(o.items.map((i) => (i.qty > 1 ? i.qty + '× ' : '') + i.name).join(', '))}</div>
      <div class="rmeta">${o.external_id ? '#' + esc(o.external_id) + ' · ' : ''}${timeAgo(o.created_at)}</div></div>
      <div class="ramt">${money(o.total)}</div>
      <button class="x-dismiss" data-action="dismissPosOrder" data-id="${o.id}" aria-label="Dismiss">×</button></div>`).join('')}
    <div class="hint">Tap an order, type the customer's code, send. No retyping.</div></div>` : '';
}

/** Called by the realtime subscription when the POS pushes a new order. */
export function onPosOrder(o) {
  if (o.status !== 'pending' || state.posOrders.some((x) => x.id === o.id)) return;
  state.posOrders.unshift(o);
  if (state.tab === 'register') paintPosOrders();
  toast('New order from POS', o.items.map((i) => i.name).join(', '), money(o.total), 'Tap it in the Register to send the receipt');
}

function loadPosOrder(el, e) {
  if (e.target.closest('[data-action="dismissPosOrder"]')) return;
  const o = state.posOrders.find((x) => x.id === el.dataset.id); if (!o) return;
  state.posOrder = o;
  state.cart = o.items.map((i) => ({ name: i.name, price: r2(i.price), qty: i.qty || 1 }));
  paintPosOrders(); paintCart(); paintTiles();
  $('c0')?.focus();
  $('lines').closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function dismissPosOrder(el) {
  const id = el.dataset.id;
  await sb.from('pos_orders').update({ status: 'dismissed' }).eq('id', id);
  state.posOrders = state.posOrders.filter((x) => x.id !== id);
  paintPosOrders();
}

function unloadPosOrder() { state.posOrder = null; state.cart = []; paintPosOrders(); paintCart(); paintTiles(); }

/* ---------- "the usual": what this customer normally orders here ---------- */
async function showUsual(customer) {
  const box = $('usual'); if (!box) return;
  box.innerHTML = '';
  if (state.cart.length) return;                       // only offer it on an empty order
  const { data } = await sb.from('receipts').select('line_items').eq('merchant_id', state.profile.id)
    .eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(12);
  const visits = (data || []).filter((r) => Array.isArray(r.line_items) && r.line_items.length);
  if (visits.length < 2) return;
  const seen = {};
  visits.forEach((r) => new Set(r.line_items.map((i) => i.name)).forEach((n) => { seen[n] = (seen[n] || 0) + 1; }));
  const names = Object.entries(seen).filter(([, n]) => n >= Math.max(2, visits.length / 2)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  const items = names.map((n) => state.menu.find((m) => m.active && m.name === n)).filter(Boolean);
  if (!items.length || !box.isConnected) return;
  state.usual = items;
  box.innerHTML = `<button class="usual" data-action="addUsual">${icons.spark}<span><b>${esc(customer.first_name || 'Their')}'s usual</b><br>${items.map((i) => esc(i.name)).join(' · ')}</span><em>Add</em></button>`;
}

function paintTiles() {
  const g = $('tiles'); if (!g) return;
  const list = state.menu.filter((m) => m.active && (state.menuCat === 'All' || (m.category || 'Other') === state.menuCat));
  g.innerHTML = list.map((m) => {
    const q = state.cart.find((c) => c.name === m.name)?.qty;
    return `<button class="tile" data-action="addMenuItem" data-id="${m.id}"><span class="n">${esc(m.name)}</span><span class="p">${money(m.price)}</span>${q ? `<span class="q">${q}</span>` : ''}</button>`;
  }).join('');
}

function paintCart() {
  const l = $('lines'); if (!l) return;
  const cart = state.cart;
  if (state.posOrder) {
    l.innerHTML = `<div class="posnote"><span class="live"></span> From POS${state.posOrder.external_id ? ' · #' + esc(state.posOrder.external_id) : ''}<button data-action="unloadPosOrder">Clear</button></div>`
      + cart.map((c) => `<div class="line"><span class="nm">${c.qty > 1 ? c.qty + ' × ' : ''}${esc(c.name)}</span><span class="pr">${money(c.qty * c.price)}</span></div>`).join('');
    const t = cartTotals();
    $('totals').innerHTML = `<div class="r"><span>Subtotal</span><span>${money(t.sub)}</span></div><div class="r"><span>Tax</span><span>${money(t.tax)}</span></div><div class="r grand"><span>Total</span><b>${money(t.total)}</b></div>`;
    return;
  }
  l.innerHTML = cart.length
    ? cart.map((c, i) => `<div class="line"><span class="nm">${esc(c.name)}</span><span class="qty"><button data-action="changeQty" data-i="${i}" data-d="-1">−</button><span>${c.qty}</span><button data-action="changeQty" data-i="${i}" data-d="1">+</button></span><span class="pr">${money(c.qty * c.price)}</span></div>`).join('')
    : '<div class="muted" style="text-align:center;font-size:13px;padding:10px 0">No items yet</div>';
  const t = cartTotals(), rate = Number(state.profile.tax_rate) || 0;
  $('totals').innerHTML = `${rate ? `<div class="r"><span>Subtotal</span><span>${money(t.sub)}</span></div><div class="r"><span>Tax (${rate}%)</span><span>${money(t.tax)}</span></div>` : ''}<div class="r grand"><span>Total</span><b>${money(t.total)}</b></div>`;
}

function addLine(name, price, qty = 1) {
  if (state.posOrder) return toast('Heads up', 'This order came from your POS', '', 'Tap Clear to start a different one');
  price = r2(price);
  const existing = state.cart.find((c) => c.name.toLowerCase() === name.toLowerCase() && c.price === price);
  if (existing) existing.qty += qty; else state.cart.push({ name, price, qty });
  paintCart(); paintTiles();
}

async function smartAdd() {
  const el = $('smart'), text = el.value.trim(); if (!text) return;
  const hint = $('smart-hint');
  hint.innerHTML = '<span class="spin sm"></span> Reading order…';
  const active = state.menu.filter((m) => m.active);
  let res = null;
  if (state.AI) {
    const r = await ai({ mode: 'parse', text, menu: active.map((m) => ({ name: m.name, price: Number(m.price) })) });
    if (r.ai && Array.isArray(r.items)) res = r;
  }
  res ||= localParse(text, active);
  (res.items || []).forEach((i) => { if (i?.name && !isNaN(Number(i.price))) addLine(i.name, Number(i.price), Math.max(1, parseInt(i.qty) || 1)); });
  const n = (res.items || []).reduce((s, i) => s + (parseInt(i.qty) || 1), 0);
  hint.innerHTML = n ? `Added ${n} item${n > 1 ? 's' : ''}. Check the order below.` : "Couldn't match that to the menu. Try the item names.";
  $('unm').innerHTML = res.unmatched?.length ? `<div class="unm">Not on the menu: ${res.unmatched.map(esc).join(', ')}. Add it as a custom item with a price.</div>` : '';
  if (n) el.value = '';
}

let recognizer = null;
function listen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, b = $('micb');
  if (recognizer) { recognizer.stop(); return; }
  recognizer = new SR();
  recognizer.lang = 'en-US'; recognizer.interimResults = true; recognizer.continuous = false;
  b.classList.add('rec');
  $('smart-hint').textContent = 'Listening… say the order.';
  recognizer.onresult = (e) => { $('smart').value = [...e.results].map((r) => r[0].transcript).join(' '); };
  recognizer.onerror = (e) => { $('smart-hint').textContent = e.error === 'not-allowed' ? 'Microphone blocked. Allow it in browser settings, or use keyboard dictation.' : "Didn't catch that. Try again."; };
  recognizer.onend = () => { b.classList.remove('rec'); recognizer = null; if ($('smart').value.trim()) smartAdd(); };
  recognizer.start();
}

async function codeInput(el) {
  const i = +el.dataset.i;
  el.value = el.value.replace(/\D/g, '').slice(-1);
  if (el.value && i < 3) $('c' + (i + 1)).focus();
  const code = readCode();
  $('who').innerHTML = '';
  if ($('usual')) $('usual').innerHTML = '';
  if (code.length === 4) {
    const { data } = await sb.rpc('find_customer_by_code', { p_code: code });
    if (readCode() !== code) return;   // digits changed while we were looking up
    $('who').innerHTML = data?.length ? `Sending to <b>${esc(data[0].first_name || 'customer')}</b>` : `<span style="color:var(--red)">No customer with code ${code}</span>`;
    if (data?.length) showUsual(data[0]);
  }
}

async function sendReceipt(btn) {
  const code = readCode(), p = state.profile;
  if (!state.cart.length) return toast('Heads up', 'Add at least one item');
  if (code.length < 4) return toast('Heads up', "Enter the customer's 4-digit code");
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const { data: found, error: lookupErr } = await sb.rpc('find_customer_by_code', { p_code: code });
    if (lookupErr) throw lookupErr;
    if (!found?.length) { toast('Not found', 'No customer with code ' + code, '', 'Double-check the digits'); btn.disabled = false; btn.textContent = 'Send receipt'; return; }
    const customer = found[0], t = cartTotals();
    const items = state.cart.map((i) => (i.qty > 1 ? i.qty + '× ' : '') + i.name).join(', ');
    const { error } = await sb.from('receipts').insert({
      customer_id: customer.id, merchant_id: p.id, merchant_name: p.full_name,
      items, amount: t.total, subtotal: t.sub, tax: t.tax, line_items: state.cart,
      category: p.business_type === 'restaurant' ? 'Dining' : guessCat(p.full_name, items),
      customer_code: code, carbon: 0,
    });
    if (error) throw error;
    if (state.posOrder) {
      const id = state.posOrder.id;
      await sb.from('pos_orders').update({ status: 'sent' }).eq('id', id);
      state.posOrders = state.posOrders.filter((x) => x.id !== id);
      state.posOrder = null;
    }
    btn.closest('.card').innerHTML = `<div class="ok"><div class="si">✅</div><div class="st">Receipt delivered</div>
      <div class="ss">${money(t.total)} sent to <b style="color:var(--mint)">${esc(customer.first_name || code)}</b> (${code}).<br>It's on their phone now. No paper printed.</div>
      <button class="btn" style="margin-top:18px" data-action="nextCustomer">Next customer</button></div>`;
    state.cart = [];
    loadSent(); paintPosOrders();
  } catch (e) {
    toast('Error', 'Could not send', '', e.message || 'Try again');
    btn.disabled = false; btn.textContent = 'Send receipt';
  }
}

async function loadSent() {
  const { data } = await sb.from('receipts').select('*').eq('merchant_id', state.profile.id).order('created_at', { ascending: false }).limit(6);
  const b = $('sent'); if (!b) return;
  b.innerHTML = data?.length
    ? data.map((r) => `<div class="rrow"><div class="ricon mono" style="font-size:12px;color:var(--mint)">${esc(r.customer_code || '••••')}</div><div class="rinfo"><div class="rname">${esc(r.items || 'Receipt')}</div><div class="rmeta">${timeAgo(r.created_at)}</div></div><div class="ramt">${money(r.amount)}</div></div>`).join('')
    : '<div class="empty" style="padding:12px">Receipts you send show here.</div>';
}

registerActions({
  smartAdd, listen, codeInput, sendReceipt, loadPosOrder, dismissPosOrder, unloadPosOrder,
  addUsual: () => { (state.usual || []).forEach((m) => addLine(m.name, Number(m.price))); $('usual').innerHTML = ''; },
  pickCategory: (el) => { state.menuCat = el.dataset.c; el.parentNode.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === el)); paintTiles(); },
  addMenuItem: (el) => { const m = state.menu.find((x) => x.id === el.dataset.id); if (m) addLine(m.name, Number(m.price)); },
  addCustom: () => { const n = $('cname').value.trim(), pr = parseFloat($('cprice').value); if (!n || isNaN(pr)) return; addLine(n, pr); $('cname').value = ''; $('cprice').value = ''; },
  changeQty: (el) => { const i = +el.dataset.i; state.cart[i].qty += +el.dataset.d; if (state.cart[i].qty <= 0) state.cart.splice(i, 1); paintCart(); paintTiles(); },
  codeKey: (el, e) => { const i = +el.dataset.i; if (e.key === 'Backspace' && !el.value && i > 0) $('c' + (i - 1)).focus(); },
  nextCustomer: () => { state.cart = []; state.posOrder = null; renderRegister(); },
  goMenu: () => openTab('menu'),
});
