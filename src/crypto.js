// Cifra/decifra os tokens das contas antes de guardar no banco (AES-256-GCM).
import crypto from 'node:crypto';
import { config } from './config.js';

function keyBuffer() {
  // Aceita a chave em hex (recomendado) ou texto; normaliza para 32 bytes.
  const raw = config.encryptionKey || 'chave-padrao-insegura-troque-no-env';
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
}

export function encrypt(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // formato: iv.tag.dados  (tudo em base64)
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(blob) {
  if (!blob) return null;
  try {
    const [ivB64, tagB64, dataB64] = String(blob).split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null; // chave trocada ou dado corrompido
  }
}
