/**
 * Property-based tests for integration functions
 *
 * Tests verify all contract invariants and properties
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fc from 'fast-check';
import { constructManifestUrl, fetchManifest, verifyDownloadedUpdate } from './integration';
import { UpdateDownloadedEvent } from 'electron-updater';

describe('constructManifestUrl', () => {
  describe('Property: Dev mode takes precedence when devUpdateSource provided', () => {
    it('should return devUpdateSource with /manifest.json appended when provided', () => {
      const devUpdateSource = 'https://github.com/941design/slim-chat/releases/download/v1.0.0';
      const publishConfig = { owner: 'user', repo: 'app' };

      const result = constructManifestUrl(publishConfig, devUpdateSource);

      expect(result).toBe(devUpdateSource + '/manifest.json');
    });

    it('should handle devUpdateSource ending with /', () => {
      const devUpdateSource = 'https://github.com/941design/slim-chat/releases/download/v1.0.0/';
      const publishConfig = { owner: 'user', repo: 'app' };

      const result = constructManifestUrl(publishConfig, devUpdateSource);

      expect(result).toBe(devUpdateSource + 'manifest.json');
    });

    it('should use devUpdateSource even when publishConfig is invalid', () => {
      const devUpdateSource = 'https://custom.example.com/updates';
      const publishConfig = {};

      const result = constructManifestUrl(publishConfig, devUpdateSource);

      expect(result).toBe(devUpdateSource + '/manifest.json');
    });

    it('P001: Dev mode always appends /manifest.json correctly', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          fc.object({ maxDepth: 1 }),
          (devUpdateSource, publishConfig) => {
            const result = constructManifestUrl(publishConfig as any, devUpdateSource);
            expect(result).toMatch(/manifest\.json$/);
            expect(result.includes(devUpdateSource.replace(/\/$/, ''))).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property: Production mode uses /latest/download/ path', () => {
    it('should construct URL with /latest/download/ for cross-version discovery', () => {
      const result = constructManifestUrl(
        { owner: 'user', repo: 'app' },
        undefined
      );

      expect(result).toBe('https://github.com/user/app/releases/latest/download/manifest.json');
    });

    it('P002: Production URL always contains /latest/download/', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          (owner, repo) => {
            const result = constructManifestUrl({ owner, repo }, undefined);
            expect(result).toContain('/latest/download/');
            expect(result).toMatch(
              new RegExp(`^https://github\\.com/${owner}/${repo}/releases/latest/download/manifest\\.json$`)
            );
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P003: Production URL always ends with /manifest.json', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          fc.stringMatching(/^[a-zA-Z0-9\-_.]+$/),
          (owner, repo) => {
            const result = constructManifestUrl({ owner, repo }, undefined);
            expect(result).toMatch(/\/manifest\.json$/);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('P004: Dev mode URL always ends with /manifest.json', () => {
      fc.assert(
        fc.property(
          fc.webUrl(),
          (devUpdateSource) => {
            const result = constructManifestUrl({}, devUpdateSource);
            expect(result).toMatch(/\/manifest\.json$/);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Error handling: Empty or missing owner (production mode)', () => {
    it('should throw error when owner is missing and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ repo: 'app' }, undefined)
      ).toThrow('GitHub owner not configured');
    });

    it('should throw error when owner is empty string and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: '', repo: 'app' }, undefined)
      ).toThrow('GitHub owner not configured');
    });

    it('should throw error when owner is only whitespace and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: '   ', repo: 'app' }, undefined)
      ).toThrow('GitHub owner not configured');
    });
  });

  describe('Error handling: Empty or missing repo (production mode)', () => {
    it('should throw error when repo is missing and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: 'user' }, undefined)
      ).toThrow('GitHub repo not configured');
    });

    it('should throw error when repo is empty string and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: 'user', repo: '' }, undefined)
      ).toThrow('GitHub repo not configured');
    });

    it('should throw error when repo is only whitespace and no devUpdateSource', () => {
      expect(() =>
        constructManifestUrl({ owner: 'user', repo: '   ' }, undefined)
      ).toThrow('GitHub repo not configured');
    });
  });

  describe('Examples from specification', () => {
    it('should match production example: 941design/slim-chat', () => {
      const result = constructManifestUrl({ owner: '941design', repo: 'slim-chat' }, undefined);
      expect(result).toBe('https://github.com/941design/slim-chat/releases/latest/download/manifest.json');
    });

    it('should match dev example with GitHub release URL', () => {
      const result = constructManifestUrl(
        {},
        'https://github.com/941design/slim-chat/releases/download/v1.0.0'
      );
      expect(result).toBe('https://github.com/941design/slim-chat/releases/download/v1.0.0/manifest.json');
    });

    it('should match dev example with local file URL', () => {
      const result = constructManifestUrl(
        {},
        'file://./test-manifests/v1.0.0'
      );
      expect(result).toBe('file://./test-manifests/v1.0.0/manifest.json');
    });
  });
});

describe('fetchManifest', () => {
  let mockFetches: Map<string, { status: number; body: any }> = new Map();
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetches.clear();
    global.fetch = (async (url: string, options?: RequestInit) => {
      const mockEntry = mockFetches.get(url as string);

      if (!mockEntry) {
        throw new Error(`No mock configured for URL: ${url}`);
      }

      return {
        ok: mockEntry.status >= 200 && mockEntry.status < 300,
        status: mockEntry.status,
        headers: {},
        json: async () => {
          if (mockEntry.body === null) {
            throw new SyntaxError('Unexpected end of JSON input');
          }
          return mockEntry.body;
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Property-Based Tests: Successful Fetch', () => {
    it('P001: Valid HTTPS URL with valid manifest returns SignedManifest', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [
          {
            url: 'https://example.com/app.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'signature-base64-data',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      const result = await fetchManifest(url);

      expect(result).toEqual(manifest);
      expect(result.version).toBe('1.0.0');
      expect(result.artifacts).toEqual(manifest.artifacts);
      expect(result.signature).toBe('signature-base64-data');
      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('P002: 2xx status codes return manifest', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 201, body: manifest });

      const result = await fetchManifest(url);
      expect(result).toEqual(manifest);
    });
  });

  describe('Property-Based Tests: HTTP Status Codes', () => {
    it('P003: Non-2xx status codes throw error with status code', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.domain().map((d) => `https://${d}/manifest.json`),
            fc.integer({ min: 300, max: 599 })
          ),
          async ([url, status]) => {
            mockFetches.set(url, { status, body: null });

            await expect(fetchManifest(url)).rejects.toThrow(
              new RegExp(`status ${status}`)
            );
          }
        ),
        { numRuns: 15 }
      );
    });

    it('P004: 404 error includes status code in message', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 404, body: null });

      try {
        await fetchManifest(url);
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('404');
      }
    });

    it('P005: 500 server error includes status code', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 500, body: null });

      try {
        await fetchManifest(url);
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('500');
      }
    });
  });

  describe('Property-Based Tests: Manifest Structure Validation', () => {
    it('P006: Missing required fields throw validation error', async () => {
      const url = 'https://example.com/manifest.json';
      const baseManifest = {
        version: '1.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      // Test missing version
      const noVersion = { ...baseManifest };
      delete (noVersion as any).version;
      mockFetches.set(url, { status: 200, body: noVersion });

      await expect(fetchManifest(url)).rejects.toThrow('Missing required manifest fields');
    });

    it('P007: All four required fields are validated', async () => {
      const url = 'https://example.com/manifest.json';

      const invalidManifests = [
        { artifacts: [], signature: 'sig', createdAt: new Date().toISOString() },
        { version: '1.0.0', signature: 'sig', createdAt: new Date().toISOString() },
        { version: '1.0.0', artifacts: [], createdAt: new Date().toISOString() },
        { version: '1.0.0', artifacts: [], signature: 'sig' },
      ];

      for (const invalidManifest of invalidManifests) {
        mockFetches.clear();
        mockFetches.set(url, { status: 200, body: invalidManifest });

        await expect(fetchManifest(url)).rejects.toThrow('Missing required manifest fields');
      }
    });

    it('P008: Non-string version throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: 123,
          artifacts: [],
          signature: 'sig',
          createdAt: new Date().toISOString(),
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "version" must be a string');
    });

    it('P009: Non-array artifacts throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: '1.0.0',
          artifacts: 'not-an-array',
          signature: 'sig',
          createdAt: new Date().toISOString(),
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "artifacts" must be an array');
    });

    it('P010: Non-string signature throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: '1.0.0',
          artifacts: [],
          signature: 123,
          createdAt: new Date().toISOString(),
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "signature" must be a string');
    });

    it('P011: Non-string createdAt throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, {
        status: 200,
        body: {
          version: '1.0.0',
          artifacts: [],
          signature: 'sig',
          createdAt: 123,
        },
      });

      await expect(fetchManifest(url)).rejects.toThrow('field "createdAt" must be a string');
    });

    it('P012: Non-object JSON throws validation error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 200, body: 'not-an-object' });

      await expect(fetchManifest(url)).rejects.toThrow('Manifest must be a valid JSON object');
    });

    it('P013: Empty manifest object throws missing fields error', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 200, body: {} });

      await expect(fetchManifest(url)).rejects.toThrow('Missing required manifest fields');
    });
  });

  describe('Property-Based Tests: URL Validation', () => {
    it('P014: HTTPS URLs accepted', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      await expect(fetchManifest(url)).resolves.toBeDefined();
    });

    it('P015: HTTP URLs are rejected with HTTPS requirement error', async () => {
      await expect(fetchManifest('http://example.com/manifest.json')).rejects.toThrow('HTTPS protocol');
    });

    it('P016: Other protocols (ftp, file, etc.) are rejected', async () => {
      await expect(fetchManifest('ftp://example.com/manifest.json')).rejects.toThrow('HTTPS');
      await expect(fetchManifest('file:///tmp/manifest.json')).rejects.toThrow('HTTPS');
    });

    it('P017: Malformed URLs throw validation error', async () => {
      await expect(fetchManifest('not-a-url')).rejects.toThrow('Invalid manifest URL');
      await expect(fetchManifest('://missing-protocol')).rejects.toThrow('Invalid manifest URL');
      await expect(fetchManifest('')).rejects.toThrow('Invalid manifest URL');
    });
  });

  describe('Property-Based Tests: Network Errors', () => {
    it('P018: Network errors are propagated', async () => {
      global.fetch = (async () => {
        throw new Error('Network error');
      }) as unknown as typeof fetch;

      await expect(fetchManifest('https://example.com/manifest.json')).rejects.toThrow('Network error');
    });

    it('P019: Timeout errors propagated', async () => {
      global.fetch = (async () => {
        throw new Error('Request timeout');
      }) as unknown as typeof fetch;

      await expect(fetchManifest('https://example.com/manifest.json')).rejects.toThrow('Request timeout');
    });
  });

  describe('Property-Based Tests: JSON Parsing', () => {
    it('P020: Invalid JSON throws parse error with message', async () => {
      const url = 'https://example.com/manifest.json';
      mockFetches.set(url, { status: 200, body: null });

      await expect(fetchManifest(url)).rejects.toThrow('Failed to parse manifest JSON');
    });
  });

  describe('Example-Based Tests: Critical Cases', () => {
    it('E001: Specific manifest with all fields returns correctly', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.0.0',
        artifacts: [
          {
            url: 'https://example.com/app.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'signature-base64-data',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      const result = await fetchManifest(url);

      expect(result.version).toBe('1.0.0');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].platform).toBe('darwin');
      expect(result.signature).toBe('signature-base64-data');
      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
    });

    it('E002: HTTP URL rejected immediately without network call', async () => {
      try {
        await fetchManifest('http://example.com/manifest.json');
        throw new Error('Should have thrown');
      } catch (err) {
        expect((err as Error).message).toContain('HTTPS');
      }
    });

    it('E003: Multiple artifact types in manifest', async () => {
      const url = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.5.0',
        artifacts: [
          {
            url: 'https://example.com/app.dmg',
            sha256: 'a'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
          {
            url: 'https://example.com/app.AppImage',
            sha256: 'b'.repeat(64),
            platform: 'linux' as const,
            type: 'AppImage' as const,
          },
          {
            url: 'https://example.com/app.exe',
            sha256: 'c'.repeat(64),
            platform: 'win32' as const,
            type: 'exe' as const,
          },
        ],
        signature: 'multi-platform-signature',
        createdAt: '2024-01-15T10:00:00Z',
      };

      mockFetches.set(url, { status: 200, body: manifest });

      const result = await fetchManifest(url);

      expect(result.artifacts).toHaveLength(3);
      expect(result.artifacts[0].platform).toBe('darwin');
      expect(result.artifacts[1].platform).toBe('linux');
      expect(result.artifacts[2].platform).toBe('win32');
    });
  });
});

describe('verifyDownloadedUpdate', () => {
  let mockFetches: Map<string, { status: number; body: any }> = new Map();
  let consoleLogSpy: any;
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockFetches.clear();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    global.fetch = (async (url: string, options?: RequestInit) => {
      const mockEntry = mockFetches.get(url as string);

      if (!mockEntry) {
        throw new Error(`No mock configured for URL: ${url}`);
      }

      return {
        ok: mockEntry.status >= 200 && mockEntry.status < 300,
        status: mockEntry.status,
        headers: {},
        json: async () => {
          if (mockEntry.body === null) {
            throw new SyntaxError('Unexpected end of JSON input');
          }
          return mockEntry.body;
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    consoleLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('Property: Complete verification flow succeeds with valid inputs', () => {
    it('should log fetch start message when verification succeeds', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      // Mock the verifyManifest function
      const verifyModule = await import('./security/verify');
      const originalVerifyManifest = verifyModule.verifyManifest;
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(`Fetching manifest from ${manifestUrl}`);
      expect(result).toEqual({ verified: true });
    });

    it('should log verification success message with manifest version', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '3.5.1',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(consoleLogSpy).toHaveBeenCalledWith('Manifest verified for version 3.5.1');
    });

    it('should return exactly { verified: true } on success', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toStrictEqual({ verified: true });
      expect(Object.keys(result)).toEqual(['verified']);
    });
  });

  describe('Property: Manifest fetch failure propagates', () => {
    it('should propagate fetch error when manifest request fails', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      mockFetches.set(manifestUrl, { status: 404, body: null });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow(/status 404/);
    });

    it('should propagate network error when fetch fails', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      global.fetch = (async () => {
        throw new Error('Network timeout');
      }) as unknown as typeof fetch;

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Network timeout');
    });

    it('should propagate JSON parse error', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      mockFetches.set(manifestUrl, { status: 200, body: null });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow(/Failed to parse manifest JSON/);
    });
  });

  describe('Property: File path missing throws error', () => {
    it('should throw error when downloadedFile property is missing', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {};

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');
    });

    it('should throw error when downloadedFile is null', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: null as any,
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');
    });

    it('should throw error when downloadedFile is empty string', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '',
      };

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');
    });
  });

  describe('Property: All steps execute in correct order', () => {
    it('should fetch manifest before calling verifyManifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const callOrder: string[] = [];
      consoleLogSpy.mockImplementation((msg: string) => {
        if (msg.includes('Fetching manifest')) {
          callOrder.push('log-fetch');
        } else if (msg.includes('Manifest verified')) {
          callOrder.push('log-verify');
        }
      });

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockImplementation(() => {
        callOrder.push('verify');
        return Promise.resolve({ verified: true });
      });

      await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(callOrder).toEqual(['log-fetch', 'verify', 'log-verify']);
    });

    it('should not call verifyManifest if manifest fetch fails', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      mockFetches.set(manifestUrl, { status: 500, body: null });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/path/to/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      const mockVerify = jest.spyOn(verifyModule, 'verifyManifest');

      try {
        await verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        );
      } catch (e) {
        // Expected to throw
      }

      expect(mockVerify).not.toHaveBeenCalled();
    });

    it('should throw error and not call verifyManifest if file path missing', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {};

      const verifyModule = await import('./security/verify');
      const mockVerify = jest.spyOn(verifyModule, 'verifyManifest');

      await expect(
        verifyDownloadedUpdate(
          downloadEvent as UpdateDownloadedEvent,
          '1.0.0',
          'darwin',
          'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
          manifestUrl
        )
      ).rejects.toThrow('Downloaded file path missing');

      expect(mockVerify).not.toHaveBeenCalled();
    });
  });

  describe('Example-Based Tests: Critical Verification Scenarios', () => {
    it('E001: Darwin platform verification with valid manifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.5.0',
        artifacts: [
          {
            url: 'https://example.com/app-darwin.dmg',
            sha256: 'd'.repeat(64),
            platform: 'darwin' as const,
            type: 'dmg' as const,
          },
        ],
        signature: 'darwin-sig-base64',
        createdAt: '2024-01-15T10:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/tmp/update.dmg',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '2.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toEqual({ verified: true });
    });

    it('E002: Linux platform verification with valid manifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '3.0.0',
        artifacts: [
          {
            url: 'https://example.com/app-linux.AppImage',
            sha256: 'l'.repeat(64),
            platform: 'linux' as const,
            type: 'AppImage' as const,
          },
        ],
        signature: 'linux-sig-base64',
        createdAt: '2024-01-16T15:30:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: '/tmp/update.AppImage',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '2.5.0',
        'linux',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toEqual({ verified: true });
    });

    it('E003: Windows platform verification with valid manifest', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '1.5.0',
        artifacts: [
          {
            url: 'https://example.com/app-win.exe',
            sha256: 'w'.repeat(64),
            platform: 'win32' as const,
            type: 'exe' as const,
          },
        ],
        signature: 'win-sig-base64',
        createdAt: '2024-01-17T08:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const downloadEvent: Partial<UpdateDownloadedEvent> = {
        downloadedFile: 'C:\\Users\\AppData\\Local\\Temp\\update.exe',
      };

      const verifyModule = await import('./security/verify');
      jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      const result = await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'win32',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(result).toEqual({ verified: true });
    });

    it('E004: Extracts and passes file path to verifyManifest correctly', async () => {
      const manifestUrl = 'https://example.com/manifest.json';
      const manifest = {
        version: '2.0.0',
        artifacts: [],
        signature: 'sig',
        createdAt: '2024-01-01T00:00:00Z',
      };

      mockFetches.set(manifestUrl, { status: 200, body: manifest });

      const filePath = '/path/to/file.dmg';
      const downloadEvent: any = {
        downloadedFile: filePath,
      };

      const verifyModule = await import('./security/verify');
      const mockVerify = jest.spyOn(verifyModule, 'verifyManifest').mockResolvedValue({ verified: true });

      await verifyDownloadedUpdate(
        downloadEvent as UpdateDownloadedEvent,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM=',
        manifestUrl
      );

      expect(mockVerify).toHaveBeenCalledWith(
        expect.objectContaining({ version: '2.0.0' }),
        filePath,
        '1.0.0',
        'darwin',
        'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkLXN0cmluZ2Zyb21lZDMyYnl0ZXM='
      );
    });
  });
});
