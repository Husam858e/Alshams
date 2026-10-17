// Small timing hooks. Every copy of a scene (layout 'dual' renders two)
// derives its state from the same scene start time, so both halves of the
// table always show the same page at the same moment.

import { useEffect, useState } from 'preact/hooks';

// Index of the current page when `count` pages rotate every `ms` since `start`.
export function usePager(start, ms, count) {
  const [, setTick] = useState(0);
  const cycle = Math.max(0, Math.floor((Date.now() - start) / ms));
  const index = count > 1 ? cycle % count : 0;
  useEffect(() => {
    if (count <= 1) return undefined;
    const delay = ms - ((Date.now() - start) % ms) + 30;
    const timer = setTimeout(() => setTick((n) => n + 1), delay);
    return () => clearTimeout(timer);
  }, [cycle, start, ms, count]);
  return index;
}

// True once `ms` have passed since `start`.
export function useAfter(start, ms) {
  const [, setTick] = useState(0);
  const done = Date.now() - start >= ms;
  useEffect(() => {
    if (done) return undefined;
    const timer = setTimeout(() => setTick((n) => n + 1), start + ms - Date.now() + 30);
    return () => clearTimeout(timer);
  }, [start, ms, done]);
  return done;
}
