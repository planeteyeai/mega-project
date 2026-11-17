interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface ApiCache<T> {
  getFresh: (key: string) => T | null;
  peek: (key: string) => T | null;
  isFresh: (key: string) => boolean;
  set: (key: string, data: T, ttlMs: number) => void;
  clear: () => void;
  getOrFetch: (key: string, ttlMs: number, fetcher: () => Promise<T>) => Promise<T>;
}

const ALL_CACHES = new Set<{ clear: () => void }>();

/** Drop every in-memory API cache (used after admin-name renames). */
export function clearAllApiCaches(): void {
  ALL_CACHES.forEach((cache) => cache.clear());
}

/** In-memory TTL cache with in-flight request deduplication. */
export function createApiCache<T>(): ApiCache<T> {
  const store = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();

  const getFresh = (key: string): T | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) return null;
    return entry.data;
  };

  const peek = (key: string): T | null => store.get(key)?.data ?? null;

  const isFresh = (key: string): boolean => getFresh(key) !== null;

  const set = (key: string, data: T, ttlMs: number) => {
    store.set(key, { data, expiresAt: Date.now() + ttlMs });
  };

  const clear = () => {
    store.clear();
    inflight.clear();
  };

  const getOrFetch = async (key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> => {
    const cached = getFresh(key);
    if (cached) return cached;

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = fetcher()
      .then((data) => {
        set(key, data, ttlMs);
        inflight.delete(key);
        return data;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });

    inflight.set(key, promise);
    return promise;
  };

  const cache = { getFresh, peek, isFresh, set, clear, getOrFetch };
  ALL_CACHES.add(cache);
  return cache;
}
