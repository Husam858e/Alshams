// Positive integer ids, unique across every device of the restaurant: one
// counter per kind in meta/counters, advanced in a transaction. A device
// keeps the ids it reserved in a small pool; a request that needs an id the
// pool does not hold throws NeedIds, the replica rolls the request back,
// reserves, and runs it again (see replica.mutate).
//
// Most kinds are reserved one at a time (ids stay dense); activity rows come
// in batches (almost every request logs one), and one spare order number is
// kept so a waiter can still take an order while the internet is down.

import { doc, runTransaction } from 'firebase/firestore';
import { withTimeout } from './firebase.js';

const BATCH = { activity: 10 }; // reserved per transaction (default 1)
const SPARE = { order: 1 }; // kept in the pool ahead of need
const RESERVE_TIMEOUT_MS = 10000;

export class NeedIds extends Error {
  constructor(kind) {
    super(`no reserved id for ${kind}`);
    this.kind = kind;
  }
}

// wantsSpare(kind): whether this device keeps spares of `kind` now (a
// designer never takes orders; nobody reserves while offline).
export function createIds(db, { wantsSpare = () => true } = {}) {
  const pools = new Map(); // kind -> [id, ...]
  const inflight = new Map(); // kind -> Promise
  const ref = doc(db, 'meta', 'counters');

  const pool = (kind) => {
    if (!pools.has(kind)) pools.set(kind, []);
    return pools.get(kind);
  };

  // Synchronous, for the route handlers (s.nextId).
  function next(kind) {
    const ids = pool(kind);
    if (!ids.length) throw new NeedIds(kind);
    return ids.shift();
  }

  // Ids handed out during a request that then failed go back to the pool.
  const checkpoint = () => new Map([...pools].map(([k, v]) => [k, [...v]]));
  const rewind = (saved) => {
    pools.clear();
    for (const [k, v] of saved) pools.set(k, v);
  };

  // Adds `count` ids of `kind` to the pool (one transaction).
  function reserve(kind, count = (BATCH[kind] ?? 1) + (SPARE[kind] ?? 0)) {
    if (inflight.has(kind)) return inflight.get(kind);
    const run = withTimeout(
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const last = Number(snap.data()?.[kind] ?? 0);
        tx.update(ref, { [kind]: last + count });
        return last;
      }),
      RESERVE_TIMEOUT_MS,
      'تعذّر حجز رقم جديد لأن الاتصال بالإنترنت مقطوع. أعد المحاولة عند عودة الاتصال.',
    )
      .then((last) => {
        const ids = pool(kind);
        for (let id = last + 1; id <= last + count; id++) ids.push(id);
      })
      .finally(() => inflight.delete(kind));
    inflight.set(kind, run);
    return run;
  }

  // For code outside a handler that needs an id up front (uploads).
  async function take(kind) {
    if (!pool(kind).length) await reserve(kind, 1);
    return next(kind);
  }

  // After a request: refill the spares in the background (when online).
  function refill() {
    for (const [kind, spare] of Object.entries(SPARE)) {
      if (pool(kind).length < spare && !inflight.has(kind) && wantsSpare(kind)) reserve(kind, spare).catch(() => {});
    }
  }

  return { next, checkpoint, rewind, reserve, take, refill };
}
