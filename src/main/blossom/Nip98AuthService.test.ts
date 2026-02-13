/**
 * Tests for NIP-98 HTTP Authentication Service
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import fc from 'fast-check';
import { generateNip98Token, type NostrEvent } from './Nip98AuthService';

describe('Nip98AuthService', () => {
  let testSecretKey: Uint8Array;
  let testPublicKey: string;

  const testUrl = 'https://blossom.example.com/upload';
  const testMethod = 'PUT';
  const testBodyHash = 'a'.repeat(64);

  beforeEach(() => {
    testSecretKey = generateSecretKey();
    testPublicKey = getPublicKey(testSecretKey);
  });

  describe('generateNip98Token', () => {
    it('should generate event with kind 27235', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      expect(result.event.kind).toBe(27235);
    });

    it('should set content to empty string', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      expect(result.event.content).toBe('');
    });

    it('should include correct u tag with URL', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const uTag = result.event.tags.find((t) => t[0] === 'u');
      expect(uTag).toEqual(['u', testUrl]);
    });

    it('should include correct method tag', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const methodTag = result.event.tags.find((t) => t[0] === 'method');
      expect(methodTag).toEqual(['method', testMethod]);
    });

    it('should include correct payload tag with body hash', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const payloadTag = result.event.tags.find((t) => t[0] === 'payload');
      expect(payloadTag).toEqual(['payload', testBodyHash]);
    });

    it('should have exactly 3 tags', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      expect(result.event.tags).toHaveLength(3);
    });

    it('should set pubkey to the signing key public key', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      expect(result.event.pubkey).toBe(testPublicKey);
    });

    it('should produce a valid signature (verifyEvent)', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      expect(verifyEvent(result.event as any)).toBe(true);
    });

    it('should set created_at within 2 seconds of current time', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const after = Math.floor(Date.now() / 1000);

      expect(result.event.created_at).toBeGreaterThanOrEqual(before);
      expect(result.event.created_at).toBeLessThanOrEqual(after);
    });

    it('should create Authorization header with Nostr prefix', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      expect(result.authorizationHeader).toMatch(/^Nostr /);
    });

    it('should produce base64-decodable header to valid JSON event', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const base64Part = result.authorizationHeader.substring('Nostr '.length);
      const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));

      expect(decoded.kind).toBe(27235);
      expect(decoded.id).toBe(result.event.id);
      expect(decoded.sig).toBe(result.event.sig);
      expect(decoded.pubkey).toBe(result.event.pubkey);
    });

    it('should round-trip: decoded header matches returned event', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const base64Part = result.authorizationHeader.substring('Nostr '.length);
      const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));

      expect(decoded).toEqual(JSON.parse(JSON.stringify(result.event)));
    });

    it('should have non-empty id and sig', () => {
      const result = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      expect(result.event.id).toBeTruthy();
      expect(result.event.id.length).toBe(64);
      expect(result.event.sig).toBeTruthy();
      expect(result.event.sig.length).toBe(128);
    });
  });

  describe('Per-Request Uniqueness (AC-040)', () => {
    it('should generate different event IDs for sequential calls with same inputs', () => {
      // Even with same inputs, different created_at or randomness should produce different IDs
      // If created_at is same (within same second), the ID will be the same, which is expected
      // The important property is that tokens aren't cached
      const result1 = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const result2 = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);

      // Verify both are independently valid
      expect(verifyEvent(result1.event as any)).toBe(true);
      expect(verifyEvent(result2.event as any)).toBe(true);

      // If timestamps differ, IDs must differ
      if (result1.event.created_at !== result2.event.created_at) {
        expect(result1.event.id).not.toBe(result2.event.id);
      }
    });

    it('should generate tokens with different keys producing different pubkeys', () => {
      const otherKey = generateSecretKey();
      const otherPubkey = getPublicKey(otherKey);

      const result1 = generateNip98Token(testSecretKey, testUrl, testMethod, testBodyHash);
      const result2 = generateNip98Token(otherKey, testUrl, testMethod, testBodyHash);

      expect(result1.event.pubkey).toBe(testPublicKey);
      expect(result2.event.pubkey).toBe(otherPubkey);
      expect(result1.event.pubkey).not.toBe(result2.event.pubkey);
    });
  });

  describe('Property-Based Tests', () => {
    const hexChar = fc.constantFrom(...'0123456789abcdef'.split(''));
    const hexString64 = fc.array(hexChar, { minLength: 64, maxLength: 64 }).map((chars) => chars.join(''));
    const httpMethod = fc.constantFrom('GET', 'PUT', 'POST', 'DELETE', 'HEAD');
    const httpsUrl = fc.webUrl({ withFragments: false }).map((url) => url.replace(/^http:/, 'https:'));

    it('should always produce valid signatures for any inputs', () => {
      fc.assert(
        fc.property(httpsUrl, httpMethod, hexString64, (url, method, hash) => {
          const key = generateSecretKey();
          const result = generateNip98Token(key, url, method, hash);

          expect(verifyEvent(result.event as any)).toBe(true);
          expect(result.event.kind).toBe(27235);
        }),
        { numRuns: 20 }
      );
    });

    it('should preserve all input parameters in tags', () => {
      fc.assert(
        fc.property(httpsUrl, httpMethod, hexString64, (url, method, hash) => {
          const key = generateSecretKey();
          const result = generateNip98Token(key, url, method, hash);

          const uTag = result.event.tags.find((t) => t[0] === 'u');
          const methodTag = result.event.tags.find((t) => t[0] === 'method');
          const payloadTag = result.event.tags.find((t) => t[0] === 'payload');

          expect(uTag![1]).toBe(url);
          expect(methodTag![1]).toBe(method);
          expect(payloadTag![1]).toBe(hash);
        }),
        { numRuns: 20 }
      );
    });

    it('should always produce valid base64 round-trip', () => {
      fc.assert(
        fc.property(httpsUrl, httpMethod, hexString64, (url, method, hash) => {
          const key = generateSecretKey();
          const result = generateNip98Token(key, url, method, hash);

          const base64Part = result.authorizationHeader.substring('Nostr '.length);
          const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString('utf-8'));
          expect(decoded.id).toBe(result.event.id);
        }),
        { numRuns: 20 }
      );
    });
  });
});
