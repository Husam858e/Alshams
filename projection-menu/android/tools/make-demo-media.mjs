// Generates the clips and thumbnails of the offline demo bundled in the APK
// (android/app/src/main/assets/media). Needs ffmpeg with libvpx-vp9.
//
//   node android/tools/make-demo-media.mjs
//
// Same idea as src/db/seed.js: content is drawn on pure black because black
// means "no light" on the table; only the glowing shapes land around the plate.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/src/main/assets/media');

const R = 'hypot(X-W/2,Y-H/2)';
const A = 'atan2(Y-H/2,X-W/2)';
// Soft ring (gaussian profile) of radius r and width w, in pixels.
const ring = (r, w, d = R) => `exp(-pow((${d}-(${r}))/${w},2))`;
const turn = (seconds) => `2*PI*T/${seconds}`; // one full cycle per clip: seamless loops

// ── Clips (480x270, 20 fps, VP9) ───────────────────────────────────
// Each shape is a brightness expression 0..1, coloured per clip.
const SHAPES = {
  // Breathing halo around the plate + rotating dashes (dish preview).
  halo: (s) =>
    `${ring(`H*0.33+5*sin(${turn(s)})`, 5)}+0.35*${ring('H*0.33', 16)}` +
    `+0.8*${ring('H*0.43', 2.5)}*gt(sin(12*${A}+2*${turn(s)}),0.25)`,
  // Three arcs chasing each other + a ticking outer dot ring (waiting for the kitchen).
  waiting: (s) =>
    `${ring('H*0.36', 4)}*clip(3*sin(3*(${A}-${turn(s)}))-1.5,0,1)` +
    `+0.7*${ring('H*0.44', 2.5)}*gt(sin(16*(${A}+${turn(s)}/2)),0.6)` +
    `+0.25*${ring('H*0.36', 14)}`,
  // Ripples spreading out from the plate, fading in and out (dish served).
  ripple: (s) =>
    `exp(-pow((mod(${R}-45*T,40)-20)/4,2))*gt(${R},H*0.30)*lt(${R},H*0.49)*clip(T/0.4,0,1)*clip((${s}-T)/1.2,0,1)` +
    `+${ring('H*0.31', 4)}*clip(T/0.3,0,1)*clip((${s}-T)/1.2,0,1)`,
};

// Idle loop for the whole table: a soft frame with a light sweeping around
// it, plus faint rings at the four place settings (defaultZones(4) centres).
function ambient(s) {
  const edge = `max(exp(-pow((min(min(X,W-X),min(Y,H-Y))-8)/3,2)),0)`;
  const sweep = `(0.25+0.75*pow(max(cos(${A}-${turn(s)}),0),6))`;
  const places = [
    [0.25, 0.25, 0],
    [0.75, 0.25, 1],
    [0.25, 0.75, 2],
    [0.75, 0.75, 3],
  ]
    .map(([cx, cy, i]) => `${ring('H*0.17', 2.2, `hypot(X-W*${cx},Y-H*${cy})`)}*(0.45+0.25*sin(${turn(s)}+${i * 1.57}))`)
    .join('+');
  return `0.8*${edge}*${sweep}+${places}`;
}

async function makeClip(file, expr, [r, g, b], seconds) {
  const e = `clip(${expr},0,1)`;
  const filter = `color=black:s=480x270:d=${seconds}:r=20,format=gbrp,geq=r='${r}*${e}':g='${g}*${e}':b='${b}*${e}'`;
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter,
    '-c:v', 'libvpx-vp9', '-crf', '42', '-b:v', '0', '-g', String(seconds * 20), '-row-mt', '1',
    '-pix_fmt', 'yuv420p', '-an', path.join(OUT, file)]);
}

// ── Thumbnails (480x360 JPEG): a plate seen from above ─────────────
// Layers are painted in order; each is [mask expression 0..1, [r, g, b]].
const P = (r) => `clip((H*${r}-${R})/1.5,0,1)`; // anti-aliased disc
const spots = (fx, fy, phase, threshold) =>
  `gt(sin(${fx}*X+${phase})*sin(${fy}*Y+${phase * 1.7})+0.4*sin(0.031*(X-Y)+${phase}),${threshold})`;
const crust = [`${P(0.33)}`, [196, 138, 74]];
const wedge = (r, halfAngle) => {
  const [dx, dy] = ['X-(W/2-H*0.2)', 'Y-H/2'];
  return `clip((H*${r}-hypot(${dx},${dy}))/1.5,0,1)*lt(abs(atan2(${dy},${dx})),${halfAngle})*gt(${dx},H*${(0.42 - r).toFixed(2)})`;
};

const DISHES = {
  margherita: [crust, [P(0.29), [196, 58, 32]], [`${P(0.28)}*${spots(0.09, 0.08, 1, 0.75)}`, [246, 236, 214]],
    [`${P(0.27)}*${spots(0.21, 0.23, 4, 1.05)}`, [62, 140, 52]]],
  veggie: [crust, [P(0.29), [186, 72, 36]], [`${P(0.28)}*${spots(0.13, 0.11, 2, 0.95)}`, [74, 168, 64]],
    [`${P(0.28)}*${spots(0.11, 0.15, 5, 1.0)}`, [236, 196, 52]], [`${P(0.28)}*${spots(0.19, 0.17, 3, 1.15)}`, [34, 30, 36]]],
  caesar: [[P(0.31), [112, 168, 64]], [`${P(0.31)}*gt(sin(0.15*X+0.4*sin(0.05*Y))*sin(0.12*Y),0.3)`, [158, 204, 98]],
    [`${P(0.29)}*${spots(0.08, 0.09, 3, 1.05)}`, [214, 168, 96]], [`${P(0.29)}*${spots(0.23, 0.2, 6, 1.12)}`, [244, 240, 226]]],
  greek: [[P(0.31), [150, 196, 112]], [`${P(0.3)}*${spots(0.1, 0.09, 2, 0.8)}`, [212, 52, 40]],
    [`${P(0.3)}*${spots(0.07, 0.08, 7, 0.95)}`, [246, 244, 232]], [`${P(0.29)}*${spots(0.17, 0.19, 4, 1.15)}`, [44, 30, 46]]],
  // A slice of cake: a wedge whose tip sits left of the plate centre.
  cheesecake: [[wedge(0.42, 0.55), [178, 116, 64]], [wedge(0.39, 0.49), [242, 222, 176]],
    [`${wedge(0.39, 0.49)}*lt(abs(sin(0.09*X+0.05*Y)),0.22)`, [150, 22, 54]]],
  brownies: [[`lt(abs(X-W*0.43),H*0.13)*lt(abs(Y-H*0.44),H*0.13)`, [86, 48, 28]],
    [`lt(abs(X-W*0.6),H*0.11)*lt(abs(Y-H*0.6),H*0.11)`, [74, 40, 22]],
    [`clip((H*0.085-hypot(X-W*0.57,Y-H*0.36))/1.5,0,1)`, [246, 236, 214]]],
};

async function makeThumbnail(file, layers) {
  const plateShade = `(0.9+0.1*(1-(X+Y)/(W+H)))`;
  const channel = (c) => {
    // Dark table with a vignette, then the plate (rim + well), then the food.
    let v = `(26+16*exp(-pow(${R}/(H*0.7),2)))`;
    const paint = (mask, value) => (v = `(${v})*(1-${mask})+(${value})*${mask}`);
    paint(P(0.44), `${[214, 214, 220][c]}*${plateShade}`);
    paint(P(0.36), `${[236, 236, 240][c]}*${plateShade}`);
    paint(`exp(-pow((${R}-H*0.36)/2,2))`, `${[180, 180, 188][c]}`);
    for (const [mask, rgb] of layers) paint(`(${mask})`, `${rgb[c]}*(0.92+0.08*random(0))`);
    return v;
  };
  const filter = `color=black:s=480x360:d=1,format=gbrp,geq=r='${channel(0)}':g='${channel(1)}':b='${channel(2)}'`;
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-frames:v', '1', '-q:v', '5',
    path.join(OUT, file)]);
}

// Optional file names on the command line regenerate only those files.
const only = new Set(process.argv.slice(2));
const wanted = (file) => !only.size || only.has(file);

fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['demo-halo-pizza.webm', () => makeClip('demo-halo-pizza.webm', SHAPES.halo(4), [255, 140, 20], 4)],
  ['demo-halo-salad.webm', () => makeClip('demo-halo-salad.webm', SHAPES.halo(4), [60, 230, 110], 4)],
  ['demo-halo-dessert.webm', () => makeClip('demo-halo-dessert.webm', SHAPES.halo(4), [255, 90, 170], 4)],
  ['demo-waiting.webm', () => makeClip('demo-waiting.webm', SHAPES.waiting(4), [255, 200, 80], 4)],
  ['demo-ripple.webm', () => makeClip('demo-ripple.webm', SHAPES.ripple(6), [255, 230, 180], 6)],
  ['demo-ambient.webm', () => makeClip('demo-ambient.webm', ambient(8), [255, 170, 60], 8)],
  ...Object.entries(DISHES).map(([name, layers]) => [`demo-${name}.jpg`, () => makeThumbnail(`demo-${name}.jpg`, layers)]),
];
await Promise.all(jobs.filter(([file]) => wanted(file)).map(([, job]) => job()));

let total = 0;
for (const file of fs.readdirSync(OUT).sort()) {
  const size = fs.statSync(path.join(OUT, file)).size;
  total += size;
  console.log(`${file.padEnd(26)} ${(size / 1024).toFixed(1).padStart(7)} KB`);
}
console.log(`${'total'.padEnd(26)} ${(total / 1024).toFixed(1).padStart(7)} KB`);
