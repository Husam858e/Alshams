// General settings (owner): restaurant identity, currency, welcome texts,
// with a live preview of the welcome scene; plus the addresses and QR codes
// staff tablets and projector devices use to reach this server.

import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { MediaField } from '../components/media.js';
import { copyText, useServerInfo } from '../components/Pairing.js';
import { PreviewFrame, PreviewPlaceholder } from '../components/PreviewFrame.js';
import { QrCode } from '../components/QrCode.js';
import { toast } from '../components/toast.js';
import { Button, ErrorState, Field, PageHeader, Skeleton } from '../components/ui.js';
import { api } from '../lib/api.js';
import { bytes, dateTime } from '../lib/format.js';
import { allTables, setState, useResource } from '../lib/store.js';

const CURRENCIES = ['د.ع', 'IQD', '$', 'ر.س', 'د.إ', 'د.ك', 'ر.ق', 'ج.م', 'ل.ل', 'د.أ'];
const FIELDS = ['restaurantName', 'restaurantNameEn', 'logoAssetId', 'currency', 'welcomeTitle', 'welcomeText', 'footerText'];
const pick = (g) => Object.fromEntries(FIELDS.map((k) => [k, g?.[k] ?? (k === 'logoAssetId' ? null : '')]));

export default function SettingsScreen() {
  const { data: settings, error, reload } = useResource('settings');
  const { data: floor } = useResource('floor');
  const [form, setForm] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const saved = settings ? pick(settings.general) : null;
  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));

  useEffect(() => {
    if (settings && (!form || !dirty)) {
      setForm(pick(settings.general));
      setLogoUrl(settings.logo_url);
    }
  }, [settings]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setInput = (k) => (e) => set(k)(e.currentTarget.value);
  const save = async (e) => {
    e?.preventDefault();
    if (!form.restaurantName.trim()) return toast.error('اسم المطعم مطلوب');
    if (!form.currency.trim()) return toast.error('العملة مطلوبة');
    setSaving(true);
    try {
      const next = await api.saveGeneral({ ...form, restaurantName: form.restaurantName.trim(), currency: form.currency.trim() });
      setState({ settings: next });
      setForm(pick(next.general));
      setLogoUrl(next.logo_url);
      toast.ok('حُفظت الإعدادات وظهرت على كل الطاولات');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const table = useMemo(() => allTables(floor)[0] ?? null, [floor]);
  const previewGeneral = useMemo(() => (form ? { ...settings?.general, ...form } : null), [form]);

  if (error && !settings) return html`<div class="page"><${ErrorState} error=${error} onRetry=${reload} /></div>`;
  return html`<div class="page settings-page">
    <${PageHeader}
      icon="sliders"
      title="الإعدادات"
      subtitle="هوية المطعم ونصوص شاشة الترحيب على الطاولات"
      actions=${dirty
        ? html`<${Button} variant="ghost" onClick=${() => (setForm(pick(settings.general)), setLogoUrl(settings.logo_url))}>تراجع<//>
            <${Button} variant="primary" icon="check" loading=${saving} onClick=${save}>حفظ الإعدادات<//>`
        : form && html`<span class="saved-tag"><${Icon} name="check-circle" size=${16} /> كل التعديلات محفوظة</span>`}
    />
    ${!form
      ? html`<div class="settings-layout"><${Skeleton} h=${520} r="18px" /><${Skeleton} h=${320} r="18px" /></div>`
      : html`<div class="settings-layout">
          <form class="stack" onSubmit=${save}>
            <section class="panel">
              <div class="panel-head"><div class="panel-title"><${Icon} name="store" size=${18} /> هوية المطعم</div></div>
              <div class="panel-body settings-identity">
                <div class="stack">
                  <${Field} label="اسم المطعم" required>
                    ${(id) => html`<input id=${id} class="input" maxlength="80" value=${form.restaurantName} onInput=${setInput('restaurantName')} />`}
                  <//>
                  <${Field} label="الاسم بالإنجليزية" hint="يظهر صغيراً تحت الاسم العربي">
                    ${(id) => html`<input id=${id} class="input" dir="ltr" maxlength="80" value=${form.restaurantNameEn} onInput=${setInput('restaurantNameEn')} />`}
                  <//>
                  <${Field} label="العملة" required hint="تظهر بجانب كل الأسعار">
                    ${(id) => html`<div class="currency-field">
                      <input id=${id} class="input currency-input" maxlength="12" value=${form.currency} onInput=${setInput('currency')} />
                      <div class="chips">
                        ${CURRENCIES.map(
                          (c) => html`<button key=${c} type="button" class=${`chip chip-sm ${form.currency === c ? 'is-active' : ''}`} aria-pressed=${form.currency === c ? 'true' : 'false'} onClick=${() => set('currency')(c)}>${c}</button>`,
                        )}
                      </div>
                    </div>`}
                  <//>
                </div>
                <${MediaField}
                  kind="image"
                  label="الشعار"
                  value=${form.logoAssetId}
                  url=${logoUrl}
                  aspect="1 / 1"
                  emptyText="اختر الشعار"
                  hint="PNG بخلفية شفافة يظهر أجمل"
                  onChange=${(a) => {
                    set('logoAssetId')(a?.id ?? null);
                    setLogoUrl(a?.url ?? null);
                  }}
                />
              </div>
            </section>

            <section class="panel">
              <div class="panel-head"><div class="panel-title"><${Icon} name="sparkles" size=${18} /> شاشة الترحيب</div></div>
              <div class="panel-body stack">
                <${Field} label="عنوان الترحيب">
                  ${(id) => html`<input id=${id} class="input" maxlength="80" value=${form.welcomeTitle} onInput=${setInput('welcomeTitle')} placeholder="أهلاً وسهلاً" />`}
                <//>
                <${Field} label="نص الترحيب">
                  ${(id) => html`<textarea id=${id} class="textarea" rows="2" maxlength="240" value=${form.welcomeText} onInput=${setInput('welcomeText')}></textarea>`}
                <//>
                <${Field} label="نص التذييل (اختياري)" hint="سطر صغير أسفل الشاشة، مثل: واي فاي الضيوف أو رقم الحجز">
                  ${(id) => html`<input id=${id} class="input" maxlength="240" value=${form.footerText} onInput=${setInput('footerText')} />`}
                <//>
              </div>
            </section>
          </form>

          <aside class="settings-side">
            <section class="panel">
              <div class="panel-head"><div class="panel-title"><${Icon} name="monitor" size=${18} /> معاينة الترحيب</div>${table && html`<span class="muted">طاولة ${table.number}</span>`}</div>
              <div class="panel-body">
                ${table
                  ? html`<${PreviewFrame} tableId=${table.id} scene=${{ type: 'welcome' }} general=${previewGeneral} logoUrl=${logoUrl} label="معاينة شاشة الترحيب" />`
                  : html`<${PreviewPlaceholder} text="أضف طاولة لتظهر المعاينة" />`}
              </div>
            </section>
            <${DevicesCard} />
          </aside>
        </div>`}
  </div>`;
}

function DevicesCard() {
  const info = useServerInfo();
  if (!info) return html`<${Skeleton} h=${300} r="18px" />`;
  const base = info.publicBaseUrl;
  return html`<section class="panel">
    <div class="panel-head"><div class="panel-title"><${Icon} name="phone" size=${18} /> التابلت وأجهزة العرض</div></div>
    <div class="panel-body stack">
      <div class="qr-pair">
        <div class="qr-cell">
          <${QrCode} text=${`${base}/app/`} size=${132} label="رمز QR لتطبيق الموظفين" />
          <strong>تطبيق الموظفين</strong>
          <span class="ltr muted">${base}/app/</span>
        </div>
        <div class="qr-cell">
          <${QrCode} text=${`${base}${info.apkUrl ?? '/app.apk'}`} size=${132} label="رمز QR لتنزيل تطبيق أندرويد" />
          <strong>تنزيل تطبيق أندرويد</strong>
          <span class="muted">${info.apkAvailable ? `${bytes(info.apkSize)} · ${dateTime(info.apkUpdatedAt)}` : 'غير متوفر على الخادم بعد'}</span>
        </div>
      </div>
      <div class="stack-sm">
        <div class="section-title">عناوين الخادم على الشبكة</div>
        ${(info.lanUrls?.length ? info.lanUrls : [base]).map(
          (u) => html`<button key=${u} type="button" class="addr-row" onClick=${() => copyText(u, 'نُسخ العنوان')}>
            <${Icon} name="globe" size=${16} /><span class="ltr">${u}</span><${Icon} name="copy" size=${15} />
          </button>`,
        )}
        <p class="field-hint">تطبيق أندرويد يجد الخادم تلقائياً على نفس الشبكة؛ أو اكتب أحد هذه العناوين.</p>
      </div>
      ${info.apkAvailable && html`<a class="btn btn-secondary btn-md" href=${info.apkUrl ?? '/app.apk'} download><${Icon} name="download" size=${18} /><span class="btn-label">تنزيل APK</span></a>`}
    </div>
  </section>`;
}
