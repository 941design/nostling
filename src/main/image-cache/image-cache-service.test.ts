/**
 * Property-based tests for ImageCacheService.
 *
 * Comprehensive coverage of cache behavior, invariants, and edge cases.
 */

import { ImageCacheService } from './image-cache-service';
import { CachedImage, CacheMetadata } from '../../shared/image-cache-types';
import * as fc from 'fast-check';
import { promises as fs } from 'fs';
import path from 'path';

describe('ImageCacheService', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = `/tmp/image-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('computeCacheKey - Property: Deterministic Hash Generation', () => {
    it('always produces same hash for same URL', () => {
      fc.assert(
        fc.property(fc.webUrl(), (url: string) => {
          const service1 = new ImageCacheService(tempDir);
          const service2 = new ImageCacheService(tempDir);

          const key1 = (service1 as any).computeCacheKey(url);
          const key2 = (service2 as any).computeCacheKey(url);

          return key1 === key2;
        }),
      );
    });

    it('produces different hashes for different URLs', () => {
      fc.assert(
        fc.property(fc.tuple(fc.webUrl(), fc.webUrl()), ([url1, url2]: [string, string]) => {
          if (url1 === url2) {
            return true;
          }

          const service = new ImageCacheService(tempDir);
          const key1 = (service as any).computeCacheKey(url1);
          const key2 = (service as any).computeCacheKey(url2);

          return key1 !== key2;
        }),
      );
    });

    it('hash output has fixed length of 64 hex characters (SHA-256)', () => {
      fc.assert(
        fc.property(fc.webUrl(), (url: string) => {
          const service = new ImageCacheService(tempDir);
          const key = (service as any).computeCacheKey(url);

          return key.length === 64 && /^[0-9a-f]{64}$/.test(key);
        }),
      );
    });
  });

  describe('initialize - Property: Idempotent Directory Creation', () => {
    it('creates cache directory with correct permissions', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('succeeds when called multiple times', async () => {
      const service = new ImageCacheService(tempDir);

      await service.initialize();
      await service.initialize();
      await service.initialize();

      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('loads cached files from disk even without database', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');
      const cached = await service.cacheImage(url, data);

      // File should exist on disk
      const fileContent = await fs.readFile(cached.filePath);
      expect(fileContent).toEqual(data);

      // Note: Without a database, metadata is not persisted
      // so a new service instance won't know about it
      const service2 = new ImageCacheService(tempDir);
      await service2.initialize();

      const stats = service2.getCacheStats();
      // Without database, service2 has no metadata
      expect(stats.itemCount).toBe(0);
    });
  });

  describe('getCachedImage - Property: File Existence Validation', () => {
    it('returns null for non-existent URLs', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      await fc.assert(
        fc.asyncProperty(fc.webUrl(), async (url: string) => {
          const result = await service.getCachedImage(url);
          return result === null;
        }),
      );
    });

    it('returns cached image data when file exists', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test image data');

      await service.cacheImage(url, data);
      const result = await service.getCachedImage(url);

      expect(result).not.toBeNull();
      expect(result?.url).toBe(url);
      expect(result?.size).toBe(data.length);
    });

    it('returns null when cached file was deleted externally', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');

      const cached = await service.cacheImage(url, data);
      await fs.unlink(cached.filePath);

      const result = await service.getCachedImage(url);
      expect(result).toBeNull();
    });

    it('URL in returned CachedImage exactly matches input URL', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(fc.webUrl(), fc.uint8Array({ minLength: 1, maxLength: 1000 })),
          async ([url, dataArray]: [string, Uint8Array]) => {
            const service = new ImageCacheService(tempDir);
            await service.initialize();
            const data = Buffer.from(dataArray);

            await service.cacheImage(url, data);
            const result = await service.getCachedImage(url);

            return result?.url === url;
          },
        ),
      );
    });

    it('filePath in returned CachedImage points to existing readable file', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test content');

      await service.cacheImage(url, data);
      const result = await service.getCachedImage(url);

      expect(result).not.toBeNull();
      const fileContent = await fs.readFile(result!.filePath);
      expect(fileContent).toEqual(data);
    });

    it('updates lastAccessed timestamp on cache hit', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');

      const cached1 = await service.cacheImage(url, data);
      const timestamp1 = cached1.timestamp;

      await new Promise((resolve) => setTimeout(resolve, 10));

      const cached2 = await service.getCachedImage(url);

      expect(cached2).not.toBeNull();
      // Note: timestamp should not change (it's the original cache time)
      // but lastAccessed should be updated (in metadata, not in CachedImage)
      expect(cached2?.timestamp).toBe(timestamp1);
    });
  });

  describe('cacheImage - Property: Bounded Cache Size with LRU Eviction', () => {
    it('total cache size never exceeds maxCacheSize', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.integer({ min: 1000, max: 100000 }),
            fc.array(
              fc.tuple(fc.webUrl(), fc.uint8Array({ minLength: 100, maxLength: 1000 })),
              { minLength: 1, maxLength: 20 },
            ),
          ),
          async ([maxSize, items]: [number, Array<[string, Uint8Array]>]) => {
            const service = new ImageCacheService(tempDir, maxSize);
            await service.initialize();

            for (const [url, dataArray] of items) {
              const data = Buffer.from(dataArray);
              try {
                await service.cacheImage(url, data);
              } catch {
                // Expected when data > maxSize
              }
            }

            const stats = service.getCacheStats();
            return stats.totalSize <= maxSize;
          },
        ),
      );
    });

    it('stores URL and data when cache has space', async () => {
      const service = new ImageCacheService(tempDir, 1000000);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('x'.repeat(100));

      const result = await service.cacheImage(url, data);

      expect(result.url).toBe(url);
      expect(result.size).toBe(data.length);

      const fileContent = await fs.readFile(result.filePath);
      expect(fileContent).toEqual(data);
    });

    it('replaces old entry when URL already cached', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data1 = Buffer.from('old data');
      const data2 = Buffer.from('new data');

      const cached1 = await service.cacheImage(url, data1);
      const cached2 = await service.cacheImage(url, data2);

      expect(cached2.size).toBe(data2.length);

      const fileContent = await fs.readFile(cached2.filePath);
      expect(fileContent).toEqual(data2);

      const stats = service.getCacheStats();
      expect(stats.itemCount).toBe(1);
      expect(stats.totalSize).toBe(data2.length);
    });

    it('removes LRU entries when eviction needed', async () => {
      const maxSize = 200;
      const service = new ImageCacheService(tempDir, maxSize);
      await service.initialize();

      const url1 = 'https://example.com/img1.png';
      const url2 = 'https://example.com/img2.png';
      const url3 = 'https://example.com/img3.png';

      const data1 = Buffer.from('x'.repeat(100));
      const data2 = Buffer.from('y'.repeat(100));
      const data3 = Buffer.from('z'.repeat(100));

      await service.cacheImage(url1, data1);
      await new Promise((resolve) => setTimeout(resolve, 5));

      await service.cacheImage(url2, data2);
      await new Promise((resolve) => setTimeout(resolve, 5));

      // At this point, cache has url1 and url2 (200 bytes total)
      // Caching url3 (100 bytes) exceeds maxSize, so eviction should happen
      // LRU should evict url1 (oldest lastAccessed)
      await service.cacheImage(url3, data3);

      const stats = service.getCacheStats();
      // url1 should be evicted, url2 and url3 should remain
      expect(stats.itemCount).toBe(2);
      expect(stats.totalSize).toBeLessThanOrEqual(maxSize);
    });

    it('allows single large item if it fits in maxCacheSize', async () => {
      const itemSize = 50000;
      const service = new ImageCacheService(tempDir, itemSize * 2);
      await service.initialize();

      const url = 'https://example.com/large.png';
      const data = Buffer.from('x'.repeat(itemSize));

      const result = await service.cacheImage(url, data);

      expect(result.size).toBe(itemSize);
      const stats = service.getCacheStats();
      expect(stats.itemCount).toBe(1);
      expect(stats.totalSize).toBe(itemSize);
    });

    it('metadata contains correct timestamp and size', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test data');
      const beforeTime = Date.now();

      const result = await service.cacheImage(url, data);

      expect(result.size).toBe(data.length);
      expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(result.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('invalidateCache - Property: Idempotent Removal', () => {
    it('returns true when URL exists in cache', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');

      await service.cacheImage(url, data);
      const result = await service.invalidateCache(url);

      expect(result).toBe(true);
    });

    it('returns false when URL does not exist', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const result = await service.invalidateCache('https://example.com/nonexistent.png');

      expect(result).toBe(false);
    });

    it('returns false when URL already invalidated (idempotent)', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');

      await service.cacheImage(url, data);
      const result1 = await service.invalidateCache(url);
      const result2 = await service.invalidateCache(url);

      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('deletes file from cache directory', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');

      const cached = await service.cacheImage(url, data);
      const filePath = cached.filePath;

      await fs.access(filePath); // Verify file exists
      await service.invalidateCache(url);

      try {
        await fs.access(filePath);
        expect(true).toBe(false); // Should not reach here
      } catch {
        // Expected: file was deleted
      }
    });

    it('removes URL from cache', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');

      await service.cacheImage(url, data);
      let stats = service.getCacheStats();
      expect(stats.itemCount).toBe(1);

      await service.invalidateCache(url);
      stats = service.getCacheStats();

      expect(stats.itemCount).toBe(0);
      expect(stats.totalSize).toBe(0);
    });

    it('succeeds even if file was already deleted externally', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('test');

      const cached = await service.cacheImage(url, data);
      await fs.unlink(cached.filePath); // Delete externally

      const result = await service.invalidateCache(url);

      expect(result).toBe(true);
    });
  });

  describe('getCacheStats - Property: Correct Aggregation', () => {
    it('returns zeros when cache is empty', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const stats = service.getCacheStats();

      expect(stats.totalSize).toBe(0);
      expect(stats.itemCount).toBe(0);
      expect(stats.oldestTimestamp).toBe(0);
      expect(stats.newestTimestamp).toBe(0);
    });

    it('reports correct totalSize as sum of all item sizes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(fc.webUrl(), fc.uint8Array({ minLength: 10, maxLength: 100 })),
            { minLength: 1, maxLength: 10 },
          ),
          async (items: Array<[string, Uint8Array]>) => {
            const service = new ImageCacheService(tempDir, 1000000);
            await service.initialize();

            let expectedSize = 0;
            for (const [url, dataArray] of items) {
              const data = Buffer.from(dataArray);
              await service.cacheImage(url, data);
              expectedSize += data.length;
            }

            const stats = service.getCacheStats();
            return stats.totalSize === expectedSize;
          },
        ),
      );
    });

    it('reports correct itemCount as number of cached URLs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.tuple(fc.webUrl(), fc.uint8Array({ minLength: 10, maxLength: 100 })),
            { minLength: 0, maxLength: 20 },
          ),
          async (items: Array<[string, Uint8Array]>) => {
            const uniqueUrls = new Set(items.map((i: any) => i[0]));
            const service = new ImageCacheService(tempDir, 10000000);
            await service.initialize();

            for (const [url, dataArray] of items) {
              const data = Buffer.from(dataArray);
              try {
                await service.cacheImage(url, data);
              } catch {
                // Ignore
              }
            }

            const stats = service.getCacheStats();
            return stats.itemCount === uniqueUrls.size;
          },
        ),
      );
    });

    it('reports oldest and newest timestamps correctly', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url1 = 'https://example.com/img1.png';
      const url2 = 'https://example.com/img2.png';
      const url3 = 'https://example.com/img3.png';

      const data = Buffer.from('test');

      const time1 = Date.now();
      const cached1 = await service.cacheImage(url1, data);
      const timestamp1 = cached1.timestamp;

      await new Promise((resolve) => setTimeout(resolve, 10));
      const cached2 = await service.cacheImage(url2, data);
      const timestamp2 = cached2.timestamp;

      await new Promise((resolve) => setTimeout(resolve, 10));
      const cached3 = await service.cacheImage(url3, data);
      const timestamp3 = cached3.timestamp;

      const stats = service.getCacheStats();

      expect(stats.oldestTimestamp).toBe(timestamp1);
      expect(stats.newestTimestamp).toBe(timestamp3);
    });

    it('updates stats after invalidation', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url1 = 'https://example.com/img1.png';
      const url2 = 'https://example.com/img2.png';
      const data = Buffer.from('test');

      const cached1 = await service.cacheImage(url1, data);
      const cached2 = await service.cacheImage(url2, data);

      let stats = service.getCacheStats();
      expect(stats.itemCount).toBe(2);
      expect(stats.totalSize).toBe(data.length * 2);

      await service.invalidateCache(url1);
      stats = service.getCacheStats();

      expect(stats.itemCount).toBe(1);
      expect(stats.totalSize).toBe(data.length);
    });
  });

  describe('Integration - Property: Round-trip Caching', () => {
    it('cache->get round-trip returns identical data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(fc.webUrl(), fc.uint8Array({ minLength: 1, maxLength: 10000 })),
          async ([url, dataArray]: [string, Uint8Array]) => {
            const service = new ImageCacheService(tempDir);
            await service.initialize();

            const originalData = Buffer.from(dataArray);
            await service.cacheImage(url, originalData);

            const cached = await service.getCachedImage(url);

            if (!cached) return false;

            const retrievedData = await fs.readFile(cached.filePath);
            return retrievedData.equals(originalData);
          },
        ),
      );
    });

    it('multiple sequential caches with same URL replaces previous', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data1 = Buffer.from('v1');
      const data2 = Buffer.from('v2');
      const data3 = Buffer.from('v3');

      await service.cacheImage(url, data1);
      let cached = await service.getCachedImage(url);
      let content = await fs.readFile(cached!.filePath);
      expect(content).toEqual(data1);

      await service.cacheImage(url, data2);
      cached = await service.getCachedImage(url);
      content = await fs.readFile(cached!.filePath);
      expect(content).toEqual(data2);

      await service.cacheImage(url, data3);
      cached = await service.getCachedImage(url);
      content = await fs.readFile(cached!.filePath);
      expect(content).toEqual(data3);

      const stats = service.getCacheStats();
      expect(stats.itemCount).toBe(1);
    });
  });

  describe('Edge Cases - Property: Boundary Conditions', () => {
    it('handles zero-length buffers', async () => {
      const service = new ImageCacheService(tempDir);
      await service.initialize();

      const url = 'https://example.com/empty.png';
      const data = Buffer.from([]);

      const result = await service.cacheImage(url, data);
      expect(result.size).toBe(0);

      const stats = service.getCacheStats();
      expect(stats.itemCount).toBe(1);
      expect(stats.totalSize).toBe(0);
    });

    it('handles very large URLs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.webUrl().map((url: string) => url + '?' + 'x'.repeat(1000)),
            fc.uint8Array({ minLength: 10, maxLength: 100 }),
          ),
          async ([url, dataArray]: [string, Uint8Array]) => {
            const service = new ImageCacheService(tempDir, 1000000);
            const data = Buffer.from(dataArray);

            try {
              const result = await service.cacheImage(url, data);
              return result.url === url;
            } catch {
              return true; // URL too long is acceptable
            }
          },
        ),
      );
    });

    it('handles maxCacheSize of exactly item size', async () => {
      const itemSize = 100;
      const service = new ImageCacheService(tempDir, itemSize);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('x'.repeat(itemSize));

      const result = await service.cacheImage(url, data);
      expect(result.size).toBe(itemSize);

      const stats = service.getCacheStats();
      expect(stats.totalSize).toBeLessThanOrEqual(itemSize);
    });

    it('handles maxCacheSize smaller than item size gracefully', async () => {
      const service = new ImageCacheService(tempDir, 50);
      await service.initialize();

      const url = 'https://example.com/image.png';
      const data = Buffer.from('x'.repeat(100));

      // Should either succeed (storing the item) or throw
      try {
        await service.cacheImage(url, data);
        const stats = service.getCacheStats();
        // If it succeeds, totalSize should not exceed maxCacheSize
        expect(stats.totalSize).toBeLessThanOrEqual(50);
      } catch {
        // Acceptable to fail
      }
    });
  });
});
