// Aponta o fluent-ffmpeg para os binarios estaticos (sem precisar instalar nada).
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

export { ffmpeg };

// Gera um poster leve (1 frame, JPG ~320px de largura) para usar como thumbnail
// no navegador, em vez de carregar dezenas de <video> ao mesmo tempo (trava o PC).
export function makeThumbnail(videoFile, outPath, seconds = 0.5) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoFile)
      .inputOptions(['-ss', String(seconds)]) // seek rapido antes de decodificar
      .outputOptions([
        '-frames:v', '1',
        '-vf', 'scale=320:-2:force_original_aspect_ratio=decrease',
        '-q:v', '4',
      ])
      .on('end', () => resolve(outPath))
      .on('error', (err) => reject(err))
      .save(outPath);
  });
}

// Le metadados (duracao, largura, altura) de um arquivo de video.
export function probe(file) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) return reject(err);
      const stream = (data.streams || []).find((s) => s.codec_type === 'video') || {};
      resolve({
        duration: Number(data.format?.duration || stream.duration || 0),
        width: Number(stream.width || 0),
        height: Number(stream.height || 0),
      });
    });
  });
}
