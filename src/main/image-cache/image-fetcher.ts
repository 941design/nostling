/**
 * Image fetcher for downloading images from remote URLs.
 *
 * Handles HTTP(S) requests with appropriate error handling and validation.
 */

import { sanitizePictureUrl } from '../../renderer/utils/url-sanitizer';

export interface FetchResult {
  data: Buffer;
  contentType: string;
}

const FETCH_TIMEOUT_MS = 30000;

export class ImageFetcher {
  /**
   * Fetch image data from a URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - url: string, valid HTTP/HTTPS URL pointing to image
   *
   *   Outputs:
   *     - Promise<FetchResult>: image data and content type
   *     - Throws Error if fetch fails (network error, non-200 status, timeout, etc.)
   *
   *   Invariants:
   *     - Only HTTP/HTTPS protocols allowed
   *     - URL must pass sanitization check (XSS prevention)
   *     - Response must have 200 status code
   *     - Response body is non-empty Buffer
   *
   *   Properties:
   *     - Timeout: request times out after 30 seconds
   *     - Error handling: network errors propagate as Error with descriptive message
   *     - Content type validation: result includes Content-Type header value
   *
   *   Algorithm:
   *     1. Validate URL protocol (must be http: or https:)
   *     2. Perform sanitization check (delegate to url-sanitizer)
   *     3. Make HTTP GET request with 30s timeout
   *     4. Check response status (must be 200)
   *     5. Read response body into Buffer
   *     6. Extract Content-Type header
   *     7. Return FetchResult
   *     8. If any step fails, throw Error with context
   */
  async fetchImage(url: string): Promise<FetchResult> {
    // Validate URL protocol
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`Only HTTP/HTTPS protocols allowed, got: ${parsedUrl.protocol}`);
    }

    // Perform sanitization check
    const sanitized = sanitizePictureUrl(url);
    if (sanitized === null) {
      throw new Error(`URL failed sanitization check: ${url}`);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      // Make HTTP GET request
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check response status
      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Read response body into Buffer
      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      if (data.length === 0) {
        throw new Error('Response body is empty');
      }

      // Extract Content-Type header
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      return {
        data,
        contentType,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${FETCH_TIMEOUT_MS}ms`);
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(`Fetch failed: ${String(error)}`);
    }
  }
}
