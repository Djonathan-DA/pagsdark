// Guarda de sessão do app. Roda ANTES do app.js (ambos são módulos, então o
// app.js só executa depois deste terminar — evita corrida com as chamadas à API).
// Em modo local o servidor já protege tudo; aqui só montamos usuário + botão Sair.
const cfg = await (await fetch('/auth/config')).json();

function mountUserBox(email, onLogout) {
  const footEl = document.querySelector('.sidebar .foot');
  if (!footEl) return;
  const box = document.createElement('div');
  box.style.cssText = 'margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--line)';
  box.innerHTML = `<div style="font-size:12px; color:var(--txt); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">👤 ${email || 'conta'}</div>`;
  const out = document.createElement('button');
  out.className = 'btn ghost sm';
  out.textContent = 'Sair';
  out.style.marginTop = '8px';
  out.onclick = onLogout;
  box.appendChild(out);
  footEl.prepend(box);
}

if (cfg.required && cfg.supabase) {
  // ---------- modo NUVEM (Supabase) ----------
  const setCookie = (token, exp = 3600) => { document.cookie = `sb-access-token=${token}; path=/; max-age=${exp}; SameSite=Lax`; };
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient(cfg.supabase.url, cfg.supabase.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { data } = await sb.auth.getSession();
  if (!data.session) { location.replace('/login'); await new Promise(() => {}); }
  setCookie(data.session.access_token, data.session.expires_in || 3600);
  sb.auth.onAuthStateChange((_e, session) => {
    if (session) setCookie(session.access_token, session.expires_in || 3600);
    else location.replace('/login');
  });
  mountUserBox(data.session.user?.email, async () => { try { await sb.auth.signOut(); } catch {} location.href = '/logout'; });
  window.__supabase = sb;
} else if (cfg.required) {
  // ---------- modo LOCAL ----------
  // Se chegamos aqui, o servidor já validou a sessão (senão teria redirecionado).
  let me = {};
  try { me = await (await fetch('/auth/me')).json(); } catch {}
  mountUserBox(me.email, () => { location.href = '/logout'; });
}
