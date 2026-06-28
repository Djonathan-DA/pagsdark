// Geração e cache de thumbnails (posters JPG) dos vídeos.
// Estratégia para o app ficar FLUIDO:
//  - on-demand: GET /thumb/:id gera na hora se faltar (fallback).
//  - em background: warmThumbnails() pré-gera os que faltam (no boot e após uploads),
//    com baixa concorrência, para não travar a CPU. Assim, ao abrir o editor, as
//    miniaturas já estão prontas (instantâneas) em vez de gerar uma a uma na tela.
import fs from 'node:fs';
import path from 'node:path';
import { all, run } from '../db.js';
import { DIRS } from '../config.js';
import { makeThumbnail } from '../ffmpeg.js';

export function thumbPathFor(id) { return path.join(DIRS.thumbs, `thumb-${id}.jpg`); }

// Garante o thumb de UM asset (gera se faltar) e devolve o caminho, ou null.
export async function ensureThumb(asset) {
  if (!asset || !asset.file_path || !fs.existsSync(asset.file_path)) return null;
  if (asset.thumb_path && fs.existsSync(asset.thumb_path)) return asset.thumb_path;
  const out = thumbPathFor(asset.id);
  if (fs.existsSync(out)) { run('UPDATE media_assets SET thumb_path = ? WHERE id = ?', [out, asset.id]); return out; }
  await makeThumbnail(asset.file_path, out);
  run('UPDATE media_assets SET thumb_path = ? WHERE id = ?', [out, asset.id]);
  return out;
}

let warming = false;
// Pré-gera, em background, todos os thumbs que faltam (baixa concorrência).
export async function warmThumbnails(concurrency = 2) {
  if (warming) return;
  warming = true;
  try {
    const list = all('SELECT * FROM media_assets ORDER BY id DESC');
    const todo = list.filter((a) => {
      if (a.thumb_path && fs.existsSync(a.thumb_path)) return false;
      if (fs.existsSync(thumbPathFor(a.id))) return false;
      return fs.existsSync(a.file_path);
    });
    if (!todo.length) return;
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const a = todo[i++];
        try { await ensureThumb(a); } catch {}
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  } finally {
    warming = false;
  }
}
