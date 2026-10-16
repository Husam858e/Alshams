// Offline demo page: the tablet frame and the projector frame talk over a
// BroadcastChannel (demo-backend.js ↔ fake-socket.js). This page listens in
// to caption what the projector is showing, and offers the way out.

import { bridge } from '/app/bridge.js';
import { CHANNEL } from './demo-data.js';

const PHASE = { preview: 'معاينة', ordered: 'بانتظار التحضير', served: 'تم التقديم' };
const nowPlaying = document.querySelector('#now-playing');
const active = new Map(); // layer -> play cue

function render() {
  if (!active.size) {
    nowPlaying.replaceChildren(
      Object.assign(document.createElement('span'), {
        className: 'idle',
        textContent: 'الطاولة في وضع الانتظار — اختر طبقاً من المنيو',
      }),
    );
    return;
  }
  const chips = [...active.values()]
    .sort((a, b) => a.layer.localeCompare(b.layer))
    .map((cue) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.dataset.phase = cue.meta?.phase ?? '';
      const place = cue.layer === 'full' ? 'كل الطاولة' : `مقعد ${cue.layer.slice('seat-'.length)}`;
      chip.textContent = [place, cue.meta?.dishName, PHASE[cue.meta?.phase]].filter(Boolean).join(' · ');
      return chip;
    });
  nowPlaying.replaceChildren(...chips);
}

new BroadcastChannel(CHANNEL).addEventListener('message', ({ data }) => {
  if (data?.type === 'cue') {
    const { cue } = data;
    if (cue.action === 'play') active.set(cue.layer, cue);
    else if (cue.action === 'stop' && cue.layer) active.delete(cue.layer);
    else if (cue.action === 'stop') active.clear();
  } else if (data?.type === 'event' && data.event === 'cue:status') {
    // A non-looping clip (served ripple) ended, or failed: the seat is idle again.
    if (!['ended', 'error'].includes(data.payload?.state)) return;
    for (const [layer, cue] of active) if (cue.cueId === data.payload.cueId) active.delete(layer);
  } else return;
  render();
});

document.querySelector('#exit').addEventListener('click', () => {
  bridge.openSettings().catch(() => {});
});

render();
