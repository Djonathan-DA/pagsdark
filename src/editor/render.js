// Renderiza UM video dentro do molde: recorta/escala o video para preencher a
// area (cover), coloca na posicao certa e sobrepoe a arte do molde por cima.
import { ffmpeg, probe } from '../ffmpeg.js';

// mold = { file_path, canvas_w, canvas_h, area_x, area_y, area_w, area_h }
// focus = { x, y } em 0..100 -> onde o video fica enquadrado na area (pan).
// audioFile (opcional) = trilha extra que entra a 35% de volume, em loop.
export async function renderOne(sourceVideo, mold, outputPath, focus = {}, audioFile = null) {
  const { duration, hasAudio } = await probe(sourceVideo);
  const dur = duration && duration > 0 ? duration : 60;

  const cw = mold.canvas_w, ch = mold.canvas_h;
  const aw = mold.area_w, ah = mold.area_h;
  const ax = mold.area_x, ay = mold.area_y;
  const fnum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 50; }; // 0 e valido!
  const fx = Math.min(1, Math.max(0, fnum(focus.x) / 100));
  const fy = Math.min(1, Math.max(0, fnum(focus.y) / 100));

  // Dois modos de composicao:
  //  - has_alpha = 1: o molde TEM furo transparente -> a arte vai POR CIMA e o
  //    video aparece pelo buraco (comportamento classico de "moldura").
  //  - has_alpha = 0: o molde e opaco -> colamos o video POR CIMA da arte, dentro
  //    da area marcada. Assim a area que o usuario escolhe sempre tem efeito.
  const hasAlpha = mold.has_alpha === undefined ? 1 : Number(mold.has_alpha);
  const videoStage = `[0:v]scale=${aw}:${ah}:force_original_aspect_ratio=increase,crop=${aw}:${ah}:(iw-${aw})*${fx.toFixed(4)}:(ih-${ah})*${fy.toFixed(4)},setsar=1,fps=30[vid]`;
  const filters = hasAlpha
    ? [
        `color=c=black:s=${cw}x${ch}:r=30:d=${dur}[bg]`,
        videoStage,
        `[bg][vid]overlay=${ax}:${ay}[tmp]`,   // video na area
        `[tmp][1:v]overlay=0:0[out]`,          // arte por cima (revela pelo furo)
      ]
    : [
        `color=c=black:s=${cw}x${ch}:r=30:d=${dur}[bg]`,
        videoStage,
        `[bg][1:v]overlay=0:0[tmp]`,           // arte primeiro (preenche o fundo)
        `[tmp][vid]overlay=${ax}:${ay}[out]`,  // video colado por cima, na area marcada
      ];

  // Audio: se tem trilha extra, ela entra a 35% (input 2, em loop). Mixa com o
  // audio original do video, se existir.
  let audioMap;
  if (audioFile) {
    if (hasAudio) {
      filters.push('[2:a]volume=0.35[m]');
      filters.push('[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[aout]');
    } else {
      filters.push('[2:a]volume=0.35[aout]');
    }
    audioMap = ['-map', '[aout]'];
  } else {
    audioMap = ['-map', '0:a?']; // mantem o audio do video, se existir
  }

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg()
      .input(sourceVideo)
      .input(mold.file_path)
      .inputOptions(['-loop 1']); // aplica ao molde (imagem)
    if (audioFile) cmd.input(audioFile).inputOptions(['-stream_loop', '-1']); // loopa a trilha
    cmd
      .complexFilter(filters)
      .outputOptions([
        '-map', '[out]',
        ...audioMap,
        '-t', String(dur),    // limita a duracao do video original
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
      ])
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}
