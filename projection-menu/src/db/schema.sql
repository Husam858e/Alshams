-- ════════════════════════════════════════════════════════════════════
--  Projection menu v2 — SQLite schema.
--  Timestamps are UTC ISO-8601 strings ("2026-10-16T12:30:00.000Z") so
--  they sort as text and SQLite date functions (with 'localtime') work.
--  JSON columns are stored as TEXT.
-- ════════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = ON;

-- Staff accounts. Passwords are scrypt hashes ("scrypt$N$r$p$salt$hash").
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  username       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL CHECK (role IN ('owner', 'designer', 'waiter')),
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at  TEXT
);

-- Login sessions. Only the sha256 of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL,
  user_agent  TEXT
);

-- Restaurant sections: الصالة الرئيسية، التراس، VIP ...
CREATE TABLE IF NOT EXISTS areas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      INTEGER NOT NULL UNIQUE CHECK (number > 0),
  area_id     INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  seats       INTEGER NOT NULL DEFAULT 4 CHECK (seats BETWEEN 1 AND 50),
  status      TEXT    NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'occupied', 'reserved')),
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- Ceiling projectors. Each runs the web player (/player/?device=<device_key>).
-- calibration = {"corners":[[x,y]x4]} TL,TR,BR,BL normalized (corner-pin).
CREATE TABLE IF NOT EXISTS projectors (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id         INTEGER REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  device_key       TEXT    NOT NULL UNIQUE,
  calibration      TEXT    NOT NULL DEFAULT '{"corners":[[0,0],[1,0],[1,1],[0,1]]}',
  rotation         INTEGER NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
  layout           TEXT    NOT NULL DEFAULT 'single' CHECK (layout IN ('single', 'dual')),
  pjlink_host      TEXT,
  pjlink_port      INTEGER NOT NULL DEFAULT 4352,
  pjlink_password  TEXT,
  last_seen_at     TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One-time 6-digit codes a projector device types to pair itself with a table.
CREATE TABLE IF NOT EXISTS pairing_codes (
  code            TEXT    PRIMARY KEY,
  table_id        INTEGER NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  projector_name  TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at      TEXT    NOT NULL
);

-- Uploaded files (stored in MEDIA_DIR under file_name).
CREATE TABLE IF NOT EXISTS media_assets (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT    NOT NULL CHECK (kind IN ('image', 'video', 'model3d')),
  title          TEXT    NOT NULL,
  original_name  TEXT    NOT NULL,
  file_name      TEXT    NOT NULL UNIQUE,
  mime_type      TEXT    NOT NULL,
  size_bytes     INTEGER NOT NULL,
  sha256         TEXT    NOT NULL,
  width          INTEGER,
  height         INTEGER,
  duration_ms    INTEGER,
  uploaded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar         TEXT    NOT NULL,
  name_en         TEXT,
  description_ar  TEXT,
  icon            TEXT,
  cover_asset_id  INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_visible      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dishes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name_ar         TEXT    NOT NULL,
  name_en         TEXT,
  description_ar  TEXT,
  price           REAL    NOT NULL DEFAULT 0 CHECK (price >= 0),
  image_asset_id  INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  video_asset_id  INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  model_asset_id  INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  badges          TEXT    NOT NULL DEFAULT '[]',
  calories        INTEGER,
  prep_minutes    INTEGER,
  is_available    INTEGER NOT NULL DEFAULT 1,
  is_featured     INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 'general' and 'theme' (JSON objects, see src/services/settings.js).
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- What each table's projector shows right now; restored after a reboot.
CREATE TABLE IF NOT EXISTS table_scenes (
  table_id    INTEGER PRIMARY KEY REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  scene       TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Orders keep a snapshot of the table number and dish names/prices so the
-- history (and reports) survive deleting a table or a dish.
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id      INTEGER REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  table_number  INTEGER,
  waiter_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'preparing', 'served', 'paid', 'cancelled')),
  notes         TEXT,
  total         REAL    NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dish_id     INTEGER REFERENCES dishes(id) ON DELETE SET NULL,
  dish_name   TEXT    NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  REAL    NOT NULL,
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT    NOT NULL,
  details     TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tables_area          ON restaurant_tables(area_id);
CREATE INDEX IF NOT EXISTS idx_projectors_table     ON projectors(table_id);
CREATE INDEX IF NOT EXISTS idx_dishes_category      ON dishes(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_status  ON orders(table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created       ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_activity_created     ON activity_log(created_at);
