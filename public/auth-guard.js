// Guarda de sessão do app. Roda ANTES do app.js (ambos módulos → app.js espera).
// O servidor já protegeu tudo (se não estivesse logado, teria redirecionado).
// Aqui: mostra usuário + Sair, e — se for sessão Google/Supabase — mantém o cookie fresco.
const cfg = await (await fetch('/auth/config')).json();

if (cfg.required) document.getElementById('topLogout')?.classList.remove('hide');

function mountUserBox(email) {
  const footEl = document.querySelector('.sidebar .foot');
  if (!footEl) return;
  const box = document.createElement('div');
  box.style.cssText = 'margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--line)';
  box.innerHTML = `<div style="font-size:12px; color:var(--txt); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">👤 ${email || 'conta'}</div>`;
  const out = document.createElement('button');
  out.className = 'btn ghost sm';
  out.textContent = 'Sair';
  out.style.marginTop = '8px';
  out.onclick = () => { location.href = '/logout'; };
  box.appendChild(out);
  footEl.prepend(box);
}

if (cfg.required) {
  let me = {};
  try { me = await (await fetch('/auth/me')).json(); } catch {}
  mountUserBox(me.email);

  // Sessão Google/Supabase: renova o token e atualiza o cookie automaticamente.
  if (cfg.supabase && typeof me.id === 'string' && me.id.startsWith('sb:')) {
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(cfg.supabase.url, cfg.supabase.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      const setCookie = (t, exp = 3600) => { document.cookie = `sb-access-token=${t}; path=/; max-age=${exp}; SameSite=Lax`; };
      const { data } = await sb.auth.getSession();
      if (data.session) setCookie(data.session.access_token, data.session.expires_in || 3600);
      sb.auth.onAuthStateChange((_e, session) => { if (session) setCookie(session.access_token, session.expires_in || 3600); });
      window.__supabase = sb;
    } catch {}
  }
}
