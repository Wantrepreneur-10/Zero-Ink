// Zero Ink × Square — Supabase Edge Function.
//
//  App (signed-in business)  POST { action: 'status' | 'start' | 'sync_menu' | 'disconnect' }
//  Square OAuth redirect     GET  ?code=…&state=…
//  Square webhooks           POST with x-square-hmacsha256-signature   (payment.updated)
//
// Secrets: SQUARE_APP_ID, SQUARE_APP_SECRET, SQUARE_WEBHOOK_SIGNATURE_KEY, SQUARE_ENV (sandbox | production),
//          APP_URL (optional, default https://getzeroink.com/app/)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { mapSquareOrder, mapSquareCatalog, completedPayment } from './mapping.js';

const ENV = (Deno.env.get('SQUARE_ENV') || 'sandbox').toLowerCase();
const SQ = ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
const APP_ID = Deno.env.get('SQUARE_APP_ID') || '';
const APP_SECRET = Deno.env.get('SQUARE_APP_SECRET') || '';
const SIG_KEY = Deno.env.get('SQUARE_WEBHOOK_SIGNATURE_KEY') || '';
const APP_URL = Deno.env.get('APP_URL') || 'https://getzeroink.com/app/';
const SELF_URL = Deno.env.get('SUPABASE_URL') + '/functions/v1/square';
const SQ_VERSION = '2025-01-23';
const SCOPES = 'ORDERS_READ PAYMENTS_READ ITEMS_READ MERCHANT_PROFILE_READ';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const back = (q: string) => new Response(null, { status: 302, headers: { Location: `${APP_URL}?square=${q}` } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const enc = new TextEncoder();

async function hmac(key: string, msg: string, out: 'hex' | 'base64') {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
  return out === 'hex' ? [...sig].map((b) => b.toString(16).padStart(2, '0')).join('') : btoa(String.fromCharCode(...sig));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// OAuth state = merchantId.timestamp.signature, so the callback can trust who started the flow.
async function makeState(merchantId: string) { const p = `${merchantId}.${Date.now()}`; return `${p}.${await hmac(APP_SECRET, p, 'hex')}`; }
async function readState(state: string) {
  const [id, ts, sig] = (state || '').split('.');
  if (!id || !ts || !sig || !safeEqual(sig, await hmac(APP_SECRET, `${id}.${ts}`, 'hex'))) return null;
  return Date.now() - Number(ts) < 15 * 60 * 1000 ? id : null;
}

async function sq(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(SQ + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Square-Version': SQ_VERSION, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.errors?.[0]?.detail || `Square ${r.status}`);
  return d;
}

async function tokenFor(conn: any) {
  // Square access tokens last 30 days; refresh when under a week is left.
  if (!conn.refresh_token || !conn.expires_at || new Date(conn.expires_at).getTime() - Date.now() > 7 * 864e5) return conn.access_token;
  const r = await fetch(SQ + '/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Square-Version': SQ_VERSION },
    body: JSON.stringify({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: 'refresh_token', refresh_token: conn.refresh_token }) });
  const d = await r.json();
  if (!r.ok || !d.access_token) return conn.access_token;
  await admin.from('square_connections').update({ access_token: d.access_token, refresh_token: d.refresh_token || conn.refresh_token, expires_at: d.expires_at }).eq('merchant_id', conn.merchant_id);
  return d.access_token;
}

async function userId(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user?.id ?? null;
}

async function syncMenu(conn: any) {
  const token = await tokenFor(conn);
  const objects: any[] = [];
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const d = await sq(`/v2/catalog/list?types=ITEM,CATEGORY${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, token);
    objects.push(...(d.objects || []));
    if (!d.cursor) break;
    cursor = d.cursor;
  }
  const items = mapSquareCatalog(objects).slice(0, 500);
  const { data: existing } = await admin.from('menu_items').select('id, name').eq('merchant_id', conn.merchant_id);
  const byName = new Map((existing || []).map((m) => [m.name.toLowerCase(), m.id]));
  let added = 0, updated = 0;
  for (const it of items) {
    const id = byName.get(it.name.toLowerCase());
    if (id) { await admin.from('menu_items').update({ price: it.price, category: it.category, active: true }).eq('id', id); updated++; }
    else { await admin.from('menu_items').insert({ merchant_id: conn.merchant_id, ...it }); added++; byName.set(it.name.toLowerCase(), 'new'); }
  }
  return { added, updated };
}

async function handleWebhook(req: Request, raw: string) {
  const given = req.headers.get('x-square-hmacsha256-signature') || '';
  if (!SIG_KEY || !safeEqual(given, await hmac(SIG_KEY, SELF_URL + raw, 'base64'))) return json({ error: 'bad signature' }, 401);
  const hit = completedPayment(JSON.parse(raw));
  if (!hit) return json({ ok: true, ignored: true });

  const { data: conn } = await admin.from('square_connections').select('*').eq('square_merchant_id', hit.merchantId).maybeSingle();
  if (!conn) return json({ ok: true, ignored: 'unknown merchant' });
  const { order } = await sq(`/v2/orders/${hit.orderId}`, await tokenFor(conn));
  const o = mapSquareOrder(order);
  if (!o.items.length) return json({ ok: true, ignored: 'no line items' });

  let customer: { id: string } | null = null;
  if (o.customer_code) {
    const { data } = await admin.from('profiles').select('id').eq('code', o.customer_code).maybeSingle();
    customer = data;
  }
  const { error } = await admin.from('pos_orders').insert({
    merchant_id: conn.merchant_id, source: 'square', external_id: o.external_id, items: o.items,
    subtotal: o.subtotal, tax: o.tax, total: o.total, note: o.note, status: customer ? 'sent' : 'pending',
  });
  if (error) return error.code === '23505' ? json({ ok: true, duplicate: true }) : json({ error: error.message }, 500);

  if (customer) {
    const { data: m } = await admin.from('profiles').select('full_name').eq('id', conn.merchant_id).single();
    await admin.from('receipts').insert({
      customer_id: customer.id, merchant_id: conn.merchant_id, merchant_name: m?.full_name || conn.business_name || 'Receipt',
      items: o.items.map((i: any) => (i.qty > 1 ? i.qty + '× ' : '') + i.name).join(', '),
      amount: o.total, subtotal: o.subtotal, tax: o.tax, line_items: o.items, category: 'Dining', customer_code: o.customer_code, carbon: 0,
    });
  }
  return json({ ok: true, delivered: !!customer });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const configured = !!(APP_ID && APP_SECRET);

  try {
    // ---- OAuth redirect from Square ----
    if (req.method === 'GET') {
      if (!configured) return back('not_configured');
      if (url.searchParams.get('error')) return back('denied');
      const merchantId = await readState(url.searchParams.get('state') || '');
      const code = url.searchParams.get('code');
      if (!merchantId || !code) return back('error');
      const r = await fetch(SQ + '/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Square-Version': SQ_VERSION },
        body: JSON.stringify({ client_id: APP_ID, client_secret: APP_SECRET, code, grant_type: 'authorization_code', redirect_uri: SELF_URL }) });
      const t = await r.json();
      if (!r.ok || !t.access_token) return back('error');
      let name = null;
      try { name = (await sq('/v2/merchants/me', t.access_token)).merchant?.business_name ?? null; } catch { /* name is optional */ }
      const { error } = await admin.from('square_connections').upsert({
        merchant_id: merchantId, square_merchant_id: t.merchant_id, business_name: name,
        access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, connected_at: new Date().toISOString(),
      });
      return back(error ? 'error' : 'connected');
    }

    const raw = await req.text();
    if (req.headers.has('x-square-hmacsha256-signature')) return await handleWebhook(req, raw);

    // ---- calls from the signed-in app ----
    const uid = await userId(req);
    if (!uid) return json({ error: 'Sign in first' }, 401);
    const body = raw ? JSON.parse(raw) : {};
    const { data: conn } = await admin.from('square_connections').select('*').eq('merchant_id', uid).maybeSingle();

    if (body.action === 'status') {
      return json({ configured, env: ENV, connected: !!conn, business_name: conn?.business_name ?? null, connected_at: conn?.connected_at ?? null });
    }
    if (!configured) return json({ configured: false, error: 'Square is not set up on the server yet' }, 400);

    if (body.action === 'start') {
      const { data: p } = await admin.from('profiles').select('is_merchant').eq('id', uid).maybeSingle();
      if (!p?.is_merchant) return json({ error: 'Business accounts only' }, 403);
      const q = new URLSearchParams({ client_id: APP_ID, scope: SCOPES, session: 'false', state: await makeState(uid), redirect_uri: SELF_URL });
      return json({ url: `${SQ}/oauth2/authorize?${q}` });
    }
    if (!conn) return json({ error: 'Square is not connected' }, 400);
    if (body.action === 'sync_menu') return json({ ok: true, ...(await syncMenu(conn)) });
    if (body.action === 'disconnect') {
      await fetch(SQ + '/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Square-Version': SQ_VERSION, Authorization: `Client ${APP_SECRET}` },
        body: JSON.stringify({ client_id: APP_ID, access_token: conn.access_token }) }).catch(() => {});
      await admin.from('square_connections').delete().eq('merchant_id', uid);
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
