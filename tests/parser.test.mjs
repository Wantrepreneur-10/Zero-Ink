import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localParse, scoreItem } from '../app/js/lib/parser.js';

const MENU = [
  ['Masala Dosa', 12], ['Plain Dosa', 10], ['Mysore Masala Dosa', 13], ['Garlic Naan', 4.5], ['Butter Naan', 4],
  ['Mango Lassi', 5], ['Mutton Biryani', 18], ['Chicken Biryani', 16], ['Masala Chai', 3], ['Idli', 7],
].map(([name, price]) => ({ name, price, active: true }));

const names = (r) => r.items.map((i) => `${i.qty}x ${i.name}`);

test('quantities in digits, words and articles', () => {
  const r = localParse('2 masala dosas, a mango lassi and three garlic naan', MENU);
  assert.deepEqual(names(r), ['2x Masala Dosa', '1x Mango Lassi', '3x Garlic Naan']);
});

test('typos and misspellings match the right item', () => {
  const r = localParse('mango lasi, garlic nan, mutton biriyani', MENU);
  assert.deepEqual(names(r), ['1x Mango Lassi', '1x Garlic Naan', '1x Mutton Biryani']);
});

test('more specific item wins over shorter one', () => {
  assert.equal(localParse('mysore masala dosa', MENU).items[0].name, 'Mysore Masala Dosa');
  assert.equal(localParse('masala dosa', MENU).items[0].name, 'Masala Dosa');
  assert.equal(localParse('chicken biryani', MENU).items[0].name, 'Chicken Biryani');
});

test('"x2" suffix', () => {
  assert.deepEqual(names(localParse('idli x2', MENU)), ['2x Idli']);
});

test('unknown item with a price becomes a custom line', () => {
  const r = localParse('extra chutney $1.50', MENU);
  assert.equal(r.items[0].name, 'Extra Chutney');
  assert.equal(r.items[0].price, 1.5);
});

test('unknown item without a price is reported, not invented', () => {
  const r = localParse('pizza', MENU);
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.unmatched, ['pizza']);
});

test('inactive items are ignored', () => {
  const menu = [...MENU, { name: 'Rava Dosa', price: 11, active: false }];
  assert.notEqual(localParse('rava dosa', menu).items[0]?.name, 'Rava Dosa');
});

test('menu prices are used', () => {
  assert.equal(localParse('2 mutton biryani', MENU).items[0].price, 18);
});

test('scoreItem is high for exact, low for unrelated', () => {
  assert.ok(scoreItem('garlic naan', 'Garlic Naan') > 0.95);
  assert.ok(scoreItem('coffee', 'Garlic Naan') < 0.3);
});
