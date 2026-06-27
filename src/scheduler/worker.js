// Worker do agendador: a cada minuto verifica posts vencidos e publica.
// So funciona com o app aberto (e um processo local).
import cron from 'node-cron';
import { get } from '../db.js';
import { duePosts, markPosting, markPosted, markFailed } from './queue.js';
import { platforms } from '../platforms/index.js';

let running = false;

async function tick() {
  if (running) return; // evita sobreposicao se um ciclo demorar
  running = true;
  try {
    const due = duePosts();
    for (const post of due) {
      // trava o post (so segue se conseguiu mudar de 'scheduled' -> 'posting')
      if (!markPosting(post.id)) continue;
      const account = get('SELECT * FROM accounts WHERE id = ?', [post.account_id]);
      const platform = platforms[post.platform];
      try {
        if (!account) throw new Error('Conta nao encontrada');
        if (!platform) throw new Error(`Plataforma ${post.platform} nao suportada`);
        const result = await platform.publish({ account, mediaPath: post.media_path, caption: post.caption });
        markPosted(post.id, result?.externalId);
        console.log(`[worker] post ${post.id} publicado em ${post.platform}`);
      } catch (err) {
        markFailed(post.id, err.message || err);
        console.warn(`[worker] post ${post.id} FALHOU (${post.platform}): ${err.message || err}`);
      }
    }
  } finally {
    running = false;
  }
}

export function startWorker() {
  cron.schedule('* * * * *', tick); // todo minuto
  console.log('[worker] agendador ativo (verifica a cada minuto).');
  tick(); // roda uma vez ja no inicio
}
