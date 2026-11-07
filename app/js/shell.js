// App frame: bottom navigation, tab routing, realtime receipt delivery, sign-out.
import { sb } from './lib/supabase.js';
import { state, resetState } from './state.js';
import { $, money, toast } from './lib/utils.js';
import { registerActions } from './lib/actions.js';
import { checkAI } from './lib/ai.js';
import { renderAuth } from './auth.js';
import { renderHome, paintHome } from './screens/customer/home.js';
import { renderInsights } from './screens/customer/insights.js';
import { renderRegister } from './screens/merchant/register.js';
import { renderDashboard } from './screens/merchant/dashboard.js';
import { renderMenu } from './screens/merchant/menu.js';
import { renderSettings } from './screens/settings.js';

const ICONS = {
  home: '<path d="M3 11l9-8 9 8M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10"/>',
  insights: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  register: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 15h3"/>',
  today: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h10"/>',
};

const SCREENS = {
  home: renderHome, insights: renderInsights, settings: renderSettings,
  register: renderRegister, today: renderDashboard, menu: renderMenu,
};

const tabsFor = (p) => (p.is_merchant
  ? [['register', 'Register'], ['today', 'Today'], ['menu', 'Menu'], ['settings', 'Settings']]
  : [['home', 'Receipts'], ['insights', 'Insights'], ['settings', 'Profile']]);

export async function start() {
  checkAI();
  const tabs = tabsFor(state.profile);
  $('app').innerHTML = `<div id="view" class="view"></div><div class="nav" id="nav">${tabs.map(([id, label]) => `
    <button class="nav-btn" data-t="${id}" data-action="openTab"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg><span>${label}</span></button>`).join('')}</div>`;
  subscribe();
  openTab(tabs[0][0]);
}

export function openTab(id) {
  state.tab = id;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
  $('view').scrollTop = 0;
  SCREENS[id]();
}

function subscribe() {
  if (state.channel) sb.removeChannel(state.channel);
  const me = state.profile.id;
  state.channel = sb.channel('rx-' + me)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'receipts', filter: `customer_id=eq.${me}` }, ({ new: r }) => {
      if (state.receipts.some((x) => x.id === r.id)) return;
      state.receipts.unshift(r);
      if (state.tab === 'home') paintHome();
      toast('Receipt received', r.merchant_name, money(r.amount), r.items || '');
      try { navigator.vibrate?.(60); } catch {}
    })
    .subscribe();
}

async function signOut() {
  await sb.auth.signOut();
  if (state.channel) { sb.removeChannel(state.channel); state.channel = null; }
  resetState();
  renderAuth();
}

registerActions({ openTab: (el) => openTab(el.dataset.t), signOut });
