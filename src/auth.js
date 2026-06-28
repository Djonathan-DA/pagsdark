// Autenticação dos usuários.
//
// Dois modos, que convivem:
//  1) LOCAL (padrão, sempre disponível): e-mail + senha salvos no banco (SQLite).
//     A senha é guardada com scrypt (sal aleatório). A sessão é um cookie ASSINADO
//     (HMAC) verificado no servidor. É o que faz a tela de login aparecer de cara.
//  2) GOOGLE / nuvem (opcional): via Supabase. Se as chaves do Supabase estiverem
//     no .env, o botão "Entrar com Google" funciona e o token (JWT) também é aceito.
//
// Segurança: tudo é verificado no servidor; o segredo de sessão e o JWT secret
// nunca vão para o navegador. Senhas nunca são guardadas em texto puro.
import crypto from 'node:crypto';
import { config } from './config.js';
import { get, insert } from './db.js';

// ---------- util base64url / segredo ----------
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlToBuf(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
function sessionSecret() {
  return crypto.createHash('sha256').update(config.encryptionKey || 'pagsdark-fallback-secret').digest();
}

// ---------- estado do auth ----------
export function supabaseEnabled() {
  const s = config.supabase;
  return Boolean(s && s.url && s.anonKey);
}
export function localEnabled() { return Boolean(config.auth && config.auth.localEnabled); }
// O login é EXIGIDO se o local está ligado ou o Supabase está configurado.
export function authRequired() { return localEnabled() || supabaseEnabled(); }
export function hasUsers() {
  try { return Boolean(get('SELECT 1 FROM users LIMIT 1')); } catch { return false; }
}

// ---------- senhas (scrypt) ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(password), salt, 32);
  return `${salt.toString('hex')}:${dk.toString('hex')}`;
}
export function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = String(stored).split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const dk = crypto.scryptSync(String(password), salt, expected.length);
    return crypto.timingSafeEqual(dk, expected);
  } catch { return false; }
}

// ---------- usuários locais ----------
export function createLocalUser(email, password, name) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('E-mail inválido.');
  if (!password || String(password).length < 6) throw new Error('A senha precisa de pelo menos 6 caracteres.');
  if (get('SELECT 1 FROM users WHERE email = ?', [email])) throw new Error('Já existe uma conta com esse e-mail.');
  const id = insert('INSERT INTO users (email, pass_hash, name) VALUES (?,?,?)', [email, hashPassword(password), name || null]);
  return { id, email };
}
export function loginLocalUser(email, password) {
  email = String(email || '').trim().toLowerCase();
  const u = get('SELECT * FROM users WHERE email = ?', [email]);
  if (!u || !verifyPassword(password, u.pass_hash)) return null;
  return { id: u.id, email: u.email };
}

// ---------- sessão local (cookie assinado) ----------
const SESSION_DAYS = 30;
export function makeSession(user) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = b64url(JSON.stringify({ uid: user.id, email: user.email, exp }));
  const sig = b64url(crypto.createHmac('sha256', sessionSecret()).update(payload).digest());
  return `${payload}.${sig}`;
}
export function verifySession(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', sessionSecret()).update(payload).digest());
  const a = Buffer.from(expected), b = Buffer.from(String(sig));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try { data = JSON.parse(b64urlToBuf(payload).toString('utf8')); } catch { return null; }
  if (!data.uid || (data.exp && Math.floor(Date.now() / 1000) > data.exp)) return null;
  return { id: 'local:' + data.uid, email: data.email || '' };
}
export function sessionCookie(token) {
  return `pd-session=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax`;
}
export function clearSessionCookie() { return 'pd-session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'; }

// ---------- verificação de JWT do Supabase (HS256) ----------
export function verifyJWT(token, secret) {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  let header;
  try { header = JSON.parse(b64urlToBuf(h).toString('utf8')); } catch { return null; }
  if (header.alg !== 'HS256') return null;
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const got = b64urlToBuf(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  let payload;
  try { payload = JSON.parse(b64urlToBuf(p).toString('utf8')); } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;
  if (payload.nbf && now < payload.nbf) return null;
  return payload;
}

// ---------- cookies / usuário da requisição ----------
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) { try { out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); } catch {} }
  });
  return out;
}

// Valida um token do Supabase consultando /auth/v1/user (funciona com as chaves
// novas, sem precisar do JWT secret). Cacheia o resultado por 60s para nao bater
// no Supabase a cada requisicao (inclui as de midia/thumbs).
const sbTokenCache = new Map();
async function verifySupabaseToken(token) {
  if (!token) return null;
  const c = sbTokenCache.get(token);
  if (c && c.exp > Date.now()) return c.user;
  try {
    const res = await fetch(`${config.supabase.url}/auth/v1/user`, {
      headers: { apikey: config.supabase.anonKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u || !u.id) return null;
    const user = { id: 'sb:' + u.id, email: u.email || '' };
    if (sbTokenCache.size > 500) sbTokenCache.clear();
    sbTokenCache.set(token, { user, exp: Date.now() + 60000 });
    return user;
  } catch { return null; }
}

export async function getUser(req) {
  if (!authRequired()) return { id: 'local', email: 'local', local: true };
  const cookies = parseCookies(req);
  // 1) sessão local (rápida, sem rede)
  const local = verifySession(cookies['pd-session']);
  if (local) return local;
  // 2) token do Supabase (cookie ou Authorization)
  if (supabaseEnabled()) {
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return await verifySupabaseToken(cookies['sb-access-token'] || bearer);
  }
  return null;
}

export async function requireAuth(req, res, next) {
  if (!authRequired()) { req.user = { id: 'local', local: true }; return next(); }
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Não autenticado.' });
  req.user = user;
  next();
}

// Config pública para o cliente (sem segredos).
export function publicAuthConfig() {
  return {
    required: authRequired(),
    local: localEnabled(),
    hasUsers: hasUsers(),
    supabase: supabaseEnabled() ? { url: config.supabase.url, anonKey: config.supabase.anonKey } : null,
  };
}
