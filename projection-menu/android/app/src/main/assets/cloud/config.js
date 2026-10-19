// The Firebase project of cloud mode: reads what people paste in setup,
// validates it, and finds the project this device uses (the one saved in
// setup, else the one built into the APK: firebase-config.js).
//
// Pasted text is never evaluated: the Firebase console shows a JavaScript
// snippet (`const firebaseConfig = { apiKey: "…", … };`, often with the
// imports and initializeApp() around it), so a small tokenizer reads the first
// object literal after "firebaseConfig" (or the first one at all): keys bare
// or quoted, string values in any quotes, comments and trailing commas allowed.
// Plain JSON is a special case of that.
//
// Imported by the setup page too: keep to Chrome 80 syntax (see app/bridge.js).

export const REQUIRED_KEYS = ['apiKey', 'projectId', 'appId', 'storageBucket'];
// What initializeApp() understands; anything else in the paste is ignored.
const KNOWN_KEYS = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
// Ours, next to them: where media files go. 'firestore' (the default, free
// Spark plan) or 'storage' (Firebase Storage, for a project on Blaze).
export const MEDIA_MODES = ['firestore', 'storage'];
const MAX_TEXT = 20000;
const MAX_VALUE = 300;

export class ConfigError extends Error {}

// ── Tokenizer ──────────────────────────────────────────────────────

const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' };

// -> [{type: 'punct'|'string'|'word'|'number', value}], from `start` until the
// object that starts there is closed.
function tokensOfObject(text, start) {
  const tokens = [];
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end + 1;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new ConfigError('تعليق غير مغلق في الإعدادات');
      i = end + 2;
    } else if (c === '"' || c === "'" || c === '`') {
      let value = '';
      let j = i + 1;
      for (;;) {
        if (j >= text.length) throw new ConfigError('نص غير مغلق في الإعدادات — تأكد من نسخ الإعدادات كاملة');
        const ch = text[j];
        if (ch === c) break;
        if (c === '`' && ch === '$' && text[j + 1] === '{') throw new ConfigError('الإعدادات تحتوي على قيم محسوبة — الصق القيم كما تظهر في Firebase console');
        if (ch === '\\') {
          const next = text[j + 1];
          if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(j + 2, j + 6))) {
            value += String.fromCharCode(parseInt(text.slice(j + 2, j + 6), 16));
            j += 6;
          } else {
            value += ESCAPES[next] !== undefined ? ESCAPES[next] : next === undefined ? '' : next;
            j += 2;
          }
          continue;
        }
        if ((ch === '\n' || ch === '\r') && c !== '`') throw new ConfigError('نص غير مغلق في الإعدادات — تأكد من نسخ الإعدادات كاملة');
        value += ch;
        j += 1;
      }
      tokens.push({ type: 'string', value });
      i = j + 1;
    } else if (/[A-Za-z_$]/.test(c)) {
      const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(i))[0];
      tokens.push({ type: 'word', value: word });
      i += word.length;
    } else if (/[0-9]/.test(c)) {
      const number = /^[0-9][0-9.eE+-]*/.exec(text.slice(i))[0];
      tokens.push({ type: 'number', value: number });
      i += number.length;
    } else {
      tokens.push({ type: 'punct', value: c });
      if (c === '{') depth += 1;
      if (c === '}') {
        depth -= 1;
        if (depth === 0) return tokens;
      }
      i += 1;
    }
  }
  throw new ConfigError('الإعدادات غير مكتملة — لم نجد القوس «}» الذي يغلقها');
}

function objectStart(text) {
  const named = text.search(/firebaseConfig\s*[=:]/);
  const from = named >= 0 ? named : 0;
  const brace = text.indexOf('{', from);
  if (brace < 0) throw new ConfigError('لم نجد إعدادات Firebase في النص — انسخ الكائن firebaseConfig كاملاً بما فيه { }');
  return brace;
}

// The flat {key: "value"} object of the tokens (other shapes are refused).
function readObject(tokens) {
  const out = {};
  let i = 1; // tokens[0] is '{'
  const unexpected = () => new ConfigError('صيغة الإعدادات غير مفهومة — الصق الكائن firebaseConfig كما يظهر في Firebase console');
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'punct' && t.value === '}') return out;
    if (t.type !== 'word' && t.type !== 'string') throw unexpected();
    const key = t.value;
    if (!(tokens[i + 1] && tokens[i + 1].type === 'punct' && tokens[i + 1].value === ':')) throw unexpected();
    const value = tokens[i + 2];
    if (!value) throw unexpected();
    if (value.type === 'string' || value.type === 'number') {
      out[key] = value.value;
    } else if (KNOWN_KEYS.indexOf(key) >= 0) {
      // e.g. apiKey: process.env.API_KEY
      throw new ConfigError(`قيمة "${key}" ليست نصاً — الصق القيم كما تظهر في Firebase console`);
    } else {
      throw unexpected();
    }
    i += 3;
    const sep = tokens[i];
    if (sep && sep.type === 'punct' && sep.value === ',') i += 1;
    else if (!(sep && sep.type === 'punct' && sep.value === '}')) throw unexpected();
  }
  throw unexpected();
}

// ── Public API ─────────────────────────────────────────────────────

/** Pasted text (console snippet or JSON) → a validated config. Throws ConfigError (Arabic). */
export function parseFirebaseConfig(text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) throw new ConfigError('الصق إعدادات مشروع Firebase أولاً');
  if (raw.length > MAX_TEXT) throw new ConfigError('النص طويل جداً — الصق الكائن firebaseConfig فقط');
  const start = objectStart(raw);
  return validateFirebaseConfig(readObject(tokensOfObject(raw, start)));
}

/** Keeps the known keys (strings, trimmed) and checks the required ones. Throws ConfigError. */
export function validateFirebaseConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ConfigError('إعدادات Firebase غير صالحة');
  const config = {};
  for (const key of KNOWN_KEYS) {
    const value = input[key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' && typeof value !== 'number') throw new ConfigError(`قيمة "${key}" غير صالحة`);
    const text = String(value).trim();
    if (!text) continue;
    if (text.length > MAX_VALUE || /\s/.test(text)) throw new ConfigError(`قيمة "${key}" غير صالحة`);
    config[key] = text;
  }
  if (input.media != null && input.media !== '') {
    const media = String(input.media).trim();
    if (MEDIA_MODES.indexOf(media) < 0) throw new ConfigError(`قيمة "media" غير صالحة (المسموح: ${MEDIA_MODES.join(' أو ')})`);
    if (media !== 'firestore') config.media = media; // absent = the default
  }
  const missing = REQUIRED_KEYS.filter((key) => !config[key]);
  if (missing.length) {
    throw new ConfigError(`الإعدادات ناقصة: ${missing.map((k) => `"${k}"`).join(' و')} — انسخ الكائن firebaseConfig كاملاً`);
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(config.projectId)) throw new ConfigError('قيمة "projectId" غير صالحة');
  return config;
}

/** "?emulators=<host>" of a cloud page: development only (debug builds, tests). */
export function emulatorHost(search) {
  const host = new URLSearchParams(search || '').get('emulators');
  return host && /^([A-Za-z0-9.-]+|\[[0-9A-Fa-f:.]+\])$/.test(host) ? host : null;
}

// The emulators' default ports (firebase/firebase.json keeps them).
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199 };

/** The cloud backend's `emulators` option for a host, or null (the real project). */
export function emulatorOptions(host) {
  return host ? { host, ...EMULATOR_PORTS } : null;
}

/**
 * The project this device uses: {config, source: 'saved'|'builtin'|null, error?}.
 * `saved` is what setup stored (bridge state config.firebase); a broken one is
 * reported, not silently replaced by the built-in project.
 */
export function chooseConfig(saved, builtIn) {
  if (saved) {
    try {
      return { config: validateFirebaseConfig(saved), source: 'saved' };
    } catch (err) {
      return { config: null, source: 'saved', error: err.message };
    }
  }
  if (builtIn) {
    try {
      return { config: validateFirebaseConfig(builtIn), source: 'builtin' };
    } catch (err) {
      return { config: null, source: 'builtin', error: err.message };
    }
  }
  return { config: null, source: null };
}
