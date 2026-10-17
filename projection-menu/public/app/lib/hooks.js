// Small shared hooks.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

export function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mql = matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, [query]);
  return matches;
}

// 'phone' < 760px <= 'tablet' < 1360px <= 'desktop'
export function useViewport() {
  const phone = useMedia('(max-width: 759.98px)');
  const desktop = useMedia('(min-width: 1360px)');
  return phone ? 'phone' : desktop ? 'desktop' : 'tablet';
}

// Re-render every `ms` (relative times, countdowns).
export function useNow(ms = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// [run, busy]: run(...args) awaits fn and tracks a busy flag (ignores re-entry).
export function useBusy(fn) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async (...args) => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await fnRef.current(...args);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);
  return [run, busy];
}

export function useDebounced(value, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Per-device UI preference (remembered filters etc.); never required to work.
export function useLocalPref(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(`pm-app:${key}`);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(`pm-app:${key}`, JSON.stringify(next));
      } catch {
        // storage disabled
      }
    },
    [key],
  );
  return [value, set];
}
