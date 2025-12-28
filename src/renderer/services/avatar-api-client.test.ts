import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import * as fc from 'fast-check';
import { AvatarApiClient } from './avatar-api-client';
import type { AvatarVocabulary, AvatarSearchResponse } from '../components/AvatarBrowserModal/types';
import type { AvatarSearchParams } from '../../shared/types';

// Mock window.api for IPC calls
const mockAvatarApi = {
  fetchVocabulary: jest.fn(),
  search: jest.fn(),
};

// Create a mock window object
const mockWindow = {
  api: {
    nostling: {
      avatarApi: mockAvatarApi,
    },
  },
};

describe('AvatarApiClient', () => {
  let client: AvatarApiClient;

  beforeAll(() => {
    // Set up global window mock before all tests
    (global as unknown as { window: typeof mockWindow }).window = mockWindow;
  });

  afterAll(() => {
    // Clean up global window mock after all tests
    delete (global as unknown as { window?: typeof mockWindow }).window;
  });

  beforeEach(() => {
    client = new AvatarApiClient();
    jest.clearAllMocks();
  });

  describe('constructFullUrl', () => {
    it('concatenates base URL with relative path', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => '/' + s),
          (relativePath) => {
            const result = client.constructFullUrl(relativePath);
            expect(result).toBe(`https://wp10665333.server-he.de${relativePath}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('produces valid HTTPS URLs', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => '/' + s),
          (relativePath) => {
            const result = client.constructFullUrl(relativePath);
            expect(result).toMatch(/^https:\/\//);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('is idempotent for same input', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => '/' + s),
          (relativePath) => {
            const result1 = client.constructFullUrl(relativePath);
            const result2 = client.constructFullUrl(relativePath);
            expect(result1).toBe(result2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('is reversible', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).map(s => '/' + s),
          (relativePath) => {
            const fullUrl = client.constructFullUrl(relativePath);
            const extractedPath = fullUrl.replace('https://wp10665333.server-he.de', '');
            expect(extractedPath).toBe(relativePath);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('fetchVocabulary', () => {
    it('returns object with string array values', async () => {
      const mockVocabulary: AvatarVocabulary = {
        subject: ['cat', 'dog'],
        color: ['red', 'blue']
      };

      mockAvatarApi.fetchVocabulary.mockResolvedValue(mockVocabulary);

      const result = await client.fetchVocabulary();

      expect(typeof result).toBe('object');
      Object.values(result).forEach(value => {
        expect(Array.isArray(value)).toBe(true);
        value.forEach(item => expect(typeof item).toBe('string'));
      });
    });

    it('throws error on IPC failure', async () => {
      mockAvatarApi.fetchVocabulary.mockRejectedValue(new Error('Network error fetching vocabulary'));

      await expect(client.fetchVocabulary()).rejects.toThrow('Network error fetching vocabulary');
    });

    it('throws error on non-200 status (from main process)', async () => {
      mockAvatarApi.fetchVocabulary.mockRejectedValue(new Error('Failed to fetch vocabulary: HTTP 500'));

      await expect(client.fetchVocabulary()).rejects.toThrow('Failed to fetch vocabulary: HTTP 500');
    });

    it('throws error on timeout (from main process)', async () => {
      mockAvatarApi.fetchVocabulary.mockRejectedValue(new Error('Request timeout fetching vocabulary'));

      await expect(client.fetchVocabulary()).rejects.toThrow('Request timeout fetching vocabulary');
    });

    it('throws error on invalid JSON structure (from main process)', async () => {
      mockAvatarApi.fetchVocabulary.mockRejectedValue(new Error('Invalid vocabulary response format'));

      await expect(client.fetchVocabulary()).rejects.toThrow('Invalid vocabulary response format');
    });

    it('is idempotent for multiple calls', async () => {
      const mockVocabulary: AvatarVocabulary = {
        subject: ['cat', 'dog']
      };

      mockAvatarApi.fetchVocabulary.mockResolvedValue(mockVocabulary);

      const result1 = await client.fetchVocabulary();
      const result2 = await client.fetchVocabulary();

      expect(result1).toEqual(result2);
    });
  });

  describe('searchAvatars', () => {
    it('throws error for invalid limit', async () => {
      const invalidLimits = [0, -1, 501, 1000];

      for (const limit of invalidLimits) {
        await expect(client.searchAvatars('', limit, 0)).rejects.toThrow('Limit must be between 1 and 500');
      }
    });

    it('throws error for negative offset', async () => {
      fc.assert(
        fc.asyncProperty(
          fc.integer({ max: -1 }),
          async (offset) => {
            await expect(client.searchAvatars('', 20, offset)).rejects.toThrow('Offset must be non-negative');
          }
        ),
        { numRuns: 50 }
      );
    });

    it('returns items count less than or equal to limit', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 500 }),
          fc.integer({ min: 0, max: 1000 }),
          async (limit, itemCount) => {
            const actualItemCount = Math.min(itemCount, limit);
            const mockResponse: AvatarSearchResponse = {
              items: Array.from({ length: actualItemCount }, (_, i) => ({ url: `/avatar-${i}.png` })),
              limit,
              offset: 0
            };

            mockAvatarApi.search.mockResolvedValue(mockResponse);

            const result = await client.searchAvatars('', limit, 0);
            expect(result.items.length).toBeLessThanOrEqual(limit);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('passes correct parameters to IPC', async () => {
      mockAvatarApi.search.mockResolvedValue({ items: [], limit: 20, offset: 40 });

      await client.searchAvatars('cat', 20, 40);

      expect(mockAvatarApi.search).toHaveBeenCalledWith({
        subjectFilter: 'cat',
        limit: 20,
        offset: 40,
      } as AvatarSearchParams);
    });

    it('passes empty filter to IPC when filter is empty', async () => {
      mockAvatarApi.search.mockResolvedValue({ items: [], limit: 20, offset: 0 });

      await client.searchAvatars('', 20, 0);

      expect(mockAvatarApi.search).toHaveBeenCalledWith({
        subjectFilter: '',
        limit: 20,
        offset: 0,
      } as AvatarSearchParams);
    });

    it('throws error on IPC failure', async () => {
      mockAvatarApi.search.mockRejectedValue(new Error('Network error searching avatars'));

      await expect(client.searchAvatars('', 20, 0)).rejects.toThrow('Network error searching avatars');
    });

    it('throws error on timeout (from main process)', async () => {
      mockAvatarApi.search.mockRejectedValue(new Error('Request timeout searching avatars'));

      await expect(client.searchAvatars('', 20, 0)).rejects.toThrow('Request timeout searching avatars');
    });

    it('throws error with API message on 400 status (from main process)', async () => {
      mockAvatarApi.search.mockRejectedValue(new Error('Invalid query: Unknown filter key: foo'));

      await expect(client.searchAvatars('', 20, 0)).rejects.toThrow('Invalid query: Unknown filter key: foo');
    });

    it('throws error on 500 status (from main process)', async () => {
      mockAvatarApi.search.mockRejectedValue(new Error('Server error searching avatars'));

      await expect(client.searchAvatars('', 20, 0)).rejects.toThrow('Server error searching avatars');
    });

    it('throws error on unexpected status (from main process)', async () => {
      mockAvatarApi.search.mockRejectedValue(new Error('Unexpected response: HTTP 503'));

      await expect(client.searchAvatars('', 20, 0)).rejects.toThrow('Unexpected response: HTTP 503');
    });

    it('throws error on invalid response structure (from main process)', async () => {
      mockAvatarApi.search.mockRejectedValue(new Error('Invalid search response format'));

      await expect(client.searchAvatars('', 20, 0)).rejects.toThrow('Invalid search response format');
    });

    it('returns valid search response structure', async () => {
      const mockResponse: AvatarSearchResponse = {
        items: [{ url: '/test.png' }],
        limit: 30,
        offset: 10
      };

      mockAvatarApi.search.mockResolvedValue(mockResponse);

      const result = await client.searchAvatars('cat', 30, 10);

      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.limit).toBe('number');
      expect(typeof result.offset).toBe('number');
      expect(result.limit).toBe(30);
      expect(result.offset).toBe(10);
    });

    it('accepts empty results as valid response', async () => {
      const mockResponse: AvatarSearchResponse = {
        items: [],
        limit: 20,
        offset: 0
      };

      mockAvatarApi.search.mockResolvedValue(mockResponse);

      const result = await client.searchAvatars('', 20, 0);
      expect(result.items).toEqual([]);
    });

    it('is deterministic for same parameters', async () => {
      const mockResponse: AvatarSearchResponse = {
        items: [{ url: '/test1.png' }, { url: '/test2.png' }],
        limit: 20,
        offset: 0
      };

      mockAvatarApi.search.mockResolvedValue(mockResponse);

      const result1 = await client.searchAvatars('cat', 20, 0);
      const result2 = await client.searchAvatars('cat', 20, 0);

      expect(result1).toEqual(result2);
      expect(mockAvatarApi.search).toHaveBeenCalledTimes(2);
    });
  });
});
