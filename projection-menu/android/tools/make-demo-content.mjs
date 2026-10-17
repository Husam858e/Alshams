// Builds the content of the APK's offline demo from sample-content/ (the
// same restaurant `npm run seed` loads), so both stay in step:
//
//   node android/tools/make-demo-content.mjs              everything
//   node android/tools/make-demo-content.mjs --data-only  only demo/data.js
//
// Writes into android/app/src/main/assets:
//   media/demo-<name>.jpg|webm   menu photos (max 1024 px wide) and clips
//   media/demo-table-wood.jpg    the table top of the demo (procedural walnut)
//   demo/data.js                 manifest + file facts for demo/backend/
// Needs ffmpeg and ffprobe. test/android-assets.test.js checks the result.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SAMPLE = path.join(ROOT, 'sample-content');
const ASSETS = path.join(ROOT, 'android/app/src/main/assets');
const MEDIA_OUT = path.join(ASSETS, 'media');
const DATA_OUT = path.join(ASSETS, 'demo', 'data.js');

export const demoName = (file) => `demo-${file.toLowerCase()}`;
export const TABLE_TEXTURE = 'demo-table-wood.jpg';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.webm': 'video/webm', '.mp4': 'video/mp4' };

// ── Menu files ─────────────────────────────────────────────────────

export function referencedFiles(manifest) {
  const files = new Set();
  for (const c of manifest.categories) {
    if (c.cover) files.add(c.cover);
    for (const d of c.dishes) for (const f of [d.image, d.video, d.model]) if (f) files.add(f);
  }
  return [...files];
}

// Photos are re-encoded smaller (a tablet never shows them 1200 px wide);
// clips are copied as they are.
async function exportFile(file) {
  const source = path.join(SAMPLE, 'images', file);
  const target = path.join(MEDIA_OUT, demoName(file));
  if (!fs.existsSync(source)) throw new Error(`sample-content/images/${file} is missing`);
  if (MIME[path.extname(file).toLowerCase()]?.startsWith('image/')) {
    await run('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', "scale='min(1024,iw)':-2:flags=lanczos",
      '-q:v', '4', '-pix_fmt', 'yuvj420p', target]);
  } else {
    fs.copyFileSync(source, target);
  }
}

async function probe(file) {
  const target = path.join(MEDIA_OUT, file);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', target]);
  const info = JSON.parse(stdout);
  const video = info.streams.find((s) => s.codec_type === 'video');
  const ext = path.extname(file).toLowerCase();
  const kind = MIME[ext].startsWith('video/') ? 'video' : 'image';
  const seconds = Number(info.format?.duration);
  return {
    kind,
    mime_type: MIME[ext],
    size_bytes: fs.statSync(target).size,
    width: video?.width ?? null,
    height: video?.height ?? null,
    duration_ms: kind === 'video' && Number.isFinite(seconds) ? Math.round(seconds * 1000) : null,
  };
}

// ── Table top: dark walnut planks seen from above ──────────────────

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D gradient noise (Perlin) in about -1..1.
function makeNoise(random) {
  const perm = new Uint8Array(512);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    const l1 = grad(perm[a], xf, yf) + u * (grad(perm[b], xf - 1, yf) - grad(perm[a], xf, yf));
    const l2 = grad(perm[a + 1], xf, yf - 1) + u * (grad(perm[b + 1], xf - 1, yf - 1) - grad(perm[a + 1], xf, yf - 1));
    return (l1 + v * (l2 - l1)) * 1.4;
  };
}

async function makeTableTexture(file, width = 1600, height = 900) {
  const random = mulberry32(7);
  const noise = makeNoise(random);
  const fbm = (x, y, octaves = 4) => {
    let sum = 0;
    let amp = 0.5;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x, y);
      x *= 2.03;
      y *= 2.03;
      amp *= 0.5;
    }
    return sum;
  };
  // Four full-length boards, glued edge to edge like a solid table top.
  const PLANKS = 4;
  const plankH = height / PLANKS;
  const planks = Array.from({ length: PLANKS }, () => ({
    ox: random() * 900,
    oy: random() * 900,
    rings: 16 + random() * 10,
    tint: 0.93 + random() * 0.12,
  }));
  const light = [98, 62, 38];
  const dark = [56, 34, 21];
  const line = [33, 19, 11];
  const mix = (a, b, t) => a + (b - a) * t;
  const out = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const pi = Math.min(PLANKS - 1, Math.floor(y / plankH));
    const yl = y - pi * plankH;
    const pl = planks[pi];
    for (let x = 0; x < width; x++) {
      const gx = x + pl.ox;
      const gy = yl + pl.oy;
      // Rings: long streaks along the grain (x), gently warped by low-frequency noise.
      const warp = fbm(gx * 0.0011, gy * 0.0045, 4) * 1.8;
      const r = (yl / plankH) * pl.rings + warp * pl.rings * 0.18;
      const ring = 0.5 + 0.5 * Math.sin(r * Math.PI * 2);
      const late = Math.pow(ring, 10); // thin dark latewood lines
      const figure = 0.5 + 0.5 * fbm(gx * 0.0014, gy * 0.012, 3);
      const fibre = noise(gx * 0.006, gy * 1.1) * 0.55 + noise(gx * 0.018, gy * 2.9) * 0.3;
      const t = Math.min(1, Math.max(0, 0.2 + 0.5 * figure + 0.16 * fibre + 0.18 * ring));
      // Glue lines between boards: a hairline with a soft bevel.
      const seam = Math.min(yl, plankH - yl);
      let shade = 1;
      if (pi > 0 || yl > 2) shade *= seam < 0.8 ? 0.55 : seam < 2.5 ? 0.86 + 0.05 * seam : 1;
      // Varnish: a broad soft sheen and a gentle falloff to the edges.
      const nx = x / width - 0.42;
      const ny = y / height - 0.38;
      const sheen = 1 + 0.16 * Math.exp(-(nx * nx * 3 + ny * ny * 6));
      const edge = 1 - 0.18 * Math.pow(Math.max(Math.abs(x / width - 0.5) * 2, Math.abs(y / height - 0.5) * 2), 4);
      const k = pl.tint * shade * sheen * edge;
      const i = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const base = mix(light[c], dark[c], t);
        out[i + c] = Math.max(0, Math.min(255, mix(base, line[c], late * 0.55) * k));
      }
    }
  }
  const raw = path.join(MEDIA_OUT, `${file}.rgb`);
  fs.writeFileSync(raw, out);
  try {
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-i', raw,
      '-q:v', '3', '-pix_fmt', 'yuvj420p', path.join(MEDIA_OUT, file)]);
  } finally {
    fs.rmSync(raw, { force: true });
  }
}

// ── data.js ────────────────────────────────────────────────────────

export function demoManifest(manifest) {
  const rename = (f) => (f ? demoName(f) : null);
  return {
    ...manifest,
    categories: manifest.categories.map((c) => ({
      ...c,
      cover: rename(c.cover),
      dishes: c.dishes.map((d) => ({ ...d, image: rename(d.image), video: rename(d.video), model: rename(d.model) })),
    })),
  };
}

function writeData(manifest, media, version) {
  const text = `// GENERATED by android/tools/make-demo-content.mjs from sample-content/manifest.json.
// Do not edit by hand: change sample-content/ and run the tool again.
// Photos: sample-content/images (sources and licences in sample-content/CREDITS.md).

export const VERSION = ${JSON.stringify(version)};

// The sample restaurant; file names point at assets/media (served as /media/<name>).
export const SAMPLE = ${JSON.stringify(demoManifest(manifest), null, 2)};

// Facts about every bundled media file (what the server's upload would record).
export const MEDIA = ${JSON.stringify(media, null, 2)};

export const TABLE_TEXTURE = ${JSON.stringify(`/media/${TABLE_TEXTURE}`)};
`;
  fs.writeFileSync(DATA_OUT, text);
}

async function main() {
  const dataOnly = process.argv.includes('--data-only');
  const manifest = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'manifest.json'), 'utf8'));
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const files = referencedFiles(manifest);
  fs.mkdirSync(MEDIA_OUT, { recursive: true });

  if (!dataOnly) {
    const wanted = new Set([...files.map(demoName), TABLE_TEXTURE]);
    for (const stale of fs.readdirSync(MEDIA_OUT).filter((f) => !wanted.has(f))) fs.rmSync(path.join(MEDIA_OUT, stale));
    await Promise.all([...files.map(exportFile), makeTableTexture(TABLE_TEXTURE)]);
  }

  const media = {};
  for (const file of files) media[demoName(file)] = { original_name: file, ...(await probe(demoName(file))) };
  writeData(manifest, media, version);

  let total = 0;
  for (const file of fs.readdirSync(MEDIA_OUT).sort()) {
    const size = fs.statSync(path.join(MEDIA_OUT, file)).size;
    total += size;
    console.log(`${file.padEnd(32)} ${(size / 1024).toFixed(1).padStart(8)} KB`);
  }
  console.log(`${'total'.padEnd(32)} ${(total / 1024).toFixed(1).padStart(8)} KB`);
  console.log(`wrote ${path.relative(ROOT, DATA_OUT)}: ${manifest.categories.length} categories, ${files.length} media files`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
