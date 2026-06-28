// Tela de login. Dois modos:
//  - Supabase configurado: Google + e-mail/senha pelo Supabase (nuvem).
//  - Sem Supabase: e-mail/senha LOCAL (salvo no banco do app). Sempre funciona.
const msg = (t, cls = '') => { const m = document.getElementById('msg'); m.textContent = t; m.className = 'msg ' + cls; };
const foot = (t) => { document.getElementById('foot').textContent = t; };

const cfg = await (await fetch('/auth/config')).json();

if (!cfg.required) {
  location.replace('/'); // login desligado -> segue direto
} else if (cfg.supabase) {
  // ---------- modo NUVEM (Supabase / Google) ----------
  const setCookie = (token, exp = 3600) => { document.cookie = `sb-access-token=${token}; path=/; max-age=${exp}; SameSite=Lax`; };
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient(cfg.supabase.url, cfg.supabase.anonKey, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  const enter = (session) => { if (!session) return; setCookie(session.access_token, session.expires_in || 3600); location.replace('/'); };
  const { data } = await sb.auth.getSession();
  if (data.session) enter(data.session);
  sb.auth.onAuthStateChange((_e, session) => { if (session) enter(session); });

  document.getElementById('googleBtn').onclick = () =>
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/login' } });
  document.getElementById('emailForm').onsubmit = async (e) => {
    e.preventDefault(); msg('Entrando…');
    const { data, error } = await sb.auth.signInWithPassword({
      email: document.getElementById('email').value.trim(), password: document.getElementById('password').value });
    if (error) return msg(error.message, 'err');
    enter(data.session);
  };
  document.getElementById('signupBtn').onclick = async () => {
    msg('Criando conta…');
    const { data, error } = await sb.auth.signUp({
      email: document.getElementById('email').value.trim(), password: document.getElementById('password').value });
    if (error) return msg(error.message, 'err');
    if (data.session) enter(data.session); else msg('Conta criada! Confirme o e-mail (se exigido) e entre.', 'ok');
  };
} else {
  // ---------- modo LOCAL (e-mail/senha no banco do app) ----------
  document.getElementById('googleBtn').style.display = 'none';
  document.querySelector('.sep').textContent = cfg.hasUsers ? 'Entre com seu e-mail' : 'Crie sua conta de acesso';
  foot(cfg.hasUsers ? '' : 'Primeiro acesso: defina e-mail e senha para criar sua conta.');

  const post = async (url) => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha no login.');
    return data;
  };
  document.getElementById('emailForm').onsubmit = async (e) => {
    e.preventDefault(); msg('Entrando…');
    try { await post('/auth/local/login'); location.replace('/'); }
    catch (err) { msg(err.message, 'err'); }
  };
  document.getElementById('signupBtn').onclick = async () => {
    msg('Criando conta…');
    try { await post('/auth/local/signup'); location.replace('/'); }
    catch (err) { msg(err.message, 'err'); }
  };
}
