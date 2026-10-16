// In-memory sliding-window counter (single server process, LAN scale).
export class RateLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map(); // key -> timestamps (ms)
  }

  recent(key, now = Date.now()) {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  isLimited(key) {
    return this.recent(key).length >= this.limit;
  }

  hit(key) {
    const now = Date.now();
    const list = this.recent(key, now);
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 10000) this.prune(now);
    return list.length;
  }

  reset(key) {
    this.hits.delete(key);
  }

  prune(now = Date.now()) {
    for (const key of this.hits.keys()) this.recent(key, now);
  }
}
