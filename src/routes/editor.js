// Endpoints da FUNCAO 1 (editor de video em massa).
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { DIRS } from '../config.js';
import { all, get, run, insert } from '../db.js';
import { analyzeMold } from '../editor/mold.js';
import { probe } from '../ffmpeg.js';
import { startBatch, jobStatus } from '../editor/batch.js';
import { ensureThumb, warmThumbnails, thumbPathFor } from '../editor/thumbs.js';

// Remove um arquivo do disco sem quebrar se ele nao existir.
function safeUnlink(p) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {} }

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
    const { canvasW, canvasH, area, detected } = await analyzeMold(finalPath);
    const name = req.body.name || path.parse(req.file.originalname).name;
    const id = insert(
      `INSERT INTO molds (name, file_path, canvas_w, canvas_h, area_x, area_y, area_w, area_h, area_auto, has_alpha)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [name, finalPath, canvasW, canvasH, area.x, area.y, area.w, area.h, detected ? 1 : 0, detected ? 1 : 0]
    );
    res.json(get('SELECT * FROM molds WHERE id = ?', [id]));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Atualiza a AREA do video no molde (seletor manual / presets na tela).
router.post('/molds/:id/area', express.json(), (req, res) => {
  const mold = get('SELECT * FROM molds WHERE id = ?', [Number(req.params.id)]);
  if (!mold) return res.status(404).json({ error: 'Molde nao encontrado.' });
  const clampEven = (v, max) => {
    let n = Math.round(Number(v) || 0);
    n = Math.max(0, Math.min(n, max));
    return Math.max(2, n - (n % 2)); // par (exigencia do H.264)
  };
  const x = Math.max(0, Math.min(Math.round(Number(req.body.x) || 0), mold.canvas_w - 2));
  const y = Math.max(0, Math.min(Math.round(Number(req.body.y) || 0), mold.canvas_h - 2));
  const w = clampEven(req.body.w, mold.canvas_w - x);
  const h = clampEven(req.body.h, mold.canvas_h - y);
  // area definida manualmente passa a ser "confiavel" (area_auto = 1): some o aviso.
  run('UPDATE molds SET area_x=?, area_y=?, area_w=?, area_h=?, area_auto=1 WHERE id=?',
    [x - (x % 2), y - (y % 2), w, h, mold.id]);
  res.json(get('SELECT * FROM molds WHERE id = ?', [mold.id]));
});

// Define COMO o vídeo entra no molde: por cima da arte (onTop=true -> has_alpha=0)
// ou por trás, aparecendo pelo furo transparente (onTop=false -> has_alpha=1).
router.post('/molds/:id/mode', express.json(), (req, res) => {
  const mold = get('SELECT * FROM molds WHERE id = ?', [Number(req.params.id)]);
  if (!mold) return res.status(404).json({ error: 'Molde nao encontrado.' });
  run('UPDATE molds SET has_alpha = ? WHERE id = ?', [req.body.onTop ? 0 : 1, mold.id]);
  res.json(get('SELECT * FROM molds WHERE id = ?', [mold.id]));
});

// Exclui um molde (e o arquivo PNG).
router.delete('/molds/:id', (req, res) => {
  const mold = get('SELECT * FROM molds WHERE id = ?', [Number(req.params.id)]);
  if (mold) { safeUnlink(mold.file_path); run('DELETE FROM molds WHERE id = ?', [mold.id]); }
  res.json({ ok: true });
});

// ---- Audios (trilha extra, aplicada a 35% no render) ----
const uploadAudio = multer({ dest: DIRS.audios });
router.get('/audios', (_req, res) => {
  res.json(all("SELECT * FROM media_assets WHERE kind = 'audio' ORDER BY id DESC"));
});
router.post('/audios', uploadAudio.single('audio'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie um arquivo de áudio no campo "audio".' });
    const ext = path.extname(req.file.originalname).toLowerCase() || '.mp3';
    const finalPath = path.join(DIRS.audios, `audio-${Date.now()}${ext}`);
    fs.renameSync(req.file.path, finalPath);
    const id = insert("INSERT INTO media_assets (kind, file_path, label) VALUES ('audio',?,?)",
      [finalPath, path.parse(req.file.originalname).name]);
    res.json(get('SELECT * FROM media_assets WHERE id = ?', [id]));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
router.delete('/audios/:id', (req, res) => {
  removeAsset(get("SELECT * FROM media_assets WHERE id = ? AND kind = 'audio'", [Number(req.params.id)]));
  res.json({ ok: true });
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
  warmThumbnails(); // pre-gera os thumbs em background (nao bloqueia a resposta)
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
    warmThumbnails(); // pre-gera os thumbs em background
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

// Poster leve (JPG) de qualquer asset — gerado sob demanda e cacheado em disco.
// Substitui dezenas de <video> no navegador (era o que travava o PC ao subir muitos videos).
router.get('/thumb/:id', async (req, res) => {
  const m = get('SELECT * FROM media_assets WHERE id = ?', [Number(req.params.id)]);
  if (!m) return res.status(404).end();
  try {
    const out = await ensureThumb(m);
    if (!out) return res.status(404).end();
    res.type('jpg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // o navegador cacheia o poster
    res.sendFile(path.resolve(out));
  } catch {
    res.status(404).end();
  }
});

// Um arquivo e "gerenciado" se vive dentro de data/ (foi copiado/gerado pelo app).
// Videos importados por REFERENCIA (via "Importar pasta") apontam para a pasta
// original do usuario e NUNCA devem ser apagados do disco ao excluir da lista.
function isManaged(p) {
  if (!p) return false;
  const rel = path.relative(DIRS.data, path.resolve(p));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// Remove um asset do banco; apaga do disco apenas arquivos gerenciados (data/).
function removeAsset(m) {
  if (!m) return;
  if (isManaged(m.file_path)) safeUnlink(m.file_path);
  safeUnlink(m.thumb_path);          // thumb fica sempre em data/thumbs -> seguro apagar
  safeUnlink(thumbPathFor(m.id));    // tambem o cache por id, caso thumb_path nao tenha sido salvo
  run('DELETE FROM media_assets WHERE id = ?', [m.id]);
}

// Excluir UM video-fonte.
router.delete('/sources/:id', (req, res) => {
  removeAsset(get("SELECT * FROM media_assets WHERE id = ? AND kind = 'source'", [Number(req.params.id)]));
  res.json({ ok: true });
});

// Excluir TODOS os videos-fonte de uma vez.
router.delete('/sources', (_req, res) => {
  const list = all("SELECT * FROM media_assets WHERE kind = 'source'");
  list.forEach(removeAsset);
  res.json({ ok: true, removed: list.length });
});

// ---- Renderizacao em lote ----
router.post('/render', express.json(), (req, res) => {
  try {
    const { moldId, sourceIds, focusX, focusY, audioId } = req.body;
    if (!moldId) return res.status(400).json({ error: 'Escolha um molde.' });
    const ids = Array.isArray(sourceIds) && sourceIds.length
      ? sourceIds
      : all("SELECT id FROM media_assets WHERE kind = 'source'").map((r) => r.id);
    const sources = ids
      .map((id) => get('SELECT file_path FROM media_assets WHERE id = ?', [id]))
      .filter(Boolean)
      .map((r) => r.file_path);
    if (!sources.length) return res.status(400).json({ error: 'Nenhum video para renderizar.' });
    // trilha de audio opcional (entra a 35%)
    let audioPath = null;
    if (audioId) {
      const a = get("SELECT file_path FROM media_assets WHERE id = ? AND kind = 'audio'", [audioId]);
      if (a) audioPath = a.file_path;
    }
    const jobId = startBatch({ moldId, sources, focus: { x: focusX, y: focusY }, audioPath });
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

// "Salvar como": exporta os videos editados do job para uma PASTA escolhida.
router.post('/job/:id/export', express.json(), (req, res) => {
  try {
    const job = get('SELECT * FROM render_jobs WHERE id = ?', [Number(req.params.id)]);
    if (!job || !job.output_dir || !fs.existsSync(job.output_dir)) return res.status(404).json({ error: 'Job nao encontrado.' });
    const dest = String(req.body.folder || '').trim();
    if (!dest) return res.status(400).json({ error: 'Informe a pasta de destino.' });
    fs.mkdirSync(dest, { recursive: true });
    let copied = 0;
    for (const name of fs.readdirSync(job.output_dir)) {
      if (!/\.(mp4|mov|webm|mkv)$/i.test(name)) continue;
      fs.copyFileSync(path.join(job.output_dir, name), path.join(dest, name));
      copied++;
    }
    res.json({ ok: true, copied, folder: dest });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

// biblioteca de videos JA renderizados (usada pelo agendador)
router.get('/library', (_req, res) => {
  res.json(all("SELECT * FROM media_assets WHERE kind = 'rendered' ORDER BY id DESC"));
});

// Excluir UM video renderizado da biblioteca.
router.delete('/library/:id', (req, res) => {
  removeAsset(get("SELECT * FROM media_assets WHERE id = ? AND kind = 'rendered'", [Number(req.params.id)]));
  res.json({ ok: true });
});

// Excluir TODOS os videos renderizados.
router.delete('/library', (_req, res) => {
  const list = all("SELECT * FROM media_assets WHERE kind = 'rendered'");
  list.forEach(removeAsset);
  res.json({ ok: true, removed: list.length });
});

export default router;
