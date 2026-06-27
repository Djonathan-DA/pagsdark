// Aponta o fluent-ffmpeg para os binarios estaticos (sem precisar instalar nada).
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

export { ffmpeg };

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
