// Servidor principal: sobe o Express, serve a interface, expoe a API e liga o
// worker do agendador.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config, DIRS, ROOT } from './config.js';
import { get } from './db.js';
import editorRouter from './routes/editor.js';
import scheduleRouter from './routes/schedule.js';
import accountsRouter from './routes/accounts.js';
import { startWorker } from './scheduler/worker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// API
app.use('/api/editor', editorRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/', accountsRouter); // /workspaces, /accounts, /platforms, /settings, /oauth/*

// Arquivos publicos (usado pelo tunel do Instagram e para previews)
app.use('/public-media', express.static(DIRS.output));

// Preview de qualquer asset/molde pelo id (no navegador)
app.get('/preview/:id', (req, res) => {
  const m = get('SELECT file_path FROM media_assets WHERE id = ?', [Number(req.params.id)]);
  if (!m || !fs.existsSync(m.file_path)) return res.status(404).end();
  res.sendFile(path.resolve(m.file_path));
});
app.get('/mold-file/:id', (req, res) => {
  const m = get('SELECT file_path FROM molds WHERE id = ?', [Number(req.params.id)]);
  if (!m || !fs.existsSync(m.file_path)) return res.status(404).end();
  res.sendFile(path.resolve(m.file_path));
});

// Interface (HTML/CSS/JS)
app.use(express.static(path.join(ROOT, 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));

app.listen(config.port, () => {
  console.log(`\n  🌙  Projeto Dark rodando em ${config.baseUrl}\n`);
  startWorker();
});
