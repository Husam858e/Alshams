// Menu content editor (owner + designer): categories and their dishes, with
// pictures, videos, 3D models, badges, ordering and visibility. The owner
// also gets the price board. Designers see prices read-only (the server
// refuses price changes from them anyway).

import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { useDragSort } from '../components/forms.js';
import { Icon } from '../components/icons.js';
import { MediaThumb } from '../components/media.js';
import { MenuButton, confirmDialog } from '../components/overlay.js';
import { ShowOnTableDialog } from '../components/ShowOnTable.js';
import { toast } from '../components/toast.js';
import { Badge, Button, Empty, ErrorState, IconButton, PageHeader, SearchInput, Segmented, Skeleton, Switch, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, count, money } from '../lib/format.js';
import { useLocalPref } from '../lib/hooks.js';
import { getState, load, useResource } from '../lib/store.js';
import { CategoryEditor } from './menu/CategoryEditor.js';
import { DishEditor } from './menu/DishEditor.js';
import { PriceBoard } from './menu/PriceBoard.js';

export const syncMenu = () => load('menu', { force: true }).catch(() => {});

const NONE = 'none'; // pseudo category: dishes without a category

const norm = (s) => String(s ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export default function MenuEditorScreen({ user }) {
  const isOwner = user.role === 'owner';
  const { data: menu, error, reload } = useResource('menu');
  useResource('media'); // warm the library for the pickers
  const [mode, setMode] = useLocalPref('menu-mode', 'content');
  const [catPref, setCatPref] = useLocalPref('menu-cat', null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // {type:'dish'|'category', item?, categoryId?}
  const [showing, setShowing] = useState(null); // scene to push to a table

  const categories = menu?.categories ?? [];
  const wanted = catPref;
  const current =
    wanted === NONE && menu?.uncategorized.length
      ? NONE
      : (categories.find((c) => String(c.id) === String(wanted))?.id ?? categories[0]?.id ?? (menu?.uncategorized.length ? NONE : null));
  const category = categories.find((c) => c.id === current) ?? null;
  const dishes = current === NONE ? (menu?.uncategorized ?? []) : (category?.dishes ?? []);
  const dishCount = menu ? categories.reduce((n, c) => n + c.dishes.length, 0) + menu.uncategorized.length : 0;
  const priceMode = isOwner && mode === 'prices';

  const select = (id) => setCatPref(id);

  return html`<div class="page menu-editor">
    <${PageHeader}
      icon="book"
      title="المنيو"
      subtitle=${menu ? `${count(categories.length, NOUNS.category)} · ${count(dishCount, NOUNS.dish)}${isOwner ? '' : ' · الأسعار يحددها المالك'}` : 'جارٍ التحميل…'}
      actions=${html`
        ${isOwner &&
        html`<${Segmented}
          label="وضع التحرير"
          value=${mode}
          onChange=${setMode}
          options=${[
            { value: 'content', label: 'المحتوى', icon: 'edit' },
            { value: 'prices', label: 'الأسعار', icon: 'tag' },
          ]}
        />`}
        ${!priceMode &&
        html`<${Button} icon="layers" onClick=${() => setEditing({ type: 'category' })}>تصنيف جديد<//>
          <${Button} variant="primary" icon="plus" onClick=${() => setEditing({ type: 'dish', categoryId: current === NONE ? null : current })} disabled=${!menu}>طبق جديد<//>`}
      `}
    />

    ${error && !menu
      ? html`<${ErrorState} error=${error} onRetry=${reload} />`
      : !menu
        ? html`<div class="me-layout">
            <div class="me-cats"><${Skeleton} h=${420} r="18px" /></div>
            <div class="me-main stack"><${Skeleton} h=${170} r="18px" />${[0, 1, 2, 3].map((i) => html`<${Skeleton} key=${i} h=${92} r="16px" />`)}</div>
          </div>`
        : priceMode
          ? html`<${PriceBoard} menu=${menu} />`
          : categories.length === 0 && menu.uncategorized.length === 0
            ? html`<${Empty}
                icon="book"
                title="المنيو فارغ"
                text="ابدأ بإضافة التصنيفات (مثل المقبلات والمشاوي)، ثم أضف الأطباق مع صورها وأوصافها."
                action=${html`<${Button} variant="primary" icon="layers" onClick=${() => setEditing({ type: 'category' })}>أضف أول تصنيف<//>`}
              />`
            : html`<div class="me-layout">
                <${CategoryList} menu=${menu} current=${current} onSelect=${select} onAdd=${() => setEditing({ type: 'category' })} />
                <div class="me-main">
                  ${category
                    ? html`<${CategoryHero}
                        category=${category}
                        index=${categories.indexOf(category)}
                        total=${categories.length}
                        onEdit=${() => setEditing({ type: 'category', item: category })}
                        onShow=${() => setShowing({ scene: { type: 'category', categoryId: category.id }, title: category.name_ar })}
                      />`
                    : html`<div class="me-none-head card card-pad">
                        <div class="row"><${Icon} name="info" size=${18} /><strong>أطباق بدون تصنيف</strong></div>
                        <p class="muted">لا تظهر هذه الأطباق في صفحات المنيو على الطاولات حتى تُنقل إلى تصنيف.</p>
                      </div>`}
                  <div class="me-dish-toolbar">
                    <div class="section-title"><${Icon} name="utensils" size=${15} /> الأطباق <span class="chip-count">${dishes.length}</span></div>
                    <div class="spacer"></div>
                    ${dishes.length > 5 && html`<${SearchInput} value=${search} onInput=${setSearch} placeholder="ابحث في هذا التصنيف…" />`}
                  </div>
                  <${DishList}
                    key=${current}
                    dishes=${dishes}
                    categoryId=${current === NONE ? null : current}
                    search=${search}
                    isOwner=${isOwner}
                    onEdit=${(d) => setEditing({ type: 'dish', item: d })}
                    onAdd=${() => setEditing({ type: 'dish', categoryId: current === NONE ? null : current })}
                    onShow=${(d) => setShowing({ scene: { type: 'dish', dishId: d.id }, title: d.name_ar })}
                  />
                </div>
              </div>`}

    ${editing?.type === 'dish' &&
    html`<${DishEditor}
      dish=${editing.item ?? null}
      categoryId=${editing.categoryId}
      menu=${menu}
      isOwner=${isOwner}
      onClose=${() => setEditing(null)}
      onSaved=${(d) => {
        if (!editing.item && d.category_id) select(d.category_id);
      }}
    />`}
    ${editing?.type === 'category' &&
    html`<${CategoryEditor}
      category=${editing.item ?? null}
      onClose=${() => setEditing(null)}
      onSaved=${(c) => select(c.id)}
    />`}
    ${showing && html`<${ShowOnTableDialog} scene=${showing.scene} title=${showing.title} onClose=${() => setShowing(null)} />`}
  </div>`;
}

function CategoryList({ menu, current, onSelect, onAdd }) {
  const cats = menu.categories;
  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const sort = useDragSort(
    cats.map((c) => c.id),
    async (ids) => {
      try {
        await api.orderCategories(ids);
        await syncMenu();
      } catch (err) {
        toast.error(err);
        syncMenu();
      }
    },
  );
  return html`<nav class="me-cats panel" aria-label="التصنيفات">
    <div class="panel-head">
      <div class="panel-title"><${Icon} name="layers" size=${18} /> التصنيفات</div>
      <div class="spacer"></div>
      <${IconButton} icon="plus" size="sm" variant="glass" label="تصنيف جديد" onClick=${onAdd} />
    </div>
    <ul class="cat-list" role="list">
      ${sort.order.map((id) => {
        const c = byId.get(id);
        if (!c) return null;
        return html`<li key=${id} class=${cx('cat-item', id === current && 'is-active', sort.dragId === id && 'is-dragging', !c.is_visible && 'is-hidden')} ...${sort.bind(id)}>
          <span class="drag-handle" aria-hidden="true" title="اسحب لتغيير الترتيب"><${Icon} name="drag" size=${16} /></span>
          <button type="button" class="cat-item-main" aria-current=${id === current ? 'true' : undefined} onClick=${() => onSelect(id)}>
            <span class="cat-item-icon" aria-hidden="true">${c.icon || '•'}</span>
            <span class="cat-item-name truncate">${c.name_ar}</span>
            ${!c.is_visible && html`<span class="cat-item-hidden" title="مخفي عن الطاولات"><${Icon} name="eye-off" size=${15} /></span>`}
            <span class="chip-count">${c.dishes.length}</span>
          </button>
        </li>`;
      })}
      ${menu.uncategorized.length > 0 &&
      html`<li class=${cx('cat-item cat-item-none', current === NONE && 'is-active')}>
        <span class="drag-handle" aria-hidden="true"></span>
        <button type="button" class="cat-item-main" onClick=${() => onSelect(NONE)}>
          <span class="cat-item-icon" aria-hidden="true"><${Icon} name="info" size=${16} /></span>
          <span class="cat-item-name truncate">بدون تصنيف</span>
          <span class="chip-count">${menu.uncategorized.length}</span>
        </button>
      </li>`}
    </ul>
    <p class="me-cats-hint"><${Icon} name="drag" size=${14} /> اسحب لتغيير ترتيب الظهور على الطاولات</p>
  </nav>`;
}

function CategoryHero({ category: c, index, total, onEdit, onShow }) {
  const [busy, setBusy] = useState(false);
  const patch = async (body, ok) => {
    setBusy(true);
    try {
      await api.updateCategory(c.id, body);
      await syncMenu();
      if (ok) toast.ok(ok);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  const move = async (delta) => {
    const ids = getState().menu.categories.map((x) => x.id);
    const i = ids.indexOf(c.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try {
      await api.orderCategories(ids);
      await syncMenu();
    } catch (err) {
      toast.error(err);
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `حذف تصنيف "${c.name_ar}"؟`,
      message: c.dishes.length
        ? `أطباقه (${c.dishes.length}) لن تُحذف، ستنتقل إلى "بدون تصنيف" ولن تظهر على الطاولات حتى تنقلها.`
        : 'التصنيف فارغ وسيُحذف نهائياً.',
      confirmLabel: 'حذف التصنيف',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteCategory(c.id);
      await syncMenu();
      toast.ok('حُذف التصنيف');
    } catch (err) {
      toast.error(err);
    }
  };
  return html`<section class=${cx('cat-hero', !c.is_visible && 'is-hidden')}>
    <div class="cat-hero-cover">
      ${c.cover_url ? html`<${MediaThumb} url=${c.cover_url} />` : html`<div class="cat-hero-nocover"></div>`}
    </div>
    <div class="cat-hero-body">
      <div class="cat-hero-title">
        <span class="cat-hero-icon" aria-hidden="true">${c.icon || '🍽'}</span>
        <div class="min0">
          <h2>${c.name_ar}</h2>
          ${c.name_en && html`<span class="cat-hero-en ltr">${c.name_en}</span>`}
        </div>
        <div class="spacer"></div>
        <${MenuButton} label="خيارات التصنيف" items=${[{ label: 'حذف التصنيف', icon: 'trash', danger: true, onSelect: remove }]} />
      </div>
      ${c.description_ar ? html`<p class="cat-hero-desc">${c.description_ar}</p>` : html`<p class="cat-hero-desc muted">بدون وصف — أضف جملة قصيرة تظهر في رأس صفحة التصنيف.</p>`}
      <div class="cat-hero-actions">
        <${Switch}
          size="sm"
          checked=${Boolean(c.is_visible)}
          disabled=${busy}
          label=${c.is_visible ? 'ظاهر على الطاولات' : 'مخفي عن الطاولات'}
          onChange=${(v) => patch({ is_visible: v }, v ? 'أصبح التصنيف ظاهراً' : 'أُخفي التصنيف عن الطاولات')}
        />
        <div class="spacer"></div>
        <${IconButton} icon="arrow-up" size="sm" variant="glass" label="تقديم في الترتيب" disabled=${index === 0} onClick=${() => move(-1)} />
        <${IconButton} icon="arrow-down" size="sm" variant="glass" label="تأخير في الترتيب" disabled=${index === total - 1} onClick=${() => move(1)} />
        <${Button} size="sm" icon="projector" onClick=${onShow} disabled=${!c.is_visible}>اعرض على طاولة<//>
        <${Button} size="sm" variant="outline" icon="edit" onClick=${onEdit}>تعديل<//>
      </div>
    </div>
  </section>`;
}

function DishList({ dishes, categoryId, search, isOwner, onEdit, onAdd, onShow }) {
  const byId = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const sort = useDragSort(
    dishes.map((d) => d.id),
    async (ids) => {
      try {
        await api.orderDishes(categoryId, ids);
        await syncMenu();
      } catch (err) {
        toast.error(err);
        syncMenu();
      }
    },
  );
  const q = norm(search.trim());
  const shown = sort.order.filter((id) => {
    const d = byId.get(id);
    return d && (!q || norm(`${d.name_ar} ${d.name_en ?? ''} ${d.description_ar ?? ''}`).includes(q));
  });

  if (dishes.length === 0) {
    return html`<${Empty}
      compact
      icon="utensils"
      title="لا توجد أطباق في هذا التصنيف"
      text="أضف الأطباق مع صورها؛ ستظهر بنفس الترتيب على الطاولات."
      action=${html`<${Button} variant="primary" icon="plus" onClick=${onAdd}>إضافة طبق<//>`}
    />`;
  }
  if (!shown.length) return html`<${Empty} compact icon="search" title="لا توجد نتائج" />`;
  return html`<ul class="dish-rows" role="list">
    ${shown.map((id, i) => {
      const d = byId.get(id);
      return html`<${DishRow}
        key=${id}
        dish=${d}
        isOwner=${isOwner}
        first=${i === 0}
        last=${i === shown.length - 1}
        dragging=${sort.dragId === id}
        bind=${q ? {} : sort.bind(id)}
        onMove=${(delta) => sort.move(id, delta)}
        onEdit=${() => onEdit(d)}
        onShow=${() => onShow(d)}
        canMove=${!q}
      />`;
    })}
  </ul>`;
}

function DishRow({ dish: d, isOwner, first, last, dragging, bind, onMove, onEdit, onShow, canMove }) {
  const [busy, setBusy] = useState(false);
  const patch = async (body, ok) => {
    setBusy(true);
    try {
      await api.updateDish(d.id, body);
      await syncMenu();
      if (ok) toast.ok(ok);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: `حذف "${d.name_ar}"؟`,
      message: 'سيُحذف الطبق من المنيو. الطلبات السابقة تحتفظ باسمه وسعره.',
      confirmLabel: 'حذف الطبق',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteDish(d.id);
      await syncMenu();
      toast.ok('حُذف الطبق');
    } catch (err) {
      toast.error(err);
    }
  };
  return html`<li class=${cx('dish-row', dragging && 'is-dragging', !d.is_available && 'is-unavailable')} ...${bind}>
    ${canMove && html`<span class="drag-handle" aria-hidden="true" title="اسحب لتغيير الترتيب"><${Icon} name="drag" size=${16} /></span>`}
    <button type="button" class="dish-row-main" onClick=${onEdit} aria-label=${`تعديل ${d.name_ar}`}>
      <span class="dish-row-thumb">
        <${MediaThumb} url=${d.image_url} kind="image" />
        ${(d.video_url || d.model_url) &&
        html`<span class="dish-row-extras">
          ${d.video_url && html`<span title="فيديو"><${Icon} name="video" size=${12} /></span>`}
          ${d.model_url && html`<span title="مجسم 3D"><${Icon} name="cube" size=${12} /></span>`}
        </span>`}
      </span>
      <span class="dish-row-text">
        <span class="dish-row-name">
          <span class="truncate">${d.name_ar}</span>
          ${d.is_featured && html`<span class="dish-row-star" title="طبق مميز"><${Icon} name="star" size=${14} /></span>`}
        </span>
        ${d.description_ar ? html`<span class="dish-row-desc">${d.description_ar}</span>` : html`<span class="dish-row-desc muted">بدون وصف</span>`}
        ${d.badges.length > 0 && html`<span class="dish-row-badges">${d.badges.map((b) => html`<${Badge} key=${b} tone="gold">${b}<//>`)}</span>`}
      </span>
    </button>
    <div class="dish-row-side">
      ${d.price > 0
        ? html`<span class="dish-row-price num">${money(d.price)}</span>`
        : html`<${Badge} tone="warn" icon="tag" title=${isOwner ? 'حدد السعر' : 'بانتظار تحديد السعر من المالك'}>بدون سعر<//>`}
      <${Switch} size="sm" checked=${Boolean(d.is_available)} disabled=${busy} label="متوفر" onChange=${(v) => patch({ is_available: v }, v ? `"${d.name_ar}" متوفر` : `"${d.name_ar}" غير متوفر الآن`)} />
    </div>
    <div class="dish-row-tools">
      <${IconButton}
        icon="star"
        size="sm"
        class=${cx('star-btn', d.is_featured && 'is-on')}
        label=${d.is_featured ? 'إلغاء التمييز' : 'تمييز الطبق (يظهر في شاشة الترحيب)'}
        aria-pressed=${d.is_featured ? 'true' : 'false'}
        disabled=${busy}
        onClick=${() => patch({ is_featured: !d.is_featured })}
      />
      ${canMove &&
      html`<${IconButton} icon="arrow-up" size="sm" label="تقديم" disabled=${first} onClick=${() => onMove(-1)} />
        <${IconButton} icon="arrow-down" size="sm" label="تأخير" disabled=${last} onClick=${() => onMove(1)} />`}
      <${MenuButton}
        label=${`خيارات ${d.name_ar}`}
        items=${[
          { label: 'تعديل', icon: 'edit', onSelect: onEdit },
          { label: 'اعرض على طاولة…', icon: 'projector', onSelect: onShow, disabled: !d.is_available },
          'divider',
          { label: 'حذف الطبق', icon: 'trash', danger: true, onSelect: remove },
        ]}
      />
    </div>
  </li>`;
}
