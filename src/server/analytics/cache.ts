type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>) {
  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) return existing.value as T;
  const value = await load();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function clearAnalyticsCache() {
  cache.clear();
}
