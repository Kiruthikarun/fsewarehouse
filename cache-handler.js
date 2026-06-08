// Custom in-memory cache handler for Next.js (App Router).
//
// WHY THIS EXISTS:
// Next.js's default data cache silently DROPS any entry larger than 2MB
// ("Failed to set Next.js data cache ... items over 2MB can not be cached").
// Our analytics caches exceed that — the dashboard payload carries ~10k stock
// rows (~2.3MB) and the movements item-options list is ~3.3MB — so every
// `unstable_cache` write failed and each request re-ran the BigQuery queries
// (~2.6s+). This handler has NO size cap and keeps entries in process memory for
// the life of the instance, so repeat views are served from cache.
//
// The Cloud Run service is pinned to a single instance (min/max=1), so an
// in-memory store is sufficient and shared across all requests. For multi-instance
// scaling, swap the Map for a shared store (e.g. Memorystore/Redis) so the cache
// stays coherent across instances. Tag support is kept so revalidateTag()
// (used by revalidateLive on every write) still invalidates entries immediately.

const cache = new Map(); // key -> { value, lastModified, tags }
const MAX_ENTRIES = 256; // bound memory; key space is small (org × range × warehouse)

module.exports = class InMemoryCacheHandler {
  constructor(options) {
    this.options = options;
  }

  async get(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    // Touch for LRU ordering.
    cache.delete(key);
    cache.set(key, entry);
    return { value: entry.value, lastModified: entry.lastModified };
  }

  async set(key, value, ctx) {
    cache.set(key, {
      value,
      lastModified: Date.now(),
      tags: (ctx && ctx.tags) || [],
    });
    if (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  // Invalidate every entry carrying any of the given tag(s). Next may pass a
  // single tag or an array.
  async revalidateTag(tags) {
    const list = Array.isArray(tags) ? tags : [tags];
    for (const [key, entry] of cache) {
      if (entry.tags && entry.tags.some((t) => list.includes(t))) {
        cache.delete(key);
      }
    }
  }
};
