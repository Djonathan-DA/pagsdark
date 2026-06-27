// Registro central das plataformas. Cada modulo expoe a mesma interface:
//   name, label, manual, connectUrl(state), handleCallback(query), publish({...})
import * as youtube from './youtube.js';
import * as instagram from './instagram.js';
import * as facebook from './facebook.js';
import * as tiktok from './tiktok.js';

export const platforms = { youtube, instagram, facebook, tiktok };

export const PLATFORM_LIST = Object.values(platforms).map((p) => ({
  name: p.name, label: p.label, manual: Boolean(p.manual),
}));
