// Theme studio (owner + designer): the look of the projected menu on every
// table. Edits show at once in a live preview of a chosen table (posted into
// the player iframe, nothing saved yet); "حفظ" applies them to all tables.

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { RangeField } from '../components/forms.js';
import { Icon } from '../components/icons.js';
import { MediaField } from '../components/media.js';
import { PreviewFrame, PreviewPlaceholder } from '../components/PreviewFrame.js';
import { deliveryText, pushScene } from '../components/ShowOnTable.js';
import { toast } from '../components/toast.js';
import { Button, ErrorState, Field, PageHeader, Segmented, Skeleton, Switch, cx } from '../components/ui.js';
import { api } from '../lib/api.js';
import { useLocalPref } from '../lib/hooks.js';
import { ACCENTS, THEME_PRESETS } from '../lib/labels.js';
import { allDishes, allTables, setState, useResource } from '../lib/store.js';

const FONTS = [
  { value: 'Cairo', label: 'القاهرة', css: 'var(--font-cairo)', hint: 'عصري وواضح' },
  { value: 'Tajawal', label: 'تجوّل', css: 'var(--font-tajawal)', hint: 'أنيق وخفيف' },
];
const CARD_STYLES = [
  { value: 'glass', label: 'زجاجية', hint: 'شفافة مع ضبابية خفيفة' },
  { value: 'solid', label: 'مصمتة', hint: 'داكنة بحواف واضحة' },
];
const BG_TYPES = [
  { value: 'preset', label: 'خلفية النمط', icon: 'sparkles' },
  { value: 'image', label: 'صورة', icon: 'image' },
  { value: 'video', label: 'فيديو', icon: 'video' },
];
const PREVIEW_SCENES = [
  { value: 'welcome', label: 'ترحيب', icon: 'sparkles' },
  { value: 'menu', label: 'المنيو', icon: 'grid' },
  { value: 'category', label: 'تصنيف', icon: 'layers' },
  { value: 'dish', label: 'طبق', icon: 'utensils' },
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function ThemeScreen() {
  const { data: settings, error, reload } = useResource('settings');
  const { data: floor } = useResource('floor');
  const { data: menu } = useResource('menu');
  const [draft, setDraft] = useState(null);
  const [bgUrl, setBgUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  // Start from the saved theme; follow outside changes while nothing is edited.
  const saved = settings?.theme;
  const dirty = Boolean(draft && saved && !same(draft, saved));
  const invalid = Boolean(draft && draft.background.type !== 'preset' && !draft.background.assetId);
  useEffect(() => {
    if (saved && (!draft || !dirty)) {
      setDraft(structuredClone(saved));
      setBgUrl(settings.background_url);
    }
  }, [saved]);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.saveTheme(draft);
      setState({ settings: next });
      setDraft(structuredClone(next.theme));
      setBgUrl(next.background_url);
      toast.ok('حُفظ التصميم وطُبّق على كل الطاولات');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };
  const discard = () => {
    setDraft(structuredClone(saved));
    setBgUrl(settings.background_url);
  };

  if (error && !settings) return html`<div class="page"><${ErrorState} error=${error} onRetry=${reload} /></div>`;

  return html`<div class="page theme-page">
    <${PageHeader}
      icon="palette"
      title="تصميم العرض"
      subtitle="شكل المنيو المعروض بالضوء على كل الطاولات"
      actions=${html`
        ${dirty && html`<${Button} variant="ghost" icon="refresh" onClick=${discard} disabled=${saving}>تراجع<//>`}
        ${dirty
          ? html`<${Button} variant="primary" icon="check" loading=${saving} disabled=${invalid} onClick=${save}>حفظ وتطبيق على كل الطاولات<//>`
          : html`<span class="saved-tag"><${Icon} name="check-circle" size=${16} /> كل التعديلات محفوظة</span>`}
      `}
    />
    ${!draft
      ? html`<div class="theme-layout"><div class="stack">${[0, 1, 2].map((i) => html`<${Skeleton} key=${i} h=${180} r="18px" />`)}</div><${Skeleton} h=${420} r="18px" /></div>`
      : html`<div class="theme-layout">
          <div class="theme-controls">
            <${Section} icon="layers" title="النمط" hint="الجو العام للخلفية والزخارف">
              <div class="preset-grid" role="radiogroup" aria-label="النمط">
                ${Object.entries(THEME_PRESETS).map(
                  ([key, p]) => html`<button
                    key=${key}
                    type="button"
                    role="radio"
                    aria-checked=${draft.preset === key ? 'true' : 'false'}
                    class=${cx('preset-card', draft.preset === key && 'is-active')}
                    onClick=${() => set('preset', key)}
                  >
                    <span class="preset-visual" style=${{ '--p0': p.swatch[0], '--p1': p.swatch[1], '--p2': p.swatch[2], '--acc': draft.accent }}>
                      <span class="pv-title"></span>
                      <span class="pv-cards"><span></span><span></span><span></span></span>
                    </span>
                    <span class="preset-name">${p.label}</span>
                    <span class="preset-hint">${p.hint}</span>
                    ${draft.preset === key && html`<span class="preset-check"><${Icon} name="check" size=${14} /></span>`}
                  </button>`,
                )}
              </div>
            <//>

            <${Section} icon="droplet" title="لون التمييز" hint="للأسعار والعناوين والإطارات">
              <div class="accent-row">
                ${ACCENTS.map(
                  (c) => html`<button
                    key=${c}
                    type="button"
                    class=${cx('swatch', draft.accent.toLowerCase() === c && 'is-active')}
                    style=${{ '--sw': c }}
                    aria-label=${`اللون ${c}`}
                    aria-pressed=${draft.accent.toLowerCase() === c ? 'true' : 'false'}
                    onClick=${() => set('accent', c)}
                  ></button>`,
                )}
                <label class="swatch swatch-custom" style=${{ '--sw': draft.accent }} title="لون مخصص">
                  <input type="color" value=${draft.accent} onInput=${(e) => set('accent', e.currentTarget.value)} aria-label="اختر لوناً مخصصاً" />
                  <${Icon} name="plus" size=${14} />
                </label>
                <span class="accent-hex num">${draft.accent.toUpperCase()}</span>
              </div>
            <//>

            <${Section} icon="image" title="الخلفية" hint="الأسود يعني لا ضوء على الطاولة؛ اختر خلفيات داكنة">
              <${Segmented}
                options=${BG_TYPES}
                value=${draft.background.type}
                label="نوع الخلفية"
                onChange=${(type) => set('background', { type, assetId: type === draft.background.type ? draft.background.assetId : null })}
              />
              ${draft.background.type !== 'preset' &&
              html`<${MediaField}
                key=${draft.background.type}
                kind=${draft.background.type}
                label=${draft.background.type === 'image' ? 'صورة الخلفية' : 'فيديو الخلفية'}
                value=${draft.background.assetId}
                url=${bgUrl}
                onChange=${(a) => {
                  set('background', { type: draft.background.type, assetId: a?.id ?? null });
                  setBgUrl(a?.url ?? null);
                }}
                hint="تُعرض خافتة خلف المحتوى"
              />`}
              ${draft.background.type !== 'preset' && !draft.background.assetId && html`<p class="field-hint warn-text">اختر ملفاً قبل الحفظ.</p>`}
            <//>

            <${Section} icon="type" title="الخط">
              <div class="choice-grid">
                ${FONTS.map(
                  (f) => html`<button
                    key=${f.value}
                    type="button"
                    class=${cx('choice-card', draft.font === f.value && 'is-active')}
                    aria-pressed=${draft.font === f.value ? 'true' : 'false'}
                    onClick=${() => set('font', f.value)}
                  >
                    <span class="font-sample" style=${{ fontFamily: f.css }}>${settings.general.restaurantName}</span>
                    <span class="font-sample-sub" style=${{ fontFamily: f.css }}>كباب عراقي · <span class="num">14,000</span></span>
                    <span class="choice-meta"><strong>${f.label}</strong> · ${f.hint}</span>
                  </button>`,
                )}
              </div>
            <//>

            <${Section} icon="grid" title="بطاقات الأطباق">
              <div class="choice-grid">
                ${CARD_STYLES.map(
                  (c) => html`<button
                    key=${c.value}
                    type="button"
                    class=${cx('choice-card', draft.cardStyle === c.value && 'is-active')}
                    aria-pressed=${draft.cardStyle === c.value ? 'true' : 'false'}
                    onClick=${() => set('cardStyle', c.value)}
                  >
                    <span class=${`card-sample card-sample-${c.value}`} style=${{ '--acc': draft.accent }}><span></span><i></i><b></b></span>
                    <span class="choice-meta"><strong>${c.label}</strong> · ${c.hint}</span>
                  </button>`,
                )}
              </div>
            <//>

            <${Section} icon="eye" title="ما يظهر على البطاقات">
              <div class="switch-list">
                <${Switch} checked=${draft.showPrices} onChange=${(v) => set('showPrices', v)} label="الأسعار" />
                <${Switch} checked=${draft.showDescriptions} onChange=${(v) => set('showDescriptions', v)} label="الأوصاف" />
                <${Switch} checked=${draft.showCalories} onChange=${(v) => set('showCalories', v)} label="السعرات الحرارية" />
              </div>
            <//>

            <${Section} icon="clock" title="التوقيت">
              <${Field} label="مدة كل صفحة في المنيو الكامل" hint="ينتقل المنيو تلقائياً بين التصنيفات.">
                ${(id) => html`<${RangeField} id=${id} min=${4} max=${60} value=${Math.min(60, draft.pageSeconds)} onChange=${(v) => set('pageSeconds', v)} unit="ث" />`}
              <//>
              <${Field} label="عرض الأطباق المميزة في شاشة الترحيب بعد" hint="إذا بقيت شاشة الترحيب دون تغيير هذه المدة تبدأ بعرض الأطباق المميزة بهدوء.">
                ${(id) => html`<${RangeField} id=${id} min=${10} max=${600} step=${10} value=${Math.min(600, draft.idleSeconds)} onChange=${(v) => set('idleSeconds', v)} unit="ث" />`}
              <//>
            <//>
          </div>

          <${PreviewPanel} floor=${floor} menu=${menu} theme=${draft} backgroundUrl=${bgUrl} dirty=${dirty} />
        </div>`}
    ${dirty &&
    html`<div class="savebar" role="status">
      <${Icon} name="info" size=${18} />
      <span>تعديلات غير محفوظة — تظهر في المعاينة فقط.</span>
      <div class="spacer"></div>
      <${Button} size="sm" variant="ghost" onClick=${discard} disabled=${saving}>تراجع<//>
      <${Button} size="sm" variant="primary" icon="check" loading=${saving} disabled=${invalid} onClick=${save}>حفظ<//>
    </div>`}
  </div>`;
}

function Section({ icon, title, hint, children }) {
  return html`<section class="panel theme-section">
    <div class="theme-section-head">
      <span class="theme-section-icon"><${Icon} name=${icon} size=${18} /></span>
      <div>
        <h2>${title}</h2>
        ${hint && html`<p>${hint}</p>`}
      </div>
    </div>
    <div class="theme-section-body">${children}</div>
  </section>`;
}

function PreviewPanel({ floor, menu, theme, backgroundUrl, dirty }) {
  const tables = useMemo(() => allTables(floor), [floor]);
  const [tableId, setTableId] = useLocalPref('theme-table', null);
  const [kind, setKind] = useLocalPref('theme-scene', 'menu');
  const [busy, setBusy] = useState(false);
  const table = tables.find((t) => t.id === tableId) ?? tables[0] ?? null;

  const scene = useMemo(() => {
    if (!menu) return { type: kind === 'category' || kind === 'dish' ? 'menu' : kind };
    const cat = menu.categories.find((c) => c.is_visible && c.dishes.length) ?? menu.categories[0];
    if (kind === 'category' && cat) return { type: 'category', categoryId: cat.id };
    if (kind === 'dish') {
      const dishes = allDishes(menu).filter((d) => d.is_available);
      const dish = dishes.find((d) => d.is_featured && d.image_url) ?? dishes.find((d) => d.image_url) ?? dishes[0];
      if (dish) return { type: 'dish', dishId: dish.id };
    }
    return { type: kind === 'category' || kind === 'dish' ? 'menu' : kind };
  }, [menu, kind]);

  const apply = async () => {
    setBusy(true);
    try {
      const res = await pushScene(table, scene);
      toast.ok(deliveryText(res.delivered, table.projectors.length), { title: `طاولة ${table.number}` });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return html`<aside class="theme-preview">
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title"><${Icon} name="monitor" size=${18} /> معاينة مباشرة</div>
        <div class="spacer"></div>
        ${tables.length > 0 &&
        html`<label class="select-inline">
          <span class="muted">طاولة</span>
          <select class="select select-sm" value=${table?.id} onChange=${(e) => setTableId(Number(e.currentTarget.value))} aria-label="طاولة المعاينة">
            ${tables.map((t) => html`<option key=${t.id} value=${t.id}>${t.number}</option>`)}
          </select>
        </label>`}
      </div>
      <div class="panel-body stack">
        ${table
          ? html`<${PreviewFrame} key=${table.id} tableId=${table.id} theme=${theme} backgroundUrl=${backgroundUrl} scene=${scene} label=${`معاينة طاولة ${table.number}`} />`
          : html`<${PreviewPlaceholder} text=${floor ? 'أضف طاولة لتظهر المعاينة' : 'جارٍ التحميل…'} />`}
        <${Segmented} options=${PREVIEW_SCENES} value=${kind} onChange=${setKind} label="المشهد في المعاينة" class="segmented-block" />
        ${dirty && html`<div class="notice notice-gold"><${Icon} name="info" size=${18} /><span>المعاينة تعرض تعديلاتك قبل الحفظ. الطاولات تبقى على التصميم المحفوظ حتى تضغط حفظ.</span></div>`}
        <${Button} icon="projector" block onClick=${apply} loading=${busy} disabled=${!table}>
          ${table ? `تطبيق على الطاولة ${table.number}` : 'تطبيق على الطاولة'}
        <//>
        <p class="field-hint center">يعرض المشهد المختار على جهاز عرض الطاولة الحقيقي لتجربته.</p>
      </div>
    </div>
  </aside>`;
}
