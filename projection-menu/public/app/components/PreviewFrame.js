// Live preview of a table's projected menu: the real player page in an
// iframe (/player/?preview=<tableId>), which follows the table's scene over
// '/live'. The theme studio also posts unsaved theme edits into it.

import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.js';
import { cx } from './ui.js';

export function PreviewFrame({ tableId, pinnedScene, theme, backgroundUrl, general, logoUrl, scene, label, class: cls, badge }) {
  const ref = useRef();
  const [loaded, setLoaded] = useState(false);
  const src = `/player/?preview=${encodeURIComponent(tableId)}${pinnedScene ? `&scene=${encodeURIComponent(pinnedScene)}` : ''}`;

  // Send the current overrides now and again shortly after load (the
  // player registers its listener once its module has started).
  const post = () => {
    const win = ref.current?.contentWindow;
    if (!win) return;
    if (theme) win.postMessage({ type: 'pm:theme', theme, background_url: backgroundUrl ?? null }, location.origin);
    if (general) win.postMessage({ type: 'pm:general', general, logo_url: logoUrl ?? null }, location.origin);
    if (scene) win.postMessage({ type: 'pm:scene', scene }, location.origin);
  };
  useEffect(post, [theme, backgroundUrl, general, logoUrl, scene]);
  useEffect(() => setLoaded(false), [src]);
  // The delayed re-sends must carry the newest edits, not the ones from load
  // time (an edit made right after load was otherwise undone in the preview).
  const latestPost = useRef(post);
  latestPost.current = post;

  const onLoad = () => {
    setLoaded(true);
    post();
    setTimeout(() => latestPost.current(), 400);
    setTimeout(() => latestPost.current(), 1500);
  };

  return html`<div class=${cx('preview', cls)}>
    <div class="preview-screen">
      <iframe
        ref=${ref}
        key=${src}
        src=${src}
        title=${label ?? 'معاينة العرض على الطاولة'}
        onLoad=${onLoad}
        allow="autoplay"
        tabindex="-1"
      ></iframe>
      ${!loaded && html`<div class="preview-loading"><span class="skeleton" style=${{ position: 'absolute', inset: 0 }}></span></div>`}
      <span class="preview-live"><span class="dot dot-pulse"></span>مباشر</span>
      ${badge}
    </div>
  </div>`;
}

export function PreviewPlaceholder({ text = 'اختر طاولة للمعاينة' }) {
  return html`<div class="preview"><div class="preview-screen preview-empty"><${Icon} name="monitor" size=${28} /><span>${text}</span></div></div>`;
}
