import { sb } from './lib/supabase.js';
import { state } from './state.js';
import { $, gen4, icons } from './lib/utils.js';
import { registerActions } from './lib/actions.js';
import { start } from './shell.js';

/** Load the user's profile, creating one with a unique 4-digit code on first sign-in. */
export async function loadProfile(user) {
  let { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!data) {
    const meta = user.user_metadata || {};
    for (let i = 0; i < 8 && !data; i++) {
      const ins = await sb.from('profiles')
        .insert({ id: user.id, full_name: meta.full_name || 'Member', code: gen4(), is_merchant: !!meta.is_merchant })
        .select().maybeSingle();
      if (ins.data) data = ins.data;   // a clash on the unique code just retries with a new one
    }
    if (!data) data = { id: user.id, full_name: 'Member', code: '----' };
  }
  data.email = user.email;
  state.profile = data;
}

export function renderAuth() {
  const up = state.authMode === 'signup', biz = state.signupRole === 'merchant';
  $('app').innerHTML = `<div class="auth-wrap">
    <div class="auth-logo">${icons.drop(64)}</div>
    <div class="auth-title">Zero Ink</div>
    <div class="auth-sub">Four digits. No paper.</div>
    <div class="err" id="aerr"></div>
    ${up ? `<div class="roles">
        <button class="role ${!biz ? 'on' : ''}" data-action="setRole" data-role="customer"><span class="ri">🙋</span>I'm a customer</button>
        <button class="role ${biz ? 'on' : ''}" data-action="setRole" data-role="merchant"><span class="ri">🏪</span>I'm a business</button></div>
      <div class="field"><label>${biz ? 'Business name' : 'Your name'}</label><input class="inp" id="f-name" placeholder="${biz ? 'e.g. Naan and Dosa' : 'Your name'}"></div>` : ''}
    <div class="field"><label>Email</label><input class="inp" id="f-email" type="email" placeholder="you@email.com" autocomplete="email" autocapitalize="off"></div>
    <div class="field"><label>Password</label><input class="inp" id="f-pass" type="password" placeholder="At least 6 characters" autocomplete="${up ? 'new-password' : 'current-password'}" data-enter="doAuth"></div>
    <button class="btn" id="f-go" data-action="doAuth">${up ? 'Create account' : 'Sign in'}</button>
    <button class="link" data-action="toggleAuthMode">${up ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
  </div>`;
}

function authError(m) { const e = $('aerr'); if (e) { e.textContent = m; e.classList.add('show'); } }

function friendly(m) {
  if (/already registered|already exists/i.test(m)) return 'That email already has an account. Try signing in.';
  if (/invalid login|invalid credentials/i.test(m)) return 'Wrong email or password.';
  if (/at least/i.test(m)) return 'Password must be at least 6 characters.';
  return m;
}

async function doAuth() {
  const btn = $('f-go'), email = $('f-email').value.trim(), pass = $('f-pass').value;
  if (!email || !pass) return authError('Enter your email and password.');
  btn.disabled = true; btn.textContent = 'Please wait…';
  try {
    if (state.authMode === 'signup') {
      const name = ($('f-name')?.value || '').trim() || 'Member', isMerchant = state.signupRole === 'merchant';
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name, is_merchant: isMerchant } } });
      if (error) throw error;
      let user = data.user;
      if (!data.session) {
        const si = await sb.auth.signInWithPassword({ email, password: pass });
        if (si.error) throw new Error('Account created. Please sign in.');
        user = si.data.user;
      }
      await loadProfile(user);
      if (isMerchant && !state.profile.is_merchant) {
        await sb.from('profiles').update({ is_merchant: true, business_type: 'restaurant' }).eq('id', state.profile.id);
        state.profile.is_merchant = true;
      }
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      await loadProfile(data.user);
    }
    await start();
  } catch (e) {
    authError(friendly(e.message || String(e)));
    btn.disabled = false; btn.textContent = state.authMode === 'signup' ? 'Create account' : 'Sign in';
  }
}

registerActions({
  doAuth,
  toggleAuthMode: () => { state.authMode = state.authMode === 'signup' ? 'signin' : 'signup'; renderAuth(); },
  setRole: (el) => {
    const keep = ['f-name', 'f-email', 'f-pass'].map((id) => $(id)?.value);
    state.signupRole = el.dataset.role;
    renderAuth();
    ['f-name', 'f-email', 'f-pass'].forEach((id, i) => { if (keep[i] && $(id)) $(id).value = keep[i]; });
  },
});

