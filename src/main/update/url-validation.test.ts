/**
 * Property-based tests for URL validation
 *
 * Tests verify edge cases and security properties for URL validation:
 * - Auth tokens in URLs
 * - Query parameters
 * - Fragment identifiers
 * - URL encoding
 * - Protocol variations
 * - Malformed URLs
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { validateUpdateUrl } from './url-validation';

describe('validateUpdateUrl', () => {
  describe('Edge Cases: Auth Tokens and Credentials', () => {
    it('should accept HTTPS URLs with auth tokens in production mode', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          (username, password) => {
            const url = `https://${username}:${password}@github.com/owner/repo/manifest.json`;
            // Should not throw - HTTPS is always valid
            expect(() => validateUpdateUrl(url, {})).not.toThrow();
          }
        )
      );
    });

    it('should reject HTTP URLs with auth tokens in production mode', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          (username, password) => {
            const url = `http://${username}:${password}@example.com/manifest.json`;
            expect(() => validateUpdateUrl(url, {})).toThrow(/must use HTTPS protocol/);
          }
        )
      );
    });

    it('should accept HTTP URLs with auth tokens when allowHttp is true', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          (username, password) => {
            const url = `http://${username}:${password}@localhost:8080/manifest.json`;
            expect(() => validateUpdateUrl(url, { allowHttp: true })).not.toThrow();
          }
        )
      );
    });
  });

  describe('Edge Cases: Query Parameters', () => {
    it('should accept HTTPS URLs with query parameters', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          fc.stringMatching(/^[a-zA-Z0-9_-]+$/),
          (key, value) => {
            const url = `https://github.com/owner/repo/manifest.json?${key}=${value}`;
            expect(() => validateUpdateUrl(url, {})).not.toThrow();
          }
        )
      );
    });

    it('should accept URLs with multiple query parameters', () => {
      const url = 'https://github.com/owner/repo/manifest.json?token=abc123&version=1.0.0&platform=darwin';
      expect(() => validateUpdateUrl(url, {})).not.toThrow();
    });

    it('should accept URLs with encoded query parameters', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }), (rawParam) => {
          const encoded = encodeURIComponent(rawParam);
          const url = `https://github.com/owner/repo/manifest.json?param=${encoded}`;
          expect(() => validateUpdateUrl(url, {})).not.toThrow();
        })
      );
    });
  });

  describe('Edge Cases: Fragment Identifiers', () => {
    it('should accept HTTPS URLs with fragment identifiers', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[a-zA-Z0-9_-]+$/), (fragment) => {
          const url = `https://github.com/owner/repo/manifest.json#${fragment}`;
          expect(() => validateUpdateUrl(url, {})).not.toThrow();
        })
      );
    });

    it('should accept URLs with both query params and fragments', () => {
      const url = 'https://github.com/owner/repo/manifest.json?version=1.0.0#section-1';
      expect(() => validateUpdateUrl(url, {})).not.toThrow();
    });
  });

  describe('Edge Cases: Protocol Variations', () => {
    it('should reject ftp:// protocol regardless of flags', () => {
      const url = 'ftp://example.com/manifest.json';
      expect(() => validateUpdateUrl(url, {})).toThrow(/unsupported protocol/);
      expect(() => validateUpdateUrl(url, { allowHttp: true })).toThrow(/unsupported protocol/);
      expect(() => validateUpdateUrl(url, { allowFileProtocol: true })).toThrow(
        /unsupported protocol/
      );
    });

    it('should reject data: URLs', () => {
      const url = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
      expect(() => validateUpdateUrl(url, {})).toThrow(/unsupported protocol/);
    });

    it('should reject blob: URLs', () => {
      const url = 'blob:https://example.com/550e8400-e29b-41d4-a716-446655440000';
      expect(() => validateUpdateUrl(url, {})).toThrow(/unsupported protocol/);
    });

    it('should reject javascript: protocol (XSS prevention)', () => {
      const url = 'javascript:alert(1)';
      expect(() => validateUpdateUrl(url, {})).toThrow(/unsupported protocol/);
    });
  });

  describe('Edge Cases: Whitespace and Empty Strings', () => {
    it('should reject empty strings', () => {
      expect(() => validateUpdateUrl('', {})).toThrow(/cannot be empty/);
    });

    it('should reject whitespace-only strings', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^\s+$/), (whitespace) => {
          expect(() => validateUpdateUrl(whitespace, {})).toThrow(/cannot be empty/);
        })
      );
    });

    it('should accept URLs with leading/trailing whitespace (trimmed)', () => {
      const url = '  https://github.com/owner/repo/manifest.json  ';
      expect(() => validateUpdateUrl(url, {})).not.toThrow();
    });
  });

  describe('Edge Cases: Malformed URLs', () => {
    it('should reject invalid URL syntax', () => {
      const invalidUrls = [
        'not a url',
        'htp://missing-t.com',
        '://no-protocol.com',
      ];

      invalidUrls.forEach((url) => {
        expect(() => validateUpdateUrl(url, {})).toThrow(/Invalid/);
      });
    });

    it('should accept URLs with spaces (auto-encoded by URL constructor)', () => {
      const url = 'https://github.com/owner/repo/manifest file.json';
      // URL constructor auto-encodes spaces, so this is actually valid
      expect(() => validateUpdateUrl(url, {})).not.toThrow();
    });
  });

  describe('Edge Cases: Case Sensitivity', () => {
    it('should accept HTTPS in uppercase', () => {
      const url = 'HTTPS://github.com/owner/repo/manifest.json';
      expect(() => validateUpdateUrl(url, {})).not.toThrow();
    });

    it('should accept mixed case protocols for HTTPS', () => {
      const url = 'HtTpS://github.com/owner/repo/manifest.json';
      expect(() => validateUpdateUrl(url, {})).not.toThrow();
    });

    it('should reject HTTP regardless of case in production mode', () => {
      expect(() => validateUpdateUrl('HTTP://example.com', {})).toThrow(/must use HTTPS/);
      expect(() => validateUpdateUrl('HtTp://example.com', {})).toThrow(/must use HTTPS/);
    });
  });

  describe('Edge Cases: IPv6 Addresses', () => {
    it('should accept HTTPS URLs with IPv6 addresses', () => {
      const url = 'https://[2001:db8::1]/manifest.json';
      expect(() => validateUpdateUrl(url, {})).not.toThrow();
    });

    it('should accept HTTP URLs with IPv6 addresses when allowHttp is true', () => {
      const url = 'http://[::1]:8080/manifest.json';
      expect(() => validateUpdateUrl(url, { allowHttp: true })).not.toThrow();
    });

    it('should reject HTTP IPv6 URLs in production mode', () => {
      const url = 'http://[2001:db8::1]/manifest.json';
      expect(() => validateUpdateUrl(url, {})).toThrow(/must use HTTPS/);
    });
  });

  describe('Edge Cases: Port Numbers', () => {
    it('should accept HTTPS URLs with explicit ports', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 65535 }), (port) => {
          const url = `https://example.com:${port}/manifest.json`;
          expect(() => validateUpdateUrl(url, {})).not.toThrow();
        })
      );
    });

    it('should accept HTTP URLs with ports when allowHttp is true', () => {
      const url = 'http://localhost:8080/manifest.json';
      expect(() => validateUpdateUrl(url, { allowHttp: true })).not.toThrow();
    });

    it('should reject HTTP URLs with ports in production mode', () => {
      const url = 'http://localhost:3000/manifest.json';
      expect(() => validateUpdateUrl(url, {})).toThrow(/must use HTTPS/);
    });
  });

  describe('Context-Aware Error Messages', () => {
    it('should include context in error messages for empty URLs', () => {
      expect(() => validateUpdateUrl('', { context: 'manifest URL' })).toThrow(/manifest URL cannot be empty/);
      expect(() => validateUpdateUrl('', { context: 'feed URL' })).toThrow(/feed URL cannot be empty/);
    });

    it('should include context in error messages for protocol violations', () => {
      expect(() => validateUpdateUrl('http://example.com', { context: 'manifest URL' })).toThrow(
        /manifest URL must use HTTPS/
      );
    });

    it('should include context in error messages for invalid URLs', () => {
      expect(() => validateUpdateUrl('not a url', { context: 'update source' })).toThrow(
        /Invalid update source/
      );
    });
  });

  describe('File Protocol Edge Cases', () => {
    it('should accept file:// URLs with absolute paths when allowFileProtocol is true', () => {
      const urls = [
        'file:///tmp/manifest.json',
        'file:///Users/test/manifest.json',
        'file:///C:/Windows/manifest.json',
      ];

      urls.forEach((url) => {
        expect(() => validateUpdateUrl(url, { allowFileProtocol: true })).not.toThrow();
      });
    });

    it('should accept file:// URLs with relative paths when allowFileProtocol is true', () => {
      const url = 'file://./test-manifests/manifest.json';
      expect(() => validateUpdateUrl(url, { allowFileProtocol: true })).not.toThrow();
    });

    it('should reject file:// URLs in production mode', () => {
      const url = 'file:///tmp/manifest.json';
      expect(() => validateUpdateUrl(url, {})).toThrow(/must use HTTPS/);
    });
  });
});
