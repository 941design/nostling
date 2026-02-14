/**
 * Bug reproduction test: Footer does not show relay connection status
 *
 * Bug report: bug-reports/footer-missing-relay-status-report.md
 * Created: 2026-02-14
 *
 * REPRODUCTION:
 * The footer's `getNostlingStatusTextThemed()` function only considers message
 * queue state (queued, sending, errors). It does NOT consume relay connection
 * status, even though relay status is tracked in main.tsx.
 *
 * EXPECTED BEHAVIOR:
 * When all relays are disconnected, the footer should show a disconnection
 * indicator (e.g., themed "offline" message) to alert the user.
 *
 * ACTUAL BEHAVIOR:
 * The footer shows "Nostling idle" or "Preening peacefully" even when all
 * relays are disconnected, giving no indication of connectivity loss.
 */

import { describe, it, expect } from '@jest/globals';
import { getNostlingStatusTextThemed, type QueueSummary } from './state.themed';

describe('Bug: Footer does not show relay connection status', () => {
  it('REGRESSION TEST: When all relays disconnected, footer shows offline status', () => {
    // Regression test for bug: footer-missing-relay-status
    // Bug report: bug-reports/footer-missing-relay-status-report.md
    // Fixed: 2026-02-14

    const queueSummary: QueueSummary = {
      queued: 0,
      sending: 0,
      errors: 0,
    };

    const relayStatus = {
      'ws://localhost:8080/': 'disconnected',
      'wss://relay.example.com/': 'disconnected',
    };

    // After fix: function accepts relayStatus parameter
    const result = getNostlingStatusTextThemed(true, queueSummary, relayStatus);

    // When all relays are disconnected, should show offline-themed message
    const offlineMessages = [
      'offline',
      'savanna unreachable',
      'flock distant',
    ];

    expect(offlineMessages).toContain(result);
  });

  it('REGRESSION TEST: When all relays disconnected (different URLs), footer shows offline status', () => {
    // Additional regression test: verify behavior with different relay URLs

    const queueSummary: QueueSummary = {
      queued: 0,
      sending: 0,
      errors: 0,
    };

    const allRelaysDisconnected = {
      'ws://localhost:8080/': 'disconnected',
      'wss://relay.example.com/': 'disconnected',
    };

    // When all relays are disconnected, should return offline-themed message
    // even if queue is empty (higher priority than idle/synced)
    const result = getNostlingStatusTextThemed(true, queueSummary, allRelaysDisconnected);

    // Expected offline-themed messages from themed-messages.json
    const expectedOfflineMessages = [
      'offline',
      'savanna unreachable',
      'flock distant',
    ];

    expect(expectedOfflineMessages).toContain(result);
  });

  it('REGRESSION TEST: When at least one relay connected, footer shows normal status', () => {
    // Verify that relay disconnection should NOT override normal status
    // when at least one relay is connected

    const queueSummary: QueueSummary = {
      queued: 0,
      sending: 0,
      errors: 0,
    };

    const someRelaysConnected = {
      'ws://localhost:8080/': 'connected',
      'wss://relay.example.com/': 'disconnected',
    };

    // When at least one relay is connected, should return normal idle status
    // (relay disconnection should only trigger when ALL relays are disconnected)
    const result = getNostlingStatusTextThemed(true, queueSummary, someRelaysConnected);

    // Expected idle-themed messages from themed-messages.json
    const expectedIdleMessages = [
      'Nostling idle',
      'Resting on the savanna',
      'Preening peacefully',
    ];

    expect(expectedIdleMessages).toContain(result);
  });

  it('REGRESSION TEST: Relay status has lower priority than errors/sending/queued', () => {
    // Relay disconnection should be higher priority than idle/synced,
    // but LOWER priority than errors, sending, or queued messages

    const relayStatus = {
      'ws://localhost:8080/': 'disconnected',
    };

    // Priority 2: Errors - should override relay disconnection
    const queueWithErrors: QueueSummary = {
      queued: 0,
      sending: 0,
      errors: 2,
    };

    // Errors should still be shown (higher priority than relay status)
    const result = getNostlingStatusTextThemed(true, queueWithErrors, relayStatus);
    expect(result).toContain('2'); // Error count should be visible

    // Priority 3: Sending - should override relay disconnection
    const queueWithSending: QueueSummary = {
      queued: 0,
      sending: 1,
      errors: 0,
    };

    // Sending should still be shown (higher priority than relay status)
    const result2 = getNostlingStatusTextThemed(true, queueWithSending, relayStatus);
    expect(result2).toContain('1'); // Sending count should be visible

    // Priority 4: Queued - should override relay disconnection
    const queueWithQueued: QueueSummary = {
      queued: 3,
      sending: 0,
      errors: 0,
    };

    // Queued should still be shown (higher priority than relay status)
    const result3 = getNostlingStatusTextThemed(true, queueWithQueued, relayStatus);
    expect(result3).toContain('3'); // Queued count should be visible
  });

  it('REGRESSION TEST: Backward compatibility - omitting relayStatus returns idle status', () => {
    // Verify backward compatibility: when relayStatus is omitted,
    // function should behave as before (return idle status when queue empty)

    const queueSummary: QueueSummary = {
      queued: 0,
      sending: 0,
      errors: 0,
    };

    // Call without relayStatus parameter (backward compatible)
    const result = getNostlingStatusTextThemed(true, queueSummary);

    // Should return idle-themed message when queue is empty and no relay status provided
    const idleMessages = [
      'Nostling idle',
      'Resting on the savanna',
      'Preening peacefully',
    ];

    expect(idleMessages).toContain(result);
  });

  it('REGRESSION TEST: Empty relay status object returns idle status', () => {
    // When relayStatus is an empty object, should behave as if no relays configured
    // (return idle status, not offline)

    const queueSummary: QueueSummary = {
      queued: 0,
      sending: 0,
      errors: 0,
    };

    const emptyRelayStatus = {};

    // Empty relay status should not trigger offline state
    const result = getNostlingStatusTextThemed(true, queueSummary, emptyRelayStatus);

    const idleMessages = [
      'Nostling idle',
      'Resting on the savanna',
      'Preening peacefully',
    ];

    expect(idleMessages).toContain(result);
  });
});
