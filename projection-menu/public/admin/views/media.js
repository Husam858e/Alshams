// Media library: upload, preview, rename and delete projection files.

import { h, mount, toast } from '/shared/dom.js';
import { api, uploadMedia } from '../api.js';
import { ACCEPT, KIND_LABEL, btn, fmtBytes, run } from '../ui.js';

export async function render(container, ctx) {
  const media = await api('/media');

  mount(
    container,
    h('div', { class: 'view-head' }, h('h2', {}, 'مكتبة العروض')),
    dropzone(ctx),
    media.length
      ? h('div', { class: 'media-grid' }, media.map((m) => mediaCard(m, ctx)))
      : h('div', { class: 'card muted' }, 'المكتبة فارغة. ارفع أول فيديو أو تصميم.'),
  );
}

function dropzone(ctx) {
  const input = h('input', { type: 'file', accept: ACCEPT, multiple: true, hidden: true });
  const bar = h('div');
  const progress = h('div', { class: 'progress', hidden: true }, bar);
  const label = h('span', { class: 'muted' });

  const uploadAll = async (files) => {
    progress.hidden = false;
    let done = 0;
    for (const file of files) {
      label.textContent = `جارٍ رفع ${file.name} (${done + 1}/${files.length})`;
      try {
        await uploadMedia(file, { onProgress: (p) => (bar.style.width = `${Math.round(p * 100)}%`) });
        done++;
      } catch (err) {
        toast(`${file.name}: ${err.message}`, 'error');
      }
    }
    if (done) toast(`تم رفع ${done} ملف`, 'ok');
    ctx.rerender();
  };

  input.addEventListener('change', () => input.files.length && uploadAll([...input.files]));
  const zone = h(
    'div',
    { class: 'dropzone' },
    h('strong', {}, 'اسحب ملفات العرض هنا أو'),
    btn('اختر ملفات', () => input.click(), 'primary'),
    h(
      'span',
      { class: 'muted' },
      'فيديو MP4 / WebM (تصاميم 3D مصدّرة كفيديو) · صور PNG / JPG / WebP · نماذج 3D بصيغة GLB. ',
      'اجعل الخلفية سوداء: الأسود = لا ضوء على الطاولة.',
    ),
    progress,
    label,
    input,
  );
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    if (e.dataTransfer.files.length) uploadAll([...e.dataTransfer.files]);
  });
  return zone;
}

function preview(m) {
  if (m.kind === 'video') {
    const video = h('video', { src: `${m.url}#t=0.5`, muted: true, loop: true, preload: 'metadata', playsinline: true });
    video.muted = true;
    video.addEventListener('mouseenter', () => video.play().catch(() => {}));
    video.addEventListener('mouseleave', () => video.pause());
    return video;
  }
  if (m.kind === 'image') return h('img', { src: m.url, alt: '', loading: 'lazy' });
  return h('span', { title: 'يُعرض مباشرة بـ three.js على صفحة العرض' }, '🧊');
}

function mediaCard(m, ctx) {
  const title = h('input', { value: m.title });
  title.addEventListener('change', () =>
    run(null, () => api(`/media/${m.id}`, { method: 'PATCH', body: { title: title.value } }), 'تم تغيير الاسم'),
  );
  const used = m.used_by_projections + m.used_as_thumbnail + m.used_as_idle;
  const del = btn('حذف', async () => {
    if (!confirm(`حذف "${m.title}" نهائياً؟`)) return;
    const ok = await run(del, () => api(`/media/${m.id}`, { method: 'DELETE' }).then(() => true), 'تم الحذف');
    if (ok) ctx.rerender();
  }, 'small danger');

  return h(
    'div',
    { class: 'card media-card' },
    h('div', { class: 'media-preview' }, preview(m)),
    title,
    h(
      'div',
      { class: 'media-meta' },
      h('span', { class: 'pill' }, KIND_LABEL[m.kind]),
      h('span', { class: 'pill' }, fmtBytes(m.size_bytes)),
      m.duration_ms && h('span', { class: 'pill' }, `${(m.duration_ms / 1000).toFixed(1)} ث`),
      m.width && h('span', { class: 'pill' }, `${m.width}×${m.height}`),
      h('span', { class: `pill ${used ? 'gold' : ''}` }, used ? `مستخدم ${used}×` : 'غير مستخدم'),
    ),
    h('div', { class: 'actions' }, h('a', { class: 'btn small', href: m.url, target: '_blank' }, 'فتح'), del),
  );
}
