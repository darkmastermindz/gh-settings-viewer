import type { CacheEntry, KeyValueCache } from './types.ts';

export class MemoryCache implements KeyValueCache {
  #map = new Map<string, CacheEntry>();
  #max: number;
  constructor(max = 5000) {
    this.#max = max;
  }
  get(key: string) {
    const v = this.#map.get(key);
    if (v) {
      this.#map.delete(key);
      this.#map.set(key, v); // LRU touch
    }
    return v;
  }
  set(key: string, entry: CacheEntry) {
    this.#map.delete(key);
    this.#map.set(key, entry);
    while (this.#map.size > this.#max) this.#map.delete(this.#map.keys().next().value!);
  }
  delete(key: string) {
    this.#map.delete(key);
  }
  clearPrefix(prefix: string) {
    for (const k of [...this.#map.keys()]) if (k.startsWith(prefix)) this.#map.delete(k);
  }
  close() {
    this.#map.clear();
  }
}
