// Corner-pin (4-point perspective) warp — the core of projection mapping.
//
// A ceiling projector never hits the table as a perfect rectangle (keystone,
// lens offset, table not centred). We render everything on a flat "stage"
// and warp it with a homography so the stage's 4 corners land exactly on the
// table's 4 corners. The browser does the warp on the GPU via CSS matrix3d,
// so it works for video, images and WebGL alike at full frame rate.

// Returns the 3×3 homography [a,b,c,d,e,f,g,h,1] (row-major) mapping each
// src[i] = [x, y] to dst[i] = [u, v]:
//   u = (a·x + b·y + c) / (g·x + h·y + 1)
//   v = (d·x + e·y + f) / (g·x + h·y + 1)
export function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  return [...solveLinear(A, b), 1];
}

export function applyHomography(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// CSS matrix3d is column-major 4×4; z passes through untouched.
// Use with `transform-origin: 0 0`.
export function toCssMatrix3d(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].join(',')})`;
}

// Stage of stageW×stageH px → viewport, with `corners` normalized (0..1) to
// the viewport: [top-left, top-right, bottom-right, bottom-left].
export function stageTransform(corners, stageW, stageH, viewW, viewH) {
  const src = [[0, 0], [stageW, 0], [stageW, stageH], [0, stageH]];
  const dst = corners.map(([x, y]) => [x * viewW, y * viewH]);
  return toCssMatrix3d(solveHomography(src, dst));
}

// Gaussian elimination with partial pivoting (8×8 here).
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) throw new Error('Degenerate corners: three points are collinear');
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
