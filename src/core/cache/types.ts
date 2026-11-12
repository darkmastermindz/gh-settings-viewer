export interface CacheEntry {
  /** Response body (settings data only: secrets endpoints return names and dates, never values). */
  data: unknown;
  etag?: string;
  /** Link header, kept so a 304 page can still paginate. */
  link?: string;
  status: number;
  url: string;
  fetchedAt: number;
}

export interface KeyValueCache {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
  delete(key: string): void;
  /** Removes every key with this prefix. */
  clearPrefix(prefix: string): void;
  close(): void;
}
