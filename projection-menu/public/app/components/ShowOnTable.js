// "Show this on a table": pick a table by number and push a scene to its
// projector (designers test their content; the owner demos it).

import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { SCENES } from '../lib/labels.js';
import { allTables, patchResource, useResource } from '../lib/store.js';
import { Icon } from './icons.js';
import { Modal } from './overlay.js';
import { toast } from './toast.js';
import { Empty, Skeleton, cx } from './ui.js';

export function deliveryText(delivered, projectors = 1) {
  if (!projectors) return 'حُفظ — لا يوجد جهاز عرض مربوط بهذه الطاولة';
  if (!delivered?.online) return 'حُفظ وسيظهر فور اتصال جهاز العرض';
  if (delivered.acked < delivered.online) return `أُرسل إلى ${delivered.online} جهاز، وأكّد ${delivered.acked}`;
  return 'ظهر على الطاولة';
}

export async function pushScene(table, scene) {
  const res = await api.setScene(table.id, scene);
  patchResource('floor', (f) => {
    const map = (t) => (t.id === table.id ? { ...t, scene: res.scene } : t);
    return { ...f, areas: f.areas.map((a) => ({ ...a, tables: a.tables.map(map) })), unassigned: f.unassigned.map(map) };
  });
  return res;
}

export function ShowOnTableDialog({ scene, title, onClose }) {
  const { data: floor } = useResource('floor');
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState({});
  const send = async (t) => {
    setBusy(t.id);
    try {
      const res = await pushScene(t, scene);
      setDone((d) => ({ ...d, [t.id]: true }));
      toast.ok(deliveryText(res.delivered, t.projectors.length), { title: `طاولة ${t.number}` });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
    }
  };
  const sections = floor
    ? [...floor.areas.map((a) => ({ id: a.id, name: a.name, tables: a.tables })), { id: 'none', name: 'بدون قسم', tables: floor.unassigned }].filter((s) => s.tables.length)
    : [];
  return html`<${Modal}
    title="اعرض على طاولة"
    subtitle=${`${SCENES[scene.type]?.label ?? ''}${title ? `: ${title}` : ''} — اختر رقم الطاولة`}
    icon="projector"
    onClose=${onClose}
  >
    ${!floor
      ? html`<div class="table-pick-grid">${Array.from({ length: 8 }, (_, i) => html`<${Skeleton} key=${i} h=${64} r="14px" />`)}</div>`
      : allTables(floor).length === 0
        ? html`<${Empty} compact icon="floor" title="لا توجد طاولات بعد" />`
        : sections.map(
            (s) => html`<div class="table-pick-section" key=${s.id}>
              <div class="section-title">${s.name}</div>
              <div class="table-pick-grid">
                ${s.tables.map((t) => {
                  const online = t.projectors.some((p) => p.online);
                  return html`<button
                    key=${t.id}
                    type="button"
                    class=${cx('table-pick', done[t.id] && 'is-done')}
                    disabled=${busy != null}
                    onClick=${() => send(t)}
                    aria-label=${`طاولة ${t.number}`}
                  >
                    <span class="table-pick-num num">${t.number}</span>
                    <span class=${cx('table-pick-dot', online ? 'is-on' : t.projectors.length ? 'is-off' : 'is-none')} title=${online ? 'جهاز العرض متصل' : 'غير متصل'}></span>
                    ${busy === t.id ? html`<span class="spinner" style=${{ width: '14px', height: '14px' }}></span>` : done[t.id] && html`<${Icon} name="check" size=${14} />`}
                  </button>`;
                })}
              </div>
            </div>`,
          )}
  <//>`;
}
