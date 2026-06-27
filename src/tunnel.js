// Sobe um tunel temporario (cloudflared) apontando para o servidor local.
// O Instagram exige uma URL PUBLICA do video para publicar; o tunel resolve isso.
import { existsSync } from 'node:fs';
import { config } from './config.js';

let cached = null; // { url, stop }

export async function getPublicBaseUrl() {
  if (cached?.url) return cached.url;
  const { bin, install, tunnel } = await import('cloudflared');
  if (!existsSync(bin)) await install(bin);
  const t = tunnel({ '--url': config.baseUrl });
  const url = await t.url; // ex.: https://abc-xyz.trycloudflare.com
  cached = { url, stop: t.stop };
  console.log(`[tunnel] URL publica ativa: ${url}`);
  return url;
}

export function stopTunnel() {
  try { cached?.stop?.(); } catch {}
  cached = null;
}
