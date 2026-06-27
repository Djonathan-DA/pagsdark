// Endpoints da FUNCAO 1 (editor de video em massa).
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { DIRS } from '../config.js';
import { all, get, insert } from '../db.js';
import { analyzeMold } from '../editor/mold.js';
import { probe } from '../ffmpeg.js';
import { startBatch, jobStatus } from '../editor/batch.js';

const router = express.Router();

const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi']);

// uploads de molde (PNG) e de videos vao para pastas diferentes
const uploadMold = multer({ dest: DIRS.molds });
const uploadVideos = multer({ dest: DIRS.media });

// ---- Moldes ----
router.get('/molds', (_req, res) => {
  res.json(all('SELECT * FROM molds ORDER BY id DESC'));
});

router.post('/molds', uploadMold.single('mold'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo PNG no campo "mold".' });
    const finalPath = path.join(DIRS.molds, `mold-${Date.now()}.png`);
    fs.renameSync(req.file.path, finalPath);
    const { canvasW, canvasH, area } = await analyzeMold(finalPath);
    const name = req.body.name || path.parse(req.file.originalname).name;
    const id = insert(
      `INSERT INTO molds (name, file_path, canvas_w, canvas_h, area_x, area_y, area_w, area_h)
       VALUES (?,?,?,?,?,?,?,?)`,
      [name, finalPath, canvasW, canvasH, area.x, area.y, area.w, area.h]
    );
    res.json(get('SELECT * FROM molds WHERE id = ?', [id]));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// ---- Videos-fonte ----
router.get('/sources', (_req, res) => {
  res.json(all("SELECT * FROM media_assets WHERE kind = 'source' ORDER BY id DESC"));
});

// upload de varios videos pelo navegador
router.post('/sources/upload', uploadVideos.array('videos', 1000), async (req, res) => {
  const created = [];
  for (const f of req.files || []) {
    const ext = path.extname(f.originalname).toLowerCase() || '.mp4';
    const finalPath = path.join(DIRS.media, `src-${Date.now()}-${created.length}${ext}`);
    fs.renameSync(f.path, finalPath);
    created.push(await registerSource(finalPath, path.parse(f.originalname).name));
  }
  res.json(created);
});

// importar uma PASTA do disco (ideal para centenas de videos, sem copiar)
router.post('/sources/import-folder', express.json(), async (req, res) => {
  try {
    const folder = req.body.folder;
    if (!folder || !fs.existsSync(folder)) return res.status(400).json({ error: 'Pasta nao encontrada.' });
    const files = fs.readdirSync(folder)
      .filter((n) => VIDEO_EXT.has(path.extname(n).toLowerCase()))
      .map((n) => path.join(folder, n));
    const created = [];
    for (const file of files) created.push(await registerSource(file, path.parse(file).name));
    res.json({ imported: created.length, items: created });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

async function registerSource(filePath, label) {
  const info = await probe(filePath).catch(() => ({}));
  const id = insert(
    'INSERT INTO media_assets (kind, file_path, label, duration, width, height) VALUES (?,?,?,?,?,?)',
    ['source', filePath, label, info.duration || null, info.width || null, info.height || null]
  );
  return get('SELECT * FROM media_assets WHERE id = ?', [id]);
}

// ---- Renderizacao em lote ----
router.post('/render', express.json(), (req, res) => {
  try {
    const { moldId, sourceIds } = req.body;
    if (!moldId) return res.status(400).json({ error: 'Escolha um molde.' });
    const ids = Array.isArray(sourceIds) && sourceIds.length
      ? sourceIds
      : all("SELECT id FROM media_assets WHERE kind = 'source'").map((r) => r.id);
    const sources = ids
      .map((id) => get('SELECT file_path FROM media_assets WHERE id = ?', [id]))
      .filter(Boolean)
      .map((r) => r.file_path);
    if (!sources.length) return res.status(400).json({ error: 'Nenhum video para renderizar.' });
    const jobId = startBatch({ moldId, sources });
    res.json({ jobId });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.get('/job/:id', (req, res) => {
  const status = jobStatus(Number(req.params.id));
  if (!status) return res.status(404).json({ error: 'Job nao encontrado.' });
  res.json(status);
});

// baixar TODOS os videos renderizados do job em um ZIP
router.get('/job/:id/zip', (req, res) => {
  const job = get('SELECT * FROM render_jobs WHERE id = ?', [Number(req.params.id)]);
  if (!job || !job.output_dir) return res.status(404).json({ error: 'Job nao encontrado.' });
  res.attachment(`projeto-dark-job-${job.id}.zip`);
  const zip = archiver('zip', { zlib: { level: 5 } });
  zip.on('error', (err) => res.status(500).end(String(err)));
  zip.pipe(res);
  zip.directory(job.output_dir, false);
  zip.finalize();
});

// biblioteca de videos JA renderizados (usada pelo agendador)
router.get('/library', (_req, res) => {
  res.json(all("SELECT * FROM media_assets WHERE kind = 'rendered' ORDER BY id DESC"));
});

export default router;
