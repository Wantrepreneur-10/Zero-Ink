// Pure mapping from Square API objects to Zero Ink shapes. No network, so it is unit-tested (tests/square.test.mjs).

const cents = (m) => Math.round(Number(m?.amount ?? 0)) / 100;

/** Square Order → { external_id, items, subtotal, tax, total, note, customer_code } */
export function mapSquareOrder(order) {
  const items = (order.line_items || [])
    .map((li) => {
      const qty = Math.max(1, Math.round(Number(li.quantity) || 1));
      const base = li.name || 'Item';
      const name = li.variation_name && !/^regular$/i.test(li.variation_name) ? `${base} (${li.variation_name})` : base;
      // gross_sales_money covers modifiers; fall back to the base price.
      const gross = li.gross_sales_money ? cents(li.gross_sales_money) : cents(li.base_price_money) * qty;
      return { name: name.slice(0, 80), qty, price: Math.round((gross / qty) * 100) / 100 };
    })
    .filter((i) => i.name);

  const total = cents(order.total_money);
  const tax = cents(order.total_tax_money);
  const tip = cents(order.total_tip_money);
  const discount = cents(order.total_discount_money);
  const notes = [];
  if (discount) notes.push(`Discount $${discount.toFixed(2)}`);
  if (tip) notes.push(`Tip $${tip.toFixed(2)}`);

  return {
    external_id: 'sq_' + order.id,
    items,
    subtotal: Math.round((total - tax - tip) * 100) / 100,
    tax,
    total,
    note: notes.join(' · ') || null,
    customer_code: findCode(order),
  };
}

/**
 * A cashier can put the customer's Zero Ink code on the Square ticket so the receipt is delivered with no extra tap.
 * Accepted in the ticket name, order note, reference or any line-item note: "ZI 1360", "zi1360", "#1360", or just "1360".
 */
export function findCode(order) {
  const fields = [order.ticket_name, order.note, order.reference_id, ...(order.line_items || []).map((li) => li.note)]
    .filter(Boolean).map(String);
  for (const f of fields) {
    const tagged = f.match(/(?:\bzi\s*[-:#]?\s*|#)(\d{4})\b/i);
    if (tagged) return tagged[1];
  }
  for (const f of fields) {
    if (/^\s*\d{4}\s*$/.test(f)) return f.trim();
  }
  return null;
}

/** Square catalog objects → [{ name, price, category }] */
export function mapSquareCatalog(objects) {
  const cats = {};
  for (const o of objects || []) if (o.type === 'CATEGORY') cats[o.id] = o.category_data?.name;
  const out = [];
  for (const o of objects || []) {
    if (o.type !== 'ITEM' || o.is_deleted) continue;
    const d = o.item_data || {};
    const catId = d.categories?.[0]?.id || d.reporting_category?.id || d.category_id;
    const category = cats[catId] || 'Other';
    const vars = (d.variations || []).filter((v) => !v.is_deleted && v.item_variation_data?.price_money);
    for (const v of vars) {
      const vn = v.item_variation_data.name;
      const name = vars.length > 1 && vn && !/^regular$/i.test(vn) ? `${d.name} (${vn})` : d.name;
      if (name) out.push({ name: name.slice(0, 80), price: cents(v.item_variation_data.price_money), category });
    }
  }
  return out;
}

/** Is this webhook event a completed payment we should turn into a receipt? */
export function completedPayment(event) {
  if (!/^payment\.(updated|created)$/.test(event?.type || '')) return null;
  const p = event.data?.object?.payment;
  if (!p || p.status !== 'COMPLETED' || !p.order_id) return null;
  return { merchantId: event.merchant_id, orderId: p.order_id };
}
