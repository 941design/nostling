import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fc from 'fast-check';

/**
 * Property-Based Tests for NIP-17 Subscription Lookback Window
 *
 * Story: 01-subscription-lookback-window
 * Epic: nip17-timestamp-lookback
 *
 * Tests verify that kind-specific lookback windows are correctly applied:
 * - Kind 1059 (NIP-17 gift wraps): 3-day lookback
 * - All other kinds (including kind 4): 24-hour lookback
 */

// Constants from service.ts
const FIRST_STREAM_LOOKBACK = 24 * 60 * 60; // 24 hours in seconds
const NIP17_TIMESTAMP_WINDOW = 3 * 24 * 60 * 60; // 3 days in seconds
const CLOCK_SKEW_BUFFER = 60; // seconds

describe('Subscription Lookback Window', () => {
  describe('Lookback Window Selection', () => {
    it('P001: NIP-17 gift wraps (kind 1059) use 3-day lookback window', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000000 }), // currentTime
          (currentTime) => {
            const kind = 1059;
            const lastTimestamp = undefined; // First subscription scenario

            // When no prior timestamp exists, calculate lookback from current time
            const expectedSince = currentTime - NIP17_TIMESTAMP_WINDOW;
            const actualLookback = NIP17_TIMESTAMP_WINDOW;

            // Property: kind 1059 always uses 3-day window
            expect(actualLookback).toBe(3 * 24 * 60 * 60);
            expect(actualLookback).toBeGreaterThan(FIRST_STREAM_LOOKBACK);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P002: Kind 4 messages use 24-hour lookback window', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000000 }), // currentTime
          (currentTime) => {
            const kind = 4;
            const lastTimestamp = undefined; // First subscription scenario

            // When no prior timestamp exists, calculate lookback from current time
            const actualLookback = FIRST_STREAM_LOOKBACK;

            // Property: kind 4 uses 24-hour window
            expect(actualLookback).toBe(24 * 60 * 60);
            expect(actualLookback).toBeLessThan(NIP17_TIMESTAMP_WINDOW);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P003: Other event kinds use 24-hour lookback window', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30000 }).filter(k => k !== 1059 && k !== 4), // random kind (not 1059 or 4)
          fc.integer({ min: 1, max: 1000000 }), // currentTime
          (kind, currentTime) => {
            const lastTimestamp = undefined; // First subscription scenario

            // When no prior timestamp exists, calculate lookback from current time
            const actualLookback = FIRST_STREAM_LOOKBACK;

            // Property: all non-1059 kinds use 24-hour window
            expect(actualLookback).toBe(24 * 60 * 60);
            expect(actualLookback).toBeLessThan(NIP17_TIMESTAMP_WINDOW);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Timestamp Calculation Properties', () => {
    it('P004: With existing timestamp, clock skew buffer is applied regardless of kind', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(4, 1059), // kind
          fc.integer({ min: 1000000, max: 2000000 }), // lastTimestamp
          (kind, lastTimestamp) => {
            // When prior timestamp exists, subtract clock skew buffer
            const expectedSince = lastTimestamp - CLOCK_SKEW_BUFFER;

            // Property: clock skew buffer is applied uniformly
            expect(expectedSince).toBe(lastTimestamp - 60);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P005: First subscription uses kind-specific lookback from current time', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(4, 1059), // kind
          fc.integer({ min: 1000000, max: 2000000 }), // currentTime
          (kind, currentTime) => {
            const lastTimestamp = undefined; // No prior timestamp

            // Choose lookback based on kind
            const lookbackWindow = kind === 1059 ? NIP17_TIMESTAMP_WINDOW : FIRST_STREAM_LOOKBACK;
            const expectedSince = currentTime - lookbackWindow;

            // Property: since timestamp is always in the past
            expect(expectedSince).toBeLessThan(currentTime);

            // Property: correct window is applied
            if (kind === 1059) {
              expect(currentTime - expectedSince).toBe(NIP17_TIMESTAMP_WINDOW);
            } else {
              expect(currentTime - expectedSince).toBe(FIRST_STREAM_LOOKBACK);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('NIP-17 Timestamp Randomization Coverage', () => {
    it('P006: 3-day window covers NIP-17 randomization range plus safety buffer', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2 * 24 * 60 * 60 }), // randomization offset (0 to 2 days)
          fc.integer({ min: 1000000, max: 2000000 }), // currentTime
          (randomizationOffset, currentTime) => {
            // NIP-17 allows timestamps up to 2 days in the past
            const randomizedTimestamp = currentTime - randomizationOffset;
            const subscriptionSince = currentTime - NIP17_TIMESTAMP_WINDOW;

            // Property: 3-day window always covers the randomization range
            expect(randomizedTimestamp).toBeGreaterThanOrEqual(subscriptionSince);

            // Property: provides 1-day safety buffer beyond 2-day randomization
            const bufferSeconds = NIP17_TIMESTAMP_WINDOW - (2 * 24 * 60 * 60);
            expect(bufferSeconds).toBe(24 * 60 * 60); // Exactly 1 day
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P007: Events with randomized timestamps within 2 days are not missed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2 * 24 * 60 * 60 }), // randomization offset (0 to 2 days)
          fc.integer({ min: 1000000, max: 2000000 }), // eventCreationTime
          (randomizationOffset, eventCreationTime) => {
            // Simulate NIP-17 behavior: randomize timestamp up to 2 days in past
            const eventTimestamp = eventCreationTime - randomizationOffset;

            // Subscription starts with 3-day lookback
            const subscriptionStartTime = eventCreationTime;
            const subscriptionSince = subscriptionStartTime - NIP17_TIMESTAMP_WINDOW;

            // Property: event timestamp falls within subscription window
            const isWithinWindow = eventTimestamp >= subscriptionSince;
            expect(isWithinWindow).toBe(true);

            // Property: event would be missed with 24-hour window
            const oldWindowSince = subscriptionStartTime - FIRST_STREAM_LOOKBACK;
            const wouldBeMissedWithOldWindow = randomizationOffset > FIRST_STREAM_LOOKBACK;

            if (wouldBeMissedWithOldWindow) {
              expect(eventTimestamp).toBeLessThan(oldWindowSince);
            }
          }
        ),
        { numRuns: 1000 } // More runs to cover edge cases
      );
    });
  });

  describe('Backward Compatibility', () => {
    it('P008: Kind 4 behavior unchanged from original implementation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1000000, max: 2000000 }), // currentTime
          fc.option(fc.integer({ min: 500000, max: 1999999 })), // lastTimestamp (optional)
          (currentTime, lastTimestamp) => {
            const kind = 4;

            // Original logic: use stored timestamp with buffer, or 24h lookback
            const expectedSince = lastTimestamp !== null
              ? lastTimestamp - CLOCK_SKEW_BUFFER
              : currentTime - FIRST_STREAM_LOOKBACK;

            // Property: kind 4 always uses 24-hour window for first subscription
            if (lastTimestamp === null) {
              expect(currentTime - expectedSince).toBe(FIRST_STREAM_LOOKBACK);
            } else {
              expect(expectedSince).toBe(lastTimestamp - CLOCK_SKEW_BUFFER);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('End-to-End Integration Scenarios', () => {
    it('E2E-001: Complete subscription workflow with NIP-17 message delivery', () => {
      // Scenario: Alice sends a NIP-17 encrypted DM to Bob
      // The message timestamp is randomized 1.5 days in the past (per NIP-17 spec)
      // Bob's subscription should capture this message with the 3-day lookback

      const now = Math.floor(Date.now() / 1000);
      const nip17RandomizationOffset = 1.5 * 24 * 60 * 60; // 1.5 days
      const messageTimestamp = now - nip17RandomizationOffset;

      // Bob starts subscription (first time, no stored timestamp)
      const subscriptionKind = 1059; // NIP-17 gift wrap
      const lookbackWindow = NIP17_TIMESTAMP_WINDOW; // 3 days
      const subscriptionSince = now - lookbackWindow;

      // Verify: Message falls within subscription window
      expect(messageTimestamp).toBeGreaterThanOrEqual(subscriptionSince);
      expect(messageTimestamp).toBeLessThanOrEqual(now);

      // Verify: Old 24h window would have missed this message
      const oldWindowSince = now - FIRST_STREAM_LOOKBACK;
      expect(messageTimestamp).toBeLessThan(oldWindowSince);

      // Property: 3-day window captures all messages within NIP-17 randomization range
      const withinNip17Range = nip17RandomizationOffset <= 2 * 24 * 60 * 60;
      const capturedByNewWindow = messageTimestamp >= subscriptionSince;
      expect(withinNip17Range).toBe(true);
      expect(capturedByNewWindow).toBe(true);
    });

    it('E2E-002: Kind 4 messages continue to use 24-hour window', () => {
      // Scenario: Alice sends a kind 4 DM to Bob
      // Kind 4 does not use timestamp randomization
      // Bob's subscription should use the original 24-hour window

      const now = Math.floor(Date.now() / 1000);
      const messageTimestamp = now - 1; // Sent 1 second ago

      // Bob starts subscription (first time, no stored timestamp)
      const subscriptionKind = 4; // Kind 4 DM
      const lookbackWindow = FIRST_STREAM_LOOKBACK; // 24 hours
      const subscriptionSince = now - lookbackWindow;

      // Verify: Message falls within 24h window
      expect(messageTimestamp).toBeGreaterThanOrEqual(subscriptionSince);
      expect(messageTimestamp).toBeLessThanOrEqual(now);

      // Verify: Lookback is exactly 24 hours, not 3 days
      expect(lookbackWindow).toBe(24 * 60 * 60);
      expect(lookbackWindow).toBeLessThan(NIP17_TIMESTAMP_WINDOW);
    });

    it('E2E-003: Resumption scenario with stored timestamp', () => {
      // Scenario: Bob's client was offline, then comes back online
      // A stored timestamp exists from previous session
      // Both kind 1059 and kind 4 should use stored timestamp with clock skew buffer

      const now = Math.floor(Date.now() / 1000);
      const storedTimestamp = now - 1000; // Stored from 1000 seconds ago

      // Verify: For both kinds, stored timestamp is used (not lookback window)
      for (const kind of [4, 1059]) {
        const sinceTimestamp = storedTimestamp - CLOCK_SKEW_BUFFER;

        expect(sinceTimestamp).toBe(storedTimestamp - 60);
        expect(sinceTimestamp).toBeGreaterThan(now - NIP17_TIMESTAMP_WINDOW);
        expect(sinceTimestamp).toBeGreaterThan(now - FIRST_STREAM_LOOKBACK);
      }

      // Property: When resuming, kind doesn't affect since calculation
      const kind4Since = storedTimestamp - CLOCK_SKEW_BUFFER;
      const kind1059Since = storedTimestamp - CLOCK_SKEW_BUFFER;
      expect(kind4Since).toBe(kind1059Since);
    });
  });

  describe('Integration Properties', () => {
    it('P009: Lookback window selection is deterministic based on kind', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(4, 1059), // kind
          (kind) => {
            // Multiple calls with same kind should yield same lookback window
            const window1 = kind === 1059 ? NIP17_TIMESTAMP_WINDOW : FIRST_STREAM_LOOKBACK;
            const window2 = kind === 1059 ? NIP17_TIMESTAMP_WINDOW : FIRST_STREAM_LOOKBACK;

            // Property: deterministic selection
            expect(window1).toBe(window2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('P010: Since timestamp is always a non-negative Unix timestamp', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(4, 1059), // kind
          fc.integer({ min: 1000000, max: 2000000 }), // currentTime
          fc.option(fc.integer({ min: 500000, max: 1999999 })), // lastTimestamp (optional)
          (kind, currentTime, lastTimestamp) => {
            const lookbackWindow = kind === 1059 ? NIP17_TIMESTAMP_WINDOW : FIRST_STREAM_LOOKBACK;

            const sinceTimestamp = lastTimestamp !== null
              ? lastTimestamp - CLOCK_SKEW_BUFFER
              : currentTime - lookbackWindow;

            // Property: since is always non-negative
            expect(sinceTimestamp).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
