// Service Worker — الشمس الذكي
// يخزّن هيكل التطبيق (App Shell) للعمل دون اتصال، ويترك طلبات الشبكة الحيّة
// (Firebase REST/SSE وأي API) تمر مباشرة دون تدخل حتى لا يُعطّل التزامن اللحظي.
const CACHE_NAME = 'alshams-shell-v1';
const APP_SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);

    // ✅ لا نتدخل أبداً في طلبات عبر النطاقات الأخرى (Firebase REST/SSE، خرائط،
    // خطوط) — التخزين المؤقت لهذه الطلبات قد يُجمّد بيانات حيّة أو يكسر SSE
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(req).then((cached) => {
            const network = fetch(req)
                .then((res) => {
                    if (res && res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => cached);
            // ✅ عرض النسخة المخزّنة فوراً إن وُجدت (أسرع) مع تحديثها في الخلفية،
            // وإلا الانتظار للشبكة كخيار وحيد
            return cached || network;
        })
    );
});
