// Merchant dashboard: sales, tickets, hourly chart, top items, customers, insights.
import { sb } from '../../lib/supabase.js';
import { state } from '../../state.js';
import { $, esc, money, icons } from '../../lib/utils.js';
import { registerActions } from '../../lib/actions.js';
import { ai, aiChip } from '../../lib/ai.js';
import { rangeStart, computeStats, localInsights, hourLabel } from '../../lib/stats.js';

const RANGES = [['today', 'Today'], ['week', '7 days'], ['month', '30 days']];
const RANGE_NAMES = { today: 'today', week: 'the last 7 days', month: 'the last 30 days' };

export async function renderDashboard() {
  $('view').innerHTML = `
    <div class="top"><div class="top-title">Dashboard<div class="top-sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>${aiChip()}</div>
    <div class="seg">${RANGES.map(([k, l]) => `<button class="${state.dashRange === k ? 'on' : ''}" data-action="setRange" data-r="${k}">${l}</button>`).join('')}</div>
    <div id="dash"><div class="empty"><span class="spin sm"></span></div></div>`;

  const { from, prevFrom } = rangeStart(state.dashRange);
  const { data } = await sb.from('receipts').select('*').eq('merchant_id', state.profile.id)
    .gte('created_at', prevFrom.toISOString()).order('created_at', { ascending: false }).limit(5000);
  const s = computeStats(data || [], from);
  const rangeName = RANGE_NAMES[state.dashRange];

  // Hourly bars: show at least 11a–9p, widened to include any sales outside that.
  let h0 = s.hours.findIndex((v) => v > 0), h1 = 23 - [...s.hours].reverse().findIndex((v) => v > 0);
  if (h0 < 0) { h0 = 11; h1 = 21; } else { h0 = Math.min(h0, 11); h1 = Math.max(h1, 21); }
  const span = s.hours.slice(h0, h1 + 1), max = Math.max(...span, 1);

  $('dash').innerHTML = `
    <div class="stats">
      <div class="stat hl"><div class="v">${money(s.revenue)}</div><div class="l">Sales ${s.delta != null ? `<span style="color:${s.delta >= 0 ? 'var(--mint)' : 'var(--red)'}">${s.delta >= 0 ? '▲' : '▼'} ${Math.abs(s.delta)}%</span>` : ''}</div></div>
      <div class="stat"><div class="v">${s.count}</div><div class="l">Receipts sent</div></div>
      <div class="stat"><div class="v">${money(s.avgTicket)}</div><div class="l">Average ticket</div></div>
      <div class="stat"><div class="v">${s.count}</div><div class="l">Paper slips not printed</div></div>
    </div>
    <div class="card ai-card"><div class="card-t">${icons.spark} Insights<span class="sp"></span>${state.AI ? '<span class="aichip on fixed"><i></i>Claude</span>' : ''}</div>
      <div class="insight" id="ins">${s.count ? '<span class="spin sm"></span> Analyzing…' : 'Send your first receipt and insights appear here.'}</div></div>
    <div class="card"><div class="card-t">Sales by hour</div>
      <div class="bars">${span.map((v, i) => `<div class="bar ${h0 + i === s.peakHour && v > 0 ? 'hot' : ''}" style="height:${(v / max) * 100}%" title="${hourLabel(h0 + i)} ${money(v)}"></div>`).join('')}</div>
      <div class="barlbl"><span>${hourLabel(h0)}</span><span>${hourLabel(Math.round((h0 + h1) / 2))}</span><span>${hourLabel(h1)}</span></div></div>
    <div class="card"><div class="card-t">Top items</div>${s.topItems.length
      ? s.topItems.map(([n, c]) => `<div class="topi"><span class="n">${esc(n)}</span><span class="meter"><i style="width:${(c / s.topItems[0][1]) * 100}%"></i></span><span class="c">${c}</span></div>`).join('')
      : '<div class="empty" style="padding:10px">Item sales show up as you send receipts.</div>'}</div>
    <div class="card"><div class="card-t">Customers</div><div class="stats" style="margin:0">
      <div class="stat"><div class="v">${s.uniqueCustomers}</div><div class="l">Unique customers</div></div>
      <div class="stat"><div class="v">${s.repeatCustomers}</div><div class="l">Came back 2+ times</div></div></div></div>
    <div class="card"><div class="card-t">Receipts</div>${s.current.slice(0, 25).map((r) => `
      <div class="rrow"><div class="ricon mono" style="font-size:12px;color:var(--mint)">${esc(r.customer_code || '••••')}</div>
      <div class="rinfo"><div class="rname">${esc(r.items || 'Receipt')}</div><div class="rmeta">${new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div>
      <div class="ramt">${money(r.amount)}</div></div>`).join('') || '<div class="empty" style="padding:10px">None yet.</div>'}</div>`;

  if (!s.count) return;
  let text = null;
  if (state.AI) {
    const r = await ai({ mode: 'summary', stats: {
      range: rangeName, revenue: s.revenue, receipts: s.count, avg_ticket: s.avgTicket, previous_period_revenue: s.prevRevenue,
      top_items: s.topItems, peak_hour: hourLabel(s.peakHour), unique_customers: s.uniqueCustomers, repeat_customers: s.repeatCustomers,
      sales_by_hour: Object.fromEntries(s.hours.map((v, i) => [hourLabel(i), v]).filter((x) => x[1] > 0)),
    } });
    if (r.ai && r.summary) text = r.summary;
  }
  if ($('ins')) $('ins').textContent = text || localInsights(s, rangeName);
}

registerActions({ setRange: (el) => { state.dashRange = el.dataset.r; renderDashboard(); } });
