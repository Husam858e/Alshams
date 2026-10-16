import { $, h, mount, toast } from '/shared/dom.js';

export const PHASES = [
  ['preview', 'معاينة', 'عند تصفح الطبق على التابلت'],
  ['ordered', 'بعد الطلب', 'أثناء انتظار التحضير'],
  ['served', 'عند التقديم', 'لحظة وصول الطبق'],
];

export const KIND_LABEL = { video: '🎬 فيديو', image: '🖼️ صورة', model3d: '🧊 نموذج 3D' };
export const ACCEPT = '.mp4,.webm,.png,.jpg,.jpeg,.webp,.glb';

let onModalClose = null;
$('#modal').addEventListener('close', () => {
  const fn = onModalClose;
  onModalClose = null;
  fn?.();
});

export function openModal(title, ...body) {
  const modal = $('#modal');
  const close = () => modal.close();
  mount(
    modal,
    h(
      'div',
      { class: 'modal-body' },
      h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'btn ghost small', onClick: close }, '✕')),
      body,
    ),
  );
  if (!modal.open) modal.showModal();
  return { close, onClose: (fn) => (onModalClose = fn) };
}

export const field = (label, input) => h('label', {}, label, input);

export function selectEl(options, value, props = {}) {
  return h(
    'select',
    { ...props, value: value ?? '' },
    options.map(([v, text]) => h('option', { value: v ?? '' }, text)),
  );
}

export const btn = (label, onClick, cls = '') => h('button', { class: `btn ${cls}`, type: 'button', onClick }, label);

// Runs an async action from a button: disables it meanwhile, toasts errors.
export async function run(button, fn, okMessage) {
  if (button) button.disabled = true;
  try {
    const result = await fn();
    if (okMessage) toast(typeof okMessage === 'function' ? okMessage(result) : okMessage, 'ok');
    return result;
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  } finally {
    if (button) button.disabled = false;
  }
}

// Turns a projection API result into a short human message.
export function projectionMessage(result) {
  if (result?.status === 'no_projection') return 'لا يوجد عرض مرتبط بهذه المرحلة';
  if (result?.status === 'no_projector') return 'لا يوجد جهاز عرض مرتبط بهذه الطاولة';
  const res = result?.results ?? [result];
  const ok = res.filter((r) => r?.ok).length;
  const failed = res.filter((r) => r && !r.ok);
  if (!failed.length) return `✓ تم الإرسال إلى ${ok} جهاز عرض`;
  return `${ok ? `✓ ${ok} جهاز · ` : ''}✗ ${failed.map((r) => r.error ?? r.result).join('، ')}`;
}

export function fmtBytes(n) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtTime(sqliteDate) {
  if (!sqliteDate) return '—';
  const iso = sqliteDate.includes('T') ? sqliteDate : `${sqliteDate.replace(' ', 'T')}Z`;
  return new Date(iso).toLocaleString('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('تم النسخ', 'ok');
  } catch {
    prompt('انسخ الرابط:', text);
  }
}
