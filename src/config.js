// Carrega o .env e expoe a configuracao da plataforma num unico lugar.
// Tambem aceita credenciais salvas pela interface (data/secrets.json), que
// sobrepoem o .env em tempo de execucao (sem precisar reiniciar para OAuth).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const DIRS = {
  data: DATA_DIR,
  media: path.join(DATA_DIR, 'media'),
  molds: path.join(DATA_DIR, 'molds'),
  audios: path.join(DATA_DIR, 'audios'),
  output: path.join(DATA_DIR, 'output'),
  thumbs: path.join(DATA_DIR, 'thumbs'),
  tmp: path.join(DATA_DIR, 'tmp'),
};

const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
function loadSecrets() {
  try { return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')); } catch { return {}; }
}
const s = loadSecrets();
const pick = (envKey, secretKey) => s[secretKey] || process.env[envKey] || '';

export const config = {
  port: Number(process.env.PORT || 3000),
  // Onde o servidor escuta. Padrao 127.0.0.1 (so o proprio Mac). Para acessar do
  // celular na mesma rede Wi-Fi, use HOST=0.0.0.0 no .env (o login continua exigido).
  host: process.env.HOST || '127.0.0.1',
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  tz: process.env.TZ || 'America/Sao_Paulo',
  encryptionKey: process.env.ENCRYPTION_KEY || '',

  youtube: {
    clientId: pick('YOUTUBE_CLIENT_ID', 'youtubeClientId'),
    clientSecret: pick('YOUTUBE_CLIENT_SECRET', 'youtubeClientSecret'),
  },
  meta: {
    appId: pick('META_APP_ID', 'metaAppId'),
    appSecret: pick('META_APP_SECRET', 'metaAppSecret'),
  },
  tiktok: {
    clientKey: pick('TIKTOK_CLIENT_KEY', 'tiktokClientKey'),
    clientSecret: pick('TIKTOK_CLIENT_SECRET', 'tiktokClientSecret'),
  },

  // Login dos usuários. Por padrão o login LOCAL (e-mail+senha, salvo no banco)
  // está LIGADO — sempre aparece a tela de login. Desligue com LOGIN=off no .env.
  // O Google é opcional e usa o Supabase (preencha as chaves abaixo).
  auth: {
    localEnabled: (process.env.LOGIN || 'on').toLowerCase() !== 'off',
  },
  // Google / sincronização de usuários na nuvem (Supabase). Opcional.
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
  },
};

// Salva credenciais vindas da interface e aplica em memoria na hora.
export function saveCredentials(values = {}) {
  const current = loadSecrets();
  const merged = { ...current, ...values };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(merged, null, 2));
  if ('youtubeClientId' in values) config.youtube.clientId = values.youtubeClientId;
  if ('youtubeClientSecret' in values) config.youtube.clientSecret = values.youtubeClientSecret;
  if ('metaAppId' in values) config.meta.appId = values.metaAppId;
  if ('metaAppSecret' in values) config.meta.appSecret = values.metaAppSecret;
  if ('tiktokClientKey' in values) config.tiktok.clientKey = values.tiktokClientKey;
  if ('tiktokClientSecret' in values) config.tiktok.clientSecret = values.tiktokClientSecret;
}

// Diz quais plataformas estao configuradas (tem credenciais no .env).
export function platformConfigured(platform) {
  switch (platform) {
    case 'youtube': return Boolean(config.youtube.clientId && config.youtube.clientSecret);
    case 'instagram': return Boolean(config.meta.appId && config.meta.appSecret);
    case 'facebook': return Boolean(config.meta.appId && config.meta.appSecret);
    case 'tiktok': return Boolean(config.tiktok.clientKey && config.tiktok.clientSecret);
    default: return false;
  }
}

export function redirectUri(platform) {
  return `${config.baseUrl}/oauth/${platform}/callback`;
}
