// Workspaces (estilo "BM"), contas vinculadas, OAuth e configuracoes.
import express from 'express';
import { all, get, run, insert } from '../db.js';
import { config, platformConfigured, redirectUri, saveCredentials } from '../config.js';
import { encrypt } from '../crypto.js';
import { platforms, PLATFORM_LIST } from '../platforms/index.js';

const router = express.Router();

// ---- Workspaces ----
router.get('/workspaces', (_req, res) => {
  const ws = all('SELECT * FROM workspaces ORDER BY id');
  res.json(ws.map((w) => ({
    ...w,
    accounts: all('SELECT id, platform, display_name, status FROM accounts WHERE workspace_id = ?', [w.id]),
  })));
});

router.post('/workspaces', express.json(), (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe um nome.' });
  const id = insert('INSERT INTO workspaces (name) VALUES (?)', [name]);
  res.json(get('SELECT * FROM workspaces WHERE id = ?', [id]));
});

router.delete('/workspaces/:id', (req, res) => {
  run('DELETE FROM workspaces WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ---- Contas ----
router.get('/accounts', (req, res) => {
  const wsId = req.query.workspaceId;
  const sql = wsId ? 'SELECT * FROM accounts WHERE workspace_id = ? ORDER BY id' : 'SELECT * FROM accounts ORDER BY id';
  res.json(wsId ? all(sql, [Number(wsId)]) : all(sql));
});

router.delete('/accounts/:id', (req, res) => {
  run('DELETE FROM accounts WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// Kwai (e qualquer plataforma manual): cadastro so com nome, sem OAuth.
router.post('/accounts/manual', express.json(), (req, res) => {
  const { workspaceId, platform, displayName } = req.body;
  if (!workspaceId || !platform) return res.status(400).json({ error: 'Dados incompletos.' });
  const id = insert(
    'INSERT INTO accounts (workspace_id, platform, display_name, status) VALUES (?,?,?,?)',
    [workspaceId, platform, displayName || platform, 'connected']
  );
  res.json(get('SELECT * FROM accounts WHERE id = ?', [id]));
});

// ---- Plataformas (status de configuracao) ----
router.get('/platforms', (_req, res) => {
  res.json(PLATFORM_LIST.map((p) => ({ ...p, configured: platformConfigured(p.name) })));
});

// ---- Configuracoes (credenciais OAuth) ----
router.get('/settings', (_req, res) => {
  const mask = (v) => (v ? '••••••••' : '');
  res.json({
    baseUrl: config.baseUrl,
    redirectUris: {
      youtube: redirectUri('youtube'),
      instagram: redirectUri('instagram'),
      tiktok: redirectUri('tiktok'),
    },
    youtube: { clientId: config.youtube.clientId, clientSecret: mask(config.youtube.clientSecret) },
    meta: { appId: config.meta.appId, appSecret: mask(config.meta.appSecret) },
    tiktok: { clientKey: config.tiktok.clientKey, clientSecret: mask(config.tiktok.clientSecret) },
  });
});

router.post('/settings', express.json(), (req, res) => {
  const v = {};
  const b = req.body || {};
  // so grava o que veio preenchido (ignora os campos mascarados/vazios)
  const map = {
    youtubeClientId: b.youtubeClientId, youtubeClientSecret: b.youtubeClientSecret,
    metaAppId: b.metaAppId, metaAppSecret: b.metaAppSecret,
    tiktokClientKey: b.tiktokClientKey, tiktokClientSecret: b.tiktokClientSecret,
  };
  for (const [k, val] of Object.entries(map)) {
    if (typeof val === 'string' && val && !val.includes('•')) v[k] = val.trim();
  }
  saveCredentials(v);
  res.json({ ok: true });
});

// ---- OAuth ----
function encodeState(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function decodeState(s) { try { return JSON.parse(Buffer.from(s, 'base64url').toString()); } catch { return {}; } }

router.get('/oauth/:platform/connect', (req, res) => {
  const platform = platforms[req.params.platform];
  if (!platform || platform.manual) return res.status(400).send('Plataforma invalida para OAuth.');
  if (!platformConfigured(req.params.platform)) {
    return res.status(400).send('Configure as credenciais desta plataforma em Configuracoes.');
  }
  const state = encodeState({ workspaceId: Number(req.query.workspaceId) || null, p: req.params.platform });
  res.redirect(platform.connectUrl(state));
});

router.get('/oauth/:platform/callback', async (req, res) => {
  const platform = platforms[req.params.platform];
  if (!platform) return res.status(400).send('Plataforma invalida.');
  if (req.query.error) return res.send(renderClose(`Conexao cancelada: ${req.query.error_description || req.query.error}`));
  try {
    const state = decodeState(req.query.state || '');
    const data = await platform.handleCallback(req.query);
    insert(
      `INSERT INTO accounts (workspace_id, platform, display_name, external_id,
        access_token_enc, refresh_token_enc, token_expires_at, scopes, meta, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'connected')`,
      [
        state.workspaceId, req.params.platform, data.displayName, data.externalId,
        encrypt(data.accessToken), encrypt(data.refreshToken), data.expiresAt,
        data.scopes, JSON.stringify(data.meta || {}),
      ]
    );
    res.send(renderClose(`Conta conectada: ${data.displayName} (${platform.label})`));
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data) : (err.message || String(err));
    res.send(renderClose(`Falha ao conectar: ${msg}`));
  }
});

// Pagina simples que avisa e fecha a aba do OAuth, atualizando a principal.
function renderClose(message) {
  return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0c0a09;color:#fdf6ef;padding:48px;text-align:center">
  <div style="font-size:46px">💸</div>
  <h2 style="color:#ff7a18">${message}</h2><p style="color:#b6a392">Pode fechar esta aba.</p>
  <script>try{window.opener&&window.opener.postMessage('oauth-done','*')}catch(e){};setTimeout(()=>window.close(),2500)</script>
  </body>`;
}

export default router;
