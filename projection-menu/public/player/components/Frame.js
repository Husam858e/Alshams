// One copy of the projected scene: themed backdrop, the scene itself (with
// cross-fades between scenes) and the subtle table number.

import { html } from 'htm/preact';
import { useMemo } from 'preact/hooks';
import { FrameContext, usePlayer } from '../lib/context.js';
import { perPageFor, shapeOf } from '../lib/layout.js';
import { CategoryScene } from '../scenes/Category.js';
import { DishScene } from '../scenes/Dish.js';
import { MenuScene } from '../scenes/Menu.js';
import { OrderScene } from '../scenes/Order.js';
import { WelcomeScene } from '../scenes/Welcome.js';
import { Guard, Swap } from './Bits.js';
import { LoopVideo, SafeImage } from './Media.js';

function Backdrop() {
  const { theme, backgroundUrl } = usePlayer();
  const type = theme.background?.type;
  const url = type === 'image' || type === 'video' ? backgroundUrl : null;
  return html`
    <div class="backdrop ${url ? 'has-media' : ''}" aria-hidden="true">
      <div class="bd-preset"></div>
      ${url && type === 'image' && html`<${SafeImage} src=${url} class="bd-media" fallback=${null} />`}
      ${url && type === 'video' && html`<${LoopVideo} src=${url} class="bd-media" />`}
      <div class="bd-shade"></div>
      <div class="bd-deco"></div>
    </div>
  `;
}

function TableTag({ online }) {
  const { table } = usePlayer();
  const number = table?.number;
  return html`
    <div class="table-tag ${online ? '' : 'is-offline'}">
      ${number != null && html`<span class="tt-label">طاولة <bdi>${number}</bdi></span>`}
      ${!online && html`<span class="tt-net"><i></i>غير متصل</span>`}
    </div>
  `;
}

function renderScene({ scene, start }) {
  switch (scene.type) {
    case 'menu':
      return html`<${MenuScene} start=${start} />`;
    case 'category':
      return html`<${CategoryScene} scene=${scene} start=${start} />`;
    case 'dish':
      return html`<${DishScene} scene=${scene} start=${start} />`;
    case 'order':
      return html`<${OrderScene} scene=${scene} start=${start} />`;
    case 'off':
      return html`<section class="scene off"></section>`;
    default:
      return html`<${WelcomeScene} start=${start} />`;
  }
}

export function Frame({ frame, shown, online, onError }) {
  const shape = shapeOf(frame.vw, frame.vh);
  const ctx = useMemo(() => ({ shape, perPage: perPageFor(shape), vw: frame.vw, vh: frame.vh }), [shape, frame.vw, frame.vh]);
  const type = shown.scene.type;
  return html`
    <${FrameContext.Provider} value=${ctx}>
      <div
        class="frame shape-${shape} scene-is-${type} ${type === 'off' ? 'is-off' : ''}"
        style=${{ '--fw': `${frame.vw}px`, '--fh': `${frame.vh}px` }}
      >
        <${Backdrop} />
        <div class="scenes">
          <${Swap} k=${shown.key} ms=${1100} class="scene-layer">
            <${Guard} onError=${onError} fallback=${html`<${WelcomeScene} start=${shown.start} />`}>
              ${renderScene(shown)}
            </${Guard}>
          </${Swap}>
        </div>
        <div class="frame-deco" aria-hidden="true"></div>
        <${TableTag} online=${online} />
      </div>
    </${FrameContext.Provider}>
  `;
}
