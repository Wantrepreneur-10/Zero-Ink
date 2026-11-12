import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapSquareOrder, mapSquareCatalog, findCode, completedPayment } from '../supabase/functions/square/mapping.js';

const money = (amount) => ({ amount, currency: 'USD' });
const ORDER = {
  id: 'ORD123',
  line_items: [
    { name: 'Masala Dosa', quantity: '2', base_price_money: money(1200), gross_sales_money: money(2400) },
    { name: 'Lassi', variation_name: 'Mango', quantity: '1', base_price_money: money(500), gross_sales_money: money(500) },
    { name: 'Naan', variation_name: 'Regular', quantity: '1', base_price_money: money(400), gross_sales_money: money(550) }, // +modifier
  ],
  total_tax_money: money(285), total_tip_money: money(300), total_money: money(4035),
};

test('order: items, modifiers, tax, tip and totals', () => {
  const o = mapSquareOrder(ORDER);
  assert.equal(o.external_id, 'sq_ORD123');
  assert.deepEqual(o.items, [
    { name: 'Masala Dosa', qty: 2, price: 12 },
    { name: 'Lassi (Mango)', qty: 1, price: 5 },
    { name: 'Naan', qty: 1, price: 5.5 },
  ]);
  assert.equal(o.tax, 2.85);
  assert.equal(o.total, 40.35);
  assert.equal(o.subtotal, 34.5);
  assert.equal(o.note, 'Tip $3.00');
  assert.equal(o.customer_code, null);
});

test('customer code is read from the ticket, note or reference', () => {
  assert.equal(findCode({ ticket_name: 'ZI 1360' }), '1360');
  assert.equal(findCode({ note: 'no onions zi1360' }), '1360');
  assert.equal(findCode({ reference_id: '#4193' }), '4193');
  assert.equal(findCode({ ticket_name: '1360' }), '1360');
  assert.equal(findCode({ line_items: [{ note: 'ZI-5287' }] }), '5287');
});

test('ordinary numbers are not mistaken for a code', () => {
  assert.equal(findCode({ ticket_name: 'Table 12' }), null);
  assert.equal(findCode({ note: 'call 5551234567' }), null);
  assert.equal(findCode({ note: 'order 20261 extra spicy' }), null);
  assert.equal(findCode({}), null);
});

test('catalog: categories, variations, deleted items', () => {
  const items = mapSquareCatalog([
    { type: 'CATEGORY', id: 'C1', category_data: { name: 'Dosa' } },
    { type: 'ITEM', id: 'I1', item_data: { name: 'Masala Dosa', categories: [{ id: 'C1' }], variations: [{ item_variation_data: { name: 'Regular', price_money: money(1200) } }] } },
    { type: 'ITEM', id: 'I2', item_data: { name: 'Lassi', variations: [
      { item_variation_data: { name: 'Mango', price_money: money(500) } }, { item_variation_data: { name: 'Sweet', price_money: money(450) } }] } },
    { type: 'ITEM', id: 'I3', is_deleted: true, item_data: { name: 'Old', variations: [{ item_variation_data: { price_money: money(100) } }] } },
    { type: 'ITEM', id: 'I4', item_data: { name: 'Market price fish', variations: [{ item_variation_data: { name: 'Regular' } }] } },
  ]);
  assert.deepEqual(items, [
    { name: 'Masala Dosa', price: 12, category: 'Dosa' },
    { name: 'Lassi (Mango)', price: 5, category: 'Other' },
    { name: 'Lassi (Sweet)', price: 4.5, category: 'Other' },
  ]);
});

test('only completed payments with an order become receipts', () => {
  const ev = (status, order_id = 'O1') => ({ type: 'payment.updated', merchant_id: 'M1', data: { object: { payment: { status, order_id } } } });
  assert.deepEqual(completedPayment(ev('COMPLETED')), { merchantId: 'M1', orderId: 'O1' });
  assert.equal(completedPayment(ev('APPROVED')), null);
  assert.equal(completedPayment(ev('COMPLETED', null)), null);
  assert.equal(completedPayment({ type: 'order.updated' }), null);
});
