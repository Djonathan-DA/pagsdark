// TikTok via Content Posting API (upload direto de arquivo).
// IMPORTANTE: apps nao auditados so publicam como SELF_ONLY (privado/rascunho).
import axios from 'axios';
import fs from 'node:fs';
import { config, redirectUri } from '../config.js';
import { decrypt } from '../crypto.js';

const API = 'https://open.tiktokapis.com';

export const name = 'tiktok';
export const label = 'TikTok';
export const manual = false;

export function connectUrl(state) {
  const params = new URLSearchParams({
    client_key: config.tiktok.clientKey,
    response_type: 'code',
    scope: 'video.publish,video.upload',
    redirect_uri: redirectUri('tiktok'),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

export async function handleCallback(query) {
  const res = await axios.post(`${API}/v2/oauth/token/`, new URLSearchParams({
    client_key: config.tiktok.clientKey,
    client_secret: config.tiktok.clientSecret,
    code: query.code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri('tiktok'),
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

  const d = res.data;
  return {
    externalId: d.open_id,
    displayName: 'Conta TikTok',
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000).toISOString() : null,
    scopes: d.scope || '',
    meta: {},
  };
}

export async function publish({ account, mediaPath, caption }) {
  const token = decrypt(account.access_token_enc);
  const stat = fs.statSync(mediaPath);
  const size = stat.size;

  // 1) inicia o envio (FILE_UPLOAD, arquivo unico)
  const init = await axios.post(`${API}/v2/post/publish/video/init/`, {
    post_info: {
      title: (caption || '').slice(0, 2200),
      privacy_level: 'SELF_ONLY', // obrigatorio enquanto o app nao for auditado
      disable_comment: false,
      disable_duet: false,
      disable_stitch: false,
    },
    source_info: {
      source: 'FILE_UPLOAD',
      video_size: size,
      chunk_size: size,
      total_chunk_count: 1,
    },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  const { publish_id, upload_url } = init.data.data;

  // 2) envia os bytes do video
  await axios.put(upload_url, fs.createReadStream(mediaPath), {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': size,
      'Content-Range': `bytes 0-${size - 1}/${size}`,
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  return { externalId: publish_id };
}
