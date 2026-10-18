# Cloud mode (Firebase) — architecture

The restaurant can run the whole system **without a local server**: every
device (waiter tablets, the designer's/owner's devices, every projector
player) talks to one Firebase project. The local Node server mode stays
available; cloud mode is a third backend next to the server and the offline
demo, behind the same seams.

## Why it fits the existing code

The staff app (`public/app`) and the player (`public/player`) never talk to
the network directly:

- staff app: `public/app/lib/api.js` (`fetch('/api/...')`, XHR for uploads)
  and `public/app/lib/live.js` (Socket.IO `/live`, events: `floor:changed`,
  `menu:changed`, `settings:changed`, `scene`, `order`, `projector:status`,
  plus `live:connected`, `live:kicked`, `live:unauthorized`);
- player: `public/player/lib/net.js`, whose demo seam uses
  `globalThis.__PM_DEMO__` (or the parent's) `openDevice(key, on)` /
  `openPreview(tableId, on)`.

The offline demo (`android/app/src/main/assets/demo/`) already answers every
`/api/*` route in the browser: `demo/backend/index.js` (`createBackend`) plus
`routes/{auth,floor,menu,orders}.js` port the server's semantics, roles,
validation and Arabic errors onto an in-memory state `s`
(`users, areas, tables, projectors, assets, categories, dishes, orders
(items embedded), activity, scenes: Map, pairing: Map, settings, seq/nextId`).

**Cloud mode = the same route logic running on a live replica of that state
that is kept in sync with Firestore.**

```
 staff app / player  ──/api/* + live events──►  cloud host (in the page)
                                                  ├─ replica `s` (same shape as the demo state)
                                                  │    ▲ onSnapshot listeners (Firestore → s, → live events)
                                                  ├─ demo route handlers run on `s`
                                                  │    ▼ diff before/after → batched writes (s → Firestore)
                                                  ├─ Firebase Auth (staff: email/password, projectors: anonymous)
                                                  └─ Firebase Storage (media uploads)
```

### Rules of the replica

1. **Reads** are served synchronously from `s` (what the demo does).
2. **Writes**: a mutating request snapshots the touched collections, runs the
   handler, diffs per document, and commits one batch: `set` for new docs,
   `update` with only the changed top-level fields for modified docs,
   `delete` for removed ones. If the handler throws, `s` is restored. If the
   commit is rejected (rules, offline too long), `s` is restored from the
   last server snapshot and the request answers with the error.
3. **Live events come from data, not from handlers**: Firestore snapshot
   changes (local writes included — they arrive at once with
   `hasPendingWrites`) are mapped to the app's events:
   categories/dishes/media → `menu:changed`; settings → `settings:changed`;
   areas/tables/projector structure → `floor:changed`; scenes/{tableId} →
   `scene` `{tableId, scene}` (order scenes resolved with the order DTO);
   orders → `order` (owner/waiter only) + `floor:changed`; projector
   online flip → `projector:status`; own role/active change → `live:kicked`.
   The demo's direct `ctx.live.*` calls are suppressed in cloud mode so no
   event fires twice.
4. **Only what the screens need is replicated**: all menu/floor/settings/
   projector/scene docs; orders that are active (`open|preparing|served`) or
   created in the last 24 h. Order history (`GET /orders` with a non-active
   status), `GET /reports/summary` and `GET /activity` run Firestore queries
   on demand and reuse the demo's DTO/report code on the result.
   Single-field queries only (no composite indexes to deploy).
5. **IDs stay positive integers** (the app's routes and `idParam` need them):
   `meta/counters` holds one counter per kind; a device reserves IDs with a
   transaction before the mutating request that needs them, so IDs are
   unique across devices. Order item IDs are unique within their order.

## Firestore layout (single restaurant per project)

| Collection / doc | Content | Read | Write |
|---|---|---|---|
| `meta/setup` | `{ownerUid, at}` — exists once the owner account exists | anyone | create once by the first owner |
| `meta/counters` | `{user, area, table, projector, asset, category, dish, order, activity}` | staff | staff (increment only) |
| `logins/{username}` | `{email}` — current Auth email of that username | `get` by anyone (not `list`) | owner |
| `roles/{uid}` | `{role, userId, active}` — the security source of truth | self, owner | owner (+ first-owner bootstrap) |
| `users/{id}` | demo user fields, no password | staff | owner |
| `areas/{id}`, `tables/{id}` | as the demo | signed in (incl. projectors) | owner; waiter may change only `status` of a table |
| `projectors/{id}` | as the demo + `last_seen_at`, `acked_at`, `test_pattern`, `device_uid`, `pending` | signed in | owner (structure), owner/designer (calibration, rotation, layout, test pattern), the bound device (only `last_seen_at`, `acked_at`, `power`) |
| `devices/{uid}` | `{projectorId, code, at}` — binds an anonymous projector device | self, owner | self (claim with a valid pairing code), owner (unbind) |
| `pairing/{code}` | `{projectorId, tableId, expiresAt, createdBy}` | `get` by anyone signed in | owner create; claiming device delete |
| `categories/{id}`, `dishes/{id}`, `media/{id}` | as the demo; media has `storage_path`, `url` | signed in | owner/designer; **designer cannot change `price`** (new dish by a designer: price 0) |
| `settings/general`, `settings/theme` | as the demo | signed in | general: owner; theme: owner/designer |
| `scenes/{tableId}` | `{type, categoryId?, dishId?, orderId?, at, by}` | signed in | staff |
| `orders/{id}` | demo order (items embedded) | owner/waiter, and the projector bound to that order's table | owner/waiter |
| `activity/{id}` | demo activity row | owner | staff create only |

Storage: `media/{assetId}/{file}`; write by owner/designer (role read with
`firestore.get` from storage rules), content-type and size limits as the
server (images, video, GLB; `maxUploadMb`), read by signed-in users.
Uploads set `cacheControl: 'public, max-age=31536000, immutable'`.

## Accounts

- Staff sign in with **username + password** as today. The Auth account's
  email is synthetic (`<username>.<n>@staff.projection-menu.app`); the
  current one is found through `logins/{username}`. Auth needs ≥ 6 chars, so
  the Auth password is a fixed prefix + the user's password (the app keeps
  its 4-character minimum).
- First run: no `meta/setup` → the app shows "create the owner account";
  the owner's Auth account, `roles/{uid}`, `users/{id}`, `logins/{username}`
  and `meta/setup` are written together.
- The owner creates staff accounts through a **secondary Firebase app
  instance** (so the owner stays signed in), then writes their `roles`,
  `users` and `logins` docs.
- Owner resets someone's password / renames a username: a fresh Auth
  account is created the same way, `logins` points to it, the old uid's
  `roles` doc is deleted — the old password stops working at once.
- Deactivate: `roles/{uid}.active = false` (rules deny everything); the
  user's open apps get `live:kicked`.
- Own password: re-authenticate with the current password, `updatePassword`.

## Projector devices

- Sign in **anonymously** (persisted by the Auth SDK).
- Pairing: the owner's "pairing code" creates the projector doc
  (`pending: true`) and `pairing/{code}`; the device enters the code, writes
  `devices/{uid}`, sets its projector `pending: false`, deletes the code.
  "Rotate key" = owner deletes `devices/{uid}` (the device loses access and
  shows the pairing screen again).
- Online: the player writes `last_seen_at` (server timestamp) at start and
  every 2 minutes; staff replicas treat a projector as online when it was
  seen in the last 5 minutes (re-evaluated on a timer).
- Scene delivery: the player writes `acked_at` when a scene arrives;
  `PUT /tables/:id/scene` waits up to 2 s for acks of the table's online
  projectors (same `{online, acked}` answer as the server).
- PJLink power control needs the LAN; in cloud mode it answers
  `{supported: false}` for now.

## Offline behaviour

Firestore's persistent local cache (IndexedDB) is on: a device that loses
the internet keeps working on its cached data, queues its writes and syncs
when back. A projector keeps showing its last menu; media files are cached
on the device by the Android app (see below).

## Android integration

- Pages: `/cloud/app.html` (staff app) and `/cloud/player.html` (projector),
  served from the APK assets like the demo. Their import maps point the
  Firebase SDK (`https://www.gstatic.com/firebasejs/<v>/firebase-*.js`) at
  copies vendored into the APK at build time (`node_modules/firebase`).
- Firebase project config: built-in default `cloud/firebase-config.js`
  (empty until the restaurant's project is known) or pasted in setup
  (stored on the device).
- Media cache: the WebView intercepts `firebasestorage.googleapis.com`
  downloads, serves them from a disk cache (Range supported) and adds CORS
  headers (the 3D model loader uses XHR).
