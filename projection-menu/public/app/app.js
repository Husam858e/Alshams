// Root component: session gate (first run / login / app), live wiring,
// routing with lazily loaded screens.

import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { BrandMark } from './components/icons.js';
import { ConfirmHost } from './components/overlay.js';
import { Shell } from './components/Shell.js';
import { ToastHost, toast } from './components/toast.js';
import { Button, Empty, Skeleton } from './components/ui.js';
import { onUnauthorized } from './lib/api.js';
import { connectLive, onLive, reconnectLive } from './lib/live.js';
import { match, navigate, useRoute } from './lib/router.js';
import { checkAuth, endSession } from './lib/session.js';
import { load, onOrderEvent, useStore, wireLive } from './lib/store.js';
import { HOME, ROUTES } from './routes.js';
import { LoginScreen, SetupScreen } from './screens/Auth.js';

export function App() {
  const auth = useStore((s) => s.auth);

  useEffect(() => {
    checkAuth();
    // Any 401 from the API: the session is gone, show the login screen.
    return onUnauthorized(() => endSession());
  }, []);

  let body;
  if (!auth.checked) body = html`<${Splash} />`;
  else if (auth.error && !auth.user) body = html`<${ServerDown} error=${auth.error} />`;
  else if (auth.needsSetup) body = html`<${SetupScreen} />`;
  else if (!auth.user) body = html`<${LoginScreen} />`;
  else body = html`<${LoggedIn} key=${auth.user.id} user=${auth.user} />`;

  return html`${body}<${ToastHost} /><${ConfirmHost} />`;
}

function Splash() {
  return html`<div class="boot-splash"><div class="boot-mark"></div></div>`;
}

function ServerDown({ error }) {
  return html`<div class="auth-page">
    <div class="auth-card auth-card-narrow">
      <${Empty}
        icon="wifi-off"
        title="تعذّر الوصول إلى الخادم"
        text=${`${error?.message ?? ''} تأكد أن جهاز الخادم يعمل وأنك على شبكة المطعم.`}
        action=${html`<${Button} variant="primary" icon="refresh" onClick=${() => checkAuth()}>إعادة المحاولة<//>`}
      />
    </div>
  </div>`;
}

function LoggedIn({ user }) {
  const route = useRoute();

  useEffect(() => {
    wireLive();
    connectLive();
    load('settings').catch(() => {});
    if (user.role !== 'designer') load('orders').catch(() => {});
    const offs = [
      // Session revoked or role changed on the server: re-check, then reconnect.
      onLive('live:kicked', async () => {
        const still = await checkAuth();
        if (still) reconnectLive();
      }),
      onLive('live:unauthorized', () => checkAuth()),
      onOrderEvent((order, previous) => {
        // Only brand-new orders taken by someone else.
        const isNew = !previous && order.status === 'open' && order.created_at === order.updated_at;
        if (!isNew || order.waiter_id === user.id) return;
        toast.order(`${order.waiter_name ?? 'ويتر'} · ${order.items.length} صنف`, {
          title: `طلب جديد — طاولة ${order.table_number}`,
          action: { label: 'فتح', onClick: () => navigate(`/table/${order.table_id}`) },
        });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // Pick the route; unknown or forbidden paths go to this role's home.
  let found = null;
  let params = null;
  for (const r of ROUTES) {
    params = match(r.path, route.path);
    if (params) {
      found = r;
      break;
    }
  }
  const allowed = found && found.roles.includes(user.role);
  useEffect(() => {
    if (!allowed) navigate(HOME[user.role], { replace: true });
  }, [allowed, route.path]);

  return html`<${Shell} user=${user} path=${route.path} full=${found?.full}>
    ${allowed && html`<${LazyScreen} key=${found.path} route=${found} params=${params} query=${route.query} user=${user} />`}
  <//>`;
}

const loaded = new Map();

function LazyScreen({ route, params, query, user }) {
  const [mod, setMod] = useState(() => loaded.get(route.path) ?? null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (mod) return;
    route
      .load()
      .then((m) => {
        loaded.set(route.path, m);
        setMod(m);
      })
      .catch((err) => setError(err));
  }, [route.path]);
  if (error) {
    return html`<${Empty} icon="alert" title="تعذّر تحميل الصفحة" text=${error.message} action=${html`<${Button} onClick=${() => location.reload()} icon="refresh">إعادة التحميل<//>`} />`;
  }
  if (!mod) return html`<${ScreenSkeleton} />`;
  const Screen = mod.default;
  return html`<${Screen} params=${params} query=${query} user=${user} />`;
}

export function ScreenSkeleton() {
  return html`<div class="page" aria-busy="true">
    <div class="page-head"><${Skeleton} w=${220} h=${32} r="10px" /></div>
    <div class="skeleton-grid">
      ${Array.from({ length: 8 }, (_, i) => html`<${Skeleton} key=${i} h=${140} r="18px" />`)}
    </div>
  </div>`;
}

export { BrandMark };
