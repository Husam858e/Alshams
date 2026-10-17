import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { HttpError, badRequest } from '../lib/validate.js';

// Allowed formats: food photos, videos (pre-rendered animations are exported
// as video) and .glb models rendered live with three.js on the players.
const FORMATS = {
  '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.webm': { kind: 'video', mime: 'video/webm' },
  '.png': { kind: 'image', mime: 'image/png' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.glb': { kind: 'model3d', mime: 'model/gltf-binary' },
};

export const ACCEPTED_EXTENSIONS = Object.keys(FORMATS);

export function formatFor(fileName) {
  return FORMATS[path.extname(fileName).toLowerCase()] ?? null;
}

// First bytes of each format, so an HTML page renamed to .jpg is refused.
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  'video/mp4': (b) => b.toString('latin1', 4, 8) === 'ftyp',
  'video/webm': (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  'model/gltf-binary': (b) => b.toString('latin1', 0, 4) === 'glTF',
};

export async function matchesSignature(filePath, format) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buf, 0, 16, 0);
    return bytesRead >= 12 && (SIGNATURES[format.mime]?.(buf) ?? false);
  } finally {
    await handle.close();
  }
}

export function createUploader({ mediaDir, maxUploadMb }) {
  fs.mkdirSync(mediaDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: mediaDir,
      // Random name: never trust the client's file name on disk, and it lets
      // /media be served with an immutable cache header.
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (formatFor(file.originalname)) return cb(null, true);
      cb(badRequest(`نوع الملف غير مدعوم. الأنواع المسموحة: ${ACCEPTED_EXTENSIONS.join(' ')}`));
    },
  });
}

// Wraps multer so its errors become HttpErrors with Arabic messages.
export function handleUpload(uploader, maxUploadMb) {
  const single = uploader.single('file');
  return (req, res, next) =>
    single(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `حجم الملف أكبر من ${maxUploadMb} ميغابايت`));
      next(err instanceof HttpError ? err : badRequest(err.message));
    });
}

export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

// Duration and resolution via ffprobe when it is installed; optional.
export function probeMedia(filePath) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 15000 },
      (err, stdout) => {
        if (err) return resolve({});
        try {
          const info = JSON.parse(stdout);
          const video = info.streams?.find((s) => s.codec_type === 'video');
          const seconds = Number(info.format?.duration);
          resolve({
            duration_ms: Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
            width: video?.width ?? null,
            height: video?.height ?? null,
          });
        } catch {
          resolve({});
        }
      },
    );
  });
}

// Multer/busboy hand over non-ASCII file names as latin1; restore UTF-8 so
// Arabic names survive.
export function decodeOriginalName(name) {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
