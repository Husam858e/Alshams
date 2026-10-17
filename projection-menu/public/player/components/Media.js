// Images, looping videos and live 3D models that never show a broken-media
// icon: anything missing or failing falls back to a tasteful placeholder.

import { html } from 'htm/preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { mediaUrl } from '../lib/media.js';
import { Icon } from './Icons.js';

export function Placeholder({ class: cls = '', icon = null }) {
  return html`
    <div class="ph ${cls}" aria-hidden="true">
      <div class="ph-plate">
        <span class="ph-icon">${icon && String(icon).length <= 4 ? icon : html`<${Icon} name="cutlery" />`}</span>
      </div>
    </div>
  `;
}

export function SafeImage({ src, class: cls = '', fallback, icon, onFail }) {
  const url = mediaUrl(src);
  const ref = useRef(null);
  const [state, setState] = useState({ url, status: 'loading' });
  const status = state.url === url ? state.status : 'loading';

  // A cached image can finish loading before Preact attaches onLoad.
  useLayoutEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setState({ url, status: 'ok' });
  }, [url]);

  if (!url || status === 'failed') return fallback !== undefined ? fallback : html`<${Placeholder} class=${cls} icon=${icon} />`;
  return html`
    <img
      ref=${ref}
      class="img ${cls} ${status === 'ok' ? 'is-ok' : ''}"
      src=${url}
      alt=""
      decoding="async"
      draggable=${false}
      onLoad=${() => setState({ url, status: 'ok' })}
      onError=${() => {
        setState({ url, status: 'failed' });
        onFail?.();
      }}
    />
  `;
}

// Muted + playsInline + loop: allowed to autoplay without a user gesture.
// Keyed by URL by the callers' parents so a new file gets a fresh element.
function VideoEl({ url, poster, cls, onFail }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return undefined;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.play()?.catch?.(() => {});
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load(); // releases the hardware decoder
    };
  }, []);
  return html`
    <video
      ref=${ref}
      class="vid ${cls} ${playing ? 'is-ok' : ''}"
      src=${url}
      poster=${mediaUrl(poster) ?? undefined}
      muted
      loop
      autoplay
      playsinline
      preload="auto"
      disablepictureinpicture
      onPlaying=${() => setPlaying(true)}
      onError=${() => onFail?.()}
    />
  `;
}

export function LoopVideo({ src, poster, class: cls = '', fallback }) {
  const url = mediaUrl(src);
  const [failed, setFailed] = useState(null);
  if (!url || failed === url) return fallback ?? null;
  return html`<${VideoEl} key=${url} url=${url} poster=${poster} cls=${cls} onFail=${() => setFailed(url)} />`;
}

// Live .glb model; three.js is downloaded only when a model is shown.
function ModelView({ url, poster, onFail }) {
  const box = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dispose = null;
    let gone = false;
    import('../model-renderer.js')
      .then(({ renderModel }) => {
        if (gone || !box.current) return;
        dispose = renderModel(box.current, url, {
          onReady: () => !gone && setReady(true),
          onError: () => !gone && onFail(),
        });
      })
      .catch(() => !gone && onFail());
    return () => {
      gone = true;
      dispose?.();
    };
  }, [url]);
  return html`
    <div class="model-view ${ready ? 'is-ready' : ''}">
      ${!ready && html`<${SafeImage} src=${poster} class="model-poster" fallback=${null} />`}
      <div class="model-canvas" ref=${box}></div>
    </div>
  `;
}

// The best visual a dish has. `rich` (dish scene): 3D model > video > photo.
// `video` (large cards): video > photo. Otherwise the photo only.
export function DishVisual({ dish, rich = false, video = false, kenburns = false, icon }) {
  const [failed, setFailed] = useState({});
  const model = rich && !failed[dish.model_url] ? mediaUrl(dish.model_url) : null;
  const clip = (rich || video) && !failed[dish.video_url] ? mediaUrl(dish.video_url) : null;
  const fail = (key) => () => setFailed((f) => ({ ...f, [key]: true }));
  const photo = html`<${SafeImage} src=${dish.image_url} class=${kenburns ? 'kenburns' : ''} icon=${icon} />`;
  if (model) return html`<${ModelView} key=${model} url=${model} poster=${dish.image_url} onFail=${fail(dish.model_url)} />`;
  if (clip) {
    return html`
      <div class="vid-wrap">
        ${photo}
        <${VideoEl} key=${clip} url=${clip} poster=${dish.image_url} cls=${kenburns ? 'kenburns-soft' : ''} onFail=${fail(dish.video_url)} />
      </div>
    `;
  }
  return photo;
}
