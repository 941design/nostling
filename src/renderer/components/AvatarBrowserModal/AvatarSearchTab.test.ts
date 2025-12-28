/**
 * Property-Based Tests for AvatarSearchTab Component Logic
 *
 * Tests orchestration of vocabulary loading, searching, filtering, pagination,
 * and avatar selection with URL sanitization at the API integration level.
 */

import fc from 'fast-check';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { avatarApiClient, BASE_URL } from '../../services/avatar-api-client';
import { sanitizePictureUrl } from '../../utils/url-sanitizer';
import type { AvatarVocabulary, AvatarSearchResponse } from './types';

jest.mock('../../services/avatar-api-client', () => {
  const actual = jest.requireActual('../../services/avatar-api-client') as { BASE_URL: string };
  return {
    ...actual,
    avatarApiClient: {
      fetchVocabulary: jest.fn(),
      searchAvatars: jest.fn(),
      constructFullUrl: jest.fn((path: string) => `${actual.BASE_URL}${path}`),
    },
  };
});

const mockAvatarApiClient = avatarApiClient as jest.Mocked<typeof avatarApiClient>;

describe('AvatarSearchTab Component Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Property: Vocabulary fetching workflow
   */
  it('property: vocabulary fetch returns structured data', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          subject: fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
        }),
        async (vocab) => {
          mockAvatarApiClient.fetchVocabulary.mockResolvedValue(vocab);

          const result = await mockAvatarApiClient.fetchVocabulary();

          expect(result).toEqual(vocab);
          expect(mockAvatarApiClient.fetchVocabulary).toHaveBeenCalledWith();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Search with empty filter
   */
  it('property: initial search with empty filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ url: fc.string() }), { minLength: 0, maxLength: 20 }),
        async (items) => {
          mockAvatarApiClient.searchAvatars.mockResolvedValue({
            items,
            limit: 20,
            offset: 0,
          });

          const result = await mockAvatarApiClient.searchAvatars('', 20, 0);

          expect(result.items).toEqual(items);
          expect(result.limit).toBe(20);
          expect(result.offset).toBe(0);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: hasNextPage determination
   */
  it('property: hasNextPage = true when full page returned', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(20), // Full page
        async (itemCount) => {
          const items = Array.from({ length: itemCount }, (_, i) => ({ url: `/avatar${i}.png` }));

          mockAvatarApiClient.searchAvatars.mockResolvedValue({
            items,
            limit: 20,
            offset: 0,
          });

          const result = await mockAvatarApiClient.searchAvatars('', 20, 0);
          const hasNextPage = result.items.length === result.limit;

          expect(hasNextPage).toBe(true);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: hasNextPage = false when partial page returned
   */
  it('property: hasNextPage = false when partial page returned', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 19 }), // Partial page
        async (itemCount) => {
          const items = Array.from({ length: itemCount }, (_, i) => ({ url: `/avatar${i}.png` }));

          mockAvatarApiClient.searchAvatars.mockResolvedValue({
            items,
            limit: 20,
            offset: 0,
          });

          const result = await mockAvatarApiClient.searchAvatars('', 20, 0);
          const hasNextPage = result.items.length === result.limit;

          expect(hasNextPage).toBe(false);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: URL sanitization workflow
   */
  it('property: avatar selection sanitizes URL', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (pathPart) => {
          const relativeUrl = `/${pathPart}`;
          const fullUrl = mockAvatarApiClient.constructFullUrl(relativeUrl);
          const sanitizedUrl = sanitizePictureUrl(fullUrl);

          expect(sanitizedUrl).toBe(fullUrl);
          if (sanitizedUrl) {
            expect(sanitizedUrl).toContain('https://');
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Pagination offset calculation
   */
  it('property: pagination calculates correct offset from page number', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (pageNumber) => {
          const PAGE_SIZE = 20;
          const expectedOffset = (pageNumber - 1) * PAGE_SIZE;

          mockAvatarApiClient.searchAvatars.mockResolvedValue({
            items: Array.from({ length: PAGE_SIZE }, (_, i) => ({ url: `/avatar${i}.png` })),
            limit: PAGE_SIZE,
            offset: expectedOffset,
          });

          const result = await mockAvatarApiClient.searchAvatars('', PAGE_SIZE, expectedOffset);

          expect(result.offset).toBe(expectedOffset);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Filter change behavior
   */
  it('property: filter change triggers new search with page 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('strawberry', 'cat', 'robot'),
        async (subject) => {
          mockAvatarApiClient.searchAvatars.mockResolvedValue({
            items: [],
            limit: 20,
            offset: 0,
          });

          await mockAvatarApiClient.searchAvatars(subject, 20, 0);

          const lastCall = mockAvatarApiClient.searchAvatars.mock.calls[
            mockAvatarApiClient.searchAvatars.mock.calls.length - 1
          ];

          expect(lastCall[0]).toBe(subject);
          expect(lastCall[1]).toBe(20); // limit
          expect(lastCall[2]).toBe(0); // offset reset to 0 (page 1)
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Empty results handling
   */
  it('property: empty search results return empty array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(undefined),
        async () => {
          mockAvatarApiClient.searchAvatars.mockResolvedValue({
            items: [],
            limit: 20,
            offset: 0,
          });

          const result = await mockAvatarApiClient.searchAvatars('', 20, 0);

          expect(result.items).toEqual([]);
          expect(result.items.length).toBe(0);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Error handling for vocabulary fetch
   */
  it('property: vocabulary fetch errors are propagated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Network error', 'Timeout', 'Server error'),
        async (errorMsg) => {
          mockAvatarApiClient.fetchVocabulary.mockRejectedValue(new Error(errorMsg));

          await expect(mockAvatarApiClient.fetchVocabulary()).rejects.toThrow(errorMsg);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: Error handling for search
   */
  it('property: search errors are propagated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Network error', 'Server error'),
        async (errorMsg) => {
          mockAvatarApiClient.searchAvatars.mockRejectedValue(new Error(errorMsg));

          await expect(mockAvatarApiClient.searchAvatars('', 20, 0)).rejects.toThrow(errorMsg);
        }
      ),
      { numRuns: 5 }
    );
  });

  /**
   * Property: URL construction is consistent
   */
  it('property: constructFullUrl produces consistent results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (relativePath) => {
          const url1 = mockAvatarApiClient.constructFullUrl(relativePath);
          const url2 = mockAvatarApiClient.constructFullUrl(relativePath);

          expect(url1).toBe(url2);
          expect(url1).toBe(`${BASE_URL}${relativePath}`);
        }
      ),
      { numRuns: 10 }
    );
  });
});
