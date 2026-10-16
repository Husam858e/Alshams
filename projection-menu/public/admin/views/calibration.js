// Live corner-pin calibration. The black box stands for the projector's
// output; drag the 4 numbered handles until the test pattern on the table
// matches the table's corners. Every move is pushed to the projector live.

import { h, toast } from '/shared/dom.js';
import { api } from '../api.js';
import { btn, openModal } from '../ui.js';

const DEFAULT = [[0, 0], [1, 0], [1, 1], [0, 1]];
const SEND_EVERY_MS = 80;
const NUDGE = 0.002;

export function openCalibration(projector, ctx) {
  let corners = (projector.calibration?.corners ?? DEFAULT).map((c) => [...c]);
  let selected = 0;

  const box = h('div', { class: 'calib', tabindex: '0' });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 1600 900');
  svg.setAttribute('preserveAspectRatio', 'none');
  const quad = document.createElementNS(svgNS, 'polygon');
  quad.setAttribute('fill', 'rgba(245,158,11,0.12)');
  quad.setAttribute('stroke', '#fbbf24');
  quad.setAttribute('stroke-width', '3');
  quad.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(quad);
  box.append(svg);

  const handles = corners.map((_, i) => {
    const el = h('div', { class: 'handle' }, i + 1);
    el.addEventListener('pointerdown', (e) => {
      selected = i;
      el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const rect = box.getBoundingClientRect();
        corners[i] = [clamp((ev.clientX - rect.left) / rect.width), clamp((ev.clientY - rect.top) / rect.height)];
        draw();
        schedule();
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    box.append(el);
    return el;
  });

  // Fine-tuning with the keyboard: 1–4 select a corner, arrows nudge it.
  box.addEventListener('keydown', (e) => {
    if (['1', '2', '3', '4'].includes(e.key)) selected = Number(e.key) - 1;
    const delta = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[e.key];
    if (!delta) return draw();
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    corners[selected] = [clamp(corners[selected][0] + delta[0] * step), clamp(corners[selected][1] + delta[1] * step)];
    draw();
    schedule();
  });

  function draw() {
    quad.setAttribute('points', corners.map(([x, y]) => `${x * 1600},${y * 900}`).join(' '));
    handles.forEach((el, i) => {
      el.style.left = `${corners[i][0] * 100}%`;
      el.style.top = `${corners[i][1] * 100}%`;
      el.style.outline = i === selected ? '3px solid #fff' : '';
    });
  }

  // Throttled save: at most one request in flight, always ending on the latest position.
  let timer = null;
  let inFlight = false;
  let dirty = false;
  function schedule() {
    dirty = true;
    if (!timer && !inFlight) timer = setTimeout(flush, SEND_EVERY_MS);
  }
  async function flush() {
    timer = null;
    if (!dirty) return;
    dirty = false;
    inFlight = true;
    try {
      await api(`/projectors/${projector.id}/calibration`, { method: 'PUT', body: { corners } });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      inFlight = false;
      if (dirty) timer = setTimeout(flush, SEND_EVERY_MS);
    }
  }

  const testPattern = (on) =>
    api(`/projectors/${projector.id}/command`, { method: 'POST', body: { action: 'test_pattern', on } }).catch(() => {});

  const modal = openModal(
    `معايرة الزوايا — ${projector.name}`,
    h(
      'p',
      { class: 'muted' },
      'تظهر الآن شاشة اختبار على الطاولة. اسحب الزوايا المرقمة حتى تنطبق حواف الشاشة على حواف الطاولة تماماً. ',
      'للضبط الدقيق: اضغط داخل المربع ثم 1–4 لاختيار زاوية والأسهم للتحريك (Shift للتحريك الأسرع).',
    ),
    box,
    h(
      'div',
      { class: 'modal-foot' },
      btn('إعادة الضبط', () => {
        corners = DEFAULT.map((c) => [...c]);
        draw();
        schedule();
      }),
      btn('تم', () => modal.close(), 'primary'),
    ),
  );
  modal.onClose(() => {
    testPattern(false);
    ctx.rerender();
  });

  draw();
  testPattern(true);
}

// Corners may sit a bit outside the frame (projector overscan).
const clamp = (v) => Math.min(1.25, Math.max(-0.25, Math.round(v * 10000) / 10000));
