// Profile (customers) / Settings (businesses).
import { sb } from '../lib/supabase.js';
import { state } from '../state.js';
import { $, esc, toast } from '../lib/utils.js';
import { registerActions } from '../lib/actions.js';
import { aiChip } from '../lib/ai.js';
import { SUPABASE_URL } from '../config.js';

const POS_URL = SUPABASE_URL + '/functions/v1/pos';

export function renderSettings() {
  const p = state.profile, biz = p.is_merchant;
  const initials = (p.full_name || 'U').split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  $('view').innerHTML = `
    <div class="top"><div class="top-title">${biz ? 'Settings' : 'Profile'}</div>${aiChip()}</div>
    <div class="card">
      <div class="pf-ava">${esc(initials)}</div>
      <div class="pf-name">${esc(p.full_name || 'Member')}</div>
      <div class="pf-email">${esc(p.email || '')}</div>
      ${biz ? `
        <div class="field"><label>Business name (shown on receipts)</label><input class="inp" id="bn" value="${esc(p.full_name || '')}"></div>
        <div class="field"><label>Sales tax %</label><input class="inp" id="tx" inputmode="decimal" value="${Number(p.tax_rate) || 0}"></div>
        <button class="btn" data-action="saveSettings">Save</button>` : `
        <div class="pf-row"><div class="nm">Your code</div><div class="vl">${esc(p.code)}</div></div>
        <div class="field" style="margin-top:12px"><label>Your name</label><input class="inp" id="bn" value="${esc(p.full_name || '')}"></div>
        <button class="btn ghost" data-action="saveSettings">Save name</button>`}
    </div>
    ${biz ? '<div class="card" id="sqcard"></div><div class="card" id="poscard"></div>' : ''}
    <div class="card">
      <div class="pf-row"><div class="nm">Account type</div><div class="vl" style="color:var(--t2)">${biz ? 'Business' : 'Customer'}</div></div>
      <div class="pf-row"><div class="nm">AI features</div><div class="vl" style="color:${state.AI ? 'var(--violet)' : 'var(--t2)'}">${state.AI ? 'On (Claude)' : 'Smart mode'}</div></div>
      <div class="pf-row"><div class="nm">Add to Home Screen</div><div class="vl" style="color:var(--t2);font-family:var(--fb);font-size:13px">Share → Add to Home Screen</div></div>
      <button class="btn-out" data-action="signOut">Sign out</button>
    </div>
    <div class="muted" style="text-align:center;font-size:11px">Zero Ink · getzeroink.com</div>`;
  if (biz) { paintSquareCard(); paintPosCard(); }
}

/* ---------- Square ---------- */
const SQ_LOGO = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="8.5" y="8.5" width="7" height="7" rx="1.6" fill="currentColor"/></svg>';

async function square(action) {
  const { data, error } = await sb.functions.invoke('square', { body: { action } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch {}
    return { error: msg };
  }
  return data || {};
}

async function paintSquareCard() {
  const box = $('sqcard'); if (!box) return;
  box.innerHTML = `<div class="card-t">${SQ_LOGO} Square</div><div class="hint"><span class="spin sm"></span> Checking…</div>`;
  const s = await square('status');
  if (!box.isConnected) return;
  const head = (label, on) => `<div class="card-t">${SQ_LOGO} Square<span class="sp"></span><span class="aichip fixed" style="${on ? 'color:var(--mint);border-color:var(--mglow);background:var(--mdim)' : ''}"><i style="${on ? 'background:var(--mint);box-shadow:0 0 8px var(--mint)' : ''}"></i>${label}</span></div>`;
  if (s.connected) {
    box.innerHTML = `${head('Connected', true)}
      <div class="muted" style="font-size:13px;margin-bottom:12px">Linked to <b style="color:var(--t1)">${esc(s.business_name || 'your Square account')}</b>${s.env === 'sandbox' ? ' (test mode)' : ''}. Every sale you ring up on Square now appears in the Register, ready to send.</div>
      <button class="btn" data-action="squareSyncMenu">Import menu from Square</button>
      <button class="btn ghost" data-action="squareDisconnect">Disconnect Square</button>
      <div class="hint"><b>Skip the tap:</b> type the customer's code as the ticket name or note on Square (for example <b>ZI 1360</b>) and the receipt goes to their phone the moment they pay.</div>`;
  } else if (s.configured) {
    box.innerHTML = `${head('Not connected', false)}
      <div class="muted" style="font-size:13px;margin-bottom:12px">Use Square at your counter? Link it once. Your menu comes across, and every sale shows up here by itself. No retyping orders.</div>
      <button class="btn" data-action="squareConnect">Connect Square</button>
      <div class="hint">You'll sign in on Square's own page and approve read-only access to orders, payments and your item list. Zero Ink can't take payments or change anything in Square.</div>`;
  } else {
    box.innerHTML = `${head('Coming soon', false)}
      <div class="muted" style="font-size:13px">The Square link is built and waiting to be switched on for this pilot. Until then, use "Send a test order" below to see how POS orders arrive.</div>`;
  }
}

async function squareConnect(btn) {
  btn.disabled = true; btn.textContent = 'Opening Square…';
  const r = await square('start');
  if (r.url) { location.href = r.url; return; }
  btn.disabled = false; btn.textContent = 'Connect Square';
  toast('Error', 'Could not start the Square link', '', r.error || 'Try again');
}

async function squareSyncMenu(btn) {
  btn.disabled = true; btn.textContent = 'Importing…';
  const r = await square('sync_menu');
  btn.disabled = false; btn.textContent = 'Import menu from Square';
  if (r.error) return toast('Error', 'Could not import the menu', '', r.error);
  state.menu = [];
  toast('Menu imported', `${r.added} new, ${r.updated} updated`, '', 'Open the Register to see your items');
}

async function squareDisconnect() {
  if (!confirm('Disconnect Square? Sales will stop appearing in Zero Ink.')) return;
  const r = await square('disconnect');
  if (r.error) return toast('Error', 'Could not disconnect', '', r.error);
  paintSquareCard();
}

/* ---------- Connect your POS ---------- */
async function paintPosCard() {
  const box = $('poscard'); if (!box) return;
  const { data } = await sb.from('merchant_keys').select('created_at').eq('merchant_id', state.profile.id).maybeSingle();
  if (!box.isConnected) return;
  const key = state.posKey;
  box.innerHTML = `
    <div class="card-t">Other POS systems<span class="sp"></span><span class="aichip ${data ? 'on' : ''} fixed" style="${data ? 'color:var(--mint);border-color:var(--mglow);background:var(--mdim)' : ''}"><i style="${data ? 'background:var(--mint);box-shadow:0 0 8px var(--mint)' : ''}"></i>${data ? 'Key active' : 'Not connected'}</span></div>
    <div class="muted" style="font-size:13px;margin-bottom:12px">Your POS sends each order here. It shows up in the Register ready to send, or goes straight to the customer when the POS includes their code. Nothing is typed twice.</div>
    ${key ? `<div class="lbl">Your connection key (shown once, copy it now)</div><div class="keybox" id="keybox">${esc(key)}</div>
      <button class="btn ghost" data-action="copyPosKey" style="margin-bottom:10px">Copy key</button>
      <div class="lbl">Send orders to</div><div class="keybox">${esc(POS_URL)}</div>
      <div class="lbl" style="margin-top:10px">Example order</div>
      <pre class="keybox" style="white-space:pre-wrap">POST ${esc(POS_URL)}
x-zeroink-key: ${esc(key)}

{ "external_id": "1042",
  "items": [{ "name": "Masala Dosa", "qty": 2, "price": 12 }],
  "tax": 1.98, "total": 25.98,
  "customer_code": "1360" }</pre>` : ''}
    <button class="btn" data-action="testPosOrder">Send a test order</button>
    <button class="btn ghost" data-action="createPosKey">${data ? 'Replace connection key' : 'Create connection key'}</button>
    <div class="hint">The test order appears in your Register in about a second, exactly as a real POS order would.</div>`;
}

async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function createPosKey() {
  const { data: existing } = await sb.from('merchant_keys').select('merchant_id').eq('merchant_id', state.profile.id).maybeSingle();
  if (existing && !confirm('Replace the key? Your POS will stop sending orders until you give it the new one.')) return;
  const key = 'zi_live_' + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const { error } = await sb.from('merchant_keys').upsert({ merchant_id: state.profile.id, key_hash: await sha256(key), created_at: new Date().toISOString() });
  if (error) return toast('Error', 'Could not create the key', '', error.message);
  state.posKey = key;
  paintPosCard();
}

async function testPosOrder(btn) {
  btn.disabled = true;
  const { data: menu } = await sb.from('menu_items').select('name, price').eq('merchant_id', state.profile.id).eq('active', true).limit(40);
  const pool = (menu?.length ? menu : [{ name: 'Test item', price: 10 }]).slice().sort(() => Math.random() - 0.5).slice(0, 3);
  const items = pool.map((m, i) => ({ name: m.name, qty: i === 0 ? 2 : 1, price: Number(m.price) }));
  const sub = items.reduce((s, i) => s + i.qty * i.price, 0), tax = Math.round(sub * (Number(state.profile.tax_rate) || 0)) / 100;
  const { data, error } = await sb.functions.invoke('pos', { body: { source: 'test', external_id: 'TEST-' + Date.now().toString().slice(-5), items, tax, total: Math.round((sub + tax) * 100) / 100 } });
  btn.disabled = false;
  if (error || !data?.ok) return toast('Error', 'Test order failed', '', error?.message || data?.error || 'Try again');
  toast('Test order sent', 'Open the Register to see it', '', 'It is waiting under "From your POS"');
}


async function saveSettings() {
  const upd = { full_name: $('bn').value.trim() || state.profile.full_name };
  if ($('tx')) { const t = parseFloat($('tx').value); upd.tax_rate = isNaN(t) ? 0 : Math.max(0, Math.min(25, t)); }
  const { error } = await sb.from('profiles').update(upd).eq('id', state.profile.id);
  if (error) return toast('Error', 'Could not save', '', error.message);
  Object.assign(state.profile, upd);
  toast('Settings', 'Saved');
  renderSettings();
}

registerActions({
  saveSettings, createPosKey, testPosOrder, squareConnect, squareSyncMenu, squareDisconnect,
  copyPosKey: async () => { try { await navigator.clipboard.writeText(state.posKey); toast('Copied', 'Connection key copied'); } catch { toast('Heads up', 'Select the key and copy it by hand'); } },
});
