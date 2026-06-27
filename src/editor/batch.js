// Roda a renderizacao EM LOTE: pega varios videos e aplica o mesmo molde,
// atualizando o progresso no banco. Processa poucos por vez (CPU).
import fs from 'node:fs';
import path from 'node:path';
import { get, all, run, insert } from '../db.js';
import { DIRS } from '../config.js';
import { renderOne } from './render.js';
import { probe } from '../ffmpeg.js';

const CONCURRENCY = 2;

// Cria o job e comeca a processar em background. Retorna o jobId na hora.
export function startBatch({ moldId, sources, focus }) {
  const mold = get('SELECT * FROM molds WHERE id = ?', [moldId]);
  if (!mold) throw new Error('Molde nao encontrado');

  const outputDir = path.join(DIRS.output, `job-${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const jobId = insert(
    'INSERT INTO render_jobs (mold_id, status, total, output_dir) VALUES (?,?,?,?)',
    [moldId, 'running', sources.length, outputDir]
  );
  for (const src of sources) {
    insert('INSERT INTO render_items (job_id, source_path, status) VALUES (?,?,?)', [jobId, src, 'pending']);
  }

  processJob(jobId, mold, outputDir, focus); // nao espera (roda em background)
  return jobId;
}

async function processJob(jobId, mold, outputDir, focus) {
  const items = all('SELECT * FROM render_items WHERE job_id = ?', [jobId]);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const item = items[index++];
      const base = path.parse(item.source_path).name.replace(/[^\w.-]/g, '_');
      const outPath = path.join(outputDir, `${base}_dark.mp4`);
      try {
        await renderOne(item.source_path, mold, outPath, focus);
        const info = await probe(outPath).catch(() => ({}));
        insert(
          'INSERT INTO media_assets (kind, file_path, label, duration, width, height) VALUES (?,?,?,?,?,?)',
          ['rendered', outPath, base, info.duration || null, info.width || null, info.height || null]
        );
        run('UPDATE render_items SET status = ?, output_path = ? WHERE id = ?', ['done', outPath, item.id]);
      } catch (err) {
        run('UPDATE render_items SET status = ?, error = ? WHERE id = ?', ['failed', String(err.message || err), item.id]);
      }
      run('UPDATE render_jobs SET done = done + 1 WHERE id = ?', [jobId]);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker());
  await Promise.all(workers);
  run('UPDATE render_jobs SET status = ? WHERE id = ?', ['done', jobId]);
}

export function jobStatus(jobId) {
  const job = get('SELECT * FROM render_jobs WHERE id = ?', [jobId]);
  if (!job) return null;
  const items = all('SELECT id, source_path, output_path, status, error FROM render_items WHERE job_id = ?', [jobId]);
  return { ...job, items };
}
