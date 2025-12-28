/**
 * Avatar Browser Integration Tests
 *
 * Property-based integration tests validating complete workflow:
 * - API client integration with search and pagination
 * - Data flow from API to components
 * - Filter and pagination state consistency
 * - URL construction and selection
 */

import fc from 'fast-check';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AvatarApiClient } from '../../services/avatar-api-client';
import type { AvatarVocabulary, AvatarSearchResponse, AvatarItem } from './types';

/**
 * Mock IPC avatarApi for testing
 * The AvatarApiClient uses window.api.nostling.avatarApi (IPC proxy)
 */
const mockAvatarApi = {
  fetchVocabulary: jest.fn<() => Promise<AvatarVocabulary>>(),
  search: jest.fn<(params: { subjectFilter: string; limit: number; offset: number }) => Promise<AvatarSearchResponse>>(),
};

// Setup window.api.nostling.avatarApi mock
(global as any).window = {
  api: {
    nostling: {
      avatarApi: mockAvatarApi,
    },
  },
};

describe('Avatar Browser Integration', () => {
  let apiClient: AvatarApiClient;

  beforeEach(() => {
    apiClient = new AvatarApiClient();
    mockAvatarApi.fetchVocabulary.mockClear();
    mockAvatarApi.search.mockClear();
  });

  /**
   * Property: Vocabulary fetching integrates with API
   */
  it('property: fetchVocabulary returns structured vocabulary from API', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          subject: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }),
        }),
        async (vocab) => {
          mockAvatarApi.fetchVocabulary.mockResolvedValueOnce(vocab);

          const result = await apiClient.fetchVocabulary();

          expect(result).toEqual(vocab);
          expect(mockAvatarApi.fetchVocabulary).toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Search integration with pagination
   */
  it('property: searchAvatars respects limit and offset for pagination', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 0, max: 1000 }),
        fc.array(
          fc.record({ url: fc.string() }),
          { minLength: 0, maxLength: 500 }
        ),
        async (subject, limit, offset, items) => {
          mockAvatarApi.search.mockClear();

          const expectedItems = items.slice(0, limit);

          const mockResponse: AvatarSearchResponse = {
            items: expectedItems,
            limit,
            offset,
          };

          mockAvatarApi.search.mockResolvedValueOnce(mockResponse);

          const result = await apiClient.searchAvatars(subject, limit, offset);

          expect(result.limit).toBe(limit);
          expect(result.offset).toBe(offset);
          expect(result.items.length).toBeLessThanOrEqual(limit);

          expect(mockAvatarApi.search).toHaveBeenCalledWith({
            subjectFilter: subject,
            limit,
            offset,
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Full URL construction workflow
   */
  it('property: complete workflow from search to URL selection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({ url: fc.string({ minLength: 1 }) }),
          { minLength: 1, maxLength: 20 }
        ),
        fc.integer({ min: 0, max: 19 }),
        async (items, selectedIndex) => {
          const actualIndex = selectedIndex % items.length;

          mockAvatarApi.search.mockResolvedValueOnce({
            items,
            limit: 20,
            offset: 0,
          });

          const searchResult = await apiClient.searchAvatars('', 20, 0);
          const selectedItem = searchResult.items[actualIndex];
          const fullUrl = apiClient.constructFullUrl(selectedItem.url);

          expect(fullUrl).toBe(`https://wp10665333.server-he.de${selectedItem.url}`);
          expect(fullUrl).toContain('https://');
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Pagination workflow maintains filter state
   */
  it('property: paginating through results maintains subject filter', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('strawberry', 'cat', 'robot'),
        fc.integer({ min: 0, max: 3 }),
        async (subject, pageNumber) => {
          mockAvatarApi.search.mockClear();

          const limit = 20;
          const offset = pageNumber * limit;

          mockAvatarApi.search.mockResolvedValueOnce({
            items: Array.from({ length: limit }, (_, i) => ({
              url: `/avatars/page${pageNumber}_${i}.png`,
            })),
            limit,
            offset,
          });

          const result = await apiClient.searchAvatars(subject, limit, offset);

          expect(result.offset).toBe(offset);

          expect(mockAvatarApi.search).toHaveBeenCalledWith({
            subjectFilter: subject,
            limit,
            offset,
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Empty filter returns unfiltered results
   */
  it('property: empty subject filter searches all avatars', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ url: fc.string() }), { minLength: 0, maxLength: 20 }),
        async (items) => {
          mockAvatarApi.search.mockResolvedValueOnce({
            items,
            limit: 20,
            offset: 0,
          });

          await apiClient.searchAvatars('', 20, 0);

          expect(mockAvatarApi.search).toHaveBeenCalledWith({
            subjectFilter: '',
            limit: 20,
            offset: 0,
          });
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Last page detection (items < limit)
   */
  it('property: last page detected when items < limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 19 }),
        async (itemCount) => {
          const limit = 20;

          mockAvatarApi.search.mockResolvedValueOnce({
            items: Array.from({ length: itemCount }, (_, i) => ({ url: `/avatar${i}.png` })),
            limit,
            offset: 0,
          });

          const result = await apiClient.searchAvatars('', limit, 0);

          const isLastPage = result.items.length < result.limit;

          expect(isLastPage).toBe(itemCount < limit);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: URL construction is idempotent
   */
  it('property: constructFullUrl is idempotent and consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (relativePath) => {
          const url1 = apiClient.constructFullUrl(relativePath);
          const url2 = apiClient.constructFullUrl(relativePath);

          expect(url1).toBe(url2);
          expect(url1).toBe(`https://wp10665333.server-he.de${relativePath}`);
          expect(url1.startsWith('https://')).toBe(true);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Multiple searches with different filters
   */
  it('property: sequential searches with different filters work correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('strawberry', 'cat', 'robot', ''), { minLength: 2, maxLength: 5 }),
        async (subjects) => {
          mockAvatarApi.search.mockClear();

          let callCount = 0;

          for (const subject of subjects) {
            mockAvatarApi.search.mockResolvedValueOnce({
              items: [{ url: `/avatar_${subject || 'all'}.png` }],
              limit: 20,
              offset: 0,
            });

            await apiClient.searchAvatars(subject, 20, 0);

            callCount++;

            expect(mockAvatarApi.search).toHaveBeenNthCalledWith(callCount, {
              subjectFilter: subject,
              limit: 20,
              offset: 0,
            });
          }

          expect(callCount).toBe(subjects.length);
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Error handling preserves system stability
   */
  it('property: API errors are properly propagated', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('Network error', 'Server error', 'Timeout'),
        async (errorMessage) => {
          mockAvatarApi.search.mockRejectedValueOnce(new Error(errorMessage));

          await expect(apiClient.searchAvatars('test', 20, 0)).rejects.toThrow(errorMessage);
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Boundary value handling for pagination
   */
  it('property: pagination boundaries are enforced', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -10, max: 0 }),
        async (invalidOffset) => {
          if (invalidOffset < 0) {
            await expect(apiClient.searchAvatars('', 20, invalidOffset)).rejects.toThrow('Offset must be non-negative');
          }
        }
      ),
      { numRuns: 10 }
    );

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 501, max: 1000 }),
        async (invalidLimit) => {
          await expect(apiClient.searchAvatars('', invalidLimit, 0)).rejects.toThrow('Limit must be between 1 and 500');
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Complete end-to-end workflow with URL sanitization
   * Tests: fetch vocabulary -> search -> filter change -> paginate -> select -> sanitize
   */
  it('property: complete workflow from vocabulary to sanitized URL selection', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          vocabulary: fc.record({
            subject: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
          }),
          page1Items: fc.array(
            fc.record({ url: fc.string({ minLength: 1 }) }),
            { minLength: 20, maxLength: 20 }
          ),
          page2Items: fc.array(
            fc.record({ url: fc.string({ minLength: 1 }) }),
            { minLength: 1, maxLength: 20 }
          ),
          filterIndex: fc.integer({ min: 0, max: 2 }),
          selectedIndex: fc.integer({ min: 0, max: 19 }),
        }),
        async ({ vocabulary, page1Items, page2Items, filterIndex, selectedIndex }) => {
          const selectedSubject = vocabulary.subject[filterIndex % vocabulary.subject.length];

          mockAvatarApi.fetchVocabulary.mockClear();
          mockAvatarApi.search.mockClear();

          // Step 1: Fetch vocabulary
          mockAvatarApi.fetchVocabulary.mockResolvedValueOnce(vocabulary);

          const vocabResult = await apiClient.fetchVocabulary();
          expect(vocabResult).toEqual(vocabulary);

          // Step 2: Initial search (empty filter)
          mockAvatarApi.search.mockResolvedValueOnce({
            items: page1Items,
            limit: 20,
            offset: 0,
          });

          const initialSearch = await apiClient.searchAvatars('', 20, 0);
          expect(initialSearch.items.length).toBe(20);

          // Step 3: Filter change
          mockAvatarApi.search.mockResolvedValueOnce({
            items: page1Items,
            limit: 20,
            offset: 0,
          });

          const filteredSearch = await apiClient.searchAvatars(selectedSubject, 20, 0);
          expect(filteredSearch.items.length).toBe(20);

          expect(mockAvatarApi.search).toHaveBeenNthCalledWith(2, {
            subjectFilter: selectedSubject,
            limit: 20,
            offset: 0,
          });

          // Step 4: Pagination
          mockAvatarApi.search.mockResolvedValueOnce({
            items: page2Items,
            limit: 20,
            offset: 20,
          });

          const page2Search = await apiClient.searchAvatars(selectedSubject, 20, 20);
          expect(page2Search.offset).toBe(20);

          expect(mockAvatarApi.search).toHaveBeenNthCalledWith(3, {
            subjectFilter: selectedSubject,
            limit: 20,
            offset: 20,
          });

          // Step 5: Select avatar
          const actualIndex = selectedIndex % page2Search.items.length;
          const selectedItem = page2Search.items[actualIndex];
          const fullUrl = apiClient.constructFullUrl(selectedItem.url);

          // Step 6: Verify URL construction
          expect(fullUrl).toBe(`https://wp10665333.server-he.de${selectedItem.url}`);
          expect(fullUrl.startsWith('https://')).toBe(true);

          // Simulate sanitization (would be done by component)
          const sanitizedUrl = fullUrl.startsWith('https://') ? fullUrl : null;
          expect(sanitizedUrl).not.toBeNull();
          expect(sanitizedUrl).toBe(fullUrl);
        }
      ),
      { numRuns: 10 }
    );
  });
});
