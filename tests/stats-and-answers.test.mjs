import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, rangeStart, localInsights } from '../app/js/lib/stats.js';
import { localAnswer } from '../app/js/lib/answer.js';
import { guessCat } from '../app/js/lib/categories.js';

const NOW = new Date(2026, 10, 6, 20, 0); // Fri Nov 6 2026, 8pm local
const at = (d, h) => new Date(2026, 10, d, h, 15).toISOString();

const SALES = [
  { customer_id: 'a', amount: 30, created_at: at(6, 19), line_items: [{ name: 'Masala Dosa', qty: 2 }, { name: 'Mango Lassi', qty: 1 }] },
  { customer_id: 'a', amount: 20, created_at: at(6, 12), line_items: [{ name: 'Masala Dosa', qty: 1 }] },
  { customer_id: 'b', amount: 10, created_at: at(6, 19), line_items: [{ name: 'Idli', qty: 1 }] },
  { customer_id: 'c', amount: 40, created_at: at(5, 19), line_items: [] }, // yesterday = previous period for "today"
];

test('today stats: revenue, tickets, repeat customers, top item, peak hour, change vs yesterday', () => {
  const { from } = rangeStart('today', NOW);
  const s = computeStats(SALES, from);
  assert.equal(s.revenue, 60);
  assert.equal(s.count, 3);
  assert.equal(s.avgTicket, 20);
  assert.equal(s.uniqueCustomers, 2);
  assert.equal(s.repeatCustomers, 1);
  assert.deepEqual(s.topItems[0], ['Masala Dosa', 3]);
  assert.equal(s.peakHour, 19);
  assert.equal(s.delta, 50); // 60 vs 40
  assert.match(localInsights(s, 'today'), /Masala Dosa is your top seller/);
});

const MINE = [
  { merchant_name: 'Naan and Dosa', amount: 31.39, created_at: at(6, 19), category: 'Dining' },
  { merchant_name: 'Blue Stone Coffee', amount: 4.5, created_at: at(3, 9) },
  { merchant_name: 'Naan and Dosa', amount: 22, created_at: new Date(2026, 9, 20, 19).toISOString(), category: 'Dining' },
];

test('answers: store, month, category, biggest, count', () => {
  assert.match(localAnswer('How much at Naan and Dosa?', MINE, NOW), /\$53\.39 at Naan and Dosa/);
  assert.match(localAnswer('What did I spend this month?', MINE, NOW), /\$35\.89 this month across 2 receipts/);
  assert.match(localAnswer('coffee this month', MINE, NOW), /\$4\.50 .*this month/);
  assert.match(localAnswer('biggest purchase?', MINE, NOW), /\$31\.39 at Naan and Dosa/);
  assert.match(localAnswer('how many times at naan and dosa last month', MINE, NOW), /^1 receipt at Naan and Dosa last month/);
  assert.match(localAnswer('spent on fuel today', MINE, NOW), /don't see any/);
});

test('category guessing', () => {
  assert.equal(guessCat('Naan and Dosa'), 'Dining');
  assert.equal(guessCat('Blue Stone Coffee'), 'Coffee');
  assert.equal(guessCat('Shell'), 'Fuel');
  assert.equal(guessCat('Random LLC'), 'Other');
});
