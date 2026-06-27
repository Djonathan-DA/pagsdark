// Renderiza UM video dentro do molde: recorta/escala o video para preencher a
// area (cover), coloca na posicao certa e sobrepoe a arte do molde por cima.
import { ffmpeg, probe } from '../ffmpeg.js';

// mold = { file_path, canvas_w, canvas_h, area_x, area_y, area_w, area_h }
export async function renderOne(sourceVideo, mold, outputPath) {
  const { duration } = await probe(sourceVideo);
  const dur = duration && duration > 0 ? duration : 60;

  const cw = mold.canvas_w, ch = mold.canvas_h;
  const aw = mold.area_w, ah = mold.area_h;
  const ax = mold.area_x, ay = mold.area_y;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(sourceVideo)
      .input(mold.file_path)
      .inputOptions(['-loop 1']) // aplica ao ultimo input (a imagem do molde)
      .complexFilter(
        [
          // fundo preto do tamanho do canvas, com a duracao do video
          `color=c=black:s=${cw}x${ch}:r=30:d=${dur}[bg]`,
          // video: escala para COBRIR a area e recorta o excesso (cover)
          `[0:v]scale=${aw}:${ah}:force_original_aspect_ratio=increase,crop=${aw}:${ah},setsar=1,fps=30[vid]`,
          // coloca o video na posicao da area
          `[bg][vid]overlay=${ax}:${ay}[tmp]`,
          // arte do molde por cima (o buraco transparente revela o video)
          `[tmp][1:v]overlay=0:0[out]`,
        ],
        'out'
      )
      .outputOptions([
        '-map 0:a?',          // mantem o audio do video, se existir
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
