// Tela de login: usa o Supabase no navegador (Google ou e-mail+senha).
// Em sucesso, guarda o token num cookie e volta para o app.
const msg = (t, cls = '') => { const m = document.getElementById('msg'); m.textContent = t; m.className = 'msg ' + cls; };
const setCookie = (token, exp = 3600) => { document.cookie = `sb-access-token=${token}; path=/; max-age=${exp}; SameSite=Lax`; };

const cfg = await (await fetch('/auth/config')).json();
if (!cfg.enabled) {
  // Login não está configurado: o app roda em modo local, segue direto.
  location.replace('/');
} else {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient(cfg.url, cfg.anonKey, {
    auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });

  const enter = (session) => {
    if (!session) return;
    setCookie(session.access_token, session.expires_in || 3600);
    location.replace('/');
  };

  // Já logado (ou voltou do Google com a sessão na URL)?
  const { data } = await sb.auth.getSession();
  if (data.session) enter(data.session);
  sb.auth.onAuthStateChange((_e, session) => { if (session) enter(session); });

  document.getElementById('googleBtn').onclick = () =>
    sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/login' } });

  document.getElementById('emailForm').onsubmit = async (e) => {
    e.preventDefault();
    msg('Entrando…');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return msg(error.message, 'err');
    enter(data.session);
  };

  document.getElementById('signupBtn').onclick = async () => {
    msg('Criando conta…');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || password.length < 6) return msg('Informe e-mail e senha (mín. 6 caracteres).', 'err');
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return msg(error.message, 'err');
    if (data.session) enter(data.session);
    else msg('Conta criada! Confirme o e-mail (se exigido) e entre.', 'ok');
  };
}
