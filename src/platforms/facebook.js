// Facebook: publica vídeo numa Página via Graph API (upload direto de arquivo).
// Usa o MESMO app do Meta que o Instagram (META_APP_ID / META_APP_SECRET).
import axios from 'axios';
import fs from 'node:fs';
import { config, redirectUri } from '../config.js';
import { decrypt } from '../crypto.js';

const GRAPH = 'https://graph.facebook.com/v21.0';
const GRAPH_VIDEO = 'https://graph-video.facebook.com/v21.0';

export const name = 'facebook';
export const label = 'Facebook (Página)';
export const manual = false;

export function connectUrl(state) {
  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: redirectUri('facebook'),
    state,
    response_type: 'code',
    scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,publish_video,business_management',
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

export async function handleCallback(query) {
  // 1) code -> token de usuario
  const tokenRes = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: redirectUri('facebook'),
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

  // 3) pega a primeira Pagina administrada
  const pages = await axios.get(`${GRAPH}/me/accounts`, {
    params: { fields: 'name,access_token', access_token: userToken },
  });
  const page = (pages.data.data || [])[0];
  if (!page) throw new Error('Nenhuma Página do Facebook encontrada nesta conta.');

  return {
    externalId: page.id,
    displayName: page.name,
    accessToken: page.access_token, // token da Pagina (publica em nome dela)
    refreshToken: null,
    expiresAt: null,
    scopes: 'pages_manage_posts,publish_video',
    meta: {},
  };
}

export async function publish({ account, mediaPath, caption }) {
  const pageId = account.external_id;
  const token = decrypt(account.access_token_enc);

  const buf = fs.readFileSync(mediaPath);
  const form = new FormData();
  form.append('access_token', token);
  form.append('description', caption || '');
  form.append('source', new Blob([buf], { type: 'video/mp4' }), 'video.mp4');

  const res = await fetch(`${GRAPH_VIDEO}/${pageId}/videos`, { method: 'POST', body: form });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Falha ao publicar no Facebook.');
  return { externalId: data.id };
}
