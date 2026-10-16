// Pairing links and QR codes for tablets, players and the Android app.
// Links must use an address other devices can reach: when the dashboard is
// itself opened via localhost, the server's LAN address is used instead.

import { h } from '/shared/dom.js';
import { api } from './api.js';
import { qrCanvas } from './qr.js';
import { btn, fmtBytes, linkBox, openModal } from './ui.js';

const isLocal = (hostname) =>
  ['localhost', '[::1]', '::1', '0.0.0.0'].includes(hostname) || hostname.endsWith('.localhost') || hostname.startsWith('127.');

// { base, local, info }: base goes into every link and QR code.
export async function lanBase() {
  const info = await api('/server-info');
  const local = isLocal(location.hostname);
  return { info, local, base: local ? info.publicBaseUrl : location.origin };
}

export function localWarning({ local, base, info }) {
  if (!local) return null;
  if (isLocal(new URL(base).hostname)) {
    return h(
      'div',
      { class: 'notice error' },
      '⚠️ لم يُعثر على عنوان للخادم على الشبكة المحلية، والأجهزة الأخرى لا تستطيع الوصول إلى "localhost". ',
      'اضبط PUBLIC_BASE_URL (مثل http://192.168.1.10:3000) ثم أعد تشغيل الخادم.',
    );
  }
  const others = info.lanUrls.filter((url) => url !== base);
  return h(
    'div',
    { class: 'notice' },
    '⚠️ فتحت لوحة التحكم عبر "localhost"، والتابلتات وأجهزة العرض لا تستطيع الوصول إليه. ',
    'الروابط ورموز QR هنا تستخدم عنوان الخادم على الشبكة: ',
    h('code', {}, base),
    others.length > 0 && h('span', {}, ' · عناوين أخرى: ', others.map((url, i) => [i ? '، ' : '', h('code', {}, url)])),
  );
}

// A QR code with its link (copyable, wraps so it can be typed on a TV box
// without a camera) and a PNG download for printing table stickers.
function qrPanel(link, { title, hint, fileName, actions }) {
  const canvas = qrCanvas(link);
  return h(
    'div',
    { class: 'qr-panel' },
    h('div', { class: 'qr-frame' }, canvas),
    h(
      'div',
      { class: 'qr-info' },
      title && h('h4', {}, title),
      hint && h('p', { class: 'muted' }, hint),
      linkBox(link),
      h(
        'div',
        { class: 'actions' },
        actions,
        h('a', { class: 'btn small', href: canvas.toDataURL('image/png'), download: `${fileName}.png` }, 'تنزيل صورة الرمز'),
      ),
    ),
  );
}

export function openQr(title, link, { lan, hint, fileName }) {
  openModal(title, localWarning(lan), qrPanel(link, { hint, fileName }));
}

export async function openAndroidApp() {
  const lan = await lanBase();
  const { info, base } = lan;
  const apkLink = `${base}${info.apkUrl}`;

  const download = info.apkAvailable
    ? qrPanel(apkLink, {
        title: 'تنزيل التطبيق',
        hint: 'امسح الرمز بكاميرا الجهاز أو افتح الرابط في متصفحه، ثم ثبّت الملف.',
        fileName: 'projection-menu-apk',
        actions: h('a', { class: 'btn small primary', href: info.apkUrl, download: '' }, `⬇ APK · ${fmtBytes(info.apkSize)}`),
      })
    : h(
        'div',
        { class: 'qr-panel missing' },
        h(
          'div',
          { class: 'qr-info' },
          h('h4', {}, 'تنزيل التطبيق'),
          h('p', { class: 'muted' }, 'ملف التطبيق غير موجود على الخادم بعد. ابنِه من مجلد android ثم انسخه إلى dist/ProjectionMenu.apk:'),
          h(
            'pre',
            { class: 'mono' },
            'cd android && ./gradlew assembleRelease\nmkdir -p ../dist && cp app/build/outputs/apk/release/ProjectionMenu-*-release.apk ../dist/ProjectionMenu.apk',
          ),
          h('p', { class: 'muted' }, 'أو اضبط APK_PATH على مسار الملف. لا حاجة لإعادة تشغيل الخادم: أعد فتح هذه النافذة فقط.'),
        ),
      );

  const modal = openModal(
    '📲 تطبيق أندرويد',
    h(
      'p',
      { class: 'muted' },
      'تطبيق واحد لتابلت الطاولة، ولأجهزة Android TV والبرجكترات بنظام أندرويد (مشغّل عرض عبر HDMI)، وللوحة التحكم. ',
      'يعمل بملء الشاشة مع قفل اختياري، ويحتوي على عرض تجريبي يعمل بدون خادم.',
    ),
    localWarning(lan),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, h('strong', {}, 'ثبّت التطبيق: '), 'امسح رمز التنزيل بكاميرا الجهاز واسمح بتثبيت التطبيقات من "مصادر غير معروفة" عندما يُطلب ذلك.'),
      h('li', {}, h('strong', {}, 'افتح التطبيق '), '«المنيو الضوئي» واختر "امسح رمز QR" (أو الصق الرابط يدوياً).'),
      h(
        'li',
        {},
        h('strong', {}, 'امسح رمز الجهاز '),
        'من "الطاولات والأجهزة": زر QR بجانب الطاولة لتابلتها، أو في بطاقة جهاز العرض لجهاز Android TV / البرجكتر. ',
        'ولفتح لوحة التحكم في التطبيق امسح رمز وضع الإدارة أدناه.',
      ),
    ),
    h(
      'div',
      { class: 'qr-pair' },
      download,
      qrPanel(`${base}/admin/`, {
        title: 'وضع الإدارة (لوحة التحكم)',
        hint: 'يفتح هذه اللوحة داخل التطبيق على جهاز المدير أو المطبخ.',
        fileName: 'projection-menu-admin',
      }),
    ),
    h(
      'p',
      { class: 'muted fine-print' },
      'إعدادات التطبيق لاحقاً: 5 نقرات سريعة في الزاوية العلوية اليسرى، أو زر الرجوع 3 مرات، أو زر القائمة في الريموت. ',
      'يمكن حمايتها برمز PIN وقفل الجهاز على التطبيق. يتطلب Android 7 أو أحدث مع Android System WebView محدَّث.',
    ),
    h(
      'div',
      { class: 'modal-foot' },
      btn('فتح الطاولات والأجهزة', () => {
        modal.close();
        location.hash = '#devices';
      }, 'primary'),
    ),
  );
}
