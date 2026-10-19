// Category editor (modal): names, icon, description, cover photo, visibility.

import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { EmojiField } from '../../components/forms.js';
import { MediaField } from '../../components/media.js';
import { Modal } from '../../components/overlay.js';
import { toast } from '../../components/toast.js';
import { Button, Field, Switch } from '../../components/ui.js';
import { api } from '../../lib/api.js';
import { load } from '../../lib/store.js';

export function CategoryEditor({ category: c, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name_ar: c?.name_ar ?? '',
    name_en: c?.name_en ?? '',
    icon: c?.icon ?? '',
    description_ar: c?.description_ar ?? '',
    cover: { id: c?.cover_asset_id ?? null, url: c?.cover_url ?? null },
    is_visible: c ? Boolean(c.is_visible) : true,
  }));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const setInput = (key) => (e) => set(key)(e.currentTarget.value);

  const save = async (e) => {
    e?.preventDefault();
    if (!form.name_ar.trim()) return setError('اسم التصنيف بالعربية مطلوب');
    setError(null);
    setBusy(true);
    const body = {
      name_ar: form.name_ar.trim(),
      name_en: form.name_en.trim() || null,
      icon: form.icon.trim() || null,
      description_ar: form.description_ar.trim() || null,
      cover_asset_id: form.cover.id,
      is_visible: form.is_visible,
    };
    try {
      const saved = c ? await api.updateCategory(c.id, body) : await api.createCategory(body);
      await load('menu', { force: true }).catch(() => {});
      toast.ok(c ? 'حُفظ التصنيف' : `أُضيف تصنيف "${saved.name_ar}"`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return html`<${Modal}
    size="lg"
    icon="layers"
    title=${c ? `تعديل تصنيف: ${c.name_ar}` : 'تصنيف جديد'}
    onClose=${onClose}
    footer=${html`
      <${Button} variant="ghost" onClick=${onClose}>إلغاء<//>
      <${Button} variant="primary" icon="check" loading=${busy} onClick=${save}>${c ? 'حفظ' : 'إضافة التصنيف'}<//>
    `}
  >
    <form class="cat-editor" onSubmit=${save} novalidate>
      <div class="stack">
        <div class="form-grid">
          <${Field} label="الاسم بالعربية" required error=${error}>
            ${(id) => html`<input id=${id} class="input" value=${form.name_ar} maxlength="60" onInput=${setInput('name_ar')} placeholder="مثال: مشاوي" />`}
          <//>
          <${Field} label="الاسم بالإنجليزية">
            ${(id) => html`<input id=${id} class="input" dir="ltr" value=${form.name_en} maxlength="60" onInput=${setInput('name_en')} placeholder="Grills" />`}
          <//>
        </div>
        <${Field} label="الوصف" hint="يظهر تحت عنوان التصنيف على الطاولة.">
          ${(id) => html`<textarea id=${id} class="textarea" rows="2" maxlength="300" value=${form.description_ar} onInput=${setInput('description_ar')}></textarea>`}
        <//>
        <${Field} label="الأيقونة">${(id) => html`<${EmojiField} id=${id} value=${form.icon} onChange=${set('icon')} />`}<//>
        <${Switch} checked=${form.is_visible} onChange=${set('is_visible')} label="ظاهر على الطاولات" hint="أخفِ التصنيف مؤقتاً (مثل منيو الإفطار) دون حذفه." />
      </div>
      <${MediaField}
        kind="image"
        label="صورة الغلاف"
        value=${form.cover.id}
        url=${form.cover.url}
        onChange=${(a) => set('cover')(a ? { id: a.id, url: a.url } : { id: null, url: null })}
        hint="صورة عريضة تظهر في رأس صفحة التصنيف"
        aspect="4 / 5"
      />
    </form>
  <//>`;
}
