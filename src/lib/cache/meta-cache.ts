/**
 * Simple in-memory cache for Meta API responses
 * Reduces API calls by caching campaigns, adsets, etc.
 */

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>()

  /**
   * Store data in cache with TTL
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttlMs - Time to live in milliseconds (default: 5 minutes)
   */
  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    })
  }

  /**
   * Get data from cache if not expired
   * @param key - Cache key
   * @returns Cached data or null if expired/not found
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Invalidate cache entries
   * @param pattern - If provided, only invalidate keys containing this pattern
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    const keysToDelete: string[] = []
    this.cache.forEach((_, key) => {
      if (key.includes(pattern)) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach(key => this.cache.delete(key))
  }

  /**
   * Get cache stats for debugging
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }
}

// Singleton instance
export const metaCache = new SimpleCache()

// Cache key generators
export const CACHE_KEYS = {
  campaigns: 'meta:campaigns',
  adsets: 'meta:adsets',
  adsetsByCampaign: (campaignId: string) => `meta:adsets:campaign:${campaignId}`,
  adsetById: (adsetId: string) => `meta:adset:${adsetId}`,
  insights: (adId: string, dateRange: string) => `meta:insights:${adId}:${dateRange}`,
  videoThumbnail: (videoId: string) => `meta:video:thumbnail:${videoId}`,
  imageThumbnail: (hash: string) => `meta:image:thumbnail:${hash}`,
}

// TTL constants
export const CACHE_TTL = {
  campaigns: 5 * 60 * 1000,        // 5 minutes
  adsets: 5 * 60 * 1000,           // 5 minutes
  insights: 15 * 60 * 1000,        // 15 minutes (insights don't change often)
  videoThumbnail: 60 * 60 * 1000,  // 1 hour (thumbnails rarely change)
  imageThumbnail: 60 * 60 * 1000,  // 1 hour
}
