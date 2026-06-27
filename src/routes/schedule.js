// Endpoints da FUNCAO 2 (agendamento + campanhas).
import express from 'express';
import { all, get, run } from '../db.js';
import { createCampaign, listCampaigns } from '../scheduler/campaign.js';
import { listPosts, createPost, cancelPost, localNowString } from '../scheduler/queue.js';

const router = express.Router();
router.use(express.json());

// ---- Campanhas ----
router.post('/campaigns', (req, res) => {
  try {
    const b = req.body;
    if (!b.workspaceId) return res.status(400).json({ error: 'Escolha um workspace.' });
    if (!b.startDate) return res.status(400).json({ error: 'Defina a data de inicio.' });
    const result = createCampaign({
      workspaceId: b.workspaceId,
      name: b.name || 'Campanha',
      startDate: b.startDate,
      postsPerDay: b.postsPerDay,
      timeSlots: b.timeSlots,
      accountIds: b.accountIds || [],
      mediaIds: b.mediaIds || [],
      fanout: b.fanout,
      captionTemplate: b.captionTemplate,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.get('/campaigns', (req, res) => {
  res.json(listCampaigns(req.query.workspaceId ? Number(req.query.workspaceId) : null));
});

router.get('/campaigns/:id/posts', (req, res) => {
  res.json(listPosts({ campaignId: Number(req.params.id) }));
});

// pausar/cancelar: cancela os posts ainda agendados da campanha
router.post('/campaigns/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  run("UPDATE posts SET status = 'canceled' WHERE campaign_id = ? AND status = 'scheduled'", [id]);
  run("UPDATE campaigns SET status = 'paused' WHERE id = ?", [id]);
  res.json({ ok: true });
});

// ---- Posts avulsos ----
router.get('/posts', (req, res) => {
  res.json(listPosts({
    workspaceId: req.query.workspaceId ? Number(req.query.workspaceId) : undefined,
    status: req.query.status,
  }));
});

// postar agora (ou em um horario): cria 1 post por conta selecionada
router.post('/post-now', (req, res) => {
  try {
    const b = req.body;
    const media = get('SELECT * FROM media_assets WHERE id = ?', [b.mediaId]);
    if (!media) return res.status(400).json({ error: 'Video nao encontrado.' });
    const accountIds = b.accountIds || [];
    const when = b.scheduledAt || localNowString();
    const ids = [];
    for (const accId of accountIds) {
      const acc = get('SELECT * FROM accounts WHERE id = ?', [accId]);
      if (!acc) continue;
      ids.push(createPost({
        workspaceId: acc.workspace_id,
        accountId: acc.id,
        platform: acc.platform,
        mediaPath: media.file_path,
        caption: b.caption || '',
        scheduledAt: when,
      }));
    }
    res.json({ created: ids.length });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

router.post('/posts/:id/cancel', (req, res) => {
  cancelPost(Number(req.params.id));
  res.json({ ok: true });
});

export default router;
