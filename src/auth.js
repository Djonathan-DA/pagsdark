// Autenticação via Supabase (login com Google / e-mail+senha).
//
// Como funciona, em resumo:
//  - O LOGIN acontece no navegador (public/login.html) usando o Supabase.
//  - O Supabase devolve um token de acesso (JWT) assinado com o "JWT secret"
//    do seu projeto. O navegador guarda esse token num cookie (sb-access-token).
//  - Aqui no servidor, a cada requisição protegida, verificamos a ASSINATURA do
//    token com o mesmo segredo. Sem token válido, a resposta é 401 / redireciona
//    para a tela de login.
//
// Segurança: a verificação é feita 100% no servidor (não dá para burlar pelo
// navegador). O segredo do JWT NUNCA vai para o cliente — só a URL e a anon key,
// que são públicas por design no Supabase.
import crypto from 'node:crypto';
import { config } from './config.js';

// Auth só é exigido quando o Supabase está configurado no .env.
export function authEnabled() {
  const s = config.supabase;
  return Boolean(s && s.url && s.anonKey && s.jwtSecret);
}

function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Verifica um JWT HS256 (formato dos tokens do Supabase) sem dependências externas.
export function verifyJWT(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header;
  try { header = JSON.parse(b64urlToBuf(h).toString('utf8')); } catch { return null; }
  if (header.alg !== 'HS256') return null; // só aceitamos HS256 (evita "alg=none")
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const got = b64urlToBuf(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  let payload;
  try { payload = JSON.parse(b64urlToBuf(p).toString('utf8')); } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;       // expirado
  if (payload.nbf && now < payload.nbf) return null;       // ainda não válido
  return payload; // { sub, email, role, exp, ... }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) { try { out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); } catch {} }
  });
  return out;
}

// Extrai o usuário autenticado de uma requisição (cookie ou Authorization: Bearer).
export function getUser(req) {
  if (!authEnabled()) return { id: 'local', email: 'local', local: true };
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = parseCookies(req)['sb-access-token'] || bearer;
  const payload = verifyJWT(token, config.supabase.jwtSecret);
  if (!payload || !payload.sub) return null;
  return { id: payload.sub, email: payload.email || '', role: payload.role || 'authenticated' };
}

// Middleware: bloqueia se não autenticado (quando o auth está ligado).
export function requireAuth(req, res, next) {
  if (!authEnabled()) { req.user = { id: 'local', local: true }; return next(); }
  const user = getUser(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });
  req.user = user;
  next();
}

// Config pública para o cliente montar o Supabase (sem segredos).
export function publicAuthConfig() {
  return {
    enabled: authEnabled(),
    url: config.supabase ? config.supabase.url : '',
    anonKey: config.supabase ? config.supabase.anonKey : '',
  };
}
