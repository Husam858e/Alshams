// Tables (tablet pairing) and projectors (status, calibration, zones, power).

import { h, mount, toast } from '/shared/dom.js';
import { api } from '../api.js';
import { lanBase, localWarning, openQr } from '../pairing.js';
import { btn, field, linkBox, openModal, projectionMessage, run, selectEl } from '../ui.js';
import { openCalibration } from './calibration.js';

const DRIVER_LABEL = {
  browser: 'متصفح / تطبيق أندرويد (عبر HDMI)',
  mpv_agent: 'وكيل mpv (Raspberry Pi)',
};

export async function render(container, ctx) {
  const [tables, projectors, media, lan] = await Promise.all([api('/tables'), api('/projectors'), api('/media'), lanBase()]);
  const data = { tables, projectors, media, lan };

  mount(
    container,
    localWarning(lan),
    h('div', { class: 'view-head' }, h('h2', {}, 'الطاولات'), btn('+ طاولة جديدة', () => editTable(null, ctx), 'primary')),
    tables.length
      ? h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            {},
            h('thead', {}, h('tr', {}, ['الرمز', 'الاسم', 'المقاعد', 'أجهزة العرض', 'رابط التابلت', ''].map((t) => h('th', {}, t)))),
            h('tbody', {}, tables.map((t) => tableRow(t, data, ctx))),
          ),
        )
      : h('div', { class: 'card muted' }, 'لا توجد طاولات بعد.'),
    h('div', { class: 'view-head' }, h('h2', {}, 'أجهزة العرض (البرجكترات)'), btn('+ جهاز عرض', () => editProjector(null, data, ctx), 'primary')),
    projectors.length
      ? h('div', { class: 'cards' }, projectors.map((p) => projectorCard(p, data, ctx)))
      : h('div', { class: 'card muted' }, 'لا توجد أجهزة عرض بعد.'),
  );
}

// Live online/offline dots.
export function onEvent(event, payload, container) {
  if (event !== 'projector:status') return;
  const pill = container.querySelector(`[data-projector-status="${payload.id}"]`);
  if (pill) setOnline(pill, payload.online);
}

function setOnline(pill, online) {
  pill.className = `pill ${online ? 'ok' : 'off'}`;
  pill.textContent = online ? 'متصل' : 'غير متصل';
}

// ── Tables ─────────────────────────────────────────────────────────
function tableRow(t, { lan }, ctx) {
  const link = `${lan.base}${t.tablet_path}`;
  const qr = btn('📱 QR', () => openQr(`ربط تابلت ${t.code} — ${t.name}`, link, {
    lan,
    hint: 'على تابلت الطاولة: افتح تطبيق «المنيو الضوئي» واختر "امسح رمز QR"، أو امسح الرمز بكاميرا التابلت لفتح الرابط في المتصفح. "مفتاح جديد" يُبطل هذا الرمز.',
    fileName: `tablet-${t.code}`,
  }), 'small primary');
  const rotate = btn('مفتاح جديد', async () => {
    if (!confirm('سيتوقف الرابط القديم عن العمل على كل التابلتات المرتبطة. متابعة؟')) return;
    if (await run(rotate, () => api(`/tables/${t.id}/rotate-key`, { method: 'POST' }), 'تم إنشاء رابط جديد')) ctx.rerender();
  }, 'small');
  const del = btn('حذف', async () => {
    if (!confirm(`حذف ${t.code}؟`)) return;
    if (await run(del, () => api(`/tables/${t.id}`, { method: 'DELETE' }).then(() => true), 'تم الحذف')) ctx.rerender();
  }, 'small danger');

  return h(
    'tr',
    {},
    h('td', {}, h('strong', {}, t.code), !t.is_active && h('span', { class: 'pill off' }, 'معطلة')),
    h('td', {}, t.name),
    h('td', {}, t.seats),
    h('td', {}, t.projector_count),
    h('td', { style: { maxWidth: '360px' } }, linkBox(link, qr)),
    h(
      'td',
      {},
      h(
        'div',
        { class: 'actions' },
        h('a', { class: 'btn small', href: t.tablet_path, target: '_blank' }, 'فتح'),
        btn('تعديل', () => editTable(t, ctx), 'small'),
        rotate,
        del,
      ),
    ),
  );
}

function editTable(t, ctx) {
  const f = {
    code: h('input', { value: t?.code ?? '', placeholder: 'T01', dir: 'ltr' }),
    name: h('input', { value: t?.name ?? '', placeholder: 'طاولة النافذة' }),
    seats: h('input', { type: 'number', min: '1', max: '20', value: t?.seats ?? 4 }),
    is_active: h('input', { type: 'checkbox', checked: t ? t.is_active : true }),
  };
  const save = btn('حفظ', async () => {
    const body = { code: f.code.value, name: f.name.value, seats: f.seats.value, is_active: f.is_active.checked };
    const ok = await run(save, () => api(t ? `/tables/${t.id}` : '/tables', { method: t ? 'PUT' : 'POST', body }), 'تم الحفظ');
    if (ok) {
      modal.close();
      ctx.rerender();
    }
  }, 'primary');
  const modal = openModal(
    t ? `تعديل ${t.code}` : 'طاولة جديدة',
    h('div', { class: 'form-grid' }, field('الرمز', f.code), field('الاسم', f.name), field('عدد المقاعد', f.seats)),
    h('label', { class: 'inline' }, f.is_active, 'الطاولة مفعلة'),
    h('p', { class: 'muted' }, 'تغيير عدد المقاعد لا يغيّر مناطق الإسقاط تلقائياً: أعد ضبطها من بطاقة جهاز العرض.'),
    h('div', { class: 'modal-foot' }, save),
  );
}

// ── Projectors ─────────────────────────────────────────────────────
function projectorCard(p, data, ctx) {
  const status = h('span', { dataset: { projectorStatus: p.id } });
  setOnline(status, p.online);

  const cmd = (button, body, ok) =>
    run(button, () => api(`/projectors/${p.id}/command`, { method: 'POST', body })).then(
      (result) => result && toast(result.ok ? ok : projectionMessage(result), result.ok ? 'ok' : 'error'),
    );
  const testOn = btn('شاشة اختبار', () => cmd(testOn, { action: 'test_pattern', on: true }, 'تم إظهار شاشة الاختبار'), 'small');
  const testOff = btn('إخفاء الاختبار', () => cmd(testOff, { action: 'test_pattern', on: false }, 'تم الإخفاء'), 'small');
  const stop = btn('إيقاف الكل', () => cmd(stop, { action: 'stop' }, 'تم إيقاف كل العروض'), 'small');
  const push = btn('إعادة إرسال الإعدادات', () => cmd(push, { action: 'config' }, 'تم الإرسال'), 'small');

  const power = (on) => {
    const b = btn(on ? 'تشغيل البرجكتر' : 'إطفاء البرجكتر', () =>
      run(b, () => api(`/projectors/${p.id}/power`, { method: 'POST', body: { on } }), on ? 'جارٍ التشغيل...' : 'جارٍ الإطفاء...'),
    'small');
    return b;
  };
  const del = btn('حذف', async () => {
    if (!confirm(`حذف "${p.name}"؟`)) return;
    if (await run(del, () => api(`/projectors/${p.id}`, { method: 'DELETE' }).then(() => true), 'تم الحذف')) ctx.rerender();
  }, 'small danger');
  const rotate = btn('مفتاح جديد', async () => {
    if (!confirm('سيتوقف الرابط/الأمر القديم عن العمل. متابعة؟')) return;
    if (await run(rotate, () => api(`/projectors/${p.id}/rotate-key`, { method: 'POST' }), 'تم')) ctx.rerender();
  }, 'small');

  const idle = data.media.find((m) => m.id === p.idle_asset_id);
  const { lan } = data;
  const playerLink = `${lan.base}${p.player_path}`;
  const connection =
    p.driver === 'browser'
      ? h(
          'div',
          {},
          h('div', { class: 'muted' }, 'افتح هذا الرابط على الجهاز المتصل بالبرجكتر (Chromium Kiosk)، أو امسح رمز QR من تطبيق أندرويد على Android TV / البرجكتر:'),
          linkBox(
            playerLink,
            btn('📺 QR', () => openQr(`ربط جهاز العرض: ${p.name}`, playerLink, {
              lan,
              hint: 'على جهاز Android TV أو البرجكتر بنظام أندرويد (المتصل بـ HDMI): افتح تطبيق «المنيو الضوئي» وامسح الرمز، أو اكتب الرابط يدوياً إذا لم تكن فيه كاميرا.',
              fileName: `player-${p.id}`,
            }), 'small primary'),
          ),
        )
      : h(
          'div',
          {},
          h('div', { class: 'muted' }, `شغّل هذا الأمر على جهاز الوكيل (${p.agent_host ?? 'لم يُحدد IP'}):`),
          linkBox(`python3 projector_agent.py --server ${lan.base} --projector ${p.id} --key ${p.access_key}`),
        );

  return h(
    'div',
    { class: 'card device' },
    h('div', { class: 'device-head' }, h('h3', {}, p.name), status),
    h(
      'div',
      { class: 'muted' },
      `الطاولة: ${p.table_code ?? '—'} · ${DRIVER_LABEL[p.driver]} · خلفية الخمول: ${idle?.title ?? 'بدون'}`,
    ),
    connection,
    h(
      'div',
      { class: 'actions' },
      btn('🎯 معايرة الزوايا', () => openCalibration(p, ctx), 'small primary'),
      btn('مناطق المقاعد', () => editZones(p, ctx), 'small'),
      testOn,
      testOff,
      stop,
      push,
    ),
    h(
      'div',
      { class: 'actions' },
      p.pjlink_host && power(true),
      p.pjlink_host && power(false),
      btn('تعديل', () => editProjector(p, data, ctx), 'small'),
      rotate,
      del,
    ),
  );
}

function editProjector(p, data, ctx) {
  const f = {
    name: h('input', { value: p?.name ?? '', placeholder: 'بروجكتر الطاولة 1' }),
    table_id: selectEl([['', '— بدون —'], ...data.tables.map((t) => [t.id, `${t.code} — ${t.name}`])], p?.table_id),
    driver: selectEl(Object.entries(DRIVER_LABEL), p?.driver ?? 'browser'),
    idle_asset_id: selectEl(
      [['', '— بدون (أسود) —'], ...data.media.filter((m) => m.kind !== 'model3d').map((m) => [m.id, m.title])],
      p?.idle_asset_id,
    ),
    agent_host: h('input', { value: p?.agent_host ?? '', placeholder: '192.168.1.50', dir: 'ltr' }),
    agent_port: h('input', { type: 'number', value: p?.agent_port ?? 8765 }),
    pjlink_host: h('input', { value: p?.pjlink_host ?? '', placeholder: '192.168.1.60', dir: 'ltr' }),
    pjlink_port: h('input', { type: 'number', value: p?.pjlink_port ?? 4352 }),
    pjlink_password: h('input', { value: p?.pjlink_password ?? '', type: 'password', autocomplete: 'off' }),
  };
  const agentFields = h('div', { class: 'form-grid' }, field('IP جهاز الوكيل', f.agent_host), field('منفذ الوكيل', f.agent_port));
  const syncDriver = () => (agentFields.hidden = f.driver.value !== 'mpv_agent');
  f.driver.addEventListener('change', syncDriver);
  syncDriver();

  const save = btn('حفظ', async () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    const ok = await run(save, () => api(p ? `/projectors/${p.id}` : '/projectors', { method: p ? 'PUT' : 'POST', body }), 'تم الحفظ');
    if (ok) {
      modal.close();
      ctx.rerender();
    }
  }, 'primary');

  const modal = openModal(
    p ? `تعديل: ${p.name}` : 'جهاز عرض جديد',
    h('div', { class: 'form-grid' }, field('الاسم', f.name), field('الطاولة', f.table_id), field('طريقة التشغيل', f.driver), field('عرض الخمول (خلفية الطاولة)', f.idle_asset_id)),
    agentFields,
    h('h4', { class: 'section-title' }, 'التحكم بطاقة البرجكتر عبر الشبكة (PJLink) — اختياري'),
    h('div', { class: 'form-grid' }, field('IP البرجكتر', f.pjlink_host), field('منفذ PJLink', f.pjlink_port), field('كلمة مرور PJLink', f.pjlink_password)),
    h('div', { class: 'modal-foot' }, save),
  );
}

// ── Seat zones ─────────────────────────────────────────────────────
function editZones(p, ctx) {
  const text = h('textarea', { dir: 'ltr', class: 'mono', style: { minHeight: '220px' }, value: JSON.stringify(p.zones, null, 2) });
  const previewBox = h('div', { class: 'calib', style: { margin: 0 } });
  const draw = () => {
    let zones;
    try {
      zones = JSON.parse(text.value);
    } catch {
      return;
    }
    if (!Array.isArray(zones)) return;
    mount(
      previewBox,
      zones.map((z) =>
        h(
          'div',
          {
            style: {
              position: 'absolute',
              left: `${z.x * 100}%`,
              top: `${z.y * 100}%`,
              width: `${z.w * 100}%`,
              height: `${z.h * 100}%`,
              border: '2px solid var(--gold)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--gold-2)',
              fontWeight: '800',
            },
          },
          h('span', { style: { transform: `rotate(${z.rotate ?? 0}deg)` } }, `مقعد ${z.seat}`),
        ),
      ),
    );
  };
  text.addEventListener('input', draw);
  draw();

  const after = async (button, body) => {
    const result = await run(button, () => api(`/projectors/${p.id}/zones`, { method: 'PUT', body }), 'تم الحفظ والإرسال للجهاز');
    if (result) {
      text.value = JSON.stringify(result.projector.zones, null, 2);
      draw();
      ctx.rerender();
    }
  };
  const save = btn('حفظ', () => {
    let zones;
    try {
      zones = JSON.parse(text.value);
    } catch {
      return toast('JSON غير صالح', 'error');
    }
    after(save, { zones });
  }, 'primary');
  const reset = btn('توزيع افتراضي حسب عدد المقاعد', () => after(reset, { reset: true }));

  openModal(
    `مناطق المقاعد — ${p.name}`,
    h(
      'p',
      { class: 'muted' },
      'كل منطقة هي المساحة أمام مقعد على سطح الطاولة (إحداثيات 0..1 بعد المعايرة). rotate: 180 للمقاعد في الجهة المقابلة حتى يظهر المحتوى معتدلاً لصاحبها.',
    ),
    previewBox,
    text,
    h('div', { class: 'modal-foot' }, save, reset),
  );
}
