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
 * Mock fetch for testing
 */
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('Avatar Browser Integration', () => {
  let apiClient: AvatarApiClient;

  beforeEach(() => {
    apiClient = new AvatarApiClient();
    (global.fetch as jest.MockedFunction<typeof fetch>).mockClear();
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
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => vocab,
          } as Response);

          const result = await apiClient.fetchVocabulary();

          expect(result).toEqual(vocab);
          expect(global.fetch).toHaveBeenCalledWith(
            'https://wp10665333.server-he.de/vocab.json',
            expect.objectContaining({ method: 'GET' })
          );
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
          (global.fetch as jest.MockedFunction<typeof fetch>).mockClear();

          const expectedItems = items.slice(0, limit);

          const mockResponse: AvatarSearchResponse = {
            items: expectedItems,
            limit,
            offset,
          };

          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => mockResponse,
          } as Response);

          const result = await apiClient.searchAvatars(subject, limit, offset);

          expect(result.limit).toBe(limit);
          expect(result.offset).toBe(offset);
          expect(result.items.length).toBeLessThanOrEqual(limit);

          const fetchCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
          const url = new URL(fetchCall[0] as string);

          expect(url.searchParams.get('limit')).toBe(limit.toString());
          expect(url.searchParams.get('offset')).toBe(offset.toString());

          if (subject !== '') {
            expect(url.searchParams.get('subject')).toBe(subject);
          }
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

          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => ({
              items,
              limit: 20,
              offset: 0,
            }),
          } as Response);

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
          (global.fetch as jest.MockedFunction<typeof fetch>).mockClear();

          const limit = 20;
          const offset = pageNumber * limit;

          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => ({
              items: Array.from({ length: limit }, (_, i) => ({
                url: `/avatars/page${pageNumber}_${i}.png`,
              })),
              limit,
              offset,
            }),
          } as Response);

          const result = await apiClient.searchAvatars(subject, limit, offset);

          expect(result.offset).toBe(offset);

          const fetchCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
          const url = new URL(fetchCall[0] as string);

          expect(url.searchParams.get('subject')).toBe(subject);
          expect(url.searchParams.get('offset')).toBe(offset.toString());
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
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => ({
              items,
              limit: 20,
              offset: 0,
            }),
          } as Response);

          await apiClient.searchAvatars('', 20, 0);

          const fetchCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0];
          const url = new URL(fetchCall[0] as string);

          expect(url.searchParams.has('subject')).toBe(false);
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

          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => ({
              items: Array.from({ length: itemCount }, (_, i) => ({ url: `/avatar${i}.png` })),
              limit,
              offset: 0,
            }),
          } as Response);

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
          (global.fetch as jest.MockedFunction<typeof fetch>).mockClear();

          let callCount = 0;

          for (const subject of subjects) {
            (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
              status: 200,
              json: async () => ({
                items: [{ url: `/avatar_${subject || 'all'}.png` }],
                limit: 20,
                offset: 0,
              }),
            } as Response);

            await apiClient.searchAvatars(subject, 20, 0);

            callCount++;

            const fetchCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[callCount - 1];
            const url = new URL(fetchCall[0] as string);

            if (subject === '') {
              expect(url.searchParams.has('subject')).toBe(false);
            } else {
              expect(url.searchParams.get('subject')).toBe(subject);
            }
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
        fc.constantFrom(400, 500),
        async (statusCode) => {
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: statusCode,
            json: async () => ({ message: 'Error' }),
          } as Response);

          await expect(apiClient.searchAvatars('test', 20, 0)).rejects.toThrow();
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
   * Tests: fetch vocabulary → search → filter change → paginate → select → sanitize
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

          (global.fetch as jest.MockedFunction<typeof fetch>).mockClear();

          // Step 1: Fetch vocabulary
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => vocabulary,
          } as Response);

          const vocabResult = await apiClient.fetchVocabulary();
          expect(vocabResult).toEqual(vocabulary);

          // Step 2: Initial search (empty filter)
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => ({
              items: page1Items,
              limit: 20,
              offset: 0,
            }),
          } as Response);

          const initialSearch = await apiClient.searchAvatars('', 20, 0);
          expect(initialSearch.items.length).toBe(20);

          // Step 3: Filter change
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => ({
              items: page1Items,
              limit: 20,
              offset: 0,
            }),
          } as Response);

          const filteredSearch = await apiClient.searchAvatars(selectedSubject, 20, 0);
          expect(filteredSearch.items.length).toBe(20);

          const fetchCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[2];
          const url = new URL(fetchCall[0] as string);
          expect(url.searchParams.get('subject')).toBe(selectedSubject);

          // Step 4: Pagination
          (global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValueOnce({
            status: 200,
            json: async () => ({
              items: page2Items,
              limit: 20,
              offset: 20,
            }),
          } as Response);

          const page2Search = await apiClient.searchAvatars(selectedSubject, 20, 20);
          expect(page2Search.offset).toBe(20);

          const paginationCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[3];
          const paginationUrl = new URL(paginationCall[0] as string);
          expect(paginationUrl.searchParams.get('subject')).toBe(selectedSubject);
          expect(paginationUrl.searchParams.get('offset')).toBe('20');

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
