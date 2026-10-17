// Multi-file uploads with per-file progress (XHR via api.js), a drop zone
// and the list of files in flight. Two files upload at a time.

import { html } from 'htm/preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import { uploadMedia } from '../lib/api.js';
import { bytes } from '../lib/format.js';
import { getState, patchResource } from '../lib/store.js';
import { Icon } from './icons.js';
import { Button, IconButton, cx } from './ui.js';

export const ACCEPT = {
  all: '.jpg,.jpeg,.png,.webp,.mp4,.webm,.glb',
  image: '.jpg,.jpeg,.png,.webp',
  video: '.mp4,.webm',
  model3d: '.glb',
};
const EXT_KIND = { jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', mp4: 'video', webm: 'video', glb: 'model3d' };
const CONCURRENCY = 2;
let seq = 0;

export function kindOf(name) {
  return EXT_KIND[String(name).split('.').pop().toLowerCase()] ?? null;
}

export function useUploader({ kind = 'all', onUploaded } = {}) {
  const [items, setItems] = useState([]);
  const queue = useRef([]);
  const active = useRef(0);
  const aborts = useRef(new Map());
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const update = (id, patch) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const pump = () => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const { id, file } = queue.current.shift();
      active.current++;
      update(id, { status: 'uploading' });
      const { promise, abort } = uploadMedia(file, { onProgress: (p) => update(id, { progress: p }) });
      aborts.current.set(id, abort);
      promise
        .then((uploaded) => {
          const asset = { ...uploaded, uploaded_by_name: uploaded.uploaded_by_name ?? getState().auth.user?.name ?? null };
          update(id, { status: 'done', progress: 1, asset });
          patchResource('media', (list) => [asset, ...list.filter((m) => m.id !== asset.id)]);
          onUploadedRef.current?.(asset);
        })
        .catch((err) => update(id, { status: err.status === -1 ? 'cancelled' : 'error', error: err.message }))
        .finally(() => {
          aborts.current.delete(id);
          active.current--;
          pump();
        });
    }
  };

  const add = useCallback(
    (fileList) => {
      const files = [...fileList];
      const fresh = files.map((file) => {
        const k = kindOf(file.name);
        const ok = k && (kind === 'all' || k === kind);
        return {
          id: ++seq,
          file,
          name: file.name,
          size: file.size,
          kind: k,
          progress: 0,
          status: ok ? 'queued' : 'error',
          error: ok ? null : kind === 'all' ? 'صيغة غير مدعومة (المسموح: JPG, PNG, WebP, MP4, WebM, GLB)' : 'نوع الملف غير مناسب لهذا الحقل',
        };
      });
      setItems((list) => [...list.filter((i) => i.status === 'uploading' || i.status === 'queued'), ...fresh]);
      for (const item of fresh) if (item.status === 'queued') queue.current.push(item);
      pump();
    },
    [kind],
  );

  const cancel = (id) => {
    const abort = aborts.current.get(id);
    if (abort) abort();
    else {
      queue.current = queue.current.filter((q) => q.id !== id);
      update(id, { status: 'cancelled' });
    }
  };
  const clear = () => setItems((list) => list.filter((i) => i.status === 'uploading' || i.status === 'queued'));
  const busy = items.some((i) => i.status === 'uploading' || i.status === 'queued');
  return { items, add, cancel, clear, busy };
}

export function DropZone({ onFiles, accept = ACCEPT.all, multiple = true, compact = false, title, hint }) {
  const input = useRef();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return html`<div
    class=${cx('dropzone', compact && 'dropzone-compact', over && 'is-over')}
    onDragEnter=${(e) => {
      e.preventDefault();
      depth.current++;
      setOver(true);
    }}
    onDragOver=${(e) => e.preventDefault()}
    onDragLeave=${() => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    }}
    onDrop=${(e) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
    }}
  >
    <span class="dropzone-icon"><${Icon} name="upload" size=${compact ? 22 : 28} /></span>
    <div class="dropzone-text">
      <strong>${title ?? (over ? 'أفلت الملفات هنا' : 'اسحب الملفات وأفلتها هنا')}</strong>
      <span>${hint ?? 'صور JPG / PNG / WebP · فيديو MP4 / WebM · مجسمات 3D بصيغة GLB'}</span>
    </div>
    <${Button} variant="primary" icon="plus" onClick=${() => input.current.click()}>اختر ملفات<//>
    <input
      ref=${input}
      type="file"
      accept=${accept}
      multiple=${multiple}
      hidden
      data-testid="file-input"
      onChange=${(e) => {
        if (e.currentTarget.files.length) onFiles(e.currentTarget.files);
        e.currentTarget.value = '';
      }}
    />
  </div>`;
}

const STATUS_TEXT = { queued: 'بالانتظار', uploading: 'جارٍ الرفع', done: 'تم', error: 'فشل', cancelled: 'أُلغي' };

export function UploadList({ items, onCancel, onClear }) {
  if (!items.length) return null;
  const finished = items.filter((i) => i.status === 'done' || i.status === 'error' || i.status === 'cancelled').length;
  return html`<div class="upload-list" aria-live="polite">
    <div class="upload-list-head">
      <span class="section-title"><${Icon} name="upload" size=${15} /> الرفع (${finished}/${items.length})</span>
      ${finished > 0 && html`<button type="button" class="link-btn" onClick=${onClear}>إخفاء المنتهية</button>`}
    </div>
    ${items.map(
      (i) => html`<div key=${i.id} class=${cx('upload-row', `is-${i.status}`)}>
        <span class="upload-kind"><${Icon} name=${i.kind === 'video' ? 'video' : i.kind === 'model3d' ? 'cube' : 'image'} size=${18} /></span>
        <div class="upload-main">
          <div class="upload-line">
            <span class="upload-name truncate ltr" title=${i.name}>${i.name}</span>
            <span class="upload-meta num">${bytes(i.size)}</span>
          </div>
          ${i.status === 'error' || i.status === 'cancelled'
            ? html`<div class="upload-error">${i.error ?? STATUS_TEXT[i.status]}</div>`
            : html`<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(i.progress * 100)} aria-label=${`رفع ${i.name}`}>
                <div class="progress-bar" style=${{ width: `${Math.round(i.progress * 100)}%` }}></div>
              </div>`}
        </div>
        <span class="upload-status">
          ${i.status === 'done'
            ? html`<${Icon} name="check-circle" size=${20} />`
            : i.status === 'uploading'
              ? html`<span class="num">${Math.round(i.progress * 100)}%</span>`
              : STATUS_TEXT[i.status]}
        </span>
        ${(i.status === 'uploading' || i.status === 'queued') && html`<${IconButton} icon="x" size="sm" label="إلغاء الرفع" onClick=${() => onCancel(i.id)} />`}
      </div>`,
    )}
  </div>`;
}
