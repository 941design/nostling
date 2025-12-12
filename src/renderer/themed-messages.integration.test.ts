/**
 * Integration tests for themed message system.
 *
 * These tests verify the complete integration of ostrich-themed messages
 * throughout the application, including:
 * - Update status text generation with theming
 * - Nostling queue status text with theming
 * - Dynamic content preservation
 * - System-level properties across components
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { getStatusText } from './utils';
import { getNostlingStatusTextThemed, type QueueSummary } from './nostling/state.themed';
import { getThemedMessagesConfig } from './themed-messages';
import type { UpdateState, UpdatePhase } from '../shared/types';

// ============================================================================
// INTEGRATION TEST: Update Status Theming
// ============================================================================

describe('Themed Messages - Update Status Integration', () => {
  it('INT001: getStatusText returns themed messages for all phases', () => {
    const phases: UpdatePhase[] = [
      'idle',
      'checking',
      'available',
      'downloading',
      'downloaded',
      'verifying',
      'ready',
      'mounting',
      'mounted',
      'failed',
    ];

    fc.assert(
      fc.property(fc.constantFrom(...phases), (phase) => {
        const updateState: UpdateState = { phase };
        const result = getStatusText(updateState);

        // Result must be non-empty
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);

        // Verify result could be a themed message (non-deterministic due to randomness)
        // We check that the message is one of the alternatives for this phase
        const config = getThemedMessagesConfig();
        const alternatives = config.updatePhases[phase] || [];

        // Either the result is exactly a themed alternative (no dynamic content),
        // or it contains a themed alternative as a substring (with dynamic content)
        const containsThemedMessage = alternatives.some((alt) => result.includes(alt) || result === alt);
        expect(containsThemedMessage).toBe(true);
      })
    );
  });

  it('INT002: Dynamic content preserved in themed update messages', () => {
    fc.assert(
      fc.property(
        fc.record({
          version: fc.string({ minLength: 1, maxLength: 10 }),
        }),
        ({ version }) => {
          // Test 'available' phase with version
          const availableState: UpdateState = {
            phase: 'available',
            version,
          };

          const availableResult = getStatusText(availableState);
          if (version.trim()) {
            expect(availableResult).toContain(`v${version}`);
          }

          // Test 'ready' phase with version
          const readyState: UpdateState = {
            phase: 'ready',
            version,
          };

          const readyResult = getStatusText(readyState);
          if (version.trim()) {
            expect(readyResult).toContain(`v${version}`);
          }
        }
      )
    );
  });

  it('INT003: Progress data preserved in downloading phase', () => {
    fc.assert(
      fc.property(
        fc.record({
          percent: fc.integer({ min: 0, max: 100 }),
          transferred: fc.integer({ min: 0, max: 1073741824 }),
          total: fc.integer({ min: 1, max: 1073741824 }),
          bytesPerSecond: fc.integer({ min: 0, max: 10485760 }),
        }),
        (progress) => {
          const updateState: UpdateState = {
            phase: 'downloading',
            progress,
          };

          const result = getStatusText(updateState);

          // Verify progress components present
          expect(result).toContain('%');
          expect(result).toMatch(/\(/); // bytes in parens
          expect(result).toMatch(/\//); // transferred / total
          expect(result).toMatch(/@/); // speed indicator
          expect(result).toContain('/s'); // speed unit
        }
      )
    );
  });

  it('INT004: Error details preserved in failed phase', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (detail) => {
          const updateState: UpdateState = {
            phase: 'failed',
            detail,
          };

          const result = getStatusText(updateState);
          if (detail.trim()) {
            expect(result).toContain(detail);
          }
        }
      )
    );
  });
});

// ============================================================================
// INTEGRATION TEST: Nostling Queue Status Theming
// ============================================================================

describe('Themed Messages - Nostling Queue Integration', () => {
  it('INT005: getNostlingStatusTextThemed returns themed messages for all states', () => {
    const testCases: Array<{ hasBridge: boolean; queueSummary: QueueSummary; expectedState: string }> = [
      { hasBridge: false, queueSummary: { queued: 0, sending: 0, errors: 0 }, expectedState: 'unavailable' },
      { hasBridge: true, queueSummary: { queued: 0, sending: 0, errors: 3 }, expectedState: 'error' },
      { hasBridge: true, queueSummary: { queued: 0, sending: 2, errors: 0 }, expectedState: 'sending' },
      { hasBridge: true, queueSummary: { queued: 5, sending: 0, errors: 0 }, expectedState: 'queued' },
      {
        hasBridge: true,
        queueSummary: { queued: 0, sending: 0, errors: 0, lastActivity: '2025-12-12T10:00:00Z' },
        expectedState: 'synced',
      },
      { hasBridge: true, queueSummary: { queued: 0, sending: 0, errors: 0 }, expectedState: 'idle' },
    ];

    for (const { hasBridge, queueSummary, expectedState } of testCases) {
      const result = getNostlingStatusTextThemed(hasBridge, queueSummary);

      // Result must be non-empty
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);

      // Verify result matches expected state pattern
      const config = getThemedMessagesConfig();

      if (expectedState === 'unavailable') {
        expect(result).toBe('Nostling bridge unavailable');
      } else if (expectedState === 'error') {
        expect(result).toContain(queueSummary.errors.toString());
        const alternatives = config.nostlingStatuses.error || [];
        const containsThemed = alternatives.some((alt) => result.includes(alt));
        expect(containsThemed).toBe(true);
      } else if (expectedState === 'sending') {
        expect(result).toContain(queueSummary.sending.toString());
        const alternatives = config.nostlingStatuses.sending || [];
        const containsThemed = alternatives.some((alt) => result.includes(alt));
        expect(containsThemed).toBe(true);
      } else if (expectedState === 'queued') {
        expect(result).toContain(queueSummary.queued.toString());
        const alternatives = config.nostlingStatuses.queued || [];
        const containsThemed = alternatives.some((alt) => result.includes(alt));
        expect(containsThemed).toBe(true);
      } else if (expectedState === 'synced') {
        const alternatives = config.nostlingQueueStates.synced || [];
        const matchesThemed = alternatives.some((alt) => result === alt);
        expect(matchesThemed).toBe(true);
      } else if (expectedState === 'idle') {
        const alternatives = config.nostlingQueueStates.idle || [];
        const matchesThemed = alternatives.some((alt) => result === alt);
        expect(matchesThemed).toBe(true);
      }
    }
  });

  it('INT006: Message counts preserved in nostling themed status', () => {
    fc.assert(
      fc.property(
        fc.record({
          errors: fc.integer({ min: 1, max: 100 }),
          sending: fc.integer({ min: 0, max: 50 }),
          queued: fc.integer({ min: 0, max: 200 }),
        }),
        ({ errors, sending, queued }) => {
          // Test error state (highest priority)
          const errorSummary: QueueSummary = { queued, sending, errors };
          const errorResult = getNostlingStatusTextThemed(true, errorSummary);
          expect(errorResult).toContain(errors.toString());

          // Test sending state (when no errors)
          if (sending > 0) {
            const sendingSummary: QueueSummary = { queued, sending, errors: 0 };
            const sendingResult = getNostlingStatusTextThemed(true, sendingSummary);
            expect(sendingResult).toContain(sending.toString());
          }

          // Test queued state (when no errors or sending)
          if (queued > 0) {
            const queuedSummary: QueueSummary = { queued, sending: 0, errors: 0 };
            const queuedResult = getNostlingStatusTextThemed(true, queuedSummary);
            expect(queuedResult).toContain(queued.toString());
          }
        }
      )
    );
  });

  it('INT007: Priority order enforced in nostling status', () => {
    const queueSummary: QueueSummary = {
      queued: 10,
      sending: 5,
      errors: 3,
    };

    // With errors, sending, and queued all > 0, errors should win
    const result = getNostlingStatusTextThemed(true, queueSummary);
    expect(result).toContain('3'); // error count
    expect(result).not.toContain('5'); // sending count not shown
    expect(result).not.toContain('10'); // queued count not shown

    // Verify it's using error themed message
    const config = getThemedMessagesConfig();
    const errorAlternatives = config.nostlingStatuses.error || [];
    const containsErrorThemed = errorAlternatives.some((alt) => result.includes(alt));
    expect(containsErrorThemed).toBe(true);
  });
});

// ============================================================================
// INTEGRATION TEST: System-Level Properties
// ============================================================================

describe('Themed Messages - System-Level Properties', () => {
  it('INT008: All themed messages are non-empty strings', () => {
    const config = getThemedMessagesConfig();

    // Check update phases
    for (const [phase, alternatives] of Object.entries(config.updatePhases)) {
      expect(alternatives.length).toBeGreaterThan(0);
      for (const alt of alternatives) {
        expect(typeof alt).toBe('string');
        expect(alt.length).toBeGreaterThan(0);
      }
    }

    // Check nostling statuses
    for (const [status, alternatives] of Object.entries(config.nostlingStatuses)) {
      expect(alternatives.length).toBeGreaterThan(0);
      for (const alt of alternatives) {
        expect(typeof alt).toBe('string');
        expect(alt.length).toBeGreaterThan(0);
      }
    }

    // Check nostling queue states
    for (const [state, alternatives] of Object.entries(config.nostlingQueueStates)) {
      expect(alternatives.length).toBeGreaterThan(0);
      for (const alt of alternatives) {
        expect(typeof alt).toBe('string');
        expect(alt.length).toBeGreaterThan(0);
      }
    }
  });

  it('INT009: Themed messages are variably selected (non-deterministic)', () => {
    // This test verifies that calling getStatusText multiple times
    // with the same input can produce different results (due to randomness)
    const updateState: UpdateState = { phase: 'idle' };

    const results = new Set<string>();
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      results.add(getStatusText(updateState));
    }

    // If there are multiple alternatives for 'idle', we should see variety
    const config = getThemedMessagesConfig();
    const idleAlternatives = config.updatePhases.idle || [];

    if (idleAlternatives.length > 1) {
      // With 100 iterations and multiple alternatives, we should see at least 2 different results
      expect(results.size).toBeGreaterThan(1);
    } else {
      // If only one alternative, all results should be the same
      expect(results.size).toBe(1);
    }
  });

  it('INT010: Integration preserves original function signatures', () => {
    // Verify getStatusText maintains its signature
    const updateState: UpdateState = { phase: 'idle' };
    const result = getStatusText(updateState);
    expect(typeof result).toBe('string');

    // Verify getNostlingStatusTextThemed maintains its signature
    const queueSummary: QueueSummary = { queued: 0, sending: 0, errors: 0 };
    const nostlingResult = getNostlingStatusTextThemed(true, queueSummary);
    expect(typeof nostlingResult).toBe('string');
  });

  it('INT011: Themed system handles all edge cases gracefully', () => {
    // Empty/whitespace version
    expect(getStatusText({ phase: 'available', version: '' })).toBeTruthy();
    expect(getStatusText({ phase: 'available', version: '   ' })).toBeTruthy();

    // Empty/whitespace detail
    expect(getStatusText({ phase: 'failed', detail: '' })).toBeTruthy();
    expect(getStatusText({ phase: 'failed', detail: '   ' })).toBeTruthy();

    // Missing progress data
    expect(getStatusText({ phase: 'downloading' })).toBeTruthy();
    expect(getStatusText({ phase: 'mounting' })).toBeTruthy();

    // Bridge unavailable
    expect(getNostlingStatusTextThemed(false, { queued: 0, sending: 0, errors: 0 })).toBe(
      'Nostling bridge unavailable'
    );

    // All zeros
    expect(getNostlingStatusTextThemed(true, { queued: 0, sending: 0, errors: 0 })).toBeTruthy();
  });
});
