# منيو الإسقاط الضوئي التفاعلي (Projection Mapping Menu)

نظام لإدارة منيو طعام يُعرض بالإسقاط الضوئي على طاولات المطعم. يتكوّن من ثلاثة أجزاء:

- **لوحة تحكم** يرفع منها المدير تصاميم وفيديوهات الـ 3D، ويربط كل طبق بعروضه الضوئية.
- **واجهة طلب على التابلت.** عندما يفتح الزبون طبقاً يظهر عرضه الضوئي فوراً على الطاولة أمام مقعده.
- **طبقة ربط مع أجهزة العرض** تعمل عبر HDMI وشبكة المطعم المحلية. تتضمن تصحيح تشوّه الصورة على سطح الطاولة (Corner-pin) وتقسيم السطح إلى مناطق للمقاعد.

> الكود هنا نموذج أولي يعمل فعلاً ومغطّى باختبارات آلية، وليس مجرد مقتطفات.

| واجهة التابلت | ما يظهر على الطاولة (مقعدان في وقت واحد) |
|---|---|
| ![tablet](docs/screenshots/tablet-dish.png) | ![seats](docs/screenshots/player-seats.png) |
| **لوحة التحكم** | **شاشة المعايرة بعد تصحيح الزوايا** |
| ![admin](docs/screenshots/admin-dishes.png) | ![test pattern](docs/screenshots/player-test-pattern.png) |

---

## 1. المعمارية (Architecture)

```mermaid
flowchart LR
  subgraph LAN["شبكة المطعم المحلية (LAN)"]
    ADMIN["💻 لوحة التحكم<br/>/admin"]
    TAB["📱 تابلت الطاولة<br/>/tablet"]
    SRV[("🖥️ الخادم<br/>Node.js · Express · Socket.IO<br/>SQLite + ملفات العرض")]
    PLAYER["Mini-PC<br/>Chromium Kiosk → /player"]
    AGENT["Raspberry Pi<br/>projector_agent.py + mpv"]
  end
  P1[["📽️ بروجكتر الطاولة 1"]]
  P2[["📽️ بروجكتر الطاولة 2"]]

  ADMIN -- "REST + أحداث حية" --> SRV
  TAB -- REST --> SRV
  SRV -- "Socket.IO cues (ack + timeout)" --> PLAYER
  SRV -- "HTTP POST /cue" --> AGENT
  AGENT -- heartbeat --> SRV
  PLAYER == HDMI ==> P1
  AGENT == HDMI ==> P2
  SRV -. "PJLink TCP 4352 (تشغيل/إطفاء)" .-> P1
```

**الفكرة الأساسية:** البرجكتر نفسه مجرد شاشة. منفذ HDMI ينقل الصورة فقط، لذلك "إرسال أمر للبرجكتر" يعني عملياً إرسال أمر إلى **الكمبيوتر الصغير المتصل به**، وهذا الكمبيوتر هو الذي يشغّل الفيديو. أوامر الشبكة التي يفهمها البرجكتر (PJLink أو RS-232) تتحكم فقط بالطاقة والمدخل، ولا تتحكم بالمحتوى.

### تسلسل الأحداث عند اختيار طبق

```mermaid
sequenceDiagram
  participant T as التابلت (مقعد 2)
  participant S as الخادم
  participant P as صفحة العرض (Mini-PC)
  participant J as البرجكتر
  T->>S: POST /api/tablet/preview {dish_id, seat_no: 2}
  S->>S: dish_projections (phase=preview) → ملف العرض<br/>projectors.zones → منطقة المقعد 2
  S->>P: emit "cue" {action: play, layer: seat-2, zone, media}
  P-->>S: ack {ok: true}  (خلال 3 ثوانٍ وإلا timeout)
  S-->>T: {status: "sent"} → "يُعرض الآن أمام المقعد 2"
  P->>J: HDMI: الفيديو داخل منطقة المقعد بعد التصحيح
  P-->>S: cue:status "playing" → سجل العرض
  T->>S: إغلاق الطبق → POST /preview/stop
  S->>P: {action: stop, layer: seat-2} → تعود المنطقة للعرض الخلفي
```

لكل طبق ثلاث **مراحل** عرض اختيارية، وكلها قابلة للربط من لوحة التحكم:

| المرحلة | متى تُشغَّل | مثال |
|---|---|---|
| `preview` | عند فتح الطبق على التابلت | البيتزا ثلاثية الأبعاد تدور أمام الزبون |
| `ordered` | بعد تأكيد الطلب أثناء الانتظار | الشيف يحضّر الطبق، أو حلقة "قيد التحضير" |
| `served` | عندما يضغط المطبخ "تم التقديم" | تموجات ضوئية حول الصحن (مرة واحدة) |

---

## 2. التقنيات المقترحة ولماذا

| الطبقة | التقنية | السبب |
|---|---|---|
| الخادم | **Node.js 22 + Express 5** | نظام تحكم لحظي قائم على الأحداث، ونفس اللغة في الواجهات والخادم |
| الاتصال اللحظي | **Socket.IO** | يدعم تأكيد الاستلام مع مهلة (ack + timeout)، وغرفة لكل جهاز عرض، وإعادة الاتصال التلقائية، وزمن استجابة أقل من 50ms على الشبكة المحلية |
| قاعدة البيانات | **SQLite** (better-sqlite3) | ملف واحد بلا إدارة، ومناسبة لمطعم واحد. المخطط ينتقل إلى **PostgreSQL** بتعديلات بسيطة عند التوسع لعدة فروع |
| الواجهات | **HTML + ES Modules** بدون build | تُحمَّل بسرعة من خادم محلي حتى بدون إنترنت. كل شاشة وحدة مستقلة (`views/*.js`)، فالانتقال إلى **React/Vite** لاحقاً سهل |
| مشغّل العرض (الخيار الأول) | **Chromium Kiosk** + فيديو HTML5 + تحويل CSS `matrix3d` + **three.js** | تصحيح التشوه يتم على كرت الشاشة (GPU)، ويمكن تشغيل عدة مقاعد في وقت واحد، وعرض نماذج `.glb` حية |
| مشغّل العرض (الخيار الثاني) | **Python 3 + mpv** (JSON IPC) + فلتر ffmpeg `perspective` | خفيف جداً على Raspberry Pi، ولا يحتاج سطح مكتب ولا متصفح |
| التحكم بالبرجكتر | **PJLink** عبر الشبكة، و **HDMI-CEC** | بروتوكولات قياسية تدعمها معظم البرجكترات التجارية |
| إنتاج المحتوى | Blender / Cinema 4D / After Effects → MP4 (H.264) أو WebM (VP9) | الفيديو المُصيَّر مسبقاً هو الأكثر ثباتاً وجودة على الطاولة |

---

## 3. هيكل المشروع

```
projection-menu/
├── src/
│   ├── server.js                 نقطة التشغيل
│   ├── app.js                    تجميع Express + Socket.IO + المشغلات
│   ├── config.js                 الإعدادات (متغيرات البيئة)
│   ├── sockets.js                namespaces: /player و /admin
│   ├── db/
│   │   ├── schema.sql            ← مخطط قاعدة البيانات
│   │   ├── index.js
│   │   └── seed.js               بيانات تجريبية + توليد مقاطع عرض بـ ffmpeg
│   ├── routes/
│   │   ├── menu.js               التصنيفات، الأطباق، ربط الطبق بالعرض
│   │   ├── media.js              رفع ملفات العرض (فيديو/صورة/glb)
│   │   ├── devices.js            الطاولات، البرجكترات، المعايرة، المناطق، الطاقة
│   │   ├── orders.js             الطلبات وسجل العرض (للإدارة/المطبخ)
│   │   ├── tablet.js             واجهة التابلت: المنيو، المعاينة، الطلب
│   │   └── agent.js              heartbeat لوكلاء mpv
│   ├── services/
│   │   ├── projectionService.js  ← قلب النظام: حدث → جهاز العرض والمنطقة → أمر
│   │   ├── drivers/
│   │   │   ├── browserDriver.js  أوامر Socket.IO لصفحة العرض
│   │   │   └── mpvAgentDriver.js أوامر HTTP لوكيل Raspberry Pi
│   │   ├── pjlink.js             تشغيل/إطفاء البرجكتر عبر الشبكة
│   │   ├── media.js              الرفع، SHA-256، ffprobe
│   │   └── orders.js
│   └── lib/                      التحقق، المصادقة، مناطق المقاعد
├── public/
│   ├── admin/                    لوحة التحكم
│   ├── tablet/                   واجهة الطلب
│   ├── player/                   صفحة العرض على البرجكتر (+ model-renderer.js لـ glb)
│   └── shared/homography.js      ← رياضيات تصحيح الزوايا الأربع
├── agent/projector_agent.py      وكيل Raspberry Pi (مكتبة Python القياسية فقط)
├── deploy/                       systemd + سكربت Kiosk
└── test/                         اختبارات node:test
```

---

## 4. قاعدة البيانات (Database Schema)

المخطط الكامل مع التعليقات موجود في [`src/db/schema.sql`](src/db/schema.sql).

```mermaid
erDiagram
  categories ||--o{ dishes : "تحتوي"
  dishes ||--o{ dish_projections : "لكل مرحلة عرض"
  media_assets ||--o{ dish_projections : "ملف العرض"
  media_assets |o--o{ dishes : "صورة التابلت"
  restaurant_tables ||--o{ projectors : "يضيئها"
  media_assets |o--o{ projectors : "عرض الخمول"
  restaurant_tables ||--o{ orders : ""
  orders ||--o{ order_items : ""
  dishes ||--o{ order_items : ""
  projectors ||--o{ projection_log : ""

  dishes {
    int id PK
    int category_id FK
    text name_ar
    real price
    int thumbnail_asset_id FK
    bool is_available
  }
  media_assets {
    int id PK
    text kind "video | image | model3d"
    text file_name "اسم عشوائي على القرص"
    text sha256 "للتخزين المؤقت والتحقق"
    int duration_ms
  }
  dish_projections {
    int dish_id FK
    int media_asset_id FK
    text phase "preview | ordered | served"
    bool loop
    int duration_ms
    real scale
  }
  projectors {
    int id PK
    int table_id FK
    text driver "browser | mpv_agent"
    text agent_host
    text pjlink_host
    text access_key
    json calibration "4 زوايا"
    json zones "منطقة لكل مقعد"
    int idle_asset_id FK
  }
  order_items {
    int order_id FK
    int dish_id FK
    int seat_no "لعرض الطبق أمام صاحبه"
    real unit_price "السعر وقت الطلب"
  }
```

**قرارات تصميم مهمة:**

- مسارات الملفات لا تُخزَّن كاملة. يُخزَّن `file_name` فقط (UUID عشوائي)، ويُبنى الرابط `/media/<file_name>`. بهذا يمكن نقل مجلد الوسائط أو تغيير الخادم بدون تعديل البيانات، ويمكن تخزين الملفات مؤقتاً للأبد (immutable cache).
- `dish_projections` جدول ربط مستقل وليس عموداً في `dishes`، لأن لكل طبق عدة عروض (مرحلة لكل عرض) ويمكن مشاركة ملف واحد بين عدة أطباق.
- حذف ملف مرتبط بطبق ممنوع (`ON DELETE RESTRICT`). أما صورة الطبق وعرض الخمول فتُفرَّغ تلقائياً (`SET NULL`).
- `calibration` و `zones` بصيغة JSON لأنها تُقرأ وتُكتب ككتلة واحدة ولا يُستعلم عنها. في PostgreSQL تصبح `JSONB`.

أمثلة على الحقول:

```jsonc
// projectors.calibration — أين تقع زوايا "المسرح" على خرج البرجكتر (نسب 0..1)
{ "corners": [[0.04,0.03], [0.97,0.05], [0.95,0.97], [0.02,0.94]] }   // TL, TR, BR, BL

// projectors.zones — المنطقة أمام كل مقعد؛ rotate:180 لمقاعد الجهة المقابلة
[ { "seat": 1, "x": 0,   "y": 0,   "w": 0.5, "h": 0.5, "rotate": 180 },
  { "seat": 2, "x": 0.5, "y": 0,   "w": 0.5, "h": 0.5, "rotate": 180 },
  { "seat": 3, "x": 0,   "y": 0.5, "w": 0.5, "h": 0.5, "rotate": 0 },
  { "seat": 4, "x": 0.5, "y": 0.5, "w": 0.5, "h": 0.5, "rotate": 0 } ]
```

---

## 5. بروتوكول الأوامر (Cue Protocol)

الأمر رسالة JSON واحدة ونفس الصيغة لكل أنواع المشغلات. الكود في [`projectionService.js`](src/services/projectionService.js).

```jsonc
// تشغيل عرض في منطقة مقعد
{ "cueId": "uuid", "action": "play", "layer": "seat-2",
  "zone":  { "x": 0.5, "y": 0, "w": 0.5, "h": 0.5, "rotate": 180 },
  "media": { "kind": "video", "url": "/media/9f1c….webm", "sha256": "…" },
  "loop": true, "durationMs": null, "scale": 1, "fadeMs": 500,
  "meta":  { "dishId": 1, "dishName": "بيتزا مارجريتا", "phase": "preview" } }

{ "cueId": "uuid", "action": "stop", "layer": "seat-2" }          // layer: null = إيقاف الكل
{ "cueId": "uuid", "action": "config", "calibration": {…}, "zones": […], "idle": {…} }
{ "cueId": "uuid", "action": "test_pattern", "on": true }
```

نتائج الإرسال تُسجَّل في `projection_log` وتظهر في "سجل العرض" بلوحة التحكم:
`acked` (استلم) · `offline` (غير متصل) · `timeout` (لم يرد خلال 3 ثوانٍ) · `failed` · ثم من المشغّل نفسه: `playing` / `ended` / `error`.

مثال مختصر لقلب النظام:

```js
// src/services/projectionService.js
async playDish({ tableId, dishId, phase, seatNo = null }) {
  const projection = this.stmt.dishProjection.get(dishId, phase);   // الطبق ← ملف العرض
  if (!projection) return { status: 'no_projection', results: [] };

  const targets = this.resolveTargets(tableId, seatNo);              // المقعد ← البرجكتر + المنطقة
  const results = await Promise.all(targets.map(({ projector, layer, zone }) =>
    this.send(projector, { action: 'play', layer, zone, media: mediaRef(projection),
                           loop: Boolean(projection.loop), durationMs: projection.duration_ms })));
  return { status: results.some((r) => r.ok) ? 'sent' : 'failed', results };
}
```

---

## 6. الربط مع أجهزة العرض (Projector Integration)

### الخيار A (المُوصى به): كمبيوتر صغير + متصفح عبر HDMI

```
[البرجكتر] ◄──HDMI── [Mini-PC أو Raspberry Pi 5] ──Ethernet── [الخادم]
                        Chromium --kiosk /player/?projector=1&key=…
```

1. أضف جهاز عرض من **لوحة التحكم ← الطاولات والأجهزة**، وانسخ رابط العرض.
2. على الكمبيوتر المتصل بالبرجكتر شغّل:
   ```bash
   PLAYER_URL="http://192.168.1.10:3000/player/?projector=1&key=XXXX" deploy/kiosk-player.sh
   ```
   السكربت يفتح Chromium بملء الشاشة، ويسمح بالتشغيل التلقائي، ويمنع إطفاء الشاشة.
3. تتصل الصفحة بالخادم عبر Socket.IO وتنتظر الأوامر. لا يلزم فتح أي منفذ على الجهاز، وتعيد الاتصال تلقائياً. إذا انقطع الخادم يستمر العرض الحالي.

الملف [`public/player/player.js`](public/player/player.js) هو الذي:
- يرسم كل شيء على "مسرح" 1920×1080 يمثّل سطح الطاولة، ثم يطبّق تحويل **homography** عبر `matrix3d` حتى تنطبق زواياه على زوايا الطاولة الفعلية.
- يضع كل عرض في منطقة مقعده ويدوّره 180° للمقاعد المقابلة. يستخدم `mix-blend-mode: screen` حتى يصبح الأسود شفافاً وتندمج العروض مع الخلفية.
- يشغّل الفيديو والصور، ونماذج `.glb` بـ three.js التي تُحمَّل محلياً من الخادم بدون إنترنت.

### الخيار B: Raspberry Pi + mpv (بدون متصفح)

```bash
sudo apt install mpv cec-utils
python3 agent/projector_agent.py --server http://192.168.1.10:3000 --projector 2 --key XXXX --cec
```

- يفتح الوكيل المنفذ `8765` ويستقبل `POST /cue` بنفس صيغة الأوامر، بشرط أن يحمل الطلب ترويسة `X-Projector-Key`.
- يتحكم بـ mpv عبر IPC، ويركّب المنطقة والدوران وتصحيح الزوايا في سلسلة فلاتر ffmpeg واحدة:
  `scale → pad → hflip,vflip → pad 1920x1080 → perspective`.
- يخزّن الفيديوهات محلياً بالـ SHA-256، فيُشغَّل الملف من القرص في المرة الثانية، ويستمر العرض إذا أُعيد تشغيل الخادم.
- يرسل heartbeat كل 10 ثوانٍ، فيظهر "متصل" في اللوحة ويستلم الإعدادات تلقائياً بعد إعادة التشغيل.
- `--cec` يشغّل البرجكتر عبر HDMI-CEC عند الإقلاع.
- **القيد:** mpv يعرض مقطعاً واحداً في كل لحظة، لذلك آخر مقعد يُطلب يأخذ العرض. لتشغيل عدة مقاعد في وقت واحد استخدم الخيار A.
- ملف systemd جاهز: [`deploy/projector-agent.service`](deploy/projector-agent.service).

### التحكم بطاقة البرجكتر

- **PJLink** (TCP 4352): أدخل IP البرجكتر وكلمة مروره في إعدادات الجهاز، فتظهر أزرار "تشغيل/إطفاء البرجكتر". التنفيذ في [`src/services/pjlink.js`](src/services/pjlink.js) ويدعم المصادقة بـ MD5.
- **HDMI-CEC**: عبر `cec-client` على جهاز الوكيل.
- **RS-232**: للبرجكترات القديمة. يمكن إضافة مشغّل مشابه لـ `pjlink.js` بمكتبة `serialport`.

### نصائح عملية للإسقاط على الطاولة

| البند | التوصية |
|---|---|
| البرجكتر | ليزر قصير المدى (Short-throw)، 3500–5000 لومن، عمر تشغيل 20,000 ساعة أو أكثر |
| التركيب | في السقف فوق مركز الطاولة، مع إمالة خفيفة وتصحيح الباقي بالمعايرة من اللوحة |
| سطح الطاولة | مطفي (Matte) فاتح اللون. الأسطح اللامعة تعكس بقعة ضوء في عين الزبون |
| المحتوى | **خلفية سوداء دائماً**، لأن الأسود يعني عدم إسقاط أي ضوء. صمّم حول الصحن وليس عليه، وتجنّب المساحات البيضاء الكبيرة |
| الإضاءة | خفّف إضاءة السقف المباشرة فوق الطاولات واستخدم إضاءة جانبية دافئة |
| الشبكة | Ethernet لأجهزة العرض، وشبكة VLAN منفصلة للأجهزة عن شبكة الزبائن |

---

## 7. التشغيل السريع

يتطلب Node.js 22 أو أحدث. ffmpeg اختياري لتوليد مقاطع العرض التجريبية وقراءة مدة الفيديو.

```bash
cd projection-menu
npm install
npm run seed                 # أطباق + طاولتان + جهازا عرض + مقاطع "هالة" تجريبية
ADMIN_TOKEN=my-secret npm start
```

- لوحة التحكم: `http://localhost:3000/admin/` (رمز الدخول هو قيمة `ADMIN_TOKEN`).
- روابط التابلت وصفحات العرض تُطبع بعد `npm run seed`، وتظهر أيضاً في **الطاولات والأجهزة** مع زر نسخ.
- للتجربة على جهاز واحد: افتح رابط `/player/…` في نافذة ورابط `/tablet/…` في نافذة أخرى، ثم اختر طبقاً.
- الاختبارات: `npm test` (17 اختباراً تغطي التدفق الكامل، و PJLink، والوكيل، ورياضيات المعايرة).

### خطوات الإعداد في المطعم

1. **مكتبة العروض**: ارفع فيديوهات الأطباق (MP4 أو WebM أو صور أو GLB).
2. **الأطباق والعروض**: أنشئ الطبق، ثم اربط ملفاً لكل مرحلة (معاينة، بعد الطلب، عند التقديم). زر "تجربة على الطاولة" يشغّله فوراً.
3. **الطاولات والأجهزة**: أنشئ الطاولة (عدد المقاعد)، ثم جهاز العرض. افتح رابط العرض على جهاز البرجكتر.
4. **🎯 معايرة الزوايا**: تظهر شبكة اختبار على الطاولة. اسحب الزوايا الأربع في اللوحة حتى تنطبق على حواف الطاولة، والتحديث يظهر على الطاولة مباشرة.
5. **مناطق المقاعد**: عدّلها إذا كان شكل الطاولة غير قياسي (طاولة دائرية أو مقعد على الطرف بدوران 90°).
6. افتح رابط التابلت على جهاز الطاولة. يُحفظ الربط في الجهاز، فيبقى مرتبطاً حتى بعد إعادة التشغيل.

### تجهيز ملفات العرض

```bash
# من Blender/After Effects إلى MP4 يعمل على Google Chrome
ffmpeg -i dish.mov -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart -an dish.mp4
# WebM/VP9 يعمل على كل نسخ Chromium (ومنها Chromium على Raspberry Pi)
ffmpeg -i dish.mov -c:v libvpx-vp9 -b:v 4M -pix_fmt yuv420p -an dish.webm
```

---

## 8. واجهة البرمجة (API)

| المسار | الوصف |
|---|---|
| **الإدارة** `Authorization: Bearer <ADMIN_TOKEN>` | |
| `GET/POST/PUT/DELETE /api/admin/categories` | التصنيفات |
| `GET/POST/PUT/DELETE /api/admin/dishes` | الأطباق (مع `projections` لكل مرحلة) |
| `PUT/DELETE /api/admin/dishes/:id/projections/:phase` | ربط الطبق بملف عرض `{media_asset_id, loop, duration_ms, scale}` |
| `POST /api/admin/dishes/:id/test` | تجربة على طاولة `{table_id, seat_no, phase}` |
| `GET/POST/PATCH/DELETE /api/admin/media` | مكتبة العروض (رفع `multipart/form-data` بالحقل `file`) |
| `GET/POST/PUT/DELETE /api/admin/tables` · `POST …/:id/rotate-key` | الطاولات وروابط التابلت |
| `GET/POST/PUT/DELETE /api/admin/projectors` | أجهزة العرض |
| `PUT /api/admin/projectors/:id/calibration` · `…/zones` | المعايرة والمناطق (تُرسل للجهاز فوراً) |
| `POST /api/admin/projectors/:id/command` | `test_pattern` / `stop` / `config` |
| `GET/POST /api/admin/projectors/:id/power` | PJLink |
| `GET /api/admin/orders` · `PATCH /api/admin/orders/:id` | الطلبات (`served` يشغّل عرض التقديم) |
| `GET /api/admin/projection-log` | سجل الأوامر |
| **التابلت** `X-Table-Code` + `X-Table-Key` | |
| `GET /api/tablet/menu` | المنيو المتاح للطاولة |
| `POST /api/tablet/preview` · `/preview/stop` | تشغيل أو إيقاف المعاينة `{dish_id, seat_no}` |
| `POST/GET /api/tablet/orders` | إرسال طلب وعرض الطلبات النشطة |
| **الأجهزة** | |
| Socket.IO `/player` — `auth: {projectorId, key}` | يستقبل `cue` ويرد بـ ack، ويرسل `cue:status` |
| Socket.IO `/admin` — `auth: {token}` | `projector:status`, `order:changed`, `projection:log` |
| `POST /api/agent/heartbeat` | نبض وكيل mpv، ويعيد له الإعدادات |

---

## 9. قبل التشغيل الفعلي (Production)

- [ ] غيّر `ADMIN_TOKEN`، واستبدله لاحقاً بحسابات مستخدمين (مدير، مطبخ) بكلمات مرور مشفّرة وجلسات.
- [ ] شغّل الخادم كخدمة: [`deploy/projection-menu.service`](deploy/projection-menu.service)، وخذ نسخاً احتياطية من مجلد `data/`.
- [ ] إذا كانت اللوحة ستُفتح من خارج المطعم، ضعها خلف HTTPS (Caddy أو Nginx) أو VPN، ولا تكشف منفذ الوكيل `8765` خارج الشبكة المحلية.
- [ ] افصل شبكة الأجهزة (VLAN) عن شبكة الزبائن.
- [ ] استخدم "مفتاح جديد" لأي تابلت أو جهاز عرض مفقود، فيتوقف الرابط القديم فوراً.

## 10. التطوير المستقبلي

- **تفاعل مباشر على الطاولة:** كاميرا عمق (Intel RealSense أو Azure Kinect) أو إطار لمس بالأشعة تحت الحمراء، حتى يختار الزبون بلمس الطاولة نفسها. أحداث اللمس تمر عبر نفس `projectionService`.
- **عدة برجكترات للطاولة الكبيرة:** المخطط يدعمها الآن (لكل جهاز مناطقه). المطلوب لاحقاً دمج الحواف (Edge blending) ومزامنة البدء عبر حقل `startAt` في الأمر.
- **العمل بدون اتصال:** Service Worker في صفحة العرض يخزّن كل ملفات الأطباق مسبقاً.
- **الربط مع نظام الكاشير (POS)** وشاشة المطبخ (KDS) عبر webhook عند `order:changed`.
- **التحليلات:** أي معاينة أدت إلى طلب (نسبة التحويل لكل عرض) من `projection_log` و `orders`.
- **فروع متعددة:** PostgreSQL، وتخزين الوسائط على S3 أو R2، مع خادم محلي (edge) في كل فرع.
- **واجهات React:** كل شاشة في `public/admin/views/*.js` تقابل مكوّن React واحداً، والـ API لا يتغير.
