// Merchant menu: add/edit/remove items, AI menu-photo scan.
import { sb } from '../../lib/supabase.js';
import { state } from '../../state.js';
import { $, esc, money, r2, toast, icons } from '../../lib/utils.js';
import { registerActions } from '../../lib/actions.js';
import { ai, aiChip } from '../../lib/ai.js';
import { loadMenu } from './register.js';

export async function renderMenu() {
  await loadMenu();
  const groups = {};
  state.menu.forEach((m) => { (groups[m.category || 'Other'] ??= []).push(m); });
  const n = state.menu.length;

  $('view').innerHTML = `
    <div class="top"><div class="top-title">Menu<div class="top-sub">${n} item${n === 1 ? '' : 's'}</div></div>${aiChip()}</div>
    <div class="card ai-card">
      <div class="card-t">${icons.spark} Scan a menu photo</div>
      <div class="muted" style="font-size:13px;margin-bottom:10px">Snap your printed menu. AI reads every item and price so you don't type them.</div>
      <button class="btn" style="background:var(--violet)" data-action="scanMenu">Take or choose photo</button>
      <div id="scan"></div>
    </div>
    <div class="card">
      <div class="card-t">Add item</div>
      <div class="addrow" style="margin:0"><input class="inp" id="nn" placeholder="Name" style="flex:1"><input class="inp pr" id="np" placeholder="Price" inputmode="decimal"></div>
      <div class="addrow"><input class="inp" id="nc" placeholder="Category (e.g. Dosa)" style="flex:1" list="catlist" data-enter="newItem"><button data-action="newItem">+</button></div>
      <datalist id="catlist">${Object.keys(groups).map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
    </div>
    <div class="card"><div class="card-t">Items<span class="sp"></span><span class="muted" style="font-size:12px;font-family:var(--fb);font-weight:500">Edits save automatically</span></div>
      ${n ? Object.entries(groups).map(([c, list]) => `<div class="cathead">${esc(c)}</div>` + list.map((m) => `
        <div class="mrow"><input class="inp nm" value="${esc(m.name)}" data-change="updateItem" data-id="${m.id}" data-k="name">
        <input class="inp pr" value="${r2(m.price).toFixed(2)}" inputmode="decimal" data-change="updateItem" data-id="${m.id}" data-k="price">
        <button class="x" data-action="deleteItem" data-id="${m.id}" aria-label="Remove">×</button></div>`).join('')).join('')
        : '<div class="empty">No items yet.</div>'}
    </div>`;
}

async function newItem() {
  const name = $('nn').value.trim(), price = parseFloat($('np').value), category = $('nc').value.trim() || 'Other';
  if (!name || isNaN(price)) return toast('Heads up', 'Enter a name and a price');
  const { error } = await sb.from('menu_items').insert({ merchant_id: state.profile.id, name, price: r2(price), category });
  if (error) return toast('Error', 'Could not save', '', error.message);
  renderMenu();
}

async function updateItem(el) {
  const k = el.dataset.k, val = k === 'price' ? r2(parseFloat(el.value)) : el.value.trim();
  if (k === 'price' && isNaN(val)) return;
  if (k === 'name' && !val) return;
  const { error } = await sb.from('menu_items').update({ [k]: val }).eq('id', el.dataset.id);
  if (error) return toast('Error', 'Could not save', '', error.message);
  const m = state.menu.find((x) => x.id === el.dataset.id); if (m) m[k] = val;
}

async function deleteItem(el) {
  if (!confirm('Remove this item from the menu?')) return;
  await sb.from('menu_items').delete().eq('id', el.dataset.id);
  renderMenu();
}

/** Downscale a photo to keep the upload small. Returns base64 JPEG without the data: prefix. */
function shrink(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Could not open that image'));
    img.src = URL.createObjectURL(file);
  });
}

export function initMenuScan() {
  $('menu-photo').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const box = $('scan');
    box.innerHTML = '<div class="hint"><span class="spin sm"></span> Reading your menu… (10–20 sec)</div>';
    try {
      const r = await ai({ mode: 'menu_scan', image: await shrink(f, 1600), media_type: 'image/jpeg' });
      if (!r.ai || !r.items?.length) { box.innerHTML = '<div class="unm">Couldn\'t read items from that photo. Try a sharper, well-lit shot of one page.</div>'; return; }
      state.scan = r.items.filter((i) => i.name && !isNaN(Number(i.price)));
      box.innerHTML = `<div class="hint" style="margin-bottom:6px">Found <b>${state.scan.length}</b> items. Review, then save.</div>`
        + state.scan.map((i) => `<div class="line"><span class="nm">${esc(i.name)} <span class="muted" style="font-size:12px">${esc(i.category || '')}</span></span><span class="pr">${money(i.price)}</span></div>`).join('')
        + `<button class="btn" data-action="saveScan">Add all ${state.scan.length} to menu</button>`;
    } catch (err) {
      box.innerHTML = `<div class="unm">${esc(err.message || err)}</div>`;
    }
  });
}

async function saveScan() {
  const rows = state.scan.map((i) => ({ merchant_id: state.profile.id, name: String(i.name).slice(0, 80), price: r2(i.price), category: i.category || 'Other' }));
  const { error } = await sb.from('menu_items').insert(rows);
  if (error) return toast('Error', 'Could not save', '', error.message);
  toast('Menu updated', rows.length + ' items added', '', 'Your register is ready');
  renderMenu();
}

registerActions({
  newItem, updateItem, deleteItem, saveScan,
  scanMenu: () => (state.AI ? $('menu-photo').click() : toast('AI off', 'Menu scan needs AI turned on', '', 'Add items by hand below for now')),
});
