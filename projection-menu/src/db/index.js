import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const SCHEMA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'schema.sql');
export const SCHEMA_VERSION = 2;

export class OutdatedDatabaseError extends Error {}

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  try {
    assertNotV1(db);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

// v1 databases (token dashboard, dish "halo" projections) cannot be migrated
// in place: the data model changed completely.
function assertNotV1(db) {
  const version = db.pragma('user_version', { simple: true });
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all());
  const isV1 = tables.has('dish_projections') || tables.has('projection_log') || (tables.size > 0 && !tables.has('users'));
  if (isV1 || version > SCHEMA_VERSION) {
    throw new OutdatedDatabaseError(
      'قاعدة البيانات من إصدار قديم (v1) ولا يمكن ترقيتها تلقائياً. ' +
        'شغّل: npm run seed -- --reset  لإنشاء قاعدة بيانات جديدة (سيحذف البيانات القديمة).',
    );
  }
}

// JSON columns are stored as TEXT.
export function parseJson(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

export const nowIso = () => new Date().toISOString();
