// Instagram Reels via Meta Graph API.
// Requer conta Profissional (Business/Creator) ligada a uma Pagina do Facebook.
// A publicacao usa uma URL PUBLICA do video (servida via tunel cloudflared).
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { config, redirectUri } from '../config.js';
import { decrypt } from '../crypto.js';
import { DIRS } from '../config.js';
import { getPublicBaseUrl } from '../tunnel.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

export const name = 'instagram';
export const label = 'Instagram Reels';
export const manual = false;

export function connectUrl(state) {
  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: redirectUri('instagram'),
    state,
    response_type: 'code',
    scope: 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management',
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function handleCallback(query) {
  // 1) troca o code por um token de usuario
  const tokenRes = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: redirectUri('instagram'),
      code: query.code,
    },
  });
  let userToken = tokenRes.data.access_token;

  // 2) token de longa duracao
  try {
    const ll = await axios.get(`${GRAPH}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: config.meta.appId,
        client_secret: config.meta.appSecret,
        fb_exchange_token: userToken,
      },
    });
    userToken = ll.data.access_token || userToken;
  } catch { /* segue com o token curto */ }

  // 3) descobre a Pagina e a conta IG ligada
  const pages = await axios.get(`${GRAPH}/me/accounts`, {
    params: { fields: 'name,access_token,instagram_business_account', access_token: userToken },
  });
  const page = (pages.data.data || []).find((p) => p.instagram_business_account);
  if (!page) throw new Error('Nenhuma Pagina com conta Instagram Profissional encontrada.');

  const ig = await axios.get(`${GRAPH}/${page.instagram_business_account.id}`, {
    params: { fields: 'username', access_token: page.access_token },
  });

  return {
    externalId: page.instagram_business_account.id,
    displayName: ig.data.username ? `@${ig.data.username}` : page.name,
    accessToken: page.access_token, // token da Pagina (usado para publicar)
    refreshToken: null,
    expiresAt: null,
    scopes: 'instagram_content_publish',
    meta: { pageId: page.id },
  };
}

export async function publish({ account, mediaPath, caption }) {
  const igId = account.external_id;
  const token = decrypt(account.access_token_enc);
  const videoUrl = await publicUrlFor(mediaPath);

  // 1) cria o container do Reel
  const create = await axios.post(`${GRAPH}/${igId}/media`, null, {
    params: { media_type: 'REELS', video_url: videoUrl, caption: caption || '', access_token: token },
  });
  const creationId = create.data.id;

  // 2) aguarda o processamento (ate ~2min)
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    const st = await axios.get(`${GRAPH}/${creationId}`, {
      params: { fields: 'status_code', access_token: token },
    });
    if (st.data.status_code === 'FINISHED') break;
    if (st.data.status_code === 'ERROR') throw new Error('Instagram falhou ao processar o video.');
  }

  // 3) publica
  const pub = await axios.post(`${GRAPH}/${igId}/media_publish`, null, {
    params: { creation_id: creationId, access_token: token },
  });
  return { externalId: pub.data.id };
}

// Garante que o arquivo esteja sob data/output e devolve a URL publica (via tunel).
async function publicUrlFor(mediaPath) {
  const base = await getPublicBaseUrl();
  let rel = path.relative(DIRS.output, mediaPath);
  if (rel.startsWith('..')) {
    // arquivo fora de output: copia para uma pasta servida publicamente
    const dest = path.join(DIRS.output, '_ig', path.basename(mediaPath));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(mediaPath, dest);
    rel = path.relative(DIRS.output, dest);
  }
  return `${base}/public-media/${rel.split(path.sep).map(encodeURIComponent).join('/')}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
