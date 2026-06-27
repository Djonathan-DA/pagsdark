// Kwai: NAO possui API publica de postagem.
// Estrategia: exportar o video para uma pasta organizada por data/hora e o
// usuario posta manualmente pelo app do Kwai. A conta e "conectada" so com nome.
import fs from 'node:fs';
import path from 'node:path';
import { DIRS } from '../config.js';

export const name = 'kwai';
export const label = 'Kwai (manual)';
export const manual = true; // nao usa OAuth; cadastro so com nome

export function connectUrl() {
  return null; // sem OAuth
}

export async function publish({ account, mediaPath, caption }) {
  const dir = path.join(DIRS.output, 'kwai', sanitize(account.display_name || 'conta'));
  fs.mkdirSync(dir, { recursive: true });
  const base = path.parse(mediaPath).name;
  const dest = path.join(dir, `${base}.mp4`);
  fs.copyFileSync(mediaPath, dest);
  if (caption) fs.writeFileSync(path.join(dir, `${base}.txt`), caption, 'utf8');
  return { externalId: `manual:${dest}` };
}

function sanitize(s) { return String(s).replace(/[^\w.-]/g, '_'); }
