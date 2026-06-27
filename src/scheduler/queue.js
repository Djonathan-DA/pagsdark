// CRUD dos posts agendados + helpers de data (tudo em hora LOCAL do Mac).
import { all, get, run, insert } from '../db.js';

// "2026-06-28T08:00:00" no relogio local (sem fuso, evita confusao de timezone).
export function localNowString() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// soma N dias a uma data "YYYY-MM-DD" e devolve "YYYY-MM-DD".
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0); // meio-dia evita problemas de horario de verao
  dt.setDate(dt.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function createPost(p) {
  return insert(
    `INSERT INTO posts (workspace_id, campaign_id, account_id, platform, media_path, caption, scheduled_at, status)
     VALUES (?,?,?,?,?,?,?, 'scheduled')`,
    [p.workspaceId, p.campaignId || null, p.accountId, p.platform, p.mediaPath, p.caption || '', p.scheduledAt]
  );
}

export function listPosts(filter = {}) {
  let sql = `SELECT p.*, a.display_name AS account_name
             FROM posts p LEFT JOIN accounts a ON a.id = p.account_id`;
  const where = [], params = [];
  if (filter.campaignId) { where.push('p.campaign_id = ?'); params.push(filter.campaignId); }
  if (filter.workspaceId) { where.push('p.workspace_id = ?'); params.push(filter.workspaceId); }
  if (filter.status) { where.push('p.status = ?'); params.push(filter.status); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY p.scheduled_at ASC';
  return all(sql, params);
}

export function duePosts() {
  return all(
    "SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 20",
    [localNowString()]
  );
}

export function cancelPost(id) {
  return run("UPDATE posts SET status = 'canceled' WHERE id = ? AND status = 'scheduled'", [id]);
}

export function markPosting(id) {
  // marca como 'posting' so se ainda estiver 'scheduled' (evita disparo duplo)
  return run("UPDATE posts SET status = 'posting' WHERE id = ? AND status = 'scheduled'", [id]).changes;
}

export function markPosted(id, externalId) {
  return run("UPDATE posts SET status = 'posted', external_post_id = ?, posted_at = ? WHERE id = ?",
    [externalId || null, localNowString(), id]);
}

export function markFailed(id, error) {
  return run("UPDATE posts SET status = 'failed', error = ? WHERE id = ?", [String(error).slice(0, 500), id]);
}

export { get };
