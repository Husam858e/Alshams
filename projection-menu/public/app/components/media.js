// Media building blocks shared by the library, the menu editor, the theme
// studio and the settings: a thumbnail for any kind of file, a form field
// that holds one library file, and the library picker dialog.

import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { NOUNS, bytes, count, duration } from '../lib/format.js';
import { MEDIA_KIND } from '../lib/labels.js';
import { useResource } from '../lib/store.js';
import { Icon } from './icons.js';
import { Modal } from './overlay.js';
import { ACCEPT, DropZone, UploadList, useUploader } from './Uploader.js';
import { Button, Chip, Empty, ErrorState, IconButton, SearchInput, Skeleton, cx } from './ui.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

export function matchesQuery(asset, query) {
  const q = norm(query.trim());
  return !q || norm(`${asset.title} ${asset.original_name}`).includes(q);
}

// Preview of a library file: photo, first video frame, or a 3D badge.
export function MediaThumb({ url, kind = 'image', alt = '', class: cls, play = false, contain = false }) {
  const [failed, setFailed] = useState(false);
  const fallback = html`<span class="mthumb-fallback"><${Icon} name=${MEDIA_KIND[kind]?.icon ?? 'image'} size=${26} /></span>`;
  let body;
  if (!url || failed) body = fallback;
  else if (kind === 'video') {
    body = html`<video
      src=${play ? url : `${url}#t=0.5`}
      muted
      playsinline
      preload="metadata"
      autoplay=${play}
      loop=${play}
      controls=${false}
      onError=${() => setFailed(true)}
    ></video>`;
  } else if (kind === 'model3d') {
    body = html`<span class="mthumb-model"><${Icon} name="cube" size=${34} /><span>GLB</span></span>`;
  } else {
    body = html`<img src=${url} alt=${alt} loading="lazy" decoding="async" onError=${() => setFailed(true)} />`;
  }
  return html`<span class=${cx('mthumb', `mthumb-${kind}`, contain && 'mthumb-contain', cls)}>${body}</span>`;
}

// One library file in a form: preview + choose / upload / remove.
// value: asset id or null; url: its public URL (from the menu/settings DTO).
export function MediaField({ kind = 'image', value, url, onChange, label, hint, emptyText, aspect = '16 / 10', disabled }) {
  const [open, setOpen] = useState(false);
  const { data: media } = useResource('media');
  const asset = media?.find((m) => m.id === value) ?? null;
  const shownUrl = asset?.url ?? url ?? null;
  const k = MEDIA_KIND[kind];
  return html`<div class=${cx('media-field', !value && 'is-empty')}>
    ${label && html`<div class="field-label">${label}</div>`}
    <div class="media-field-box" style=${{ aspectRatio: aspect }}>
      ${value
        ? html`<${MediaThumb} url=${shownUrl} kind=${kind} play=${kind === 'video'} />`
        : html`<button type="button" class="media-field-empty" onClick=${() => setOpen(true)} disabled=${disabled}>
            <${Icon} name=${k.icon} size=${26} />
            <span>${emptyText ?? `اختر ${k.label}`}</span>
          </button>`}
      ${value &&
      html`<div class="media-field-actions">
        <${Button} size="sm" variant="secondary" icon="refresh" onClick=${() => setOpen(true)} disabled=${disabled}>تغيير<//>
        <${IconButton} size="sm" variant="glass" icon="trash" label=${`إزالة ${k.label}`} onClick=${() => onChange(null)} disabled=${disabled} />
      </div>`}
    </div>
    ${(asset || hint) && html`<div class="field-hint truncate">${asset ? asset.title : hint}</div>`}
    ${open &&
    html`<${MediaPickerModal}
      kind=${kind}
      selectedId=${value}
      onClose=${() => setOpen(false)}
      onPick=${(a) => {
        setOpen(false);
        onChange(a);
      }}
    />`}
  </div>`;
}

// Library dialog filtered to one kind, with upload in place: a file uploaded
// here is picked as soon as it finishes.
export function MediaPickerModal({ kind = 'image', selectedId, onPick, onClose }) {
  const { data: media, error, reload } = useResource('media');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(selectedId ?? null);
  const uploader = useUploader({ kind, onUploaded: (asset) => setPicked(asset.id) });
  const k = MEDIA_KIND[kind];
  const list = useMemo(() => (media ?? []).filter((m) => m.kind === kind && matchesQuery(m, query)), [media, kind, query]);
  const chosen = media?.find((m) => m.id === picked) ?? null;

  return html`<${Modal}
    size="xl"
    icon=${k.icon}
    title=${`اختيار ${k.label} من المكتبة`}
    subtitle="اختر ملفاً موجوداً أو ارفع ملفاً جديداً — يُختار تلقائياً بعد الرفع."
    onClose=${onClose}
    class="picker"
    footer=${html`
      <span class="picker-chosen truncate">${chosen ? html`<${Icon} name="check-circle" size=${16} /> ${chosen.title}` : 'لم يُختر ملف'}</span>
      <div class="spacer"></div>
      <${Button} variant="ghost" onClick=${onClose}>إلغاء<//>
      <${Button} variant="primary" icon="check" disabled=${!chosen || uploader.busy} onClick=${() => onPick(chosen)}>اختيار<//>
    `}
  >
    <div class="picker-top">
      <${DropZone}
        compact
        accept=${ACCEPT[kind]}
        onFiles=${uploader.add}
        hint=${kind === 'image' ? 'JPG / PNG / WebP' : kind === 'video' ? 'MP4 / WebM (يُفضّل H.264 أو VP9)' : 'مجسم ثلاثي الأبعاد بصيغة GLB'}
      />
      <${UploadList} items=${uploader.items} onCancel=${uploader.cancel} onClear=${uploader.clear} />
      <div class="toolbar picker-toolbar">
        <${SearchInput} value=${query} onInput=${setQuery} placeholder=${`ابحث في ${k.plural}…`} />
        <span class="muted">${media ? count(list.length, NOUNS.file) : ''}</span>
      </div>
    </div>
    ${error && !media
      ? html`<${ErrorState} error=${error} onRetry=${reload} />`
      : !media
        ? html`<div class="picker-grid">${Array.from({ length: 8 }, (_, i) => html`<${Skeleton} key=${i} h=${150} r="14px" />`)}</div>`
        : list.length === 0
          ? html`<${Empty} compact icon=${k.icon} title=${query ? 'لا توجد نتائج' : `لا توجد ${k.plural} في المكتبة`} text=${query ? '' : 'ارفع ملفاً من الأعلى.'} />`
          : html`<div class="picker-grid" role="listbox" aria-label=${k.plural}>
              ${list.map(
                (m) => html`<button
                  key=${m.id}
                  type="button"
                  role="option"
                  aria-selected=${m.id === picked ? 'true' : 'false'}
                  class=${cx('picker-item', m.id === picked && 'is-picked')}
                  onClick=${() => setPicked(m.id)}
                  onDblClick=${() => onPick(m)}
                >
                  <${MediaThumb} url=${m.url} kind=${m.kind} />
                  <span class="picker-item-title truncate">${m.title}</span>
                  <${MediaMeta} asset=${m} class="picker-item-meta" />
                  ${m.id === picked && html`<span class="picker-check"><${Icon} name="check" size=${16} /></span>`}
                </button>`,
              )}
            </div>`}
  <//>`;
}

// "1200×800 · 0:12 · 180 KB", each part isolated so RTL keeps it readable.
export function MediaMeta({ asset: m, class: cls }) {
  const parts = [];
  if (m.width && m.height) parts.push(`${m.width}×${m.height}`);
  if (m.kind === 'video' && m.duration_ms) parts.push(duration(m.duration_ms));
  parts.push(bytes(m.size_bytes));
  return html`<span class=${cx('media-meta', cls)}>${parts.map((p, i) => html`${i > 0 && ' · '}<span class="num" key=${i}>${p}</span>`)}</span>`;
}

export function KindChips({ value, onChange, counts }) {
  const kinds = [['all', 'الكل', 'layers'], ['image', 'صور', 'image'], ['video', 'فيديو', 'video'], ['model3d', '3D', 'cube']];
  return html`<div class="chips" role="group" aria-label="نوع الملف">
    ${kinds.map(
      ([key, label, icon]) => html`<${Chip} key=${key} icon=${icon} active=${value === key} onClick=${() => onChange(key)} count=${counts?.[key]}>${label}<//>`,
    )}
  </div>`;
}
