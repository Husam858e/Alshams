// Projector player.
//
//   /player/?device=<key>   a real projector: corner-pinned, rotated, acks scenes
//   /player/?preview=<id>   staff live preview of table <id> (session cookie):
//                           no warp, scaled to its iframe, follows '/live', never acks.
//                           Optional &scene=menu|welcome|off|category:<id>|dish:<id>|order:<id>
//                           pins a scene (theme studio). The parent page may also
//                           postMessage {type:'pm:theme', theme} / {type:'pm:general', general}
//                           / {type:'pm:scene', scene} / {type:'pm:reset'} (same origin only).

import { html, render } from 'htm/preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Guard } from './components/Bits.js';
import { Frame } from './components/Frame.js';
import { Stage } from './components/Stage.js';
import { TestPattern } from './components/TestPattern.js';
import { hexToRgb, mixColor, normalizeGeneral, normalizeTheme, PlayerContext } from './lib/context.js';
import { perPageFor, primaryShape } from './lib/layout.js';
import { mediaUrl, preloadAll } from './lib/media.js';
import { findCategory, findDish, menuPages } from './lib/menu.js';
import { openDevice, openPreview } from './lib/net.js';
import { resolveOrder } from './scenes/Order.js';

const params = new URLSearchParams(location.search);
const previewId = params.get('preview');
const deviceKey = previewId ? null : params.get('device') || params.get('key');
const MODE = previewId ? 'preview' : deviceKey ? 'device' : 'none';
document.documentElement.dataset.mode = MODE;

const SCENE_TYPES = ['welcome', 'menu', 'category', 'dish', 'order', 'off'];

function normalizeScene(scene) {
  return scene && typeof scene === 'object' && SCENE_TYPES.includes(scene.type) ? scene : { type: 'welcome' };
}

// Same key = same content: a re-sent scene restarts its paging, no cross-fade.
function sceneKey(scene) {
  if (scene.type === 'category') return `category:${scene.categoryId}`;
  if (scene.type === 'dish') return `dish:${scene.dishId}`;
  if (scene.type === 'order') return `order:${scene.orderId}`;
  return scene.type;
}

function parsePinnedScene(value) {
  if (!value) return null;
  const [type, id] = value.split(':');
  const field = { category: 'categoryId', dish: 'dishId', order: 'orderId' }[type];
  if (!SCENE_TYPES.includes(type) || (field && !id)) return null;
  return field ? { type, [field]: Number(id) || id } : { type };
}
const pinnedScene = MODE === 'preview' ? parsePinnedScene(params.get('scene')) : null;

// Photos the incoming scene shows first; loaded before the cross-fade starts.
function sceneImages(scene, boot, orders) {
  if (!boot || scene.type === 'off') return [];
  const { menu, settings = {} } = boot;
  const perPage = perPageFor(primaryShape(boot.projector));
  const urls = [settings.logo_url];
  if (settings.theme?.background?.type === 'image') urls.push(settings.background_url);
  if (scene.type === 'menu') urls.push(...(menuPages(menu, perPage)[0]?.dishes ?? []).map((d) => d.image_url));
  if (scene.type === 'category') {
    const cat = findCategory(menu, scene.categoryId);
    if (cat) urls.push(cat.cover_url || cat.dishes.find((d) => d.image_url)?.image_url, ...cat.dishes.slice(0, perPage).map((d) => d.image_url));
  }
  if (scene.type === 'dish') urls.push(findDish(menu, scene.dishId)?.dish.image_url);
  if (scene.type === 'order') {
    const items = resolveOrder(scene, orders)?.items ?? [];
    urls.push(...items.slice(0, 6).map((i) => findDish(menu, i.dish_id)?.dish.image_url));
  }
  return urls.filter(Boolean);
}

// Last bootstrap + scene, so a rebooted projector shows the menu at once,
// even before (or without) reaching the server.
const STORE_KEY = 'pm-player:last';
function loadCached() {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    return value?.key === deviceKey && value.boot ? value : null;
  } catch {
    return null;
  }
}
function saveCached(boot, scene) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ key: deviceKey, boot, scene }));
  } catch {
    // storage full or disabled: not critical
  }
}

// Keep the screen (and the HDMI signal) awake.
async function keepAwake() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {
    // unsupported or refused; kiosk/OS settings cover it
  }
}

const NOTICES = {
  none: ['جهاز العرض غير مربوط', 'اربط هذا الجهاز بطاولة من تطبيق الموظفين (رمز الاقتران) ثم افتح رابط العرض الخاص به.'],
  unauthorized: ['تعذّر التحقق من جهاز العرض', 'مفتاح هذا الجهاز غير صالح أو تم تغييره. أعد ربطه برمز اقتران جديد من تطبيق الموظفين.'],
  login: ['انتهت الجلسة', 'سجّل الدخول في تطبيق الموظفين لعرض المعاينة.'],
  missing: ['المعاينة غير متاحة', 'هذه الطاولة غير موجودة أو لا تملك صلاحية عرضها.'],
  connecting: ['جارٍ الاتصال بالخادم…', ''],
};

function Notice({ kind }) {
  const [title, text] = NOTICES[kind] ?? NOTICES.connecting;
  return html`
    <div class="notice ${kind === 'connecting' ? 'is-dim' : ''}">
      <div class="notice-mark"></div>
      <div class="notice-title">${title}</div>
      ${text && html`<div class="notice-text">${text}</div>`}
    </div>
  `;
}

function App() {
  const cached = useMemo(() => (MODE === 'device' ? loadCached() : null), []);
  const initialScene = normalizeScene(pinnedScene ?? cached?.scene ?? cached?.boot?.scene);
  const [boot, setBoot] = useState(cached?.boot ?? null);
  const [projector, setProjector] = useState(cached?.boot?.projector ?? null);
  const [shown, setShown] = useState({ scene: initialScene, key: sceneKey(initialScene), start: Date.now() });
  const [online, setOnline] = useState(true);
  const [fatal, setFatal] = useState(MODE === 'none' ? 'none' : null);
  const [testPattern, setTestPattern] = useState(false);
  const [orders, setOrders] = useState({});
  const [override, setOverride] = useState(null);

  const bootRef = useRef(boot);
  const shownRef = useRef(shown);
  const ordersRef = useRef(orders);
  const netRef = useRef(null);
  const seq = useRef(0);
  ordersRef.current = orders;

  const show = useCallback(async (raw) => {
    const scene = normalizeScene(raw);
    const key = sceneKey(scene);
    const ticket = ++seq.current;
    const current = shownRef.current;
    if (key === current.key) {
      const resent = scene.at && scene.at !== current.scene.at;
      const next = { scene, key, start: resent ? Date.now() : current.start };
      shownRef.current = next;
      setShown(next);
      return;
    }
    await preloadAll(sceneImages(scene, bootRef.current, ordersRef.current), 1500);
    if (ticket !== seq.current) return; // a newer scene arrived meanwhile
    const next = { scene, key, start: Date.now() };
    shownRef.current = next;
    setShown(next);
  }, []);

  // Connection.
  useEffect(() => {
    if (MODE === 'none') return;
    const remember = (list) => {
      const valid = list.filter((o) => o && typeof o === 'object' && o.id != null);
      if (valid.length) setOrders((m) => Object.assign({ ...m }, ...valid.map((o) => ({ [String(o.id)]: o }))));
    };
    const on = {
      bootstrap(b) {
        if (!b || typeof b !== 'object' || (!b.menu && !b.settings)) return;
        bootRef.current = b;
        setBoot(b);
        setFatal(null);
        if (b.projector) setProjector(b.projector);
        remember([b.order, b.scene?.order, ...(Array.isArray(b.orders) ? b.orders : [])]);
        if (!pinnedScene && b.scene) show(b.scene);
        netRef.current?.reportStatus('ready');
        if (MODE === 'device') saveCached(b, b.scene ?? shownRef.current.scene);
      },
      scene(scene) {
        if (pinnedScene) return;
        remember([scene?.order]);
        show(scene);
        if (MODE === 'device' && bootRef.current) saveCached(bootRef.current, scene);
      },
      projector(p) {
        if (p && typeof p === 'object') setProjector((cur) => ({ ...(cur ?? {}), ...p }));
      },
      testPattern: (value) => setTestPattern(Boolean(value)),
      order: (o) => remember([o]),
      online: (value) => setOnline(Boolean(value)),
      fatal: (reason) => setFatal(reason),
    };
    netRef.current = MODE === 'device' ? openDevice(deviceKey, on) : openPreview(previewId, on);
  }, []);

  // Order scenes: fetch the order when it did not come with the scene
  // (the server normally embeds it as scene.order, null when it is gone).
  useEffect(() => {
    const { scene } = shown;
    if (scene.type !== 'order' || 'order' in scene || !netRef.current) return undefined;
    let alive = true;
    netRef.current.fetchOrder(scene.orderId).then((o) => {
      if (alive && o && o.id != null) setOrders((m) => ({ ...m, [String(o.id)]: o }));
    });
    return () => {
      alive = false;
    };
  }, [shown.key, shown.scene.at]);

  // Device: stay awake, hide the cursor, report errors to the server.
  useEffect(() => {
    if (MODE !== 'device') return undefined;
    keepAwake();
    const onVisible = () => document.visibilityState === 'visible' && keepAwake();
    document.addEventListener('visibilitychange', onVisible);
    let last = 0;
    const onError = (event) => {
      if (Date.now() - last < 10000) return;
      last = Date.now();
      const message = event?.message ?? event?.reason?.message ?? String(event?.reason ?? 'error');
      netRef.current?.reportStatus('error', message);
    };
    addEventListener('error', onError);
    addEventListener('unhandledrejection', onError);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('error', onError);
      removeEventListener('unhandledrejection', onError);
    };
  }, []);

  // Preview: live theme edits from the staff app (theme studio).
  useEffect(() => {
    if (MODE !== 'preview') return undefined;
    const onMessage = (event) => {
      if (event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
      const { type } = event.data;
      if (type === 'pm:theme') setOverride((o) => ({ ...o, theme: event.data.theme ?? null }));
      else if (type === 'pm:general') setOverride((o) => ({ ...o, general: event.data.general ?? null }));
      else if (type === 'pm:scene') show(event.data.scene);
      else if (type === 'pm:reset') setOverride(null);
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, []);

  const settings = boot?.settings ?? {};
  const theme = useMemo(() => normalizeTheme({ ...settings.theme, ...(override?.theme ?? {}) }), [settings.theme, override]);
  const general = useMemo(() => normalizeGeneral({ ...settings.general, ...(override?.general ?? {}) }), [settings.general, override]);
  const player = useMemo(
    () => ({
      theme,
      general,
      menu: boot?.menu ?? null,
      table: boot?.table ?? null,
      logoUrl: mediaUrl(settings.logo_url),
      backgroundUrl: mediaUrl(settings.background_url),
      orders,
      mode: MODE,
    }),
    [theme, general, boot, orders],
  );

  // The preview shows the table as guests see it, but not upside down.
  const geometry = MODE === 'preview' ? { layout: projector?.layout, rotation: 0 } : projector;
  const reportError = (err) => netRef.current?.reportStatus('error', err?.message ?? String(err));
  const notice = fatal ?? (boot ? null : 'connecting');

  return html`
    <${PlayerContext.Provider} value=${player}>
      <div
        class="player preset-${theme.preset} cards-${theme.cardStyle} font-${theme.font.toLowerCase()}"
        style=${{
          '--accent': theme.accent,
          '--accent-rgb': hexToRgb(theme.accent),
          '--accent-hi': mixColor(theme.accent, '#fff6e6', 0.45),
          '--accent-lo': mixColor(theme.accent, '#000000', 0.3),
          '--font': theme.font === 'Tajawal' ? 'var(--font-tajawal)' : 'var(--font-cairo)',
        }}
      >
        <${Stage}
          warp=${MODE === 'device'}
          projector=${notice ? null : geometry}
          renderFrame=${(frame) =>
            notice
              ? html`<${Notice} kind=${notice} />`
              : html`
                  <${Guard} onError=${reportError} resetKey=${shown.key}>
                    <${Frame} frame=${frame} shown=${shown} online=${online} onError=${reportError} />
                  </${Guard}>
                `}
          overlay=${testPattern && MODE === 'device'
            ? html`<${TestPattern}
                tableNumber=${boot?.table?.number}
                projectorName=${projector?.name}
                layout=${projector?.layout}
                rotation=${projector?.rotation ?? 0}
              />`
            : null}
        />
      </div>
    </${PlayerContext.Provider}>
  `;
}

render(html`<${App} />`, document.getElementById('root'));
