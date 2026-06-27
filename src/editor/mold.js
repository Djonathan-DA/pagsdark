// Analisa o molde (PNG) e descobre a AREA onde o video deve entrar.
// Regra: a area e o "buraco" transparente do PNG (pixels com alfa baixo).
// Se nao houver transparencia, usa o canvas inteiro.
import sharp from 'sharp';

const ALPHA_THRESHOLD = 128; // abaixo disso o pixel e considerado "buraco"

function even(n) { return Math.max(2, Math.round(n / 2) * 2); } // dimensoes pares (exigencia do H.264)

export async function analyzeMold(filePath) {
  const img = sharp(filePath);
  const meta = await img.metadata();
  const canvasW = meta.width || 1080;
  const canvasH = meta.height || 1920;

  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels; // 4 (RGBA)
  let minX = canvasW, minY = canvasH, maxX = -1, maxY = -1;

  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const alpha = data[(y * canvasW + x) * ch + (ch - 1)];
      if (alpha < ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  let area;
  if (maxX < 0) {
    // Sem transparencia: usa o canvas inteiro.
    area = { x: 0, y: 0, w: even(canvasW), h: even(canvasH) };
  } else {
    area = {
      x: even(minX),
      y: even(minY),
      w: even(maxX - minX + 1),
      h: even(maxY - minY + 1),
    };
  }

  return { canvasW: even(canvasW), canvasH: even(canvasH), area };
}
