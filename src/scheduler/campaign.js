// Gera uma CAMPANHA: distribui um lote de videos pelos dias e horarios fixos,
// criando todos os posts agendados de uma vez (ex.: 500 videos, 10/dia).
import { get, all, insert } from '../db.js';
import { addDays, createPost } from './queue.js';

// Gera horarios igualmente espacados entre 08:00 e 22:00 quando o usuario nao
// fornece a lista. Ex.: n=4 -> 08:00, 12:40, 17:20, 22:00.
function autoSlots(n) {
  if (n <= 1) return ['08:00'];
  const startMin = 8 * 60, endMin = 22 * 60;
  const step = (endMin - startMin) / (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const m = Math.round(startMin + step * i);
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  });
}

function applyTemplate(template, ctx) {
  if (!template) return '';
  return template
    .replaceAll('{n}', String(ctx.n))
    .replaceAll('{date}', ctx.date)
    .replaceAll('{label}', ctx.label || '');
}

// opts: { workspaceId, name, startDate, postsPerDay, timeSlots[], accountIds[],
//         mediaIds[], fanout, captionTemplate }
export function createCampaign(opts) {
  const accounts = opts.accountIds
    .map((id) => get('SELECT * FROM accounts WHERE id = ?', [id]))
    .filter(Boolean);
  if (!accounts.length) throw new Error('Selecione pelo menos uma conta.');

  const media = opts.mediaIds
    .map((id) => get('SELECT * FROM media_assets WHERE id = ?', [id]))
    .filter(Boolean);
  if (!media.length) throw new Error('Selecione pelo menos um video.');

  // horarios do dia
  let slots = Array.isArray(opts.timeSlots) ? opts.timeSlots.filter(Boolean) : [];
  const perDay = Number(opts.postsPerDay) || slots.length || 1;
  if (!slots.length) slots = autoSlots(perDay);
  if (slots.length < perDay) slots = autoSlots(perDay); // completa se faltar
  slots = slots.slice(0, perDay);

  const fanout = opts.fanout === 'roundrobin' ? 'roundrobin' : 'cross';

  const campaignId = insert(
    `INSERT INTO campaigns (workspace_id, name, start_date, posts_per_day, time_slots, account_ids, fanout, caption_template)
     VALUES (?,?,?,?,?,?,?,?)`,
    [opts.workspaceId, opts.name, opts.startDate, perDay,
     JSON.stringify(slots), JSON.stringify(opts.accountIds), fanout, opts.captionTemplate || '']
  );

  // distribui cada video num (dia, horario)
  let created = 0;
  media.forEach((m, i) => {
    const day = Math.floor(i / perDay);
    const slot = slots[i % perDay];
    const date = addDays(opts.startDate, day);
    const scheduledAt = `${date}T${slot}:00`;
    const caption = applyTemplate(opts.captionTemplate, { n: i + 1, date, label: m.label });

    const targets = fanout === 'roundrobin'
      ? [accounts[i % accounts.length]]
      : accounts; // cross: o mesmo video em todas as contas

    for (const acc of targets) {
      createPost({
        workspaceId: opts.workspaceId,
        campaignId,
        accountId: acc.id,
        platform: acc.platform,
        mediaPath: m.file_path,
        caption,
        scheduledAt,
      });
      created++;
    }
  });

  return { campaignId, posts: created, days: Math.ceil(media.length / perDay), slots };
}

export function listCampaigns(workspaceId) {
  const sql = workspaceId
    ? 'SELECT * FROM campaigns WHERE workspace_id = ? ORDER BY id DESC'
    : 'SELECT * FROM campaigns ORDER BY id DESC';
  const rows = workspaceId ? all(sql, [workspaceId]) : all(sql);
  return rows.map((c) => {
    const counts = get(
      `SELECT COUNT(*) AS total,
              SUM(status='posted') AS posted,
              SUM(status='failed') AS failed,
              SUM(status='scheduled') AS scheduled
       FROM posts WHERE campaign_id = ?`, [c.id]);
    return { ...c, time_slots: JSON.parse(c.time_slots || '[]'), counts };
  });
}
