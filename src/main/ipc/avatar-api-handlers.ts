/**
 * Avatar API IPC Handlers
 *
 * Provides CORS-free proxy for avatar API requests from the renderer process.
 * The main process is not subject to CORS restrictions, so it can fetch from
 * external servers and return the results to the renderer.
 *
 * CONTRACT FOR: registerAvatarApiHandlers
 *   Inputs:
 *     - None (uses global ipcMain)
 *
 *   Outputs:
 *     - void (side effect: registers IPC handlers)
 *
 *   Registered Channels:
 *     - nostling:avatar-api:fetch-vocabulary -> fetches vocab.json
 *     - nostling:avatar-api:search -> fetches search results with filters
 *
 *   Properties:
 *     - Idempotent: calling multiple times re-registers handlers
 *     - Handlers registered with ipcMain.handle (async invoke pattern)
 */

import { ipcMain, net } from 'electron';

const BASE_URL = 'https://wp10665333.server-he.de';
const FETCH_TIMEOUT_MS = 30000;

export interface AvatarSearchParams {
  subjectFilter?: string;
  limit?: number;
  offset?: number;
}

export interface AvatarVocabularyResponse {
  [key: string]: string[];
}

export interface AvatarSearchResponse {
  items: { url: string }[];
  limit: number;
  offset: number;
}

/**
 * Make an HTTP request using Electron's net module (not subject to CORS)
 */
async function fetchFromMainProcess(url: string): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, FETCH_TIMEOUT_MS);

    const request = net.request({
      url,
      method: 'GET',
    });

    let responseData = '';
    let statusCode = 0;

    request.on('response', (response) => {
      statusCode = response.statusCode;

      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        clearTimeout(timeoutId);
        try {
          const data = JSON.parse(responseData);
          resolve({ status: statusCode, data });
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      });

      response.on('error', (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });

    request.on('error', (error: Error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    request.end();
  });
}

/**
 * Register avatar API IPC handlers
 */
export function registerAvatarApiHandlers(): void {
  // Fetch vocabulary
  ipcMain.handle('nostling:avatar-api:fetch-vocabulary', async (): Promise<AvatarVocabularyResponse> => {
    const url = `${BASE_URL}/vocab.json`;

    try {
      const { status, data } = await fetchFromMainProcess(url);

      if (status !== 200) {
        throw new Error(`Failed to fetch vocabulary: HTTP ${status}`);
      }

      // Validate response structure
      if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        throw new Error('Invalid vocabulary response format');
      }

      for (const value of Object.values(data as Record<string, unknown>)) {
        if (!Array.isArray(value)) {
          throw new Error('Invalid vocabulary response format');
        }
        for (const item of value) {
          if (typeof item !== 'string') {
            throw new Error('Invalid vocabulary response format');
          }
        }
      }

      return data as AvatarVocabularyResponse;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'Request timeout') {
          throw new Error('Request timeout fetching vocabulary');
        }
        if (error.message.startsWith('Failed to fetch vocabulary') || error.message === 'Invalid vocabulary response format') {
          throw error;
        }
      }
      throw new Error('Network error fetching vocabulary');
    }
  });

  // Search avatars
  ipcMain.handle(
    'nostling:avatar-api:search',
    async (_, params: AvatarSearchParams): Promise<AvatarSearchResponse> => {
      const { subjectFilter = '', limit = 20, offset = 0 } = params;

      // Validate inputs
      if (limit < 1 || limit > 500) {
        throw new Error('Limit must be between 1 and 500');
      }
      if (offset < 0) {
        throw new Error('Offset must be non-negative');
      }

      const urlParams = new URLSearchParams();
      urlParams.append('limit', limit.toString());
      urlParams.append('offset', offset.toString());

      if (subjectFilter !== '') {
        urlParams.append('subject', subjectFilter);
      }

      const url = `${BASE_URL}/cgi/search?${urlParams.toString()}`;

      try {
        const { status, data } = await fetchFromMainProcess(url);

        if (status === 200) {
          // Validate response structure
          if (
            typeof data !== 'object' ||
            data === null ||
            !Array.isArray((data as AvatarSearchResponse).items) ||
            typeof (data as AvatarSearchResponse).limit !== 'number' ||
            typeof (data as AvatarSearchResponse).offset !== 'number'
          ) {
            throw new Error('Invalid search response format');
          }
          return data as AvatarSearchResponse;
        }

        if (status === 400) {
          const errorData = data as { message?: string };
          throw new Error(`Invalid query: ${errorData.message || 'Bad request'}`);
        }

        if (status === 500) {
          throw new Error('Server error searching avatars');
        }

        throw new Error(`Unexpected response: HTTP ${status}`);
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === 'Request timeout') {
            throw new Error('Request timeout searching avatars');
          }
          if (
            error.message.startsWith('Invalid query:') ||
            error.message === 'Server error searching avatars' ||
            error.message.startsWith('Unexpected response:') ||
            error.message === 'Invalid search response format'
          ) {
            throw error;
          }
        }
        throw new Error('Network error searching avatars');
      }
    }
  );
}
