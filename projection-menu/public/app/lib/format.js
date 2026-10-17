// Arabic formatting with Latin digits (easier to read on a busy floor).

import { getState } from './store.js';

const LOCALE = 'ar-u-nu-latn';
const numberFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const relFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

export const currency = () => getState().settings?.general?.currency || 'د.ع';

export const num = (n) => numberFmt.format(Number(n) || 0);
export const int = (n) => intFmt.format(Number(n) || 0);

export function money(n, cur = currency()) {
  return `${numberFmt.format(Number(n) || 0)} ${cur}`;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  const d = new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const time = (v) => (toDate(v) ? timeFmt.format(toDate(v)) : '—');
export const dateTime = (v) => (toDate(v) ? dateTimeFmt.format(toDate(v)) : '—');
export const dayLabel = (v) => (toDate(v) ? dayFmt.format(toDate(v)) : '—');

export function timeAgo(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return '—';
  const sec = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return 'الآن';
  if (abs < 3600) return relFmt.format(Math.round(sec / 60), 'minute');
  if (abs < 86400) return relFmt.format(Math.round(sec / 3600), 'hour');
  return relFmt.format(Math.round(sec / 86400), 'day');
}

// Isolated left-to-right ("4.8 MB"), so RTL text around it cannot flip it.
export function bytes(n) {
  if (!n && n !== 0) return '—';
  let text;
  if (n < 1024 * 1024) text = `${num(Math.max(1, Math.round(n / 1024)))} KB`;
  else if (n < 1024 * 1024 * 1024) text = `${num(Math.round((n / 1024 / 1024) * 10) / 10)} MB`;
  else text = `${num(Math.round((n / 1024 / 1024 / 1024) * 100) / 100)} GB`;
  return `\u2066${text}\u2069`;
}

export function duration(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// YYYY-MM-DD in the browser's time zone.
export function isoDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

// Arabic counted noun: count(25, ['ملف', 'ملفان', 'ملفات', 'ملفاً']) -> '25 ملفاً'.
// forms: [singular, dual, plural (3-10), accusative singular (11+)].
export function count(n, [one, two, few, many]) {
  const v = Math.abs(Math.trunc(Number(n) || 0));
  if (v === 0) return `0 ${few}`;
  if (v === 1) return `${one} واحد`.replace(/ة واحد$/, 'ة واحدة');
  if (v === 2) return two;
  const mod = v % 100;
  return `${int(v)} ${mod >= 3 && mod <= 10 ? few : many}`;
}

export const NOUNS = {
  file: ['ملف', 'ملفان', 'ملفات', 'ملفاً'],
  dish: ['طبق', 'طبقان', 'أطباق', 'طبقاً'],
  category: ['تصنيف', 'تصنيفان', 'تصنيفات', 'تصنيفاً'],
  table: ['طاولة', 'طاولتان', 'طاولات', 'طاولة'],
  order: ['طلب', 'طلبان', 'طلبات', 'طلباً'],
  item: ['صنف', 'صنفان', 'أصناف', 'صنفاً'],
  user: ['مستخدم', 'مستخدمان', 'مستخدمين', 'مستخدماً'],
  projector: ['جهاز عرض', 'جهازا عرض', 'أجهزة عرض', 'جهاز عرض'],
  seat: ['مقعد', 'مقعدان', 'مقاعد', 'مقعداً'],
  image: ['صورة', 'صورتان', 'صور', 'صورة'],
  video: ['فيديو', 'فيديوهان', 'فيديوهات', 'فيديو'],
  model: ['مجسم', 'مجسمان', 'مجسمات', 'مجسماً'],
  section: ['قسم', 'قسمان', 'أقسام', 'قسماً'],
};
