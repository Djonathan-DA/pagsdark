// Registro central das plataformas. Cada modulo expoe a mesma interface:
//   name, label, manual, connectUrl(state), handleCallback(query), publish({...})
import * as youtube from './youtube.js';
import * as instagram from './instagram.js';
import * as tiktok from './tiktok.js';
import * as kwai from './kwai.js';

export const platforms = { youtube, instagram, tiktok, kwai };

export const PLATFORM_LIST = Object.values(platforms).map((p) => ({
  name: p.name, label: p.label, manual: Boolean(p.manual),
}));
