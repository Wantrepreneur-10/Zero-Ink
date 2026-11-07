// Merchant dashboard math. Pure: takes receipt rows, returns numbers.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const hourLabel = (h) => (h % 12 || 12) + (h < 12 ? 'a' : 'p');

/** Start of the selected range and of the equally long period before it. */
export function rangeStart(range, now = new Date()) {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (range === 'week') from.setDate(from.getDate() - 6);
  if (range === 'month') from.setDate(from.getDate() - 29);
  const prevFrom = new Date(from - (now - from) - 1);
  return { from, prevFrom };
}

export function computeStats(rows, from) {
  const cur = rows.filter((r) => new Date(r.created_at) >= from);
  const prev = rows.filter((r) => new Date(r.created_at) < from);
  const sum = (list) => list.reduce((s, r) => s + Number(r.amount || 0), 0);
  const revenue = sum(cur), prevRevenue = sum(prev);

  const visits = {};
  cur.forEach((r) => { visits[r.customer_id] = (visits[r.customer_id] || 0) + 1; });

  const itemCounts = {};
  cur.forEach((r) => (Array.isArray(r.line_items) ? r.line_items : []).forEach((i) => {
    itemCounts[i.name] = (itemCounts[i.name] || 0) + (i.qty || 1);
  }));

  const hours = Array(24).fill(0);
  cur.forEach((r) => { hours[new Date(r.created_at).getHours()] += Number(r.amount || 0); });
  const peakHour = hours.indexOf(Math.max(...hours));

  return {
    current: cur,
    revenue: r2(revenue),
    prevRevenue: r2(prevRevenue),
    delta: prevRevenue ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null,
    count: cur.length,
    avgTicket: cur.length ? r2(revenue / cur.length) : 0,
    uniqueCustomers: Object.keys(visits).length,
    repeatCustomers: Object.values(visits).filter((n) => n > 1).length,
    topItems: Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 6),
    hours,
    peakHour,
  };
}

/** Plain-language insights when the AI isn't configured. */
export function localInsights(s, rangeName) {
  const money = (n) => '$' + r2(n).toFixed(2);
  const out = [`• ${money(s.revenue)} from ${s.count} receipt${s.count > 1 ? 's' : ''} ${rangeName}${s.delta != null ? `, ${s.delta >= 0 ? 'up' : 'down'} ${Math.abs(s.delta)}% vs the period before` : ''}.`];
  if (s.topItems.length) out.push(`• ${s.topItems[0][0]} is your top seller (${s.topItems[0][1]} sold)${s.topItems[1] ? `, then ${s.topItems[1][0]}` : ''}.`);
  out.push(`• Busiest hour: ${hourLabel(s.peakHour)}–${hourLabel((s.peakHour + 1) % 24)}. Average ticket ${money(s.avgTicket)}.`);
  if (s.repeatCustomers) out.push(`• ${s.repeatCustomers} customer${s.repeatCustomers > 1 ? 's' : ''} came back more than once.`);
  return out.join('\n');
}
