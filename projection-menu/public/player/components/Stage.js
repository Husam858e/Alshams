// The 1920x1080 stage. On a projector it is corner-pinned (calibration) onto
// the table; in the staff preview it is simply scaled to fit the iframe.
// Inside, the surface applies rotation and holds one copy of the scene per
// frame ('dual' layout: two halves, the far one turned 180 degrees).

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { stageTransform } from '/shared/homography.js';
import { framesFor, normalizeRotation, STAGE_H, STAGE_W, surfaceSize } from '../lib/layout.js';

const DEFAULT_CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

function useViewport() {
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: innerWidth, h: innerHeight });
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);
  return size;
}

function validCorners(corners) {
  return Array.isArray(corners) && corners.length === 4 && corners.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
    ? corners
    : DEFAULT_CORNERS;
}

function fitTransform(view) {
  const s = Math.min(view.w / STAGE_W, view.h / STAGE_H) || 1;
  return `translate(${(view.w - STAGE_W * s) / 2}px, ${(view.h - STAGE_H * s) / 2}px) scale(${s})`;
}

export function Stage({ warp, projector, renderFrame, overlay }) {
  const view = useViewport();
  const corners = projector?.calibration?.corners;
  const transform = useMemo(() => {
    if (!warp) return fitTransform(view);
    try {
      return stageTransform(validCorners(corners), STAGE_W, STAGE_H, view.w, view.h);
    } catch {
      return `scale(${view.w / STAGE_W}, ${view.h / STAGE_H})`; // degenerate corners
    }
  }, [warp, view.w, view.h, JSON.stringify(corners ?? null)]);

  const rotation = normalizeRotation(projector?.rotation);
  const surface = surfaceSize(rotation);
  const frames = framesFor({ rotation, layout: projector?.layout });

  return html`
    <div class="stage" style=${{ transform }}>
      <div
        class="surface"
        style=${{
          width: `${surface.w}px`,
          height: `${surface.h}px`,
          left: `${(STAGE_W - surface.w) / 2}px`,
          top: `${(STAGE_H - surface.h) / 2}px`,
          transform: `rotate(${rotation}deg)`,
        }}
      >
        ${frames.map((f) => html`
          <div
            key=${f.id}
            class="frame-slot slot-${f.id}"
            style=${{
              width: `${f.vw}px`,
              height: `${f.vh}px`,
              left: `${f.x + (f.w - f.vw) / 2}px`,
              top: `${f.y + (f.h - f.vh) / 2}px`,
              transform: `scale(${f.scale})${f.flip ? ' rotate(180deg)' : ''}`,
            }}
          >
            ${renderFrame(f)}
          </div>
        `)}
      </div>
      ${overlay}
    </div>
  `;
}
