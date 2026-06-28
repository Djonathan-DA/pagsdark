// Guarda de sessão do app. Roda ANTES do app.js (ambos são módulos, então o
// app.js só executa depois deste terminar — evita corrida com as chamadas à API).
// Em modo local (sem Supabase configurado) não faz nada.
const setCookie = (token, exp = 3600) => { document.cookie = `sb-access-token=${token}; path=/; max-age=${exp}; SameSite=Lax`; };

const cfg = await (await fetch('/auth/config')).json();
if (cfg.enabled) {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const sb = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const { data } = await sb.auth.getSession();
  if (!data.session) {
    location.replace('/login');
    // trava o resto do carregamento até a navegação acontecer
    await new Promise(() => {});
  }
  setCookie(data.session.access_token, data.session.expires_in || 3600);

  // Mantém o cookie atualizado quando o token é renovado.
  sb.auth.onAuthStateChange((_e, session) => {
    if (session) setCookie(session.access_token, session.expires_in || 3600);
    else location.replace('/login');
  });

  // Mostra o usuário + botão Sair no rodapé da barra lateral.
  const foot = document.querySelector('.sidebar .foot');
  if (foot) {
    const email = data.session.user?.email || 'conta';
    const box = document.createElement('div');
    box.style.cssText = 'margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid var(--line)';
    box.innerHTML = `<div style="font-size:12px; color:var(--txt); overflow:hidden; text-overflow:ellipsis; white-space:nowrap">👤 ${email}</div>`;
    const out = document.createElement('button');
    out.className = 'btn ghost sm';
    out.textContent = 'Sair';
    out.style.marginTop = '8px';
    out.onclick = async () => { try { await sb.auth.signOut(); } catch {} location.href = '/logout'; };
    box.appendChild(out);
    foot.prepend(box);
  }

  window.__supabase = sb;
}
