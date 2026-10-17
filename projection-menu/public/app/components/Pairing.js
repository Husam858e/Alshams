// Connecting a projector device to a table (owner):
//  - PairingDialog: a 6-digit code (10 minutes, single use) typed into the
//    Android app's "جهاز عرض على طاولة" setup, plus a QR to install the app.
//  - PlayerLinkDialog: the projector's private player link as a QR code, for
//    devices that open a browser instead of the app.

import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../lib/api.js';
import { useNow } from '../lib/hooks.js';
import { allTables, useResource } from '../lib/store.js';
import { Icon } from './icons.js';
import { Modal } from './overlay.js';
import { QrCode } from './QrCode.js';
import { toast } from './toast.js';
import { Button, Field, Spinner, cx } from './ui.js';

let infoCache = null;
// Addresses LAN devices can reach (never "localhost"); falls back to this page's origin.
export function useServerInfo() {
  const [info, setInfo] = useState(infoCache);
  useEffect(() => {
    if (infoCache) return;
    api
      .serverInfo()
      .then((i) => setInfo((infoCache = i)))
      .catch(() => setInfo({ publicBaseUrl: location.origin, apkAvailable: false, apkUrl: '/app.apk', lanUrls: [location.origin] }));
  }, []);
  return info;
}

export async function copyText(text, ok = 'نُسخ') {
  try {
    await navigator.clipboard.writeText(text);
    toast.ok(ok);
  } catch {
    toast.info(text, { title: 'انسخ النص' });
  }
}

export function PairingDialog({ tableId: initialTable, onClose }) {
  const { data: floor } = useResource('floor');
  const tables = useMemo(() => allTables(floor), [floor]);
  const [tableId, setTableId] = useState(initialTable ?? null);
  const [name, setName] = useState('');
  const [code, setCode] = useState(null); // {code, expiresAt}
  const [busy, setBusy] = useState(false);
  const known = useRef(null); // projector ids of the table when the code was made
  const info = useServerInfo();
  const now = useNow(1000);
  const table = tables.find((t) => t.id === Number(tableId)) ?? null;

  const create = async () => {
    if (!table) return;
    setBusy(true);
    try {
      known.current = new Set(table.projectors.map((p) => p.id));
      setCode(await api.pairingCode(table.id, name.trim()));
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initialTable && !code) create();
  }, [floor ? 1 : 0]);

  // The device claimed the code: a new projector shows up on that table.
  const claimed = code && table && known.current ? table.projectors.find((p) => !known.current.has(p.id)) : null;
  const left = code ? Math.max(0, Date.parse(code.expiresAt) - now) : 0;
  const expired = code && left === 0 && !claimed;
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  const apkUrl = info ? `${info.publicBaseUrl}${info.apkUrl ?? '/app.apk'}` : null;

  return html`<${Modal}
    size="lg"
    icon="link"
    title=${table ? `ربط جهاز عرض بطاولة ${table.number}` : 'ربط جهاز عرض'}
    subtitle="جهاز أندرويد (TV Box أو تابلت) موصول بالبروجكتر فوق الطاولة"
    onClose=${onClose}
    footer=${html`
      ${code && !claimed && html`<${Button} variant="ghost" icon="refresh" onClick=${create} loading=${busy}>رمز جديد<//>`}
      <div class="spacer"></div>
      <${Button} variant=${claimed ? 'primary' : 'secondary'} onClick=${onClose}>${claimed ? 'تم' : 'إغلاق'}<//>
    `}
  >
    ${!code
      ? html`<div class="stack">
          <div class="form-grid">
            <${Field} label="الطاولة" required>
              ${(id) => html`<select id=${id} class="select" value=${tableId ?? ''} onChange=${(e) => setTableId(Number(e.currentTarget.value) || null)}>
                <option value="">اختر رقم الطاولة</option>
                ${tables.map((t) => html`<option key=${t.id} value=${t.id}>طاولة ${t.number}</option>`)}
              </select>`}
            <//>
            <${Field} label="اسم الجهاز (اختياري)" hint="مثل: بروجكتر السقف">
              ${(id) => html`<input id=${id} class="input" maxlength="60" value=${name} onInput=${(e) => setName(e.currentTarget.value)} placeholder=${table ? `جهاز عرض طاولة ${table.number}` : ''} />`}
            <//>
          </div>
          <div class="form-actions">
            <${Button} variant="primary" icon="key" disabled=${!table} loading=${busy} onClick=${create}>إنشاء رمز الربط<//>
          </div>
        </div>`
      : claimed
        ? html`<div class="pair-success">
            <span class="pair-success-icon"><${Icon} name="check" size=${34} /></span>
            <h3>تم ربط "${claimed.name}" بطاولة ${table.number}</h3>
            <p class="muted">${claimed.online ? 'الجهاز متصل ويعرض الآن.' : 'سيظهر المنيو على الطاولة فور اتصال الجهاز.'}</p>
          </div>`
        : html`<div class="pair-layout">
            <div class="pair-code-box">
              <span class="section-title">رمز الربط</span>
              <div class=${cx('pair-code num', expired && 'is-expired')} aria-label=${`رمز الربط ${code.code.split('').join(' ')}`}>
                ${code.code.split('').map((d, i) => html`<span key=${i}>${d}</span>`)}
              </div>
              <div class=${cx('pair-timer', expired && 'is-expired')}>
                ${expired
                  ? html`<${Icon} name="alert" size=${16} /> انتهت صلاحية الرمز — أنشئ رمزاً جديداً`
                  : html`<${Icon} name="clock" size=${16} /> صالح لمدة <span class="num">${mmss}</span> · لمرة واحدة`}
              </div>
              <div class="pair-waiting">${!expired && html`<${Spinner} size=${14} /> بانتظار إدخال الرمز على الجهاز…`}</div>
              <ol class="pair-steps">
                <li>ثبّت تطبيق <strong>المنيو الضوئي</strong> على جهاز العرض (امسح الرمز المجاور).</li>
                <li>اختر <strong>«جهاز عرض على طاولة»</strong> ثم اختر هذا الخادم من القائمة أو اكتب عنوانه:
                  <span class="pair-server ltr">${info?.publicBaseUrl ?? location.origin}</span></li>
                <li>أدخل الرمز المكوّن من 6 أرقام.</li>
              </ol>
            </div>
            <div class="pair-qr">
              ${apkUrl
                ? html`<${QrCode} text=${apkUrl} size=${176} label="رمز QR لتنزيل تطبيق أندرويد" />`
                : html`<div class="qr" style=${{ width: '176px', height: '176px' }}></div>`}
              <strong>تنزيل تطبيق أندرويد</strong>
              <span class="ltr muted pair-qr-url">${apkUrl ?? ''}</span>
              ${info && !info.apkAvailable && html`<span class="badge badge-warn">ملف APK غير موجود على الخادم بعد</span>`}
            </div>
          </div>`}
  <//>`;
}

export function PlayerLinkDialog({ projector: p, onClose }) {
  const info = useServerInfo();
  const url = `${info?.publicBaseUrl ?? location.origin}${p.player_url}`;
  return html`<${Modal}
    size="md"
    icon="qr"
    title="رابط المشغل"
    subtitle=${`${p.name}${p.table_number ? ` · طاولة ${p.table_number}` : ''}`}
    onClose=${onClose}
    footer=${html`
      <${Button} variant="ghost" icon="external" onClick=${() => window.open(p.player_url, '_blank', 'noopener')}>فتح هنا<//>
      <div class="spacer"></div>
      <${Button} variant="primary" icon="copy" onClick=${() => copyText(url, 'نُسخ رابط المشغل')}>نسخ الرابط<//>
    `}
  >
    <div class="link-dialog">
      ${info ? html`<${QrCode} text=${url} size=${220} label="رمز QR لرابط المشغل" />` : html`<div class="qr" style=${{ width: '220px', height: '220px' }}></div>`}
      <p class="link-url ltr">${url}</p>
      <div class="notice notice-warn">
        <${Icon} name="lock" size=${18} />
        <span>افتح هذا الرابط على الجهاز الموصول بالبروجكتر (أو امسحه من تطبيق أندرويد). الرابط يعمل كمفتاح سري للجهاز: إن تسرّب، غيّر المفتاح من قائمة الجهاز.</span>
      </div>
    </div>
  <//>`;
}
