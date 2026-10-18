// Subscribers that live in another frame of the same origin (the staff app
// and player iframes call into the page that hosts the backend). Payloads
// are cloned into the subscriber's realm, and a subscriber whose frame was
// closed or navigated away is noticed and dropped. Shared by the offline
// demo and the cloud host.

// The global of the realm a function was created in (a player iframe), so
// payloads can be cloned into it and a closed frame can be noticed.
function realmOf(fn) {
  try {
    return fn.constructor('return globalThis')();
  } catch {
    return null;
  }
}

// A subscriber living in another frame: calls are dropped (and the
// subscription forgotten) once that frame is gone or navigated away.
export function frameTarget(fn) {
  const realm = realmOf(fn);
  let doc;
  try {
    doc = realm?.document;
  } catch {
    doc = undefined;
  }
  return {
    alive() {
      try {
        return !realm || (!realm.closed && realm.document === doc);
      } catch {
        return false;
      }
    },
    clone(value) {
      try {
        return (realm?.structuredClone ?? structuredClone)(value);
      } catch {
        return structuredClone(value);
      }
    },
  };
}

// A target for subscribers of this realm (always alive).
export const sameRealm = Object.freeze({ alive: () => true, clone: (value) => structuredClone(value) });
