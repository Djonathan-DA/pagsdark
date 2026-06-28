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
import { authEnabled, getUser, publicAuthConfig } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Cabecalhos basicos de seguranca (sem dependencia extra).
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Arquivos publicos para o tunel do Instagram (a Meta busca o video por fora):
// precisa ficar SEM login. Colocado antes do gate de autenticacao de proposito.
app.use('/public-media', express.static(DIRS.output));

// ---- Autenticacao (Supabase) ----
// Config publica para o cliente (sem segredos) e logout.
app.get('/auth/config', (_req, res) => res.json(publicAuthConfig()));
app.get('/login', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'login.html')));
app.get('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax');
  res.redirect('/login');
});

// Gate: quando o login esta ligado, tudo (menos os itens publicos) exige sessao.
const OPEN_PATHS = ['/login', '/login.html', '/login.js', '/style.css', '/auth/config', '/logout', '/favicon.ico'];
app.use((req, res, next) => {
  if (!authEnabled()) { req.user = { id: 'local', local: true }; return next(); }
  if (OPEN_PATHS.includes(req.path) || req.path.startsWith('/public-media')) return next();
  const user = getUser(req);
  if (user) { req.user = user; return next(); }
  if ((req.headers.accept || '').includes('text/html')) return res.redirect('/login');
  return res.status(401).json({ error: 'Não autenticado.' });
});

// API (protegida pelo gate acima quando o login esta ligado)
app.use('/api/editor', editorRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/', accountsRouter); // /workspaces, /accounts, /platforms, /settings, /oauth/*

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

// Vincula apenas ao localhost: o app e local e nao deve ficar exposto na rede.
app.listen(config.port, '127.0.0.1', () => {
  console.log(`\n  💸  PagsDark rodando em ${config.baseUrl}\n`);
  startWorker();
});
