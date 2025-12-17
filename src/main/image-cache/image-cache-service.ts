/**
 * Image cache service for persistent disk-based caching with LRU eviction.
 *
 * This service manages a local cache of images from remote URLs to:
 * - Enable offline access to profile images
 * - Improve loading performance
 * - Track URL changes for cache invalidation
 */

import { CachedImage, CacheMetadata, CacheStats } from '../../shared/image-cache-types';
import { CacheDatabase } from './cache-database';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Simple async mutex for serializing cache operations.
 * Ensures only one operation runs at a time to prevent race conditions.
 */
class AsyncMutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

export class ImageCacheService {
  private readonly cacheDir: string;
  private readonly maxCacheSize: number;
  private cacheMetadata: Map<string, CacheMetadata>;
  private db: any;
  private mutex: AsyncMutex;

  constructor(cacheDir: string, maxCacheSize: number = 100 * 1024 * 1024, db?: any) {
    this.cacheDir = cacheDir;
    this.maxCacheSize = maxCacheSize;
    this.cacheMetadata = new Map();
    this.db = db;
    this.mutex = new AsyncMutex();
  }

  /**
   * Initialize the cache service.
   *
   * CONTRACT:
   *   Inputs:
   *     - this: ImageCacheService instance with cacheDir and maxCacheSize configured
   *
   *   Outputs:
   *     - Promise resolving to void when initialization complete
   *
   *   Invariants:
   *     - After initialization, cacheDir exists as a directory
   *     - After initialization, cacheMetadata is populated from database
   *     - Cache directory permissions are user-read/write only (not world-readable)
   *
   *   Properties:
   *     - Idempotent: calling initialize multiple times has same effect as once
   *     - Side effects: creates directory if not exists, loads metadata from DB
   *
   *   Algorithm:
   *     1. Check if cacheDir exists
   *     2. If not, create directory with appropriate permissions (0700)
   *     3. Load cache metadata from database into memory Map
   *     4. If database metadata missing or corrupted, initialize empty cache
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { mode: 0o700, recursive: true });
    } catch (error) {
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }

    if (this.db) {
      await CacheDatabase.initializeSchema(this.db);
      const metadata = await CacheDatabase.loadAll(this.db);
      this.cacheMetadata.clear();
      for (const item of metadata) {
        this.cacheMetadata.set(item.url, item);
      }
    }
  }

  /**
   * Get cached image data for a URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - url: string, valid HTTP/HTTPS URL
   *
   *   Outputs:
   *     - Promise<CachedImage | null>:
   *       - CachedImage if URL is cached and file exists
   *       - null if URL not in cache or cached file missing
   *
   *   Invariants:
   *     - If returned, CachedImage.filePath points to existing readable file
   *     - If returned, CachedImage.url exactly matches input url
   *     - lastAccessed timestamp updated in metadata if cache hit
   *
   *   Properties:
   *     - Deterministic: same URL returns same result until cache changes
   *     - Side effects: updates lastAccessed timestamp on cache hit
   *     - File existence validation: checks file exists before returning
   *
   *   Algorithm:
   *     1. Compute cache key from URL (SHA-256 hash)
   *     2. Look up cache key in metadata Map
   *     3. If found, verify file exists at filePath
   *     4. If file exists, update lastAccessed timestamp
   *     5. Return CachedImage with metadata
   *     6. If not found or file missing, return null
   */
  async getCachedImage(url: string): Promise<CachedImage | null> {
    return this.mutex.run(async () => {
      const cacheKey = this.computeCacheKey(url);
      const metadata = this.cacheMetadata.get(url);

      if (!metadata) {
        return null;
      }

      try {
        await fs.access(metadata.filePath);
      } catch {
        return null;
      }

      if (this.db) {
        const now = Date.now();
        await CacheDatabase.updateLastAccessed(this.db, url, now);
        metadata.lastAccessed = now;
      }

      return {
        url: metadata.url,
        filePath: metadata.filePath,
        timestamp: metadata.timestamp,
        size: metadata.size,
      };
    });
  }

  /**
   * Cache an image from a URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - url: string, valid HTTP/HTTPS URL to fetch
   *     - data: Buffer, image data to cache (already fetched)
   *
   *   Outputs:
   *     - Promise<CachedImage>: metadata for newly cached image
   *
   *   Invariants:
   *     - After completion, url is in cache with provided data
   *     - After completion, file exists at returned filePath
   *     - Total cache size ≤ maxCacheSize after eviction
   *     - If URL already cached, old entry is replaced (invalidated)
   *
   *   Properties:
   *     - Cache size bounded: enforces maxCacheSize via LRU eviction
   *     - Atomic operation: either fully succeeds or fails without partial state
   *     - LRU eviction: removes least recently accessed items until size ≤ maxCacheSize
   *
   *   Algorithm:
   *     1. Compute cache key from URL (SHA-256 hash)
   *     2. Compute file path: cacheDir + cache key + extension from URL
   *     3. Check if total cache size + data.length > maxCacheSize
   *     4. If over limit, evict LRU items until space available:
   *        a. Sort metadata by lastAccessed ascending
   *        b. Remove oldest items until totalSize + data.length ≤ maxCacheSize
   *        c. Delete files and database entries for evicted items
   *     5. If URL already exists in cache, delete old file (invalidation)
   *     6. Write data to file path
   *     7. Create/update metadata: {url, filePath, timestamp: now, size: data.length, lastAccessed: now}
   *     8. Store metadata in database
   *     9. Update in-memory Map
   *    10. Return CachedImage
   */
  async cacheImage(url: string, data: Buffer): Promise<CachedImage> {
    return this.mutex.run(async () => {
      const cacheKey = this.computeCacheKey(url);
      const fileExtension = this.getExtensionFromUrl(url);
      const filePath = path.join(this.cacheDir, `${cacheKey}${fileExtension}`);

      let currentTotalSize = 0;
      for (const metadata of this.cacheMetadata.values()) {
        currentTotalSize += metadata.size;
      }

      const newTotalSize = currentTotalSize + data.length;

      if (newTotalSize > this.maxCacheSize) {
        await this.evictLRU(this.maxCacheSize - data.length);
      }

      const existingMetadata = this.cacheMetadata.get(url);
      if (existingMetadata) {
        try {
          await fs.unlink(existingMetadata.filePath);
        } catch {
          // Ignore error if file doesn't exist
        }
      }

      await fs.writeFile(filePath, data, { mode: 0o600 });

      const now = Date.now();
      const metadata: CacheMetadata = {
        url,
        filePath,
        timestamp: now,
        size: data.length,
        lastAccessed: now,
      };

      if (this.db) {
        await CacheDatabase.store(this.db, metadata);
      }

      this.cacheMetadata.set(url, metadata);

      return {
        url: metadata.url,
        filePath: metadata.filePath,
        timestamp: metadata.timestamp,
        size: metadata.size,
      };
    });
  }

  private async evictLRU(targetSize: number): Promise<void> {
    const entries = Array.from(this.cacheMetadata.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    let currentSize = 0;
    for (const metadata of this.cacheMetadata.values()) {
      currentSize += metadata.size;
    }

    for (const [url, metadata] of entries) {
      if (currentSize <= targetSize) {
        break;
      }

      try {
        await fs.unlink(metadata.filePath);
      } catch {
        // Ignore error if file doesn't exist
      }

      if (this.db) {
        await CacheDatabase.delete(this.db, url);
      }

      this.cacheMetadata.delete(url);
      currentSize -= metadata.size;
    }
  }

  private getExtensionFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const ext = path.extname(pathname);
      if (ext && ext.length > 0 && ext.length <= 5) {
        return ext;
      }
    } catch {
      // Ignore parse errors
    }
    return '.img';
  }

  /**
   * Invalidate (remove) cached image for a URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - url: string, URL to invalidate
   *
   *   Outputs:
   *     - Promise<boolean>: true if entry was removed, false if not found
   *
   *   Invariants:
   *     - After completion, url is not in cache
   *     - After completion, cached file (if existed) is deleted
   *     - After completion, metadata removed from database and memory
   *
   *   Properties:
   *     - Idempotent: invalidating non-existent URL succeeds (returns false)
   *     - Side effects: deletes file, removes database row, updates Map
   *
   *   Algorithm:
   *     1. Compute cache key from URL
   *     2. Look up metadata in Map
   *     3. If not found, return false
   *     4. Delete file at filePath (ignore error if missing)
   *     5. Delete metadata from database
   *     6. Delete from in-memory Map
   *     7. Return true
   */
  async invalidateCache(url: string): Promise<boolean> {
    return this.mutex.run(async () => {
      const metadata = this.cacheMetadata.get(url);

      if (!metadata) {
        return false;
      }

      try {
        await fs.unlink(metadata.filePath);
      } catch {
        // Ignore error if file doesn't exist
      }

      if (this.db) {
        await CacheDatabase.delete(this.db, url);
      }

      this.cacheMetadata.delete(url);

      return true;
    });
  }

  /**
   * Get cache statistics.
   *
   * CONTRACT:
   *   Inputs:
   *     - this: ImageCacheService instance
   *
   *   Outputs:
   *     - CacheStats: current cache statistics
   *
   *   Invariants:
   *     - totalSize ≤ maxCacheSize (enforced by cacheImage)
   *     - itemCount equals size of metadata Map
   *     - If itemCount = 0, oldestTimestamp and newestTimestamp are 0
   *
   *   Properties:
   *     - Read-only: no side effects
   *     - Snapshot in time: reflects state at call time
   *
   *   Algorithm:
   *     1. Sum size field across all metadata entries
   *     2. Count metadata entries
   *     3. Find min and max timestamp values
   *     4. Return CacheStats object
   */
  getCacheStats(): CacheStats {
    let totalSize = 0;
    let oldestTimestamp = 0;
    let newestTimestamp = 0;

    if (this.cacheMetadata.size > 0) {
      const timestamps: number[] = [];
      for (const metadata of this.cacheMetadata.values()) {
        totalSize += metadata.size;
        timestamps.push(metadata.timestamp);
      }
      oldestTimestamp = Math.min(...timestamps);
      newestTimestamp = Math.max(...timestamps);
    }

    return {
      totalSize,
      itemCount: this.cacheMetadata.size,
      oldestTimestamp,
      newestTimestamp,
    };
  }

  /**
   * Compute cache key from URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - url: string, arbitrary URL
   *
   *   Outputs:
   *     - string: SHA-256 hash of URL in hexadecimal format
   *
   *   Invariants:
   *     - Output is deterministic: same URL always produces same hash
   *     - Output is valid filename (alphanumeric hex)
   *     - Output prevents path traversal attacks
   *
   *   Properties:
   *     - Deterministic: hash(url1) = hash(url2) ⟺ url1 = url2
   *     - Collision resistant: different URLs produce different hashes (with high probability)
   *     - Fixed length: all outputs are same length (64 hex chars)
   *
   *   Algorithm:
   *     1. Create SHA-256 hash instance
   *     2. Update hash with URL string
   *     3. Compute digest
   *     4. Convert to hexadecimal string
   */
  private computeCacheKey(url: string): string {
    return createHash('sha256').update(url).digest('hex');
  }
}
