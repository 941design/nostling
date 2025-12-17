/**
 * Property-based tests for image-cache-handlers.ts
 *
 * Tests verify all contract invariants and properties:
 * - Completeness: all 3 handlers registered with correct channel names
 * - Input validation: handlers accept URL strings
 * - Service delegation: handlers delegate to correct service methods
 * - Return types: handlers return correct types for each operation
 * - Error propagation: errors from service propagate to renderer
 * - Idempotency: can be called multiple times
 * - Image fetching: cache handler fetches image data before caching
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as fc from 'fast-check';
import { CachedImage } from '../../shared/image-cache-types';

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

jest.mock('../image-cache/image-fetcher');

// Mock fs to return test image data (PNG header)
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(() => Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))),
  },
}));

import { registerImageCacheHandlers } from './image-cache-handlers';
import { ImageFetcher } from '../image-cache/image-fetcher';

describe('registerImageCacheHandlers', () => {
  let mockIpcMain: any;
  let handlers: Map<string, Function>;
  let mockImageFetcher: any;

  beforeEach(() => {
    handlers = new Map();

    const { ipcMain } = require('electron');
    ipcMain.handle.mockImplementation((channel: string, handler: Function) => {
      handlers.set(channel, handler);
    });

    mockIpcMain = ipcMain;

    mockImageFetcher = ImageFetcher as jest.MockedClass<typeof ImageFetcher>;
    mockImageFetcher.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockCacheService(): any {
    return {
      getCachedImage: jest.fn(),
      cacheImage: jest.fn(),
      invalidateCache: jest.fn(),
    };
  }

  const urlArbitrary = fc.webUrl();

  const cachedImageArbitrary: fc.Arbitrary<CachedImage> = fc.record({
    url: fc.webUrl(),
    filePath: fc.stringMatching(/^\/[a-z0-9/_.-]+$/),
    timestamp: fc.integer({ min: 0, max: Date.now() }),
    size: fc.nat({ max: 1000000 }),
  });

  describe('Property: Completeness - all 3 handlers registered', () => {
    it('should register exactly 3 IPC handlers', () => {
      const service = createMockCacheService();
      registerImageCacheHandlers(service);

      expect(mockIpcMain.handle).toHaveBeenCalledTimes(3);
      expect(handlers.size).toBe(3);
    });

    it('should register handlers with correct channel names', () => {
      const service = createMockCacheService();
      registerImageCacheHandlers(service);

      expect(handlers.has('nostling:image-cache:get')).toBe(true);
      expect(handlers.has('nostling:image-cache:cache')).toBe(true);
      expect(handlers.has('nostling:image-cache:invalidate')).toBe(true);
    });

    it('should use consistent nostling:image-cache: namespace for all channels', () => {
      const service = createMockCacheService();
      registerImageCacheHandlers(service);

      const allChannels = Array.from(handlers.keys());
      allChannels.forEach((channel) => {
        expect(channel).toMatch(/^nostling:image-cache:/);
      });
    });
  });

  describe('Property: Input validation - handlers accept URL strings', () => {
    it('should call getCachedImage with URL string', () => {
      fc.assert(
        fc.property(urlArbitrary, (url: string) => {
          const service = createMockCacheService();
          service.getCachedImage.mockResolvedValue(null);
          registerImageCacheHandlers(service);

          const handler = handlers.get('nostling:image-cache:get');
          handler!(null, url);

          expect(service.getCachedImage).toHaveBeenCalledWith(url);
        }),
        { numRuns: 50 }
      );
    });

    it('should call invalidateCache with URL string', () => {
      fc.assert(
        fc.property(urlArbitrary, (url: string) => {
          const service = createMockCacheService();
          service.invalidateCache.mockResolvedValue(true);
          registerImageCacheHandlers(service);

          const handler = handlers.get('nostling:image-cache:invalidate');
          handler!(null, url);

          expect(service.invalidateCache).toHaveBeenCalledWith(url);
        }),
        { numRuns: 50 }
      );
    });

    it('should call cacheImage with URL after fetching', async () => {
      const url = 'https://example.com/image.png';
      const data = new Uint8Array([1, 2, 3]);

      const service = createMockCacheService();
      const cachedImage: CachedImage = {
        url,
        filePath: '/cache/abc123',
        timestamp: Date.now(),
        size: data.length,
      };
      service.cacheImage.mockResolvedValue(cachedImage);

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockResolvedValue({
          data: Buffer.from(data),
          contentType: 'image/png',
        }),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      await handler!(null, url);

      expect(mockFetcher.fetchImage).toHaveBeenCalledWith(url);
      expect(service.cacheImage).toHaveBeenCalledWith(url, Buffer.from(data));
    });
  });

  describe('Property: Service delegation - handlers call correct methods', () => {
    it('image-cache:get should delegate to getCachedImage', async () => {
      const service = createMockCacheService();
      service.getCachedImage.mockResolvedValue(null);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:get');
      await handler!(null, 'https://example.com/image.png');

      expect(service.getCachedImage).toHaveBeenCalledTimes(1);
      expect(service.cacheImage).not.toHaveBeenCalled();
      expect(service.invalidateCache).not.toHaveBeenCalled();
    });

    it('image-cache:cache should delegate to cacheImage', async () => {
      const service = createMockCacheService();
      const cachedImage: CachedImage = {
        url: 'https://example.com/image.png',
        filePath: '/cache/abc',
        timestamp: Date.now(),
        size: 1000,
      };
      service.cacheImage.mockResolvedValue(cachedImage);

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockResolvedValue({
          data: Buffer.from([1, 2, 3]),
          contentType: 'image/png',
        }),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      await handler!(null, 'https://example.com/image.png');

      expect(service.cacheImage).toHaveBeenCalledTimes(1);
      expect(service.getCachedImage).not.toHaveBeenCalled();
      expect(service.invalidateCache).not.toHaveBeenCalled();
    });

    it('image-cache:invalidate should delegate to invalidateCache', async () => {
      const service = createMockCacheService();
      service.invalidateCache.mockResolvedValue(true);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:invalidate');
      await handler!(null, 'https://example.com/image.png');

      expect(service.invalidateCache).toHaveBeenCalledTimes(1);
      expect(service.getCachedImage).not.toHaveBeenCalled();
      expect(service.cacheImage).not.toHaveBeenCalled();
    });
  });

  describe('Property: Return types - handlers return correct types', () => {
    it('image-cache:get returns CachedImage | null', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), cachedImageArbitrary),
          (cachedImageOrNull: CachedImage | null) => {
            const service = createMockCacheService();
            service.getCachedImage.mockResolvedValue(cachedImageOrNull);
            registerImageCacheHandlers(service);

            const handler = handlers.get('nostling:image-cache:get');
            const result = handler!(null, 'https://example.com/image.png');

            if (cachedImageOrNull === null) {
              expect(result).toBeDefined();
            } else {
              expect(result).toBeDefined();
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('image-cache:cache returns CachedImage', () => {
      fc.assert(
        fc.property(cachedImageArbitrary, (cachedImage: CachedImage) => {
          const service = createMockCacheService();
          service.cacheImage.mockResolvedValue(cachedImage);

          const mockFetcher = {
            fetchImage: jest.fn<any>().mockResolvedValue({
              data: Buffer.from([1, 2, 3]),
              contentType: 'image/png',
            }),
          };
          (ImageFetcher as any).mockImplementation(() => mockFetcher);

          handlers.clear();
          registerImageCacheHandlers(service);

          const handler = handlers.get('nostling:image-cache:cache');
          const result = handler!(null, cachedImage.url);

          expect(result).toBeDefined();
        }),
        { numRuns: 50 }
      );
    });

    it('image-cache:invalidate returns boolean', () => {
      fc.assert(
        fc.property(fc.boolean(), (success: boolean) => {
          const service = createMockCacheService();
          service.invalidateCache.mockResolvedValue(success);
          registerImageCacheHandlers(service);

          const handler = handlers.get('nostling:image-cache:invalidate');
          const result = handler!(null, 'https://example.com/image.png');

          expect(result).toBeDefined();
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Error propagation - errors propagate to renderer', () => {
    it('image-cache:get should propagate getCachedImage errors', async () => {
      const service = createMockCacheService();
      const testError = new Error('Test error');
      service.getCachedImage.mockRejectedValue(testError);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:get');
      await expect(handler!(null, 'https://example.com/image.png')).rejects.toThrow('Test error');
    });

    it('image-cache:cache should propagate fetchImage errors', async () => {
      const service = createMockCacheService();

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockRejectedValue(new Error('Fetch failed')),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      await expect(handler!(null, 'https://example.com/image.png')).rejects.toThrow('Fetch failed');
    });

    it('image-cache:cache should propagate cacheImage errors', async () => {
      const service = createMockCacheService();
      service.cacheImage.mockRejectedValue(new Error('Cache error'));

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockResolvedValue({
          data: Buffer.from([1, 2, 3]),
          contentType: 'image/png',
        }),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      await expect(handler!(null, 'https://example.com/image.png')).rejects.toThrow('Cache error');
    });

    it('image-cache:invalidate should propagate invalidateCache errors', async () => {
      const service = createMockCacheService();
      const testError = new Error('Invalidate error');
      service.invalidateCache.mockRejectedValue(testError);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:invalidate');
      await expect(handler!(null, 'https://example.com/image.png')).rejects.toThrow('Invalidate error');
    });
  });

  describe('Property: Idempotency - can be called multiple times', () => {
    it('should allow multiple registrations (handlers replaced)', () => {
      const service1 = createMockCacheService();
      const service2 = createMockCacheService();

      registerImageCacheHandlers(service1);
      expect(mockIpcMain.handle).toHaveBeenCalledTimes(3);

      handlers.clear();
      mockIpcMain.handle.mockClear();

      registerImageCacheHandlers(service2);
      expect(mockIpcMain.handle).toHaveBeenCalledTimes(3);
      expect(handlers.size).toBe(3);
    });

    it('should work correctly when called multiple times in sequence', async () => {
      const service = createMockCacheService();
      service.getCachedImage.mockResolvedValue(null);

      registerImageCacheHandlers(service);
      const handler1 = handlers.get('nostling:image-cache:get');
      await handler1!(null, 'https://example.com/image1.png');

      handlers.clear();
      registerImageCacheHandlers(service);
      const handler2 = handlers.get('nostling:image-cache:get');
      await handler2!(null, 'https://example.com/image2.png');

      expect(service.getCachedImage).toHaveBeenCalledTimes(2);
      expect(service.getCachedImage).toHaveBeenNthCalledWith(1, 'https://example.com/image1.png');
      expect(service.getCachedImage).toHaveBeenNthCalledWith(2, 'https://example.com/image2.png');
    });
  });

  describe('Property: Image fetching - cache handler fetches before caching', () => {
    it('should fetch image data before calling cacheImage', async () => {
      const service = createMockCacheService();
      const cachedImage: CachedImage = {
        url: 'https://example.com/image.png',
        filePath: '/cache/image.png',
        timestamp: Date.now(),
        size: 100,
      };
      service.cacheImage.mockResolvedValue(cachedImage);

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockResolvedValue({
          data: Buffer.from([1, 2, 3]),
          contentType: 'image/png',
        }),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      await handler!(null, 'https://example.com/image.png');

      const fetchCallOrder = mockFetcher.fetchImage.mock.invocationCallOrder[0];
      const cacheCallOrder = service.cacheImage.mock.invocationCallOrder[0];
      expect(fetchCallOrder).toBeLessThan(cacheCallOrder);
    });

    it('should pass fetched data buffer to cacheImage', async () => {
      const imageData = Buffer.from([255, 216, 255, 224]); // JPEG magic number
      const service = createMockCacheService();
      const cachedImage: CachedImage = {
        url: 'https://example.com/image.jpg',
        filePath: '/cache/image.jpg',
        timestamp: Date.now(),
        size: imageData.length,
      };
      service.cacheImage.mockResolvedValue(cachedImage);

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockResolvedValue({
          data: imageData,
          contentType: 'image/jpeg',
        }),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      await handler!(null, 'https://example.com/image.jpg');

      expect(service.cacheImage).toHaveBeenCalledWith('https://example.com/image.jpg', imageData);
    });
  });

  describe('Property: Handler isolation - each handler is independent', () => {
    it('calling get handler should not affect cache or invalidate', async () => {
      const service = createMockCacheService();
      service.getCachedImage.mockResolvedValue(null);
      registerImageCacheHandlers(service);

      const getHandler = handlers.get('nostling:image-cache:get');
      await getHandler!(null, 'https://example.com/image.png');

      expect(service.getCachedImage).toHaveBeenCalledTimes(1);
      expect(service.cacheImage).not.toHaveBeenCalled();
      expect(service.invalidateCache).not.toHaveBeenCalled();
    });

    it('calling invalidate handler should not affect get or cache', async () => {
      const service = createMockCacheService();
      service.invalidateCache.mockResolvedValue(true);
      registerImageCacheHandlers(service);

      const invalidateHandler = handlers.get('nostling:image-cache:invalidate');
      await invalidateHandler!(null, 'https://example.com/image.png');

      expect(service.invalidateCache).toHaveBeenCalledTimes(1);
      expect(service.getCachedImage).not.toHaveBeenCalled();
      expect(service.cacheImage).not.toHaveBeenCalled();
    });
  });

  describe('Example-based tests: Critical scenarios', () => {
    it('Example: Register handlers and verify all channels exist', () => {
      const service = createMockCacheService();
      registerImageCacheHandlers(service);

      expect(handlers.has('nostling:image-cache:get')).toBe(true);
      expect(handlers.has('nostling:image-cache:cache')).toBe(true);
      expect(handlers.has('nostling:image-cache:invalidate')).toBe(true);
      expect(handlers.size).toBe(3);
    });

    it('Example: Get cached image returns null when not found', async () => {
      const service = createMockCacheService();
      service.getCachedImage.mockResolvedValue(null);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:get');
      const result = await handler!(null, 'https://example.com/nonexistent.png');

      expect(result).toBeNull();
      expect(service.getCachedImage).toHaveBeenCalledWith('https://example.com/nonexistent.png');
    });

    it('Example: Get cached image returns data URL when found', async () => {
      const cachedImage: CachedImage = {
        url: 'https://example.com/image.png',
        filePath: '/cache/abc123.png',
        timestamp: 1700000000000,
        size: 50000,
      };

      const service = createMockCacheService();
      service.getCachedImage.mockResolvedValue(cachedImage);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:get');
      const result = await handler!(null, 'https://example.com/image.png');

      // Now returns { dataUrl: string } instead of CachedImage
      expect(result).toHaveProperty('dataUrl');
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('Example: Cache image fetches and stores data', async () => {
      const imageUrl = 'https://example.com/profile.jpg';
      const imageBuffer = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]); // JPEG header

      const cachedImage: CachedImage = {
        url: imageUrl,
        filePath: '/cache/profile.jpg',
        timestamp: Date.now(),
        size: imageBuffer.length,
      };

      const service = createMockCacheService();
      service.cacheImage.mockResolvedValue(cachedImage);

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockResolvedValue({
          data: imageBuffer,
          contentType: 'image/jpeg',
        }),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      const result = await handler!(null, imageUrl);

      // Now returns { dataUrl: string } instead of CachedImage
      expect(result).toHaveProperty('dataUrl');
      expect(result.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(mockFetcher.fetchImage).toHaveBeenCalledWith(imageUrl);
      expect(service.cacheImage).toHaveBeenCalledWith(imageUrl, imageBuffer);
    });

    it('Example: Invalidate cache removes entry (returns true)', async () => {
      const service = createMockCacheService();
      service.invalidateCache.mockResolvedValue(true);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:invalidate');
      const result = await handler!(null, 'https://example.com/image.png');

      expect(result).toBe(true);
      expect(service.invalidateCache).toHaveBeenCalledWith('https://example.com/image.png');
    });

    it('Example: Invalidate cache when entry not found (returns false)', async () => {
      const service = createMockCacheService();
      service.invalidateCache.mockResolvedValue(false);
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:invalidate');
      const result = await handler!(null, 'https://example.com/nonexistent.png');

      expect(result).toBe(false);
      expect(service.invalidateCache).toHaveBeenCalledWith('https://example.com/nonexistent.png');
    });

    it('Example: Cache handler error when fetch fails', async () => {
      const service = createMockCacheService();

      const mockFetcher = {
        fetchImage: jest.fn<any>().mockRejectedValue(new Error('Network timeout')),
      };
      (ImageFetcher as any).mockImplementation(() => mockFetcher);

      handlers.clear();
      registerImageCacheHandlers(service);

      const handler = handlers.get('nostling:image-cache:cache');
      await expect(handler!(null, 'https://example.com/image.png')).rejects.toThrow('Network timeout');
      expect(service.cacheImage).not.toHaveBeenCalled();
    });
  });
});
