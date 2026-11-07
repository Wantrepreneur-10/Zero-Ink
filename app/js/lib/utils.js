export const $ = (id) => document.getElementById(id);
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const money = (n) => '$' + r2(n).toFixed(2);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const gen4 = () => String(Math.floor(1000 + Math.random() * 9000));
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function timeAgo(ts, now = Date.now()) {
  const d = new Date(ts), s = (now - d) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let toastTimer;
export function toast(title, line1 = '', line2 = '', line3 = '') {
  $('toast-t').textContent = title;
  $('toast-store').textContent = line1;
  $('toast-amt').textContent = line2;
  $('toast-items').textContent = line3;
  const t = $('toast');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}

export const icons = {
  drop: (s = 56) => `<svg width="${s}" height="${s}" viewBox="0 0 512 512"><defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19f5b0"/><stop offset="1" stop-color="#00b377"/></linearGradient></defs><path d="M256 110 C188 212 150 262 150 330 a106 106 0 0 0 212 0 C362 262 324 212 256 110 Z" fill="url(#dg)"/><circle cx="256" cy="320" r="34" fill="#07090d"/></svg>`,
  spark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" class="spark"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};
