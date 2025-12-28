/**
 * Avatar API Client Service
 *
 * Handles communication with external avatar image server via IPC proxy.
 * The main process proxies requests to bypass CORS restrictions.
 *
 * SPECIFICATION FOR pbt-dev AGENT:
 *
 * CONTRACT FOR: fetchVocabulary
 *   Inputs:
 *     - None
 *
 *   Outputs:
 *     - Promise resolving to AvatarVocabulary object
 *       Structure: Record mapping filter keys to string arrays
 *       Example: { "color": ["blue", "red"], "style": ["anime"] }
 *     - Promise rejects with Error if request fails
 *
 *   Invariants:
 *     - Makes IPC call to main process which fetches: BASE_URL + "/vocab.json"
 *     - Response is valid JSON object
 *     - All keys map to non-empty string arrays
 *
 *   Properties:
 *     - Timeout: request times out after 30 seconds (handled by main process)
 *     - Error propagation: network errors, timeouts, non-200 status all throw Error
 *     - Retry-safe: multiple calls are safe (idempotent GET)
 *
 *   Error Cases:
 *     - Network error: "Network error fetching vocabulary"
 *     - Timeout: "Request timeout fetching vocabulary"
 *     - Non-200 status: "Failed to fetch vocabulary: HTTP {status}"
 *     - Invalid JSON: "Invalid vocabulary response format"
 *
 * CONTRACT FOR: searchAvatars
 *   Inputs:
 *     - subjectFilter: string, subject filter value
 *       Constraints: empty string means no filter (returns all avatars)
 *       Example: "strawberry" filters to strawberry-subject avatars
 *     - limit: positive integer, number of results per page
 *       Constraints: 1 ≤ limit ≤ 500
 *       Default: 20
 *     - offset: non-negative integer, pagination offset
 *       Constraints: offset ≥ 0
 *       Default: 0
 *
 *   Outputs:
 *     - Promise resolving to AvatarSearchResponse object
 *       Structure: { items: AvatarItem[], limit: number, offset: number }
 *       Example: { items: [{url: "/avatars/uuid.png"}], limit: 20, offset: 0 }
 *     - Promise rejects with Error if request fails or validation fails
 *
 *   Invariants:
 *     - Makes IPC call to main process which fetches: BASE_URL + "/cgi/search" + query parameters
 *     - Query parameters include: subject (if non-empty), limit, offset
 *     - Response status 200: success with AvatarSearchResponse
 *     - Response status 400: client error (invalid query parameters)
 *     - Response status 500: server error
 *     - items.length ≤ limit
 *
 *   Properties:
 *     - Timeout: request times out after 30 seconds (handled by main process)
 *     - Deterministic: same parameters always return same results (stable pagination)
 *     - Last page detection: items.length < limit indicates no more results
 *     - Empty results: items array may be empty (valid response)
 *
 *   Error Cases:
 *     - Invalid limit: "Limit must be between 1 and 500"
 *     - Invalid offset: "Offset must be non-negative"
 *     - Network error: "Network error searching avatars"
 *     - Timeout: "Request timeout searching avatars"
 *     - 400 response: "Invalid query: {API error message}"
 *     - 500 response: "Server error searching avatars"
 *     - Invalid response format: "Invalid search response format"
 *
 * CONTRACT FOR: constructFullUrl
 *   Inputs:
 *     - relativePath: string, relative URL path from avatar item
 *       Example: "/avatars/uuid.png"
 *       Constraints: must start with "/"
 *
 *   Outputs:
 *     - Full HTTPS URL: string
 *       Example: "https://wp10665333.server-he.de/avatars/uuid.png"
 *       Format: BASE_URL + relativePath
 *
 *   Invariants:
 *     - Output always starts with BASE_URL
 *     - Output is valid HTTPS URL
 *
 *   Properties:
 *     - Idempotent: same input always produces same output
 *     - Reversible: can extract relative path from full URL
 *
 * Constants:
 *   - BASE_URL: "https://wp10665333.server-he.de"
 *     Immutable server endpoint
 *
 * Testing Considerations:
 *   - Property: fetchVocabulary always returns object with string array values
 *   - Property: searchAvatars with limit=N returns ≤ N items
 *   - Property: searchAvatars with empty filter returns results
 *   - Property: searchAvatars respects pagination (offset changes results)
 *   - Property: constructFullUrl always produces valid HTTPS URL
 *   - Error handling: all API errors result in Error with descriptive message
 *   - Timeout behavior: requests abort after 30 seconds
 *
 * Implementation Notes:
 *   - Uses IPC proxy via window.api.nostling.avatarApi
 *   - Main process uses Electron's net module (not subject to CORS)
 *   - All validation and error handling done by main process
 */

import type { AvatarVocabulary, AvatarSearchResponse } from '../components/AvatarBrowserModal/types';

export const BASE_URL = 'https://wp10665333.server-he.de';

export class AvatarApiClient {
  /**
   * Fetch vocabulary (available filter keys and values)
   * See CONTRACT above for complete specification
   */
  async fetchVocabulary(): Promise<AvatarVocabulary> {
    try {
      return await window.api.nostling!.avatarApi.fetchVocabulary();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error fetching vocabulary');
    }
  }

  /**
   * Search for avatars with optional subject filter and pagination
   * See CONTRACT above for complete specification
   */
  async searchAvatars(subjectFilter: string = '', limit: number = 20, offset: number = 0): Promise<AvatarSearchResponse> {
    // Validate inputs (redundant with main process, but fail fast in renderer)
    if (limit < 1 || limit > 500) {
      throw new Error('Limit must be between 1 and 500');
    }

    if (offset < 0) {
      throw new Error('Offset must be non-negative');
    }

    try {
      return await window.api.nostling!.avatarApi.search({
        subjectFilter,
        limit,
        offset,
      });
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error searching avatars');
    }
  }

  /**
   * Construct full URL from relative path
   * See CONTRACT above for complete specification
   */
  constructFullUrl(relativePath: string): string {
    return BASE_URL + relativePath;
  }
}

export const avatarApiClient = new AvatarApiClient();
