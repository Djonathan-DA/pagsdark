// YouTube Shorts: OAuth + upload via YouTube Data API v3.
import { google } from 'googleapis';
import fs from 'node:fs';
import { config, redirectUri } from '../config.js';
import { decrypt } from '../crypto.js';

export const name = 'youtube';
export const label = 'YouTube Shorts';
export const manual = false;

function client() {
  return new google.auth.OAuth2(config.youtube.clientId, config.youtube.clientSecret, redirectUri('youtube'));
}

export function connectUrl(state) {
  return client().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    state,
  });
}

export async function handleCallback(query) {
  const o = client();
  const { tokens } = await o.getToken(query.code);
  o.setCredentials(tokens);
  const yt = google.youtube({ version: 'v3', auth: o });
  const me = await yt.channels.list({ part: ['snippet'], mine: true });
  const ch = me.data.items?.[0];
  return {
    externalId: ch?.id || null,
    displayName: ch?.snippet?.title || 'Canal YouTube',
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scopes: tokens.scope || '',
    meta: {},
  };
}

export async function publish({ account, mediaPath, caption }) {
  const o = client();
  o.setCredentials({
    refresh_token: decrypt(account.refresh_token_enc),
    access_token: decrypt(account.access_token_enc),
  });
  const yt = google.youtube({ version: 'v3', auth: o });
  const title = (caption || 'Short').split('\n')[0].slice(0, 95) || 'Short';
  const description = `${caption || ''}\n\n#Shorts`.trim();
  const res = await yt.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, categoryId: '22' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(mediaPath) },
  });
  return { externalId: res.data.id };
}
