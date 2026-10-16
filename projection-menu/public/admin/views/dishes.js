// Dishes, categories, and linking each dish to its projection files.

import { h, mount, toast } from '/shared/dom.js';
import { api, uploadMedia } from '../api.js';
import { ACCEPT, KIND_LABEL, PHASES, btn, field, openModal, projectionMessage, run, selectEl } from '../ui.js';

export async function render(container, ctx) {
  const [dishes, categories, media, tables] = await Promise.all([
    api('/dishes'),
    api('/categories'),
    api('/media'),
    api('/tables'),
  ]);
  const data = { categories, media, tables };

  mount(
    container,
    h(
      'div',
      { class: 'view-head' },
      h('h2', {}, 'الأطباق والعروض الضوئية'),
      btn('التصنيفات', () => editCategories(categories, ctx)),
      btn('+ طبق جديد', () => editDish(null, data, ctx), 'primary'),
    ),
    h(
      'p',
      { class: 'muted' },
      'لكل طبق ثلاثة عروض اختيارية: معاينة عند التصفح، عرض بعد الطلب أثناء الانتظار، وعرض لحظة التقديم.',
    ),
    dishes.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            {},
            h(
              'thead',
              {},
              h('tr', {}, ['', 'الطبق', 'التصنيف', 'السعر', 'الحالة', 'العروض الضوئية', ''].map((t) => h('th', {}, t))),
            ),
            h('tbody', {}, dishes.map((dish) => dishRow(dish, data, ctx))),
          ),
        )
      : h('div', { class: 'card muted' }, 'لا توجد أطباق بعد. ابدأ بإضافة تصنيف ثم طبق.'),
  );
}

function dishRow(dish, data, ctx) {
  return h(
    'tr',
    {},
    h('td', {}, dish.thumbnail_url ? h('img', { class: 'thumb', src: dish.thumbnail_url, alt: '' }) : h('div', { class: 'thumb' })),
    h('td', {}, h('strong', {}, dish.name_ar), dish.name_en && h('div', { class: 'muted' }, dish.name_en)),
    h('td', {}, dish.category_name ?? '—'),
    h('td', {}, dish.price),
    h('td', {}, h('span', { class: `pill ${dish.is_available ? 'ok' : 'off'}` }, dish.is_available ? 'متاح' : 'مخفي')),
    h(
      'td',
      {},
      h(
        'div',
        { class: 'actions' },
        PHASES.map(([phase, label]) =>
          h('span', { class: `pill ${dish.projections[phase] ? 'gold' : ''}`, title: dish.projections[phase]?.media_title ?? 'غير مرتبط' }, label),
        ),
      ),
    ),
    h('td', {}, btn('تعديل', () => editDish(dish, data, ctx), 'small')),
  );
}

// ── Dish editor ────────────────────────────────────────────────────
function editDish(dish, data, ctx) {
  const images = data.media.filter((m) => m.kind === 'image');
  const f = {
    name_ar: h('input', { value: dish?.name_ar ?? '', required: true }),
    name_en: h('input', { value: dish?.name_en ?? '', dir: 'ltr' }),
    category_id: selectEl([['', '— بدون —'], ...data.categories.map((c) => [c.id, c.name_ar])], dish?.category_id),
    price: h('input', { type: 'number', min: '0', step: 'any', value: dish?.price ?? '' }),
    sort_order: h('input', { type: 'number', value: dish?.sort_order ?? 0 }),
    description_ar: h('textarea', { value: dish?.description_ar ?? '' }),
    thumbnail_asset_id: selectEl([['', '— بدون صورة —'], ...images.map((m) => [m.id, m.title])], dish?.thumbnail_asset_id),
    is_available: h('input', { type: 'checkbox', checked: dish ? dish.is_available : true }),
  };
  const thumbUpload = h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp' });
  thumbUpload.addEventListener('change', async () => {
    const file = thumbUpload.files[0];
    if (!file) return;
    const asset = await run(null, () => uploadMedia(file), 'تم رفع الصورة');
    if (asset) {
      data.media.unshift(asset);
      f.thumbnail_asset_id.append(h('option', { value: asset.id }, asset.title));
      f.thumbnail_asset_id.value = asset.id;
    }
  });

  const save = btn(dish ? 'حفظ التعديلات' : 'إنشاء الطبق', async () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
    const saved = await run(save, () => api(dish ? `/dishes/${dish.id}` : '/dishes', { method: dish ? 'PUT' : 'POST', body }), 'تم الحفظ');
    if (!saved) return;
    ctx.rerender();
    // A new dish goes straight to its projection setup.
    if (!dish) editDish(saved, data, ctx);
  }, 'primary');

  const remove =
    dish &&
    btn('حذف الطبق', async () => {
      if (!confirm(`حذف "${dish.name_ar}"؟`)) return;
      const ok = await run(remove, () => api(`/dishes/${dish.id}`, { method: 'DELETE' }).then(() => true), 'تم الحذف');
      if (ok) {
        modal.close();
        ctx.rerender();
      }
    }, 'danger');

  const modal = openModal(
    dish ? `تعديل: ${dish.name_ar}` : 'طبق جديد',
    h(
      'div',
      { class: 'form-grid' },
      field('الاسم بالعربية *', f.name_ar),
      field('الاسم بالإنجليزية', f.name_en),
      field('التصنيف', f.category_id),
      field('السعر *', f.price),
      field('الترتيب', f.sort_order),
      field('صورة الطبق (للتابلت)', f.thumbnail_asset_id),
      field('أو ارفع صورة جديدة', thumbUpload),
    ),
    field('الوصف', f.description_ar),
    h('label', { class: 'inline' }, f.is_available, 'متاح للطلب'),
    h('div', { class: 'modal-foot' }, save, remove),
    dish && projectionEditor(dish, data, ctx),
  );
}

// ── Dish ↔ projection files ────────────────────────────────────────
function projectionEditor(dish, data, ctx) {
  const mediaOptions = () => [['', '— بدون عرض —'], ...data.media.map((m) => [m.id, `${KIND_LABEL[m.kind]} · ${m.title}`])];
  const selects = [];

  const rows = PHASES.map(([phase, label, hint]) => {
    const p = dish.projections[phase];
    const media = selectEl(mediaOptions(), p?.media_asset_id);
    selects.push(media);
    const loop = h('input', { type: 'checkbox', checked: p ? p.loop : phase !== 'served' });
    const seconds = h('input', { type: 'number', min: '0', step: '0.5', placeholder: 'المدة (ث)', value: p?.duration_ms ? p.duration_ms / 1000 : '' });
    const scale = h('input', { type: 'number', min: '0.1', max: '3', step: '0.1', value: p?.scale ?? 1, title: 'حجم العرض' });
    const save = btn('حفظ', async () => {
      if (!media.value) {
        await run(save, () => api(`/dishes/${dish.id}/projections/${phase}`, { method: 'DELETE' }), 'تم فك الربط');
      } else {
        await run(
          save,
          () =>
            api(`/dishes/${dish.id}/projections/${phase}`, {
              method: 'PUT',
              body: {
                media_asset_id: Number(media.value),
                loop: loop.checked,
                duration_ms: seconds.value ? Math.round(Number(seconds.value) * 1000) : null,
                scale: Number(scale.value) || 1,
              },
            }),
          'تم ربط العرض بالطبق',
        );
      }
      ctx.rerender();
    }, 'small primary');
    return h(
      'div',
      { class: 'phase' },
      h('div', {}, h('strong', {}, label), h('div', { class: 'muted' }, hint)),
      media,
      h('label', { class: 'inline' }, loop, 'تكرار'),
      h('div', { class: 'actions' }, seconds, scale),
      save,
    );
  });

  // Quick upload straight from the dish (also lands in the media library).
  const status = h('span', { class: 'muted' });
  const upload = h('input', { type: 'file', accept: ACCEPT });
  upload.addEventListener('change', async () => {
    const file = upload.files[0];
    if (!file) return;
    const asset = await run(null, () =>
      uploadMedia(file, { onProgress: (p) => (status.textContent = `جارٍ الرفع ${Math.round(p * 100)}%`) }),
    );
    status.textContent = '';
    if (!asset) return;
    data.media.unshift(asset);
    for (const select of selects) select.append(h('option', { value: asset.id }, `${KIND_LABEL[asset.kind]} · ${asset.title}`));
    toast(`تم رفع "${asset.title}" — اختره من القائمة واحفظ`, 'ok');
  });

  return h(
    'div',
    { class: 'modal-body', style: { padding: 0 } },
    h('h4', { class: 'section-title' }, 'العروض الضوئية لهذا الطبق'),
    rows,
    h('div', { class: 'actions' }, field('رفع ملف عرض جديد (فيديو / صورة / glb)', upload), status),
    testPanel(dish, data),
  );
}

function testPanel(dish, data) {
  if (!data.tables.length) return h('p', { class: 'muted' }, 'أضف طاولة وجهاز عرض لتجربة العرض مباشرة.');
  const table = selectEl(data.tables.map((t) => [t.id, `${t.code} — ${t.name}`]), data.tables[0].id);
  const seat = h('input', { type: 'number', min: '1', max: '20', placeholder: 'كل الطاولة' });
  const phase = selectEl(PHASES.map(([p, label]) => [p, label]), 'preview');
  const play = btn('▶ تجربة على الطاولة', async () => {
    const result = await run(play, () =>
      api(`/dishes/${dish.id}/test`, {
        method: 'POST',
        body: { table_id: Number(table.value), seat_no: seat.value ? Number(seat.value) : null, phase: phase.value },
      }),
    );
    if (result) toast(projectionMessage(result), result.status === 'sent' ? 'ok' : 'error');
  }, 'primary');
  return h(
    'div',
    { class: 'modal-body', style: { padding: 0 } },
    h('h4', { class: 'section-title' }, 'تجربة مباشرة'),
    h('div', { class: 'form-grid' }, field('الطاولة', table), field('المقعد', seat), field('المرحلة', phase)),
    h('div', {}, play),
  );
}

// ── Categories ─────────────────────────────────────────────────────
function editCategories(categories, ctx) {
  const row = (c) => {
    const name = h('input', { value: c?.name_ar ?? '', placeholder: 'اسم التصنيف' });
    const nameEn = h('input', { value: c?.name_en ?? '', placeholder: 'English', dir: 'ltr' });
    const order = h('input', { type: 'number', value: c?.sort_order ?? categories.length, style: { width: '80px' } });
    const save = btn(c ? 'حفظ' : 'إضافة', async () => {
      const body = { name_ar: name.value, name_en: nameEn.value, sort_order: order.value };
      const ok = await run(save, () => api(c ? `/categories/${c.id}` : '/categories', { method: c ? 'PUT' : 'POST', body }), 'تم الحفظ');
      if (ok) await refresh();
    }, 'small primary');
    const del =
      c &&
      btn('حذف', async () => {
        if (!confirm(`حذف تصنيف "${c.name_ar}"؟ الأطباق ستبقى بدون تصنيف.`)) return;
        await run(del, () => api(`/categories/${c.id}`, { method: 'DELETE' }), 'تم الحذف');
        await refresh();
      }, 'small danger');
    return h('div', { class: 'actions', style: { flexWrap: 'nowrap' } }, name, nameEn, order, save, del);
  };
  const list = h('div', { style: { display: 'grid', gap: '8px' } });
  const draw = () => mount(list, categories.map(row), h('h4', { class: 'section-title' }, 'تصنيف جديد'), row(null));
  const refresh = async () => {
    categories = await api('/categories');
    draw();
    ctx.rerender();
  };
  draw();
  openModal('التصنيفات', list);
}
