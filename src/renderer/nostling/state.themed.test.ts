/**
 * Property-based tests for themed Nostling queue status text
 *
 * Tests verify all contract invariants and properties:
 * - Result is never empty string
 * - Message counts are preserved in result (when > 0)
 * - Priority order: no bridge > errors > sending > queued > synced > idle
 * - Completeness: All queue states have corresponding themed alternatives
 * - Count accuracy: Numeric counts match input exactly
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { getNostlingStatusTextThemed, QueueSummary } from './state.themed';
import { getThemedMessagesConfig } from '../themed-messages';

const themedConfig = getThemedMessagesConfig();

// Arbitraries for generating queue summaries
const nonNegativeInt = fc.integer({ min: 0, max: 100 });

const queueSummaryArb = fc.record({
  queued: nonNegativeInt,
  sending: nonNegativeInt,
  errors: nonNegativeInt,
  lastActivity: fc.option(fc.constant('2025-12-12T10:30:00Z'), { nil: undefined }),
});

const queueSummaryWithErrorsArb = fc.record({
  queued: nonNegativeInt,
  sending: nonNegativeInt,
  errors: fc.integer({ min: 1, max: 100 }),
  lastActivity: fc.option(fc.constant('2025-12-12T10:30:00Z'), { nil: undefined }),
});

const queueSummaryWithSendingArb = fc.record({
  queued: nonNegativeInt,
  sending: fc.integer({ min: 1, max: 100 }),
  errors: fc.constant(0),
  lastActivity: fc.option(fc.constant('2025-12-12T10:30:00Z'), { nil: undefined }),
});

const queueSummaryWithQueuedArb = fc.record({
  queued: fc.integer({ min: 1, max: 100 }),
  sending: fc.constant(0),
  errors: fc.constant(0),
  lastActivity: fc.option(fc.constant('2025-12-12T10:30:00Z'), { nil: undefined }),
});

const queueSummarySyncedArb = fc.record({
  queued: fc.constant(0),
  sending: fc.constant(0),
  errors: fc.constant(0),
  lastActivity: fc.constant('2025-12-12T10:30:00Z'),
});

const queueSummaryIdleArb = fc.record({
  queued: fc.constant(0),
  sending: fc.constant(0),
  errors: fc.constant(0),
  lastActivity: fc.constant(undefined),
});

describe('getNostlingStatusTextThemed', () => {
  describe('Invariants', () => {
    it('INV001: Result is never empty string', () => {
      fc.assert(
        fc.property(fc.boolean(), queueSummaryArb, (hasBridge, queueSummary) => {
          const result = getNostlingStatusTextThemed(hasBridge, queueSummary);
          expect(result).not.toBe('');
          expect(result.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('INV002: Error count is preserved in result when errors > 0', () => {
      fc.assert(
        fc.property(queueSummaryWithErrorsArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          const countMatch = result.match(/^(\d+)\s/);
          expect(countMatch).not.toBeNull();
          const extractedCount = parseInt(countMatch![1], 10);
          expect(extractedCount).toBe(queueSummary.errors);
        }),
        { numRuns: 50 }
      );
    });

    it('INV003: Sending count is preserved in result when sending > 0 and no errors', () => {
      fc.assert(
        fc.property(queueSummaryWithSendingArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          const countMatch = result.match(/^(\d+)\s/);
          expect(countMatch).not.toBeNull();
          const extractedCount = parseInt(countMatch![1], 10);
          expect(extractedCount).toBe(queueSummary.sending);
        }),
        { numRuns: 50 }
      );
    });

    it('INV004: Queued count is preserved in result when queued > 0, no errors/sending', () => {
      fc.assert(
        fc.property(queueSummaryWithQueuedArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          const countMatch = result.match(/^(\d+)\s/);
          expect(countMatch).not.toBeNull();
          const extractedCount = parseInt(countMatch![1], 10);
          expect(extractedCount).toBe(queueSummary.queued);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Priority Order Properties', () => {
    it('PROP001: No bridge state has highest priority (overrides all other states)', () => {
      fc.assert(
        fc.property(queueSummaryArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(false, queueSummary);
          expect(result).toBe('Nostling bridge unavailable');
        }),
        { numRuns: 50 }
      );
    });

    it('PROP002: Error state takes priority over sending/queued/synced/idle', () => {
      fc.assert(
        fc.property(queueSummaryWithErrorsArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          // Result should contain error themed message
          const containsErrorTheme = themedConfig.nostlingStatuses.error.some((msg) =>
            result.includes(msg)
          );
          expect(containsErrorTheme).toBe(true);
          // Should start with error count
          expect(result).toMatch(/^\d+\s/);
        }),
        { numRuns: 50 }
      );
    });

    it('PROP003: Sending state takes priority over queued/synced/idle (when no errors)', () => {
      fc.assert(
        fc.property(queueSummaryWithSendingArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          // Result should contain sending themed message
          const containsSendingTheme = themedConfig.nostlingStatuses.sending.some((msg) =>
            result.includes(msg)
          );
          expect(containsSendingTheme).toBe(true);
          // Should start with sending count
          expect(result).toMatch(/^\d+\s/);
        }),
        { numRuns: 50 }
      );
    });

    it('PROP004: Queued state takes priority over synced/idle (when no errors/sending)', () => {
      fc.assert(
        fc.property(queueSummaryWithQueuedArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          // Result should contain queued themed message
          const containsQueuedTheme = themedConfig.nostlingStatuses.queued.some((msg) =>
            result.includes(msg)
          );
          expect(containsQueuedTheme).toBe(true);
          // Should contain offline themed message in parentheses
          const containsOfflineTheme = themedConfig.nostlingQueueStates.offline.some((msg) =>
            result.includes(`(${msg})`)
          );
          expect(containsOfflineTheme).toBe(true);
          // Should start with queued count
          expect(result).toMatch(/^\d+\s/);
        }),
        { numRuns: 50 }
      );
    });

    it('PROP005: Synced state takes priority over idle (when no errors/sending/queued)', () => {
      fc.assert(
        fc.property(queueSummarySyncedArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          // Result should be one of the synced themed messages
          const isSyncedTheme = themedConfig.nostlingQueueStates.synced.includes(result);
          expect(isSyncedTheme).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('PROP006: Idle state is default (when no errors/sending/queued/lastActivity)', () => {
      fc.assert(
        fc.property(queueSummaryIdleArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          // Result should be one of the idle themed messages
          const isIdleTheme = themedConfig.nostlingQueueStates.idle.includes(result);
          expect(isIdleTheme).toBe(true);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Completeness Properties', () => {
    it('PROP007: All possible queue states return valid themed messages', () => {
      fc.assert(
        fc.property(fc.boolean(), queueSummaryArb, (hasBridge, queueSummary) => {
          const result = getNostlingStatusTextThemed(hasBridge, queueSummary);

          if (!hasBridge) {
            // No bridge: exact fixed message
            expect(result).toBe('Nostling bridge unavailable');
          } else if (queueSummary.errors > 0) {
            // Error state: must contain error themed message
            const containsErrorTheme = themedConfig.nostlingStatuses.error.some((msg) =>
              result.includes(msg)
            );
            expect(containsErrorTheme).toBe(true);
          } else if (queueSummary.sending > 0) {
            // Sending state: must contain sending themed message
            const containsSendingTheme = themedConfig.nostlingStatuses.sending.some((msg) =>
              result.includes(msg)
            );
            expect(containsSendingTheme).toBe(true);
          } else if (queueSummary.queued > 0) {
            // Queued state: must contain queued and offline themed messages
            const containsQueuedTheme = themedConfig.nostlingStatuses.queued.some((msg) =>
              result.includes(msg)
            );
            const containsOfflineTheme = themedConfig.nostlingQueueStates.offline.some((msg) =>
              result.includes(msg)
            );
            expect(containsQueuedTheme).toBe(true);
            expect(containsOfflineTheme).toBe(true);
          } else if (queueSummary.lastActivity) {
            // Synced state: must be one of synced themed messages
            const isSyncedTheme = themedConfig.nostlingQueueStates.synced.includes(result);
            expect(isSyncedTheme).toBe(true);
          } else {
            // Idle state: must be one of idle themed messages
            const isIdleTheme = themedConfig.nostlingQueueStates.idle.includes(result);
            expect(isIdleTheme).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Format Properties', () => {
    it('PROP008: States with counts format as "{count} {themed-message}"', () => {
      fc.assert(
        fc.property(
          fc.oneof(queueSummaryWithErrorsArb, queueSummaryWithSendingArb),
          (queueSummary) => {
            const result = getNostlingStatusTextThemed(true, queueSummary);
            // Should start with number followed by space
            expect(result).toMatch(/^\d+\s/);
            // Extract count
            const countMatch = result.match(/^(\d+)\s(.+)$/);
            expect(countMatch).not.toBeNull();
            const [, count, message] = countMatch!;
            // Count should be numeric
            expect(parseInt(count, 10)).toBeGreaterThan(0);
            // Message part should not be empty
            expect(message.trim().length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('PROP009: Queued state formats as "{count} {themed-queued} ({themed-offline})"', () => {
      fc.assert(
        fc.property(queueSummaryWithQueuedArb, (queueSummary) => {
          const result = getNostlingStatusTextThemed(true, queueSummary);
          // Should match pattern: number, space, text, space, parentheses with text
          expect(result).toMatch(/^\d+\s.+\s\(.+\)$/);
          // Extract count
          const countMatch = result.match(/^(\d+)\s/);
          expect(countMatch).not.toBeNull();
          const extractedCount = parseInt(countMatch![1], 10);
          expect(extractedCount).toBe(queueSummary.queued);
        }),
        { numRuns: 50 }
      );
    });

    it('PROP010: Synced and idle states contain no counts', () => {
      fc.assert(
        fc.property(
          fc.oneof(queueSummarySyncedArb, queueSummaryIdleArb),
          (queueSummary) => {
            const result = getNostlingStatusTextThemed(true, queueSummary);
            // Should NOT start with a number
            expect(result).not.toMatch(/^\d+\s/);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Edge Cases (Example-Based)', () => {
    it('should handle zero counts correctly', () => {
      const queueSummary: QueueSummary = {
        queued: 0,
        sending: 0,
        errors: 0,
      };
      const result = getNostlingStatusTextThemed(true, queueSummary);
      // Should return idle themed message
      expect(themedConfig.nostlingQueueStates.idle).toContain(result);
    });

    it('should handle bridge unavailable with non-zero counts', () => {
      const queueSummary: QueueSummary = {
        queued: 5,
        sending: 3,
        errors: 2,
        lastActivity: '2025-12-12T10:30:00Z',
      };
      const result = getNostlingStatusTextThemed(false, queueSummary);
      expect(result).toBe('Nostling bridge unavailable');
    });

    it('should prioritize errors over all other states', () => {
      const queueSummary: QueueSummary = {
        queued: 10,
        sending: 5,
        errors: 1,
        lastActivity: '2025-12-12T10:30:00Z',
      };
      const result = getNostlingStatusTextThemed(true, queueSummary);
      expect(result).toMatch(/^1\s/);
      const containsErrorTheme = themedConfig.nostlingStatuses.error.some((msg) =>
        result.includes(msg)
      );
      expect(containsErrorTheme).toBe(true);
    });

    it('should prioritize sending over queued and synced', () => {
      const queueSummary: QueueSummary = {
        queued: 10,
        sending: 2,
        errors: 0,
        lastActivity: '2025-12-12T10:30:00Z',
      };
      const result = getNostlingStatusTextThemed(true, queueSummary);
      expect(result).toMatch(/^2\s/);
      const containsSendingTheme = themedConfig.nostlingStatuses.sending.some((msg) =>
        result.includes(msg)
      );
      expect(containsSendingTheme).toBe(true);
    });

    it('should prioritize queued over synced', () => {
      const queueSummary: QueueSummary = {
        queued: 7,
        sending: 0,
        errors: 0,
        lastActivity: '2025-12-12T10:30:00Z',
      };
      const result = getNostlingStatusTextThemed(true, queueSummary);
      expect(result).toMatch(/^7\s/);
      const containsQueuedTheme = themedConfig.nostlingStatuses.queued.some((msg) =>
        result.includes(msg)
      );
      expect(containsQueuedTheme).toBe(true);
    });

    it('should handle lastActivity as null-like (undefined)', () => {
      const queueSummary: QueueSummary = {
        queued: 0,
        sending: 0,
        errors: 0,
        lastActivity: undefined,
      };
      const result = getNostlingStatusTextThemed(true, queueSummary);
      expect(themedConfig.nostlingQueueStates.idle).toContain(result);
    });

    it('should handle lastActivity with timestamp for synced state', () => {
      const queueSummary: QueueSummary = {
        queued: 0,
        sending: 0,
        errors: 0,
        lastActivity: '2025-12-12T10:30:00Z',
      };
      const result = getNostlingStatusTextThemed(true, queueSummary);
      expect(themedConfig.nostlingQueueStates.synced).toContain(result);
    });

    it('should handle large counts correctly', () => {
      const queueSummary: QueueSummary = {
        queued: 0,
        sending: 0,
        errors: 999,
      };
      const result = getNostlingStatusTextThemed(true, queueSummary);
      expect(result).toMatch(/^999\s/);
    });
  });
});
