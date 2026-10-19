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
                                                  └─ media files: Firestore chunks + a per-device cache
                                                     (Firebase Storage only with `media: 'storage'`)
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
   transaction, so IDs are unique across devices. A handler that needs an ID
   the device does not hold yet throws `NeedIds`: the request is rolled back,
   the ID reserved, and the request run again. Activity IDs are reserved ten
   at a time, and owners/waiters keep one spare order number (so an order can
   still be taken while the internet is down); a reload may leave gaps.
   Order item IDs are unique within their order (`item_seq` on the order).
6. **Handlers stay synchronous**: every mutating demo handler runs between a
   snapshot and a diff of `s` with no `await` in between, so remote snapshots
   never interleave with a request. Routes that need Auth, media files, queries
   or acks have cloud versions (`cloud/backend/routes/`) that do their async
   work first and then call `mutate(fn)`.
7. **Writes wait for the server only when online**: a request waits up to
   8 s for its batch to be accepted (a refusal answers with the error);
   offline, the batch stays queued in the local cache and the request is
   answered at once. A batch refused later rebuilds `s` from the last
   snapshots and tells the screens to refresh.

## Firestore layout (single restaurant per project)

| Collection / doc | Content | Read | Write |
|---|---|---|---|
| `meta/setup` | `{ownerUid, at}` — exists once the owner account exists | anyone | create once by the first owner |
| `meta/counters` | `{user, area, table, projector, asset, category, dish, order, activity}` | staff | staff (increment only) |
| `logins/{username}` | `{email}` — current Auth email of that username | `get` by anyone (not `list`) | owner |
| `roles/{uid}` | `{role, userId, active}` — the security source of truth | self, owner | owner (+ first-owner bootstrap) |
| `users/{id}` | demo user fields, no password | staff | owner |
| `areas/{id}`, `tables/{id}` | as the demo | active staff and paired projectors | owner; waiter may change only `status` of a table |
| `projectors/{id}` | as the demo + `last_seen_at`, `acked_at`, `test_pattern`, `device_uid`, `pending` (+ `pairing_code`, `pairing_expires_at` while pending); no PJLink password | active staff and paired projectors | owner (structure), designer (calibration, rotation, layout, test pattern), the bound device (only `last_seen_at`, `acked_at`, `power`, and `pending`/`device_uid` when it claims) |
| `devices/{uid}` | `{projectorId, code, at}` — binds an anonymous projector device | self, owner | self (claim with a valid, unexpired code that the same batch deletes), owner (unbind) |
| `pairing/{code}` | `{projectorId, tableId, expiresAt (Timestamp), createdBy}` | `get` by anyone signed in | owner create; claiming device delete |
| `categories/{id}`, `dishes/{id}` | as the demo | active staff and paired projectors | owner/designer; **designer cannot change `price`** (new dish by a designer: price 0) |
| `media/{id}` | as the demo + where the file is: `storage: 'firestore'`, `chunks`, `rev`, `sha256` (`url: null`); or `storage_path` + `url` (Storage) | active staff and paired projectors | owner/designer; a Firestore file only once its first and last chunk exist; afterwards only the title changes |
| `mediaChunks/{assetId}_{index}` | `{assetId, index, data}` — `data` is Firestore Bytes, ≤ 900 KB | active staff and paired projectors | owner/designer create (shape and size checked, never for a published asset) and delete; never updated |
| `settings/general`, `settings/theme` | as the demo | anyone (name and theme are public; the sign-in screen shows the name) | general: owner; theme: owner/designer |
| `scenes/{tableId}` | `{type, categoryId?, dishId?, orderId?, at, by}` | active staff and paired projectors | staff; never an `order` scene by a designer |
| `orders/{id}` | demo order (items embedded) | owner/waiter, and (one by one) the projector bound to that order's table | owner/waiter |
| `activity/{id}` | demo activity row | owner | staff create only |

Firebase Storage is not used by default (see "Media in Firestore"). A
project on the Blaze plan may set `media: 'storage'`: then uploads go to
`media/{assetId}/{file}`; write by owner/designer (role read with
`firestore.get` from `storage.rules`), content-type and size limits as the
server (images, video, GLB; `maxUploadMb`), read by signed-in users, with
`cacheControl: 'public, max-age=31536000, immutable'`.

## Media in Firestore (default)

The restaurant's project is on the free **Spark** plan, where Firebase
Storage is not available (new projects need Blaze and a payment card). So
media files live in Firestore itself (`cloud/backend/media.js`):

**Upload** (`POST /media`, `cloud/backend/routes/content.js`):

1. `inspectUpload` (extension, signature, 100 MB input limit) as before.
2. **Images** (JPEG/PNG/WebP, photos, covers, logo and backgrounds alike) are
   decoded and re-encoded in the browser: longest side ≤ **1600 px** (never
   upscaled), **WebP quality 0.82** through `OffscreenCanvas.convertToBlob`
   (a `<canvas>` without it), alpha kept. Without a WebP encoder: JPEG for
   opaque images, PNG when any pixel is transparent. A file that is already
   small enough and would not get smaller is kept as it is. EXIF orientation
   is applied (`createImageBitmap`). `width`/`height` are those stored. In
   Node (tests) there is no decoder: an encoder can be injected
   (`createCloudHost(…, {imageEncoder})`), else images are stored as uploaded.
3. **Videos** (MP4/WebM) and **GLB models** are stored as they are, within
   **20 MB** and **15 MB** (`LIMIT_MB` in `media.js`, one place; compressed
   images ≤ 10 MB). Above, a 413 in Arabic says the size, the limit and how
   to shrink the file (shorter clip / 720p, smaller textures).
4. The bytes are cut into **≤ 900 KB chunks** (under Firestore's 1 MiB per
   document) and written as **Firestore Bytes** (no base64) to
   `mediaChunks/{assetId}_{index}` `{assetId, index, data}`, two at a time,
   each write acknowledged by the server: `fields.onProgress(written/total)`
   is real progress. Upload needs the internet (refused offline at once; a
   chunk unacknowledged for 60 s fails the upload).
5. The **media doc comes last**, through the replica (`mutate`):
   `{storage: 'firestore', chunks, size_bytes, mime_type, sha256, rev
   (= sha256[0..16]), width, height, duration_ms, url: null, …}`. Readers only
   look for chunks of assets in `media/`, and the rules refuse a media doc
   whose first or last chunk is missing, so nobody sees half a file.
6. **Cancel** (`fields.signal`, the XHR shim's `abort()`): no new chunk is
   started, the chunks of that id are deleted in one batch (sent after the
   writes, so applied after them) and the request answers 499. A failed or
   refused upload cleans up the same way.

**Delete** (`DELETE /media/:id`): the demo's checks (a used file cannot be
deleted), then the media doc and all its chunks in **one batch**
(`chunkDeletes` in the replica's `extra` writes). A Storage file (older entry
or Blaze project) is deleted from Storage afterwards, as before.

**Display.** The shared model's DTOs take a URL synchronously
(`createModel(s, {assetUrl})`, demo/server: `asset.url`). In cloud mode
`assetUrl` is the device's **media cache** (`createMediaCache`):

- a ready file → its `blob:` URL (`URL.createObjectURL`), usable by `<img>`,
  `<video>`, the three.js GLB loader, the staff app's preview iframes (same
  origin) and the projector player;
- otherwise `null` (the screens show their placeholder) and the file starts
  loading: from the **Cache API** (`caches.open('pm-media-v1')`, key
  `<assetId>-<rev>`), else from Firestore (chunk reads, a few at a time,
  reassembled into a Blob, size checked) and then stored in the cache.
  Images load before models, models before videos; two files at a time.
- when files arrive (debounced, ≤ 1.5 s) the host refreshes what shows them:
  staff hosts emit `menu:changed` (menu, library, previews; plus
  `settings:changed` when it is the logo or the background), device hosts
  re-bootstrap the player. A failed load is retried when asked again after
  30 s and when the connection comes back.
- the uploading device puts its own bytes in the cache: the upload's answer
  already has a working URL.
- URLs of deleted/replaced files are revoked; after a server (not cache)
  snapshot of `media/`, cached files no longer in the library are deleted
  from the Cache API.

**Projectors prefetch** every file their menu and settings use (dish
photos/videos/models, category covers, logo, theme background) at every
bootstrap, so a table has everything on the device and keeps showing it
offline (also after a restart: Firestore's own cache has the docs, the Cache
API the files). **Staff devices load lazily**: a file is read when a screen
needs its URL.

The player's URL policy (`public/player/lib/media.js`) accepts `blob:` URLs of
its own origin only (`blob:<page origin>/<uuid>`), next to `/media/…` server
files and Storage download URLs; it never shows a URL of another site. A
player saves its last bootstrap in `localStorage` with `blob:` URLs removed
(they die with the page), so a reloaded projector shows placeholders until
the cache hands it fresh URLs (immediately when the files are cached).

**Free-tier capacity (Spark).** Firestore storage is 1 GiB in total: a
compressed photo is typically 100–300 KB (thousands fit), a short clip a few
MB. Reads are counted per document: a file costs one read per 900 KB chunk,
**once per device** (then it comes from the device's cache). Free each day:
50,000 reads, 20,000 writes, 20,000 deletes; and 10 GiB of outbound traffic
a month. Each device keeps its files in its own storage (no cache shared
between devices), so ten projectors read a new 6 MB clip ten times.

**Firebase Storage (optional).** A project on Blaze can keep media in Storage
with `media: 'storage'` in its Firebase config (built-in
`cloud/firebase-config.js`, or pasted in setup; native `FirebaseProject` and
`cloud/config.js` keep the key): uploads then go to Storage as described
above, the Android app caches those downloads (`MediaProxy`), and
`storage.rules` must be published. Existing library entries keep working
whichever mode is set (each entry says where its file is).

## Accounts

- Staff sign in with **username + password** as today. The Auth account's
  email is synthetic (`u<userId>-<random>@staff.projection-menu.app`, so any
  username, Arabic included, works); the current one is found through
  `logins/u_<lowercased username>` (`{email, userId}`). Auth needs ≥ 6
  chars, so the Auth password is a fixed prefix (`pm#`) + the user's
  password (the app keeps its 4-character minimum). `users/{id}` also keeps
  the current `uid` and `email`; every change of a user's role/active/uid
  through the demo's handlers writes `roles/` and `logins/` in the same
  batch.
- First run: no `meta/setup` → the app shows "create the owner account";
  the owner's Auth account, `roles/{uid}`, `users/{id}`, `logins/{username}`
  and `meta/setup` are written together.
- The owner creates staff accounts through a **secondary Firebase app
  instance** (so the owner stays signed in), then writes their `roles`,
  `users` and `logins` docs.
- Owner resets someone's password: a fresh Auth account is created the
  same way, `logins` points to it, the old uid's `roles` doc is deleted — the
  old password stops working at once and that user's open apps are kicked.
  (Usernames cannot be renamed, as with the server. The owner's own password
  is changed with "change password", not by a reset.)
- Deactivate: `roles/{uid}.active = false` (rules deny everything); the
  user's open apps get `live:kicked`.
- Own password: re-authenticate with the current password, `updatePassword`.

## Projector devices

- Sign in **anonymously** (persisted by the Auth SDK).
- Pairing: the owner's "pairing code" creates the projector doc
  (`pending: true`, hidden from staff screens) and `pairing/{code}`; the
  device enters the code, writes `devices/{uid}`, sets its projector
  `pending: false` + `device_uid`, deletes the code — one batch the rules
  check. The pairing dialog then sees the projector appear on the table.
  Expired codes and their pending projectors are cleaned up with the next
  code. `POST /projectors/pairing-codes` also accepts `projector_id` to
  re-pair an existing projector instead of adding one.
- "Rotate key" (and deleting a projector or its table) = unbind, in two
  commits: first the projector's `device_uid` is cleared (the device, still
  allowed to read, sees it and shows the pairing screen), then
  `devices/{uid}` is deleted (the device loses all access). In one batch the
  emulator stalls the device's listeners as soon as access is revoked. A
  refused heartbeat also makes the device check its binding.
- Online: the player writes `last_seen_at` (server timestamp) at start and
  every 2 minutes; staff replicas treat a projector as online when it was
  seen in the last 5 minutes (re-evaluated on a timer).
- Scene delivery: the player writes `acked_at = scene.at` (the scene's own
  timestamp is the ack token, so clocks do not matter) with a heartbeat when
  a scene arrives; `PUT /tables/:id/scene` waits up to 2 s for acks of the
  table's online projectors (same `{online, acked}` answer as the server).
- A projector reads its order one document at a time (the order its table
  shows), never with a query — the rules allow exactly that.
- PJLink power control needs the LAN: `GET …/power` answers
  `{supported: false, power: null}` (the menu stays usable), `POST` answers
  501 with an Arabic explanation.

## Offline behaviour

Firestore's persistent local cache (IndexedDB) is on: a device that loses
the internet keeps working on its cached data, queues its writes and syncs
when back. A projector keeps showing its last menu; its media files are in
its Cache API storage (see "Media in Firestore"). Uploads need the internet.

## Android integration

- Pages: `/cloud/app.html` (staff app) and `/cloud/player.html` (projector),
  served from the APK assets like the demo. Their import maps point the
  Firebase SDK (`https://www.gstatic.com/firebasejs/<v>/firebase-*.js`) at
  copies vendored into the APK at build time (`node_modules/firebase`).
- Firebase project config: built-in default `cloud/firebase-config.js`
  (empty until the restaurant's project is known) or pasted in setup
  (stored on the device).
- Media cache: by default the pages keep media files in the Cache API
  (`pm-media-v1`, per app origin). For `media: 'storage'` projects the
  WebView intercepts `firebasestorage.googleapis.com` downloads, serves them
  from a disk cache (Range supported) and adds CORS headers (the 3D model
  loader uses XHR).

## Implementation map

- `demo/backend/` is the shared core: `model.js` (DTOs, scenes, player
  bootstraps), `router.js` (route table; a backend may replace a route),
  `frames.js` (subscribers in other frames), `probe.js` (image/video size),
  `routes/*.js` (the handlers, with small hooks: `ctx.nextItemId`,
  `dto.user/projector/media`, exported `credentials`, `inspectUpload`,
  `reportRange/reportSummary/activityDto`). Designers get order scenes
  without the order in the demo too.
- `cloud/backend/`: `index.js` (public entry: `createCloudHost`,
  `claimProjector`, `probeProject`), `staff.js` (session, listeners, live
  events, previews), `device.js` (projector), `replica.js` (mirror, diff,
  commit), `ids.js`, `schema.js` (collections, conversions, constants),
  `firebase.js` (app instances `pm-staff` / `pm-device`, emulators,
  persistent cache, errors; the Storage SDK only for `media: 'storage'`),
  `media.js` (limits, image re-encoding, chunks, the device media cache),
  `routes/` (cloud versions of the routes that need Auth, media files,
  queries or acks).
- Firestore reads stay small: order history = replica + one cached query of
  older orders (500, refreshed at most every 10 minutes); reports = one range
  query on `created_at`; activity = `orderBy(created_at) + limit`. Every
  projector heartbeat (every 2 minutes) costs each open staff app one read.
- `/system/server-info` answers `{mode: 'cloud', projectId, publicBaseUrl:
  <page origin>, lanUrls: [], apkAvailable: false, …}`.

## Project setup and tests

- Firebase console (Spark plan is enough): enable Authentication →
  Email/Password and Anonymous; create Firestore; publish
  `firebase/firestore.rules` (console, or `npx firebase-tools deploy --only
  firestore:rules --project <id> --config firebase/firebase.json`). Only a
  `media: 'storage'` project also needs Storage (Blaze) and `storage.rules`
  (`--only firestore:rules,storage`; Storage's role check reads Firestore,
  which the first deploy asks to allow).
- `npm run test:cloud` runs `test/cloud/*.test.js` (security rules and the
  hosts end to end, media in Firestore and in Storage) on the emulators
  (`demo-pm`, no real project). Behind an HTTP proxy, set
  `HTTPS_PROXY=undefined` for that command: firebase-tools sends its
  emulator-to-emulator calls through `HTTPS_PROXY` (ignoring `NO_PROXY`),
  which breaks Storage's role check. `npm test` covers chunking, image
  sizing, limits and the media cache without emulators
  (`test/cloud-media.test.js`).

