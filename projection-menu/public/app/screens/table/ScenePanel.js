// Left side of the table screen: the live preview of what the table shows,
// and the controls that change it (welcome, full menu, a category, a dish,
// the order, off).

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../../components/icons.js';
import { PreviewFrame } from '../../components/PreviewFrame.js';
import { Img, cx } from '../../components/ui.js';
import { timeAgo } from '../../lib/format.js';
import { useNow } from '../../lib/hooks.js';
import { SCENES, sceneLabel } from '../../lib/labels.js';

export function ScenePanel({ table, menu, scene, onShow, delivery, busy, activeOrder, compact }) {
  useNow(30000);
  const current = scene ?? { type: 'welcome' };
  const categories = menu?.categories ?? [];

  // Category whose dishes are offered as quick "show this dish" buttons.
  const sceneCategoryId = useMemo(() => {
    if (current.type === 'category') return current.categoryId;
    if (current.type === 'dish') return categories.find((c) => c.dishes.some((d) => d.id === current.dishId))?.id ?? null;
    return null;
  }, [current, categories]);
  const [pickedCategory, setPickedCategory] = useState(sceneCategoryId);
  useEffect(() => setPickedCategory(sceneCategoryId ?? categories[0]?.id ?? null), [sceneCategoryId, categories.length]);
  const dishStrip = categories.find((c) => c.id === pickedCategory)?.dishes ?? [];

  const is = (type, extra = {}) => current.type === type && Object.entries(extra).every(([k, v]) => current[k] === v);

  const big = [
    { scene: { type: 'welcome' }, ...SCENES.welcome },
    { scene: { type: 'menu' }, ...SCENES.menu },
    {
      scene: activeOrder ? { type: 'order', orderId: activeOrder.id } : null,
      ...SCENES.order,
      // "الطلب #N" stays on one line in narrow buttons.
      label: activeOrder ? html`عرض <span class="nowrap">الطلب <bdi>#${activeOrder.id}</bdi></span>` : 'عرض الطلب',
      disabled: !activeOrder,
      hint: activeOrder ? null : 'لا يوجد طلب نشط',
    },
    { scene: { type: 'off' }, ...SCENES.off },
  ];

  return html`<div class=${cx('scene-panel', compact && 'is-compact')}>
    <div class="scene-preview">
      <${PreviewFrame} tableId=${table.id} label=${`معاينة طاولة ${table.number}`} />
      <div class="scene-now">
        <span class="scene-now-label">يُعرض الآن</span>
        <strong class="truncate">
          <${Icon} name=${SCENES[current.type]?.icon ?? 'sparkles'} size=${16} />
          ${sceneLabel(current, menu)}
        </strong>
        ${current.by && html`<span class="scene-now-by">${current.by} · ${timeAgo(current.at)}</span>`}
      </div>
      ${delivery && html`<${DeliveryNote} delivery=${delivery} projectors=${table.projectors} />`}
    </div>

    <div class="scene-actions" role="group" aria-label="ماذا يُعرض على الطاولة">
      ${big.map(
        (b) => html`<button
          key=${b.icon}
          type="button"
          class=${cx('scene-btn', b.scene && is(b.scene.type) && 'is-active', b.scene?.type === 'off' && 'scene-btn-off')}
          disabled=${b.disabled || busy}
          title=${b.hint}
          aria-pressed=${b.scene && is(b.scene.type) ? 'true' : 'false'}
          onClick=${() => b.scene && onShow(b.scene)}
        >
          <span class="scene-btn-icon"><${Icon} name=${b.icon} size=${22} /></span>
          <span class="scene-btn-label">${b.label}</span>
        </button>`,
      )}
    </div>

    ${categories.length > 0 &&
    html`<div class="scene-block">
      <div class="section-title"><${Icon} name="layers" size=${15} /> اعرض تصنيفاً</div>
      <div class="scene-cats">
        ${categories.map(
          (c) => html`<button
            key=${c.id}
            type="button"
            class=${cx('scene-cat', is('category', { categoryId: c.id }) && 'is-active', !c.is_visible && 'is-hidden')}
            disabled=${busy || !c.is_visible}
            title=${c.is_visible ? `اعرض ${c.name_ar}` : 'هذا التصنيف مخفي عن العرض'}
            onClick=${() => {
              setPickedCategory(c.id);
              onShow({ type: 'category', categoryId: c.id });
            }}
          >
            ${c.icon && html`<span class="scene-cat-icon" aria-hidden="true">${c.icon}</span>`}
            <span class="truncate">${c.name_ar}</span>
          </button>`,
        )}
      </div>
    </div>`}

    ${dishStrip.length > 0 &&
    html`<div class="scene-block">
      <div class="section-title">
        <${Icon} name="utensils" size=${15} /> اعرض طبقاً
        <span class="muted">· ${categories.find((c) => c.id === pickedCategory)?.name_ar ?? ''}</span>
      </div>
      <div class="dish-strip">
        ${dishStrip.map(
          (d) => html`<button
            key=${d.id}
            type="button"
            class=${cx('strip-dish', is('dish', { dishId: d.id }) && 'is-active')}
            disabled=${busy || !d.is_available}
            onClick=${() => onShow({ type: 'dish', dishId: d.id })}
            aria-label=${`اعرض ${d.name_ar} على الطاولة`}
          >
            <${Img} src=${d.image_url} class="strip-img" />
            <span class="strip-name">${d.name_ar}</span>
          </button>`,
        )}
      </div>
    </div>`}
  </div>`;
}

function DeliveryNote({ delivery, projectors }) {
  if (delivery.state === 'sending') {
    return html`<div class="delivery delivery-sending"><span class="spinner" style=${{ width: '14px', height: '14px' }}></span>جارٍ الإرسال إلى الطاولة…</div>`;
  }
  if (delivery.state === 'error') {
    return html`<div class="delivery delivery-error"><${Icon} name="alert" size=${16} />${delivery.message}</div>`;
  }
  const { online = 0, acked = 0 } = delivery.result ?? {};
  if (!projectors.length) {
    return html`<div class="delivery delivery-warn"><${Icon} name="info" size=${16} />حُفظ العرض. لا يوجد جهاز عرض مربوط بهذه الطاولة.</div>`;
  }
  if (online === 0) {
    return html`<div class="delivery delivery-warn"><${Icon} name="wifi-off" size=${16} />حُفظ العرض وسيظهر فور اتصال جهاز العرض.</div>`;
  }
  if (acked < online) {
    return html`<div class="delivery delivery-warn"><${Icon} name="alert" size=${16} />أُرسل إلى ${online} جهاز، وأكّد ${acked} فقط.</div>`;
  }
  return html`<div class="delivery delivery-ok"><${Icon} name="check-circle" size=${16} />ظهر على الطاولة${online > 1 ? ` (${online} أجهزة)` : ''}</div>`;
}
