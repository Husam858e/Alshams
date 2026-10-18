// A live replica of the restaurant's Firestore data in the shape of the
// demo backend's state `s`, so the demo's route handlers run on it
// unchanged. See "Rules of the replica" in docs/cloud-architecture.md.
//
//   Firestore ──onSnapshot──► mirror (raw docs) ──fromDoc──► s ──► onChange(events)
//   handler(s) ──diff before/after──► one batch of set/update/delete ──► Firestore
//
// The mirror is the truth: `s` may run ahead of it only between a request's
// writes and their (immediate, local) snapshot. A request that throws is
// rolled back from a JSON snapshot of `s`; a commit the server rejects
// rebuilds `s` from the mirror (Firestore reverts its cache and reports the
// server's version).

import { deleteField, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { COMMIT_WAIT_MS, SPECS, putRow, removeRow, rowsOf, spec } from './schema.js';
import { httpErrorOf } from './firebase.js';
import { NeedIds } from './ids.js';

const MAX_BATCH = 450; // Firestore allows 500 writes per batch
const MAX_ATTEMPTS = 5;

const sleep = (ms) => {
  let timer;
  const promise = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
};

const json = (value) => JSON.stringify(value ?? null);

// options:
//   db, s, ids                Firestore, the state to keep, the id pools
//   hidden(key, data)         true: keep the doc in the mirror only (pending projectors)
//   decorate(key, row)        adds derived fields (a projector's `online`)
//   extraWrites(key, change)  writes that go with a row's change (e.g. roles of a user)
//   onChange(key, changes, {initial, fromCache})  after snapshots were applied
//   isOnline()                whether to wait for the server to accept writes
//   onLateFailure(err)        writes rejected after the request had answered
export function createReplica({ db, s, ids = null, hidden = () => false, decorate = (_key, row) => row, extraWrites = () => [], onChange = () => {}, isOnline = () => true, onLateFailure = () => {} }) {
  const mirror = new Map(SPECS.map((sp) => [sp.key, new Map()])); // key -> docId -> {data, sources}
  const sources = new Map(); // name -> {off, loaded}
  let stopped = false;

  const rowOf = (sp, id, data) => decorate(sp.key, sp.fromDoc(id, data));

  // One document's new state from one listener (data null: gone from it).
  function apply(sp, source, id, data) {
    const docs = mirror.get(sp.key);
    const prev = docs.get(id) ?? null;
    if (data === null) {
      if (!prev) return null;
      prev.sources.delete(source);
      if (prev.sources.size) return null; // still matched by another listener
      docs.delete(id);
      removeRow(sp, s, id);
      return { id, before: prev.data, after: null };
    }
    docs.set(id, { data, sources: new Set([...(prev?.sources ?? []), source]) });
    if (hidden(sp.key, data)) removeRow(sp, s, id);
    else putRow(sp, s, id, rowOf(sp, id, data));
    return { id, before: prev?.data ?? null, after: data };
  }

  // Starts a listener on a query or a document reference. -> Promise (first snapshot)
  function listen(name, key, ref, { onError } = {}) {
    unlisten(name);
    const sp = spec(key);
    const entry = { off: null, loaded: false };
    let firstResolve;
    entry.first = new Promise((resolve) => {
      firstResolve = resolve;
    });
    const isDoc = ref.type === 'document';
    entry.off = onSnapshot(
      ref,
      (snap) => {
        if (stopped || sources.get(name) !== entry) return;
        const changes = [];
        if (isDoc) changes.push(apply(sp, name, snap.id, snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null));
        else for (const ch of snap.docChanges()) changes.push(apply(sp, name, ch.doc.id, ch.type === 'removed' ? null : ch.doc.data({ serverTimestamps: 'estimate' })));
        const initial = !entry.loaded;
        entry.loaded = true;
        firstResolve(snap);
        onChange(key, changes.filter(Boolean), { initial, fromCache: snap.metadata.fromCache, source: name, snap });
      },
      (err) => {
        firstResolve(null);
        if (!stopped) onError?.(err);
      },
    );
    sources.set(name, entry);
    return entry.first;
  }

  // Stops a listener and forgets what only it had brought in.
  function unlisten(name) {
    const entry = sources.get(name);
    if (!entry) return;
    entry.off();
    sources.delete(name);
    for (const sp of SPECS) {
      for (const [id, item] of [...mirror.get(sp.key)]) {
        if (!item.sources.delete(name) || item.sources.size) continue;
        mirror.get(sp.key).delete(id);
        removeRow(sp, s, id);
      }
    }
  }

  function stop() {
    stopped = true;
    for (const name of [...sources.keys()]) {
      sources.get(name).off();
      sources.delete(name);
    }
  }

  const raw = (key, id) => mirror.get(key).get(String(id))?.data ?? null;
  const rawAll = (key) => [...mirror.get(key)].map(([id, item]) => ({ id, data: item.data }));

  // ── Writes ─────────────────────────────────────────────────────

  // JSON of every row (outbox kinds start empty), to diff or roll back.
  function snapshot() {
    return new Map(SPECS.map((sp) => [sp.key, new Map([...rowsOf(sp, s)].map(([id, row]) => [id, json(row)]))]));
  }

  function restore(before) {
    for (const sp of SPECS) {
      const prev = before.get(sp.key);
      const now = rowsOf(sp, s);
      const same = now.size === prev.size && [...now].every(([id, row]) => prev.get(id) === json(row));
      if (same) continue;
      if (sp.shape === 'list') s[sp.key] = [...prev.values()].map((j) => JSON.parse(j));
      else if (sp.shape === 'map') s.scenes = new Map([...prev].map(([id, j]) => [Number(id), JSON.parse(j)]));
      else for (const [id, j] of prev) s.settings[id] = JSON.parse(j);
    }
  }

  // Rows changed since `before` -> [{op, path:[collection, id], data}]
  function diff(before) {
    const writes = [];
    for (const sp of SPECS) {
      const prev = before.get(sp.key);
      const now = rowsOf(sp, s);
      for (const [id, row] of now) {
        const was = prev.get(id);
        const text = json(row);
        if (was === text) continue;
        const beforeRow = was === undefined ? null : JSON.parse(was);
        if (beforeRow === null) writes.push({ op: 'set', path: [sp.path, id], data: sp.toDoc(row) });
        else {
          const a = sp.toDoc(beforeRow);
          const b = sp.toDoc(row);
          const fields = {};
          for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (json(a[k]) !== json(b[k])) fields[k] = k in b ? (b[k] ?? null) : deleteField();
          }
          if (Object.keys(fields).length) writes.push({ op: 'update', path: [sp.path, id], data: fields });
        }
        writes.push(...extraWrites(sp.key, { id, before: beforeRow, after: row }));
      }
      for (const [id, was] of prev) {
        if (now.has(id)) continue;
        writes.push({ op: 'delete', path: [sp.path, id] });
        writes.push(...extraWrites(sp.key, { id, before: JSON.parse(was), after: null }));
      }
    }
    return writes;
  }

  // Outbox rows (activity) are written, never kept.
  const clearOutbox = () => {
    for (const sp of SPECS) if (sp.outbox) s[sp.key] = [];
  };

  // Rebuilds `s` from the mirror (after the server rejected writes).
  function resync() {
    for (const sp of SPECS) {
      if (sp.outbox) continue;
      if (sp.shape === 'list') s[sp.key] = [];
      else if (sp.shape === 'map') s.scenes = new Map();
      for (const [id, item] of mirror.get(sp.key)) {
        if (sp.shape === 'object' || !hidden(sp.key, item.data)) putRow(sp, s, id, rowOf(sp, id, item.data));
      }
    }
  }

  function batchesOf(writes) {
    const batches = [];
    for (let i = 0; i < writes.length; i += MAX_BATCH) {
      const batch = writeBatch(db);
      for (const w of writes.slice(i, i + MAX_BATCH)) {
        const ref = doc(db, ...w.path);
        if (w.op === 'set') batch.set(ref, w.data);
        else if (w.op === 'update') batch.update(ref, w.data);
        else batch.delete(ref);
      }
      batches.push(batch);
    }
    return batches;
  }

  // Commits; waits (a few seconds, and only when online) for the server so
  // a rejected write answers the request with its error. Offline, the
  // writes stay queued in the local cache and sync later.
  async function commit(writes) {
    const all = Promise.all(batchesOf(writes).map((b) => b.commit()));
    const late = (err) => {
      console.error('cloud: writes rejected by Firestore', err);
      resync();
      onLateFailure(err);
    };
    if (!isOnline()) {
      all.catch(late);
      return;
    }
    const wait = sleep(COMMIT_WAIT_MS);
    const outcome = await Promise.race([all.then(() => null, (err) => err), wait.promise.then(() => 'pending')]);
    wait.cancel();
    if (outcome === 'pending') all.catch(late);
    else if (outcome) {
      resync();
      throw httpErrorOf(outcome);
    }
  }

  // Runs a synchronous handler on `s` and commits what it changed (plus the
  // writes it pushed to `extra`). -> the handler's result
  async function mutate(fn) {
    for (let attempt = 1; ; attempt++) {
      const before = snapshot();
      const saved = ids?.checkpoint();
      const extra = [];
      let out;
      try {
        out = fn(extra);
        if (out && typeof out.then === 'function') throw new Error('cloud: a mutating handler must be synchronous');
      } catch (err) {
        restore(before);
        clearOutbox();
        if (saved) ids.rewind(saved);
        if (err instanceof NeedIds && attempt < MAX_ATTEMPTS) {
          await ids.reserve(err.kind);
          continue;
        }
        throw err;
      }
      const writes = [...diff(before), ...extra];
      clearOutbox();
      if (writes.length) await commit(writes);
      ids?.refill();
      return out;
    }
  }

  return {
    listen,
    unlisten,
    stop,
    mutate,
    commit,
    resync,
    raw,
    rawAll,
    loaded: (name) => Boolean(sources.get(name)?.loaded),
    first: (name) => sources.get(name)?.first ?? Promise.resolve(null),
  };
}
