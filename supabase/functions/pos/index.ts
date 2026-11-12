// Zero Ink POS bridge — Supabase Edge Function.
// Any till, POS plug-in or script can push orders and menus here with the restaurant's connection key.
//
//   POST /functions/v1/pos      header: x-zeroink-key: zi_live_…
//   { "type": "order", "external_id": "T4-1042", "items": [{ "name": "Masala Dosa", "qty": 2, "price": 12 }],
//     "tax": 1.98, "total": 25.98, "customer_code": "1360" }
//   { "type": "menu", "items": [{ "name": "Masala Dosa", "price": 12, "category": "Dosa" }] }
//
// An order with a valid customer_code is delivered straight to the customer's phone.
// Without one it waits in the restaurant's Register until the cashier types the code.
// The signed-in app can also call this (Authorization: Bearer <user token>) to send a test order.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zeroink-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

async function merchantFor(req: Request): Promise<string | null> {
  const key = req.headers.get('x-zeroink-key');
  if (key) {
    const { data } = await admin.from('merchant_keys').select('merchant_id').eq('key_hash', await sha256(key.trim())).maybeSingle();
    return data?.merchant_id ?? null;
  }
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user?.id ?? null;
}

function cleanItems(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 100).map((i: any) => ({
    name: String(i?.name ?? '').trim().slice(0, 80),
    qty: Math.max(1, Math.min(999, parseInt(i?.qty ?? i?.quantity ?? 1) || 1)),
    price: r2(i?.price ?? i?.unit_price),
  })).filter((i) => i.name && i.price >= 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const merchantId = await merchantFor(req);
  if (!merchantId) return json({ error: 'Invalid or missing connection key' }, 401);
  const { data: merchant } = await admin.from('profiles').select('id, full_name, is_merchant, business_type').eq('id', merchantId).maybeSingle();
  if (!merchant?.is_merchant) return json({ error: 'Not a business account' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Body must be JSON' }, 400); }

  // ---- menu sync ----
  if (body.type === 'menu') {
    const incoming = (Array.isArray(body.items) ? body.items : []).slice(0, 500)
      .map((i: any) => ({ name: String(i?.name ?? '').trim().slice(0, 80), price: r2(i?.price), category: String(i?.category ?? 'Other').trim().slice(0, 40) || 'Other' }))
      .filter((i: any) => i.name);
    if (!incoming.length) return json({ error: 'No menu items' }, 400);
    const { data: existing } = await admin.from('menu_items').select('id, name').eq('merchant_id', merchantId);
    const byName = new Map((existing || []).map((m) => [m.name.toLowerCase(), m.id]));
    let added = 0, updated = 0;
    for (const it of incoming) {
      const id = byName.get(it.name.toLowerCase());
      if (id) { await admin.from('menu_items').update({ price: it.price, category: it.category, active: true }).eq('id', id); updated++; }
      else { await admin.from('menu_items').insert({ merchant_id: merchantId, ...it }); added++; }
    }
    return json({ ok: true, added, updated });
  }

  // ---- order ----
  const items = cleanItems(body.items);
  if (!items.length) return json({ error: 'Order needs at least one item with a name and price' }, 400);
  const subtotal = body.subtotal != null ? r2(body.subtotal) : r2(items.reduce((s, i) => s + i.qty * i.price, 0));
  const tax = r2(body.tax);
  const total = body.total != null ? r2(body.total) : r2(subtotal + tax);
  const externalId = body.external_id != null ? String(body.external_id).slice(0, 80) : null;
  const source = String(body.source || 'pos').slice(0, 30);
  const code = body.customer_code != null ? String(body.customer_code).trim() : '';

  let customer: { id: string } | null = null;
  if (/^\d{4}$/.test(code)) {
    const { data } = await admin.from('profiles').select('id').eq('code', code).maybeSingle();
    customer = data;
  }

  const { data: order, error } = await admin.from('pos_orders').insert({
    merchant_id: merchantId, source, external_id: externalId, items, subtotal, tax, total,
    note: body.note ? String(body.note).slice(0, 120) : null, status: customer ? 'sent' : 'pending',
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return json({ ok: true, duplicate: true, message: 'Order already received' });
    return json({ error: error.message }, 500);
  }

  if (customer) {
    const { error: rErr } = await admin.from('receipts').insert({
      customer_id: customer.id, merchant_id: merchantId, merchant_name: merchant.full_name,
      items: items.map((i) => (i.qty > 1 ? i.qty + '× ' : '') + i.name).join(', '),
      amount: total, subtotal, tax, line_items: items, category: 'Dining', customer_code: code, carbon: 0,
    });
    if (rErr) return json({ error: rErr.message }, 500);
    return json({ ok: true, order_id: order.id, delivered: true });
  }
  return json({ ok: true, order_id: order.id, delivered: false, message: code ? 'No customer with that code. Order is waiting in the Register.' : 'Order is waiting in the Register.' });
});
