/**
 * Integration test for image cache IPC flow.
 *
 * Tests the full cache flow crossing IPC boundary from preload to handlers to service.
 * This test catches channel prefix mismatches that unit tests cannot detect.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ipcMain } from 'electron';
import { registerImageCacheHandlers } from '../ipc/image-cache-handlers';
import { ImageCacheService } from './image-cache-service';
import type { CachedImage } from '../../shared/image-cache-types';

// Mock electron's ipcMain
const mockHandlers = new Map<string, Function>();

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn((channel: string, handler: Function) => {
      mockHandlers.set(channel, handler);
    }),
  },
}));

// Mock ImageFetcher to avoid network requests
const mockFetchImage = jest.fn();
// @ts-ignore - Mock type compatibility
mockFetchImage.mockResolvedValue({
  data: Buffer.from([255, 216, 255, 224]), // JPEG header
  contentType: 'image/jpeg',
});

jest.mock('./image-fetcher', () => ({
  ImageFetcher: class {
    fetchImage = mockFetchImage;
  },
}));

// Mock fs to return test image data (handlers now convert file to data URL)
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(() => Promise.resolve(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))),
  },
}));

describe('Image Cache IPC Integration', () => {
  let mockService: any;

  beforeEach(() => {
    mockHandlers.clear();

    // Create mock service
    mockService = {
      getCachedImage: jest.fn(),
      cacheImage: jest.fn(),
      invalidateCache: jest.fn(),
    };

    // Register handlers (this should register with nostling:image-cache:* prefix)
    registerImageCacheHandlers(mockService);
  });

  describe('IPC Channel Prefix Correctness', () => {
    it('should register handlers with nostling:image-cache: prefix matching preload expectations', () => {
      // Verify all three handlers are registered with correct prefix
      expect(mockHandlers.has('nostling:image-cache:get')).toBe(true);
      expect(mockHandlers.has('nostling:image-cache:cache')).toBe(true);
      expect(mockHandlers.has('nostling:image-cache:invalidate')).toBe(true);

      // Verify old prefix (image-cache:*) is NOT registered
      expect(mockHandlers.has('image-cache:get')).toBe(false);
      expect(mockHandlers.has('image-cache:cache')).toBe(false);
      expect(mockHandlers.has('image-cache:invalidate')).toBe(false);
    });

    it('should invoke service methods when IPC handlers are called', async () => {
      const testUrl = 'https://example.com/avatar.png';
      const cachedImage: CachedImage = {
        url: testUrl,
        filePath: '/cache/avatar.png',
        timestamp: Date.now(),
        size: 1024,
      };

      mockService.getCachedImage.mockResolvedValue(cachedImage);

      // Simulate IPC call from renderer
      const handler = mockHandlers.get('nostling:image-cache:get');
      expect(handler).toBeDefined();

      const result = await handler!(null, testUrl);

      // Verify service method was called
      expect(mockService.getCachedImage).toHaveBeenCalledWith(testUrl);
      // Handler now returns { dataUrl: string } instead of CachedImage
      expect(result).toHaveProperty('dataUrl');
      expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('Property: End-to-end cache flow maintains invariants', () => {
    it('should preserve dataUrl format through cache -> get flow', async () => {
      const testUrl = 'https://example.com/profile.jpg';
      const cachedImage: CachedImage = {
        url: testUrl,
        filePath: '/cache/profile.jpg',
        timestamp: Date.now(),
        size: 2048,
      };

      mockService.cacheImage.mockResolvedValue(cachedImage);
      mockService.getCachedImage.mockResolvedValue(cachedImage);

      // Cache image via IPC
      const cacheHandler = mockHandlers.get('nostling:image-cache:cache');
      const cacheResult = await cacheHandler!(null, testUrl);

      // Handler returns { dataUrl: string }
      expect(cacheResult).toHaveProperty('dataUrl');
      expect(cacheResult.dataUrl).toMatch(/^data:image\//);

      // Retrieve via IPC
      const getHandler = mockHandlers.get('nostling:image-cache:get');
      const getResult = await getHandler!(null, testUrl);

      expect(getResult).toHaveProperty('dataUrl');
      expect(getResult.dataUrl).toMatch(/^data:image\//);
    });

    it('should maintain cache invalidation semantics across IPC boundary', async () => {
      const testUrl = 'https://example.com/old-avatar.png';

      mockService.invalidateCache.mockResolvedValue(true);
      mockService.getCachedImage.mockResolvedValue(null);

      // Invalidate via IPC
      const invalidateHandler = mockHandlers.get('nostling:image-cache:invalidate');
      const invalidateResult = await invalidateHandler!(null, testUrl);

      expect(invalidateResult).toBe(true);
      expect(mockService.invalidateCache).toHaveBeenCalledWith(testUrl);

      // Verify cache miss after invalidation
      const getHandler = mockHandlers.get('nostling:image-cache:get');
      const getResult = await getHandler!(null, testUrl);

      expect(getResult).toBeNull();
    });
  });

  describe('Property: Concurrency safety across IPC calls', () => {
    it('should handle concurrent IPC requests without race conditions', async () => {
      const urls = [
        'https://example.com/avatar1.png',
        'https://example.com/avatar2.png',
        'https://example.com/avatar3.png',
      ];

      // Mock service returns URL-specific results
      mockService.cacheImage.mockImplementation((url: string, data: Buffer) =>
        Promise.resolve({
          url,
          filePath: `/cache/${url.split('/').pop()}`,
          timestamp: Date.now(),
          size: data.length,
        })
      );

      const cacheHandler = mockHandlers.get('nostling:image-cache:cache');

      // Concurrent cache requests
      const results = await Promise.all(
        urls.map(url => cacheHandler!(null, url))
      );

      // Verify all URLs were processed correctly
      expect(results.length).toBe(3);
      results.forEach((result) => {
        // Handler returns { dataUrl: string } now
        expect(result).toHaveProperty('dataUrl');
        expect(result.dataUrl).toMatch(/^data:image\//);
      });

      // Verify service was called for each URL
      expect(mockService.cacheImage).toHaveBeenCalledTimes(3);
    });
  });
});
