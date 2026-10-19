// Media library: drag & drop multi-file upload with per-file progress, a
// filterable grid, details with rename, usage and delete.

import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from '../components/icons.js';
import { KindChips, MediaMeta, MediaThumb, matchesQuery } from '../components/media.js';
import { Drawer, MenuButton, confirmDialog } from '../components/overlay.js';
import { toast } from '../components/toast.js';
import { DropZone, UploadList, useUploader } from '../components/Uploader.js';
import { Badge, Button, Empty, ErrorState, Field, PageHeader, SearchInput, Segmented, Skeleton } from '../components/ui.js';
import { api } from '../lib/api.js';
import { NOUNS, bytes, count, dateTime, duration } from '../lib/format.js';
import { useLocalPref } from '../lib/hooks.js';
import { MEDIA_KIND } from '../lib/labels.js';
import { navigate } from '../lib/router.js';
import { patchResource, useResource } from '../lib/store.js';

const USAGE = [
  { value: 'all', label: 'الكل' },
  { value: 'used', label: 'مستخدمة' },
  { value: 'unused', label: 'غير مستخدمة' },
];
const SORTS = {
  new: { label: 'الأحدث', fn: (a, b) => b.id - a.id },
  name: { label: 'الاسم', fn: (a, b) => a.title.localeCompare(b.title, 'ar') },
  size: { label: 'الحجم', fn: (a, b) => b.size_bytes - a.size_bytes },
};

export default function MediaScreen() {
  const { data: media, error, reload } = useResource('media');
  const uploader = useUploader();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useLocalPref('media-kind', 'all');
  const [usage, setUsage] = useLocalPref('media-usage', 'all');
  const [sort, setSort] = useLocalPref('media-sort', 'new');
  const [openId, setOpenId] = useState(null);
  const pageDrop = usePageDrop(uploader.add);

  const counts = useMemo(() => {
    const c = { all: 0, image: 0, video: 0, model3d: 0, size: 0 };
    for (const m of media ?? []) {
      c.all++;
      c[m.kind]++;
      c.size += m.size_bytes;
    }
    return c;
  }, [media]);

  const list = useMemo(
    () =>
      (media ?? [])
        .filter((m) => kind === 'all' || m.kind === kind)
        .filter((m) => usage === 'all' || (usage === 'used' ? m.used_by.length > 0 : m.used_by.length === 0))
        .filter((m) => matchesQuery(m, query))
        .sort(SORTS[sort]?.fn ?? SORTS.new.fn),
    [media, kind, usage, query, sort],
  );
  const opened = media?.find((m) => m.id === openId) ?? null;

  return html`<div class="page media-page">
    <${PageHeader}
      icon="image"
      title="مكتبة الوسائط"
      subtitle=${media ? `${count(counts.all, NOUNS.file)} · ${count(counts.image, NOUNS.image)} · ${count(counts.video, NOUNS.video)} · ${count(counts.model3d, NOUNS.model)} · ${bytes(counts.size)}` : 'جارٍ التحميل…'}
    />

    <div class="media-upload">
      <${DropZone} onFiles=${uploader.add} compact=${Boolean(media?.length)} />
      <${UploadList} items=${uploader.items} onCancel=${uploader.cancel} onClear=${uploader.clear} />
    </div>

    <div class="toolbar media-toolbar">
      <${SearchInput} value=${query} onInput=${setQuery} placeholder="ابحث بالاسم…" label="ابحث في المكتبة" />
      <${KindChips} value=${kind} onChange=${setKind} counts=${media ? counts : undefined} />
      <div class="spacer"></div>
      <${Segmented} size="sm" options=${USAGE} value=${usage} onChange=${setUsage} label="الاستخدام" />
      <label class="select-inline">
        <span class="sr-only">الترتيب</span>
        <${Icon} name="filter" size=${16} />
        <select class="select select-sm" value=${sort} onChange=${(e) => setSort(e.currentTarget.value)} aria-label="الترتيب">
          ${Object.entries(SORTS).map(([k, s]) => html`<option key=${k} value=${k}>${s.label}</option>`)}
        </select>
      </label>
    </div>

    ${error && !media
      ? html`<${ErrorState} error=${error} onRetry=${reload} />`
      : !media
        ? html`<div class="media-grid">${Array.from({ length: 10 }, (_, i) => html`<${Skeleton} key=${i} h=${210} r="16px" />`)}</div>`
        : media.length === 0
          ? html`<${Empty} icon="image" title="المكتبة فارغة" text="ارفع صور الأطباق وفيديوهاتها وتصاميم الخلفية من الأعلى، ثم اربطها بالأطباق من شاشة المنيو." />`
          : list.length === 0
            ? html`<${Empty} icon="search" title="لا توجد ملفات مطابقة" action=${html`<${Button} onClick=${() => (setQuery(''), setKind('all'), setUsage('all'))}>عرض الكل<//>`} />`
            : html`<div class="media-grid">
                ${list.map((m) => html`<${MediaCard} key=${m.id} asset=${m} onOpen=${() => setOpenId(m.id)} />`)}
              </div>`}

    ${opened && html`<${MediaDetails} asset=${opened} onClose=${() => setOpenId(null)} />`}
    ${pageDrop && html`<div class="page-drop" aria-hidden="true"><div><${Icon} name="upload" size=${40} /><strong>أفلت الملفات لرفعها إلى المكتبة</strong></div></div>`}
  </div>`;
}

// Files dragged anywhere over the page upload too.
function usePageDrop(onFiles) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const cb = useRef(onFiles);
  cb.current = onFiles;
  useEffect(() => {
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = (e) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overFn = (e) => hasFiles(e) && e.preventDefault();
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      // The drop zone handles its own drops.
      if (e.target.closest?.('.dropzone')) return;
      if (e.dataTransfer.files.length) cb.current(e.dataTransfer.files);
    };
    addEventListener('dragenter', enter);
    addEventListener('dragleave', leave);
    addEventListener('dragover', overFn);
    addEventListener('drop', drop);
    return () => {
      removeEventListener('dragenter', enter);
      removeEventListener('dragleave', leave);
      removeEventListener('dragover', overFn);
      removeEventListener('drop', drop);
    };
  }, []);
  return over;
}

function MediaCard({ asset: m, onOpen }) {
  const used = m.used_by.length;
  return html`<article class="media-card">
    <button type="button" class="media-card-main" onClick=${onOpen} aria-label=${`تفاصيل ${m.title}`}>
      <div class="media-card-thumb">
        <${MediaThumb} url=${m.url} kind=${m.kind} alt="" />
        <span class="media-kind"><${Icon} name=${MEDIA_KIND[m.kind]?.icon} size=${13} />${m.kind === 'video' && m.duration_ms ? html`<span class="num">${duration(m.duration_ms)}</span>` : MEDIA_KIND[m.kind]?.label}</span>
        ${used > 0 && html`<span class="media-used" title=${m.used_by.map((u) => u.label).join('، ')}><${Icon} name="link" size=${12} /><span class="num">${used}</span></span>`}
      </div>
      <div class="media-card-body">
        <span class="media-card-title truncate">${m.title}</span>
        <${MediaMeta} asset=${m} class="media-card-meta truncate" />
      </div>
    </button>
    <${MediaMenu} asset=${m} onOpen=${onOpen} />
  </article>`;
}

function MediaMenu({ asset, onOpen }) {
  return html`<${MenuButton}
    class="media-card-menu"
    label=${`خيارات ${asset.title}`}
    items=${[
      { label: 'التفاصيل وإعادة التسمية', icon: 'edit', onSelect: onOpen },
      { label: 'نسخ الرابط', icon: 'copy', onSelect: () => copyLink(asset) },
      'divider',
      { label: 'حذف', icon: 'trash', danger: true, onSelect: () => deleteAsset(asset) },
    ]}
  />`;
}

async function copyLink(asset) {
  const url = new URL(asset.url, location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    toast.ok('نُسخ رابط الملف');
  } catch {
    toast.info(url, { title: 'رابط الملف' });
  }
}

export async function deleteAsset(asset) {
  const used = asset.used_by;
  if (used.length) {
    await confirmDialog({
      title: 'الملف مستخدم حالياً',
      message: `لا يمكن حذف "${asset.title}" لأنه مستخدم في:\n${used.map((u) => `• ${u.label}`).join('\n')}\n\nاستبدله أو أزله من هذه الأماكن أولاً.`,
      confirmLabel: 'حسناً',
      cancelLabel: 'إغلاق',
      icon: 'link',
    });
    return false;
  }
  const ok = await confirmDialog({
    title: `حذف "${asset.title}"؟`,
    message: 'سيُحذف الملف نهائياً من الخادم.',
    confirmLabel: 'حذف',
    danger: true,
  });
  if (!ok) return false;
  try {
    await api.deleteMedia(asset.id);
    patchResource('media', (list) => list.filter((m) => m.id !== asset.id));
    toast.ok('حُذف الملف');
    return true;
  } catch (err) {
    toast.error(err);
    return false;
  }
}

const USE_LINK = { dish: '/menu', category: '/menu', logo: '/settings', theme: '/theme' };

function MediaDetails({ asset: m, onClose }) {
  const [title, setTitle] = useState(m.title);
  const [busy, setBusy] = useState(false);
  useEffect(() => setTitle(m.title), [m.id, m.title]);
  const dirty = title.trim() && title.trim() !== m.title;

  const save = async (e) => {
    e?.preventDefault();
    if (!dirty) return;
    setBusy(true);
    try {
      const updated = await api.renameMedia(m.id, title.trim());
      patchResource('media', (list) => list.map((x) => (x.id === m.id ? { ...x, ...updated } : x)));
      toast.ok('حُفظ الاسم');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const info = [
    ['النوع', MEDIA_KIND[m.kind]?.label],
    m.width && m.height ? ['الأبعاد', html`<span class="num">${m.width} × ${m.height}</span>`] : null,
    m.kind === 'video' && m.duration_ms ? ['المدة', html`<span class="num">${duration(m.duration_ms)}</span>`] : null,
    ['الحجم', html`<span class="num">${bytes(m.size_bytes)}</span>`],
    ['اسم الملف الأصلي', html`<span class="ltr truncate">${m.original_name}</span>`],
    ['رُفع بواسطة', m.uploaded_by_name ?? '—'],
    ['تاريخ الرفع', dateTime(m.created_at)],
  ].filter(Boolean);

  return html`<${Drawer}
    title="تفاصيل الملف"
    icon=${MEDIA_KIND[m.kind]?.icon}
    onClose=${onClose}
    footer=${html`
      <${Button} variant="danger" icon="trash" onClick=${async () => (await deleteAsset(m)) && onClose()}>حذف<//>
      <div class="spacer"></div>
      <${Button} variant="ghost" icon="copy" onClick=${() => copyLink(m)}>نسخ الرابط<//>
    `}
  >
    <div class="stack">
      <div class="media-detail-preview">
        ${m.kind === 'video'
          ? html`<video src=${m.url} controls muted playsinline preload="metadata"></video>`
          : html`<${MediaThumb} url=${m.url} kind=${m.kind} contain />`}
      </div>
      <form class="media-rename" onSubmit=${save}>
        <${Field} label="الاسم الظاهر في المكتبة">
          ${(id) => html`<input id=${id} class="input" value=${title} maxlength="120" onInput=${(e) => setTitle(e.currentTarget.value)} />`}
        <//>
        <${Button} type="submit" variant="primary" icon="check" loading=${busy} disabled=${!dirty}>حفظ<//>
      </form>
      <dl class="info-list">
        ${info.map(([k, v]) => html`<div key=${k}><dt>${k}</dt><dd>${v}</dd></div>`)}
      </dl>
      <div class="stack-sm">
        <div class="section-title"><${Icon} name="link" size=${15} /> أين يُستخدم</div>
        ${m.used_by.length === 0
          ? html`<div class="notice"><${Icon} name="info" size=${18} /><span>غير مستخدم حالياً — يمكن حذفه بأمان.</span></div>`
          : html`<ul class="usage-list">
              ${m.used_by.map(
                (u, i) => html`<li key=${i}>
                  <button
                    type="button"
                    class="usage-item"
                    onClick=${() => {
                      onClose();
                      navigate(USE_LINK[u.type] ?? '/menu');
                    }}
                  >
                    <${Icon} name=${u.type === 'dish' ? 'utensils' : u.type === 'category' ? 'layers' : u.type === 'logo' ? 'store' : 'palette'} size=${16} />
                    <span class="truncate">${u.label}</span>
                    <${Icon} name="chevron-left" size=${16} />
                  </button>
                </li>`,
              )}
            </ul>
            <${Badge} tone="warn" icon="lock">لا يمكن حذفه وهو مستخدم<//>`}
      </div>
    </div>
  <//>`;
}
