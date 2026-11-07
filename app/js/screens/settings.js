// Profile (customers) / Settings (businesses).
import { sb } from '../lib/supabase.js';
import { state } from '../state.js';
import { $, esc, toast } from '../lib/utils.js';
import { registerActions } from '../lib/actions.js';
import { aiChip } from '../lib/ai.js';

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
    <div class="card">
      <div class="pf-row"><div class="nm">Account type</div><div class="vl" style="color:var(--t2)">${biz ? 'Business' : 'Customer'}</div></div>
      <div class="pf-row"><div class="nm">AI features</div><div class="vl" style="color:${state.AI ? 'var(--violet)' : 'var(--t2)'}">${state.AI ? 'On (Claude)' : 'Smart mode'}</div></div>
      <div class="pf-row"><div class="nm">Add to Home Screen</div><div class="vl" style="color:var(--t2);font-family:var(--fb);font-size:13px">Share → Add to Home Screen</div></div>
      <button class="btn-out" data-action="signOut">Sign out</button>
    </div>
    <div class="muted" style="text-align:center;font-size:11px">Zero Ink · getzeroink.com</div>`;
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

registerActions({ saveSettings });
