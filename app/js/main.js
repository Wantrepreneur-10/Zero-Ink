// Entry point.
import { sb } from './lib/supabase.js';
import { initActions } from './lib/actions.js';
import { $, esc } from './lib/utils.js';
import { loadProfile, renderAuth } from './auth.js';
import { start } from './shell.js';
import { initMenuScan } from './screens/merchant/menu.js';

window.__ziBooted = true;
initActions();
initMenuScan();

try {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { await loadProfile(session.user); await start(); }
  else renderAuth();
} catch (e) {
  $('app').innerHTML = `<div class="loader"><div style="font-size:40px">⚠️</div><div style="color:var(--t2);text-align:center;padding:0 30px">Couldn't reach Zero Ink.<br><span style="font-size:12px;color:var(--t3)">${esc(e.message || e)}</span><br><button class="btn small" style="margin-top:14px" onclick="location.reload()">Try again</button></div></div>`;
}
