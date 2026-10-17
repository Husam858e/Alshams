// Small shared hooks.

import { useCallback, useEffect, useState } from 'preact/hooks';

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
