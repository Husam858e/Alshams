// Arabic formatting with Latin digits (easier to read on a busy floor).

import { getState } from './store.js';

const LOCALE = 'ar-u-nu-latn';
const numberFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const relFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const shortDayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'numeric' });

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
export const shortDay = (v) => (toDate(v) ? shortDayFmt.format(toDate(v)) : '—');

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

export function bytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024 * 1024) return `${num(Math.max(1, Math.round(n / 1024)))} KB`;
  if (n < 1024 * 1024 * 1024) return `${num(Math.round((n / 1024 / 1024) * 10) / 10)} MB`;
  return `${num(Math.round((n / 1024 / 1024 / 1024) * 100) / 100)} GB`;
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

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('') || '؟';
