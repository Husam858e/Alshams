-- ════════════════════════════════════════════════════════════════════
--  مخطط قاعدة البيانات — منيو الإسقاط الضوئي
--  SQLite (يعمل كما هو تقريباً على PostgreSQL مع تغيير AUTOINCREMENT
--  إلى GENERATED ALWAYS AS IDENTITY و TEXT JSON إلى JSONB)
-- ════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- تصنيفات المنيو: بيتزا، سلطات، حلويات...
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar     TEXT    NOT NULL,
  name_en     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- مكتبة ملفات العرض: فيديو (mp4/webm)، صور، ونماذج 3D (glb)
-- الملف نفسه على القرص في MEDIA_DIR، وهنا فقط بياناته الوصفية.
CREATE TABLE IF NOT EXISTS media_assets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT    NOT NULL CHECK (kind IN ('video', 'image', 'model3d')),
  title          TEXT    NOT NULL,
  original_name  TEXT    NOT NULL,
  file_name      TEXT    NOT NULL UNIQUE,         -- الاسم المخزّن على القرص
  mime_type      TEXT    NOT NULL,
  size_bytes     INTEGER NOT NULL,
  sha256         TEXT    NOT NULL,                -- للتحقق والتخزين المؤقت في أجهزة العرض
  duration_ms    INTEGER,                         -- للفيديو (عبر ffprobe إن توفر)
  width          INTEGER,
  height         INTEGER,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- الأطباق
CREATE TABLE IF NOT EXISTS dishes (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id         INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name_ar             TEXT    NOT NULL,
  name_en             TEXT,
  description_ar      TEXT,
  price               REAL    NOT NULL DEFAULT 0 CHECK (price >= 0),
  thumbnail_asset_id  INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  is_available        INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ربط الطبق بعروضه الضوئية. لكل طبق عرض مختلف لكل "مرحلة":
--   preview : عند تصفح الطبق على التابلت (معاينة على الطاولة)
--   ordered : بعد تأكيد الطلب أثناء انتظار التحضير
--   served  : لحظة تقديم الطبق (تؤكدها الإدارة/المطبخ)
CREATE TABLE IF NOT EXISTS dish_projections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id         INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  media_asset_id  INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  phase           TEXT    NOT NULL CHECK (phase IN ('preview', 'ordered', 'served')),
  loop            INTEGER NOT NULL DEFAULT 1,
  duration_ms     INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0), -- NULL = حتى نهاية الملف/الإيقاف
  scale           REAL    NOT NULL DEFAULT 1.0 CHECK (scale > 0 AND scale <= 3),
  UNIQUE (dish_id, phase)
);

-- طاولات المطعم. access_key يُستخدم لربط التابلت بالطاولة.
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,            -- مثال: T01
  name        TEXT    NOT NULL,
  seats       INTEGER NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 20),
  access_key  TEXT    NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1
);

-- أجهزة العرض. الطاولة الكبيرة يمكن أن يغطيها أكثر من بروجكتر.
--   driver = 'browser'   : كمبيوتر صغير متصل بالبرجكتر عبر HDMI يشغّل صفحة /player
--   driver = 'mpv_agent' : Raspberry Pi يشغّل agent/projector_agent.py مع mpv
-- calibration : JSON لزوايا الإسقاط الأربع (Corner-pin) لتصحيح التشوه على سطح الطاولة
-- zones       : JSON لمناطق كل مقعد على سطح الطاولة (إحداثيات نسبية 0..1 + دوران)
CREATE TABLE IF NOT EXISTS projectors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id         INTEGER REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL,
  driver           TEXT    NOT NULL DEFAULT 'browser' CHECK (driver IN ('browser', 'mpv_agent')),
  agent_host       TEXT,                          -- IP جهاز التشغيل (Raspberry Pi) لوكيل mpv
  agent_port       INTEGER DEFAULT 8765,
  pjlink_host      TEXT,                          -- IP البرجكتر نفسه للتحكم بالطاقة (PJLink)
  pjlink_port      INTEGER DEFAULT 4352,
  pjlink_password  TEXT,
  access_key       TEXT    NOT NULL,
  calibration      TEXT    NOT NULL DEFAULT '{}',
  zones            TEXT    NOT NULL DEFAULT '[]',
  idle_asset_id    INTEGER REFERENCES media_assets(id) ON DELETE SET NULL, -- عرض الخلفية عند الخمول
  last_seen_at     TEXT
);

-- الطلبات
CREATE TABLE IF NOT EXISTS orders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id    INTEGER NOT NULL REFERENCES restaurant_tables(id),
  status      TEXT    NOT NULL DEFAULT 'placed'
              CHECK (status IN ('placed', 'preparing', 'served', 'closed', 'cancelled')),
  total       REAL    NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dish_id     INTEGER NOT NULL REFERENCES dishes(id),
  seat_no     INTEGER,                            -- لعرض الطبق أمام صاحبه بالضبط
  quantity    INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price  REAL    NOT NULL,                   -- السعر وقت الطلب
  notes       TEXT
);

-- سجل كل أمر أُرسل لجهاز عرض (للتشخيص والإحصاءات)
CREATE TABLE IF NOT EXISTS projection_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  projector_id    INTEGER REFERENCES projectors(id) ON DELETE SET NULL,
  table_id        INTEGER,
  dish_id         INTEGER,
  media_asset_id  INTEGER,
  cue_id          TEXT,
  action          TEXT    NOT NULL,               -- play / stop / idle / calibrate / test_pattern
  phase           TEXT,
  result          TEXT    NOT NULL,               -- acked / offline / timeout / failed / playing / ended / error
  error           TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dishes_category      ON dishes(category_id);
CREATE INDEX IF NOT EXISTS idx_projections_dish     ON dish_projections(dish_id);
CREATE INDEX IF NOT EXISTS idx_projectors_table     ON projectors(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_projection_log_time  ON projection_log(created_at);
