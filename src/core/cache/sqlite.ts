import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { containsSecret } from '../security/redact.ts';
import type { CacheEntry, KeyValueCache } from './types.ts';

/**
 * SQLite cache file (node:sqlite, built into Node 26). Holds settings responses and ETags.
 * Never tokens, keys, JWTs or request headers: writes that look like a credential are refused.
 */
export class SqliteCache implements KeyValueCache {
  #db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS http_cache (
        key TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        status INTEGER NOT NULL,
        etag TEXT,
        link TEXT,
        data TEXT NOT NULL,
        fetched_at INTEGER NOT NULL
      );
    `);
  }

  get(key: string): CacheEntry | undefined {
    const row = this.#db.prepare('SELECT url, status, etag, link, data, fetched_at FROM http_cache WHERE key = ?').get(key) as
      | { url: string; status: number; etag: string | null; link: string | null; data: string; fetched_at: number }
      | undefined;
    if (!row) return undefined;
    return { url: row.url, status: row.status, etag: row.etag ?? undefined, link: row.link ?? undefined, data: JSON.parse(row.data), fetchedAt: row.fetched_at };
  }

  set(key: string, e: CacheEntry): void {
    const data = JSON.stringify(e.data ?? null);
    if (containsSecret(key) || containsSecret(data) || containsSecret(e.url)) return; // never persist anything token-like
    this.#db
      .prepare('INSERT OR REPLACE INTO http_cache (key, url, status, etag, link, data, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(key, e.url, e.status, e.etag ?? null, e.link ?? null, data, e.fetchedAt);
  }

  delete(key: string): void {
    this.#db.prepare('DELETE FROM http_cache WHERE key = ?').run(key);
  }

  clearPrefix(prefix: string): void {
    this.#db.prepare("DELETE FROM http_cache WHERE substr(key, 1, length(?)) = ?").run(prefix, prefix);
  }

  /** For tests and diagnostics: every stored row as text. */
  dump(): string {
    return JSON.stringify(this.#db.prepare('SELECT * FROM http_cache').all());
  }

  close(): void {
    this.#db.close();
  }
}

/** Memory in front of SQLite. */
export class TieredCache implements KeyValueCache {
  #l1: KeyValueCache;
  #l2: KeyValueCache;
  constructor(l1: KeyValueCache, l2: KeyValueCache) {
    this.#l1 = l1;
    this.#l2 = l2;
  }
  get(key: string) {
    const hit = this.#l1.get(key);
    if (hit) return hit;
    const v = this.#l2.get(key);
    if (v) this.#l1.set(key, v);
    return v;
  }
  set(key: string, e: CacheEntry) {
    this.#l1.set(key, e);
    this.#l2.set(key, e);
  }
  delete(key: string) {
    this.#l1.delete(key);
    this.#l2.delete(key);
  }
  clearPrefix(prefix: string) {
    this.#l1.clearPrefix(prefix);
    this.#l2.clearPrefix(prefix);
  }
  close() {
    this.#l1.close();
    this.#l2.close();
  }
}
