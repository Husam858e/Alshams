// Dish editor (drawer): text, category, pictures / video / 3D model from the
// library, badges, details and visibility. Price: owner only.

import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { TagInput } from '../../components/forms.js';
import { Icon } from '../../components/icons.js';
import { MediaField } from '../../components/media.js';
import { Drawer, confirmDialog } from '../../components/overlay.js';
import { toast } from '../../components/toast.js';
import { Button, Field, Switch } from '../../components/ui.js';
import { api } from '../../lib/api.js';
import { currency } from '../../lib/format.js';
import { BADGE_SUGGESTIONS } from '../../lib/labels.js';
import { load } from '../../lib/store.js';

const syncMenu = () => load('menu', { force: true }).catch(() => {});

const fromDish = (d, categoryId) => ({
  name_ar: d?.name_ar ?? '',
  name_en: d?.name_en ?? '',
  category_id: d ? (d.category_id ?? '') : (categoryId ?? ''),
  description_ar: d?.description_ar ?? '',
  price: d?.price != null ? String(d.price) : '',
  image: { id: d?.image_asset_id ?? null, url: d?.image_url ?? null },
  video: { id: d?.video_asset_id ?? null, url: d?.video_url ?? null },
  model: { id: d?.model_asset_id ?? null, url: d?.model_url ?? null },
  badges: d?.badges ?? [],
  calories: d?.calories ?? '',
  prep_minutes: d?.prep_minutes ?? '',
  is_available: d ? Boolean(d.is_available) : true,
  is_featured: d ? Boolean(d.is_featured) : false,
});

const intOrNull = (v) => (v === '' || v == null ? null : Math.round(Number(v)));

export function DishEditor({ dish, categoryId, menu, isOwner, onClose, onSaved }) {
  const [form, setForm] = useState(() => fromDish(dish, categoryId));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (key) => (value) => {
    setTouched(true);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setInput = (key) => (e) => set(key)(e.currentTarget.value);
  const pickMedia = (key) => (asset) => set(key)(asset ? { id: asset.id, url: asset.url } : { id: null, url: null });

  const close = async () => {
    if (touched && !busy) {
      const ok = await confirmDialog({ title: 'تجاهل التعديلات؟', message: 'لم تُحفظ تعديلاتك على الطبق.', confirmLabel: 'تجاهل', cancelLabel: 'متابعة التعديل' });
      if (!ok) return;
    }
    onClose();
  };

  const save = async (e) => {
    e?.preventDefault();
    const errs = {};
    if (!form.name_ar.trim()) errs.name_ar = 'اسم الطبق بالعربية مطلوب';
    const price = form.price === '' ? null : Number(form.price);
    if (isOwner && price != null && (!Number.isFinite(price) || price < 0)) errs.price = 'سعر غير صالح';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = {
      name_ar: form.name_ar.trim(),
      name_en: form.name_en.trim() || null,
      category_id: form.category_id === '' ? null : Number(form.category_id),
      description_ar: form.description_ar.trim() || null,
      image_asset_id: form.image.id,
      video_asset_id: form.video.id,
      model_asset_id: form.model.id,
      badges: form.badges,
      calories: intOrNull(form.calories),
      prep_minutes: intOrNull(form.prep_minutes),
      is_available: form.is_available,
      is_featured: form.is_featured,
    };
    // Only the owner sends a price; the server answers 403 to anyone else.
    if (isOwner) body.price = price ?? 0;

    setBusy(true);
    try {
      const saved = dish ? await api.updateDish(dish.id, body) : await api.createDish(body);
      await syncMenu();
      toast.ok(dish ? `حُفظ "${saved.name_ar}"` : `أُضيف "${saved.name_ar}" إلى المنيو`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const descLen = form.description_ar.length;

  return html`<${Drawer}
    size="lg"
    title=${dish ? `تعديل: ${dish.name_ar}` : 'طبق جديد'}
    subtitle=${dish ? 'التغييرات تظهر على الطاولات فور الحفظ' : 'أضف الاسم والصورة والوصف؛ يظهر على الطاولات فور الحفظ'}
    icon="utensils"
    onClose=${close}
    footer=${html`
      <${Button} variant="ghost" onClick=${close}>إلغاء<//>
      <${Button} variant="primary" icon="check" loading=${busy} onClick=${save}>${dish ? 'حفظ التعديلات' : 'إضافة الطبق'}<//>
    `}
  >
    <form class="editor-form" onSubmit=${save} novalidate>
      <section class="editor-section">
        <h3 class="editor-section-title"><${Icon} name="image" size=${16} /> الصورة والوسائط</h3>
        <div class="dish-media-fields">
          <${MediaField} kind="image" label="صورة الطبق" value=${form.image.id} url=${form.image.url} onChange=${pickMedia('image')} hint="صورة أفقية بدقة 1200px على الأقل" aspect="4 / 3" />
          <div class="dish-media-side">
            <${MediaField} kind="video" label="فيديو (اختياري)" value=${form.video.id} url=${form.video.url} onChange=${pickMedia('video')} emptyText="أضف فيديو قصيراً" aspect="16 / 9" />
            <${MediaField} kind="model3d" label="مجسم ثلاثي الأبعاد (اختياري)" value=${form.model.id} url=${form.model.url} onChange=${pickMedia('model')} emptyText="أضف مجسماً GLB" aspect="16 / 9" />
          </div>
        </div>
        <p class="field-hint">الفيديو يُعرض صامتاً ومتكرراً في البطاقات الكبيرة وصفحة الطبق؛ المجسم يدور ببطء في صفحة الطبق.</p>
      </section>

      <section class="editor-section">
        <h3 class="editor-section-title"><${Icon} name="type" size=${16} /> المعلومات</h3>
        <div class="form-grid">
          <${Field} label="اسم الطبق بالعربية" required error=${errors.name_ar}>
            ${(id) => html`<input id=${id} class="input" value=${form.name_ar} maxlength="80" onInput=${setInput('name_ar')} placeholder="مثال: كباب لحم" />`}
          <//>
          <${Field} label="الاسم بالإنجليزية">
            ${(id) => html`<input id=${id} class="input" dir="ltr" value=${form.name_en} maxlength="80" onInput=${setInput('name_en')} placeholder="Kebab" />`}
          <//>
          <${Field} label="التصنيف" class="span-2">
            ${(id) => html`<select id=${id} class="select" value=${form.category_id} onChange=${setInput('category_id')}>
              <option value="">بدون تصنيف (لا يظهر على الطاولات)</option>
              ${menu.categories.map((c) => html`<option key=${c.id} value=${c.id}>${c.icon ? `${c.icon} ` : ''}${c.name_ar}</option>`)}
            </select>`}
          <//>
          <${Field}
            label="الوصف"
            class="span-2"
            aside=${html`<span class=${`field-count num ${descLen > 160 ? 'is-long' : ''}`}>${descLen}/500</span>`}
            hint="جملة أو جملتان تفتح الشهية؛ الوصف القصير (أقل من 160 حرفاً) يظهر كاملاً في البطاقات."
          >
            ${(id) => html`<textarea id=${id} class="textarea" rows="3" maxlength="500" value=${form.description_ar} onInput=${setInput('description_ar')} placeholder="مكونات الطبق وطريقة تحضيره…"></textarea>`}
          <//>
        </div>
      </section>

      <section class="editor-section">
        <h3 class="editor-section-title"><${Icon} name="tag" size=${16} /> السعر والتفاصيل</h3>
        <div class="form-grid form-grid-3">
          <${Field}
            label="السعر"
            error=${errors.price}
            hint=${isOwner ? null : 'تعديل الأسعار من صلاحيات المالك'}
            aside=${!isOwner && html`<span class="lock-tag"><${Icon} name="lock" size=${13} /> للمالك</span>`}
          >
            ${(id) => html`<div class="input-affix">
              <input
                id=${id}
                class="input input-num"
                inputmode="decimal"
                value=${isOwner ? form.price : String(dish?.price ?? 0)}
                readonly=${!isOwner}
                aria-readonly=${!isOwner ? 'true' : undefined}
                onInput=${(e) => set('price')(e.currentTarget.value.replace(/[^\d.]/g, ''))}
                placeholder="0"
              />
              <span class="affix">${currency()}</span>
            </div>`}
          <//>
          <${Field} label="السعرات (اختياري)">
            ${(id) => html`<div class="input-affix"><input id=${id} class="input input-num" inputmode="numeric" value=${form.calories} onInput=${(e) => set('calories')(e.currentTarget.value.replace(/\D/g, '').slice(0, 5))} placeholder="—" /><span class="affix">سعرة</span></div>`}
          <//>
          <${Field} label="وقت التحضير (اختياري)">
            ${(id) => html`<div class="input-affix"><input id=${id} class="input input-num" inputmode="numeric" value=${form.prep_minutes} onInput=${(e) => set('prep_minutes')(e.currentTarget.value.replace(/\D/g, '').slice(0, 3))} placeholder="—" /><span class="affix">دقيقة</span></div>`}
          <//>
        </div>
        <${Field} label="الشارات" hint="كلمات قصيرة تظهر على البطاقة (حتى 8).">
          ${(id) => html`<${TagInput} id=${id} value=${form.badges} onChange=${set('badges')} suggestions=${BADGE_SUGGESTIONS} />`}
        <//>
      </section>

      <section class="editor-section">
        <h3 class="editor-section-title"><${Icon} name="eye" size=${16} /> الظهور</h3>
        <div class="switch-list">
          <${Switch} checked=${form.is_available} onChange=${set('is_available')} label="متوفر الآن" hint="الطبق غير المتوفر يختفي من الطاولات ولا يمكن طلبه." />
          <${Switch} checked=${form.is_featured} onChange=${set('is_featured')} label="طبق مميز" hint="يُعرض بالتناوب في شاشة الترحيب ويحمل علامة مميزة." />
        </div>
      </section>
    </form>
  <//>`;
}
