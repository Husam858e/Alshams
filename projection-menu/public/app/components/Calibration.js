// Live corner-pin calibration of one projector. The box stands for the
// projector's output; drag the 4 numbered corners until the test pattern on
// the table lines up with the table's edges. Every move reaches the
// projector at once (throttled); the box previews the warp locally with the
// same homography the player uses.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { stageTransform } from '/shared/homography.js';
import { api } from '../lib/api.js';
import { patchResource } from '../lib/store.js';
import { Icon } from './icons.js';
import { Modal } from './overlay.js';
import { toast } from './toast.js';
import { Button, IconButton, Segmented, Switch, cx } from './ui.js';

const DEFAULT = [[0, 0], [1, 0], [1, 1], [0, 1]];
const NAMES = ['أعلى اليسار', 'أعلى اليمين', 'أسفل اليمين', 'أسفل اليسار'];
const STEPS = [
  { value: 0.001, label: 'دقيق' },
  { value: 0.005, label: 'عادي' },
  { value: 0.02, label: 'سريع' },
];
const SEND_EVERY_MS = 90;
const STAGE_W = 1920;
const STAGE_H = 1080;

// Corners may sit a little outside the frame (projector overscan).
const clamp = (v) => Math.min(1.25, Math.max(-0.25, Math.round(v * 10000) / 10000));

export function CalibrationDialog({ projector, onClose }) {
  const [corners, setCorners] = useState(() => (projector.calibration?.corners ?? DEFAULT).map((c) => [...c]));
  const [selected, setSelected] = useState(0);
  const [step, setStep] = useState(0.005);
  const [pattern, setPattern] = useState(true);
  const [sync, setSync] = useState('idle'); // idle | sending | saved | error
  const box = useRef();
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Size of the box for the local warp preview.
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  // Test pattern on the real projector while calibrating.
  useEffect(() => {
    api.testPattern(projector.id, pattern).catch(() => {});
  }, [pattern]);
  useEffect(
    () => () => {
      api.testPattern(projector.id, false).catch(() => {});
      patchResource('projectors', (list) => list?.map((x) => (x.id === projector.id ? { ...x, test_pattern: false } : x)) ?? list);
    },
    [],
  );

  // Throttled save: one request in flight, always ending on the latest corners.
  const pending = useRef(null);
  const timer = useRef(null);
  const inFlight = useRef(false);
  const flush = async () => {
    timer.current = null;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    inFlight.current = true;
    setSync('sending');
    try {
      const saved = await api.saveCalibration(projector.id, next);
      patchResource('projectors', (list) => list.map((p) => (p.id === projector.id ? { ...p, calibration: saved.calibration } : p)));
      if (!pending.current) setSync('saved');
    } catch (err) {
      setSync('error');
      toast.error(err);
    } finally {
      inFlight.current = false;
      if (pending.current) timer.current = setTimeout(flush, SEND_EVERY_MS);
    }
  };
  const update = (next) => {
    setCorners(next);
    pending.current = next;
    if (!timer.current && !inFlight.current) timer.current = setTimeout(flush, SEND_EVERY_MS);
  };
  const moveCorner = (i, x, y) => update(corners.map((c, j) => (j === i ? [clamp(x), clamp(y)] : c)));

  const startDrag = (i) => (e) => {
    e.preventDefault();
    setSelected(i);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const rect = box.current.getBoundingClientRect();
    let latest = corners;
    const move = (ev) => {
      latest = latest.map((c, j) => (j === i ? [clamp((ev.clientX - rect.left) / rect.width), clamp((ev.clientY - rect.top) / rect.height)] : c));
      update(latest);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const nudge = (dx, dy, mult = 1) => {
    const [x, y] = corners[selected];
    moveCorner(selected, x + dx * step * mult, y + dy * step * mult);
  };
  const onKey = (e) => {
    if (['1', '2', '3', '4'].includes(e.key)) return setSelected(Number(e.key) - 1);
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    nudge(d[0], d[1], e.shiftKey ? 5 : 1);
  };

  let warp = '';
  try {
    if (size.w) warp = stageTransform(corners, STAGE_W, STAGE_H, size.w, size.h);
  } catch {
    // three corners on a line: no valid warp until one moves
  }

  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  return html`<${Modal}
    size="xl"
    icon="corners"
    title=${`معايرة الزوايا — ${projector.name}`}
    subtitle=${projector.table_number ? `طاولة ${projector.table_number}` : 'غير مربوط بطاولة'}
    onClose=${onClose}
    class="calib-dialog"
    footer=${html`
      <${Button} variant="ghost" icon="refresh" onClick=${() => update(DEFAULT.map((c) => [...c]))}>إعادة الضبط<//>
      <span class=${cx('calib-sync', `is-${sync}`)} role="status">
        ${sync === 'sending' ? 'جارٍ الإرسال…' : sync === 'saved' ? html`<${Icon} name="check-circle" size=${15} /> طُبّق على الجهاز` : sync === 'error' ? 'تعذّر الحفظ' : ''}
      </span>
      <div class="spacer"></div>
      <${Button} variant="primary" icon="check" onClick=${onClose}>تم<//>
    `}
  >
    <div class="calib-layout">
      <div class="calib-stage-wrap">
        <div class="calib-stage" ref=${box} tabindex="0" onKeyDown=${onKey} aria-label="مساحة المعايرة: اسحب الزوايا أو استخدم الأسهم">
          <div class="calib-warp" style=${{ transform: warp, width: `${STAGE_W}px`, height: `${STAGE_H}px` }}>
            <div class="calib-grid"></div>
            <span class="calib-warp-label">طاولة ${projector.table_number ?? ''}</span>
          </div>
          <svg class="calib-quad" viewBox="0 0 1000 562.5" preserveAspectRatio="none" aria-hidden="true">
            <polygon points=${corners.map(([x, y]) => `${x * 1000},${y * 562.5}`).join(' ')} />
          </svg>
          ${corners.map(
            ([x, y], i) => html`<button
              key=${i}
              type="button"
              class=${cx('calib-handle', i === selected && 'is-selected')}
              style=${{ left: pct(x), top: pct(y) }}
              onPointerDown=${startDrag(i)}
              onClick=${() => setSelected(i)}
              aria-label=${`الزاوية ${i + 1}: ${NAMES[i]}`}
            >${i + 1}</button>`,
          )}
        </div>
        <p class="field-hint">الإطار الداكن = صورة البروجكتر كاملة. الإطار الذهبي = حيث يظهر المنيو. على الكمبيوتر: 1–4 لاختيار زاوية والأسهم للتحريك (Shift أسرع).</p>
      </div>

      <div class="calib-side">
        <div class="notice notice-gold">
          <${Icon} name="target" size=${18} />
          <span>اسحب كل زاوية حتى تنطبق زاوية شاشة الاختبار على زاوية الطاولة تماماً. التغيير يظهر على الطاولة مباشرة.</span>
        </div>
        <${Switch} checked=${pattern} onChange=${setPattern} label="شاشة الاختبار على الطاولة" hint="شبكة وأرقام الزوايا تساعد على المطابقة" />

        <div class="stack-sm">
          <div class="section-title">الزاوية المحددة</div>
          <div class="corner-pick" role="radiogroup" aria-label="الزاوية">
            ${NAMES.map(
              (n, i) => html`<button
                key=${i}
                type="button"
                role="radio"
                aria-checked=${i === selected ? 'true' : 'false'}
                class=${cx('corner-btn', i === selected && 'is-active')}
                onClick=${() => setSelected(i)}
              ><span class="num">${i + 1}</span>${n}</button>`,
            )}
          </div>
        </div>

        <div class="nudge">
          <div class="nudge-pad" role="group" aria-label="تحريك الزاوية">
            <${IconButton} icon="chevron-up" variant="glass" label="أعلى" onClick=${() => nudge(0, -1)} class="nudge-up" />
            <${IconButton} icon="chevron-left" variant="glass" label="يسار" onClick=${() => nudge(-1, 0)} class="nudge-left" />
            <span class="nudge-center num">${selected + 1}</span>
            <${IconButton} icon="chevron-right" variant="glass" label="يمين" onClick=${() => nudge(1, 0)} class="nudge-right" />
            <${IconButton} icon="chevron-down" variant="glass" label="أسفل" onClick=${() => nudge(0, 1)} class="nudge-down" />
          </div>
          <div class="stack-sm nudge-info">
            <span class="section-title">مقدار الخطوة</span>
            <${Segmented} size="sm" options=${STEPS} value=${step} onChange=${setStep} label="مقدار الخطوة" class="segmented-block" />
            <div class="corner-xy num">x ${pct(corners[selected][0])} · y ${pct(corners[selected][1])}</div>
          </div>
        </div>
      </div>
    </div>
  <//>`;
}
