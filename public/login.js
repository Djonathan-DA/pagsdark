// Tela de login HÍBRIDA:
//  - E-mail + senha LOCAL (sempre funciona, salvo no banco do app).
//  - "Entrar com Google" via Supabase (aparece quando o Supabase está configurado).
// Os dois geram uma sessão que o servidor aceita — você nunca fica trancado para fora.
const msg = (t, cls = '') => { const m = document.getElementById('msg'); m.textContent = t; m.className = 'msg ' + cls; };
const foot = (t) => { document.getElementById('foot').textContent = t; };

const cfg = await (await fetch('/auth/config')).json();

if (!cfg.required) {
  location.replace('/'); // login desligado -> segue direto
} else {
  // ---------- e-mail/senha LOCAL (sempre) ----------
  const postLocal = async (url) => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Falha no login.');
    return data;
  };
  document.getElementById('emailForm').onsubmit = async (e) => {
    e.preventDefault(); msg('Entrando…');
    try { await postLocal('/auth/local/login'); location.replace('/'); }
    catch (err) { msg(err.message, 'err'); }
  };
  document.getElementById('signupBtn').onclick = async () => {
    msg('Criando conta…');
    try { await postLocal('/auth/local/signup'); location.replace('/'); }
    catch (err) { msg(err.message, 'err'); }
  };
  // ---------- Google (Supabase), se configurado ----------
  if (cfg.supabase) {
    document.querySelector('.sep').textContent = cfg.hasUsers ? 'ou com e-mail' : 'ou crie sua conta de acesso';
    const setCookie = (token, exp = 3600) => { document.cookie = `sb-access-token=${token}; path=/; max-age=${exp}; SameSite=Lax`; };
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      });
      const enter = (session) => { if (!session) return; setCookie(session.access_token, session.expires_in || 3600); location.replace('/'); };
      const { data } = await sb.auth.getSession();
      if (data.session) enter(data.session);
      sb.auth.onAuthStateChange((_e, session) => { if (session) enter(session); });
      document.getElementById('googleBtn').onclick = () =>
        sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/login' } })
          .then(({ error }) => { if (error) msg('Google: ' + error.message, 'err'); });
    } catch (e) {
      document.getElementById('googleBtn').style.display = 'none';
      document.querySelector('.sep').textContent = cfg.hasUsers ? 'Entre com e-mail' : 'Crie sua conta de acesso';
    }
  } else {
    document.getElementById('googleBtn').style.display = 'none';
    document.querySelector('.sep').textContent = cfg.hasUsers ? 'Entre com e-mail' : 'Crie sua conta de acesso';
  }
}
