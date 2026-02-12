/**
 * Regression Test: Relay WebSocket Auto-Reconnection
 *
 * Bug: When a relay WebSocket connection drops, the client permanently remains
 * in "disconnected" state. No automatic reconnection is attempted.
 *
 * Bug report: bug-reports/relay-no-auto-reconnect-report.md
 * Fixed: 2026-02-12
 *
 * Root cause: startStatusMonitoring() detected drops but didn't reconnect
 *
 * Protection: Ensures automatic reconnection with exponential backoff when
 * relay connections drop due to network interruption or relay restart.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { RelayPool, type RelayEndpoint } from './relay-pool';
import { SimplePool } from 'nostr-tools';

// Helper to normalize URL format (match SimplePool's trailing slash)
function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/';
}

jest.mock('../logging', () => ({
  log: jest.fn(),
}));

jest.mock('nostr-tools', () => ({
  SimplePool: jest.fn()
}));

const MockedSimplePool = SimplePool as jest.MockedClass<typeof SimplePool>;

describe('Bug: Relay No Auto-Reconnect', () => {
  let pool: RelayPool;
  let mockPool: jest.Mocked<SimplePool>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockPool = {
      ensureRelay: jest.fn(),
      close: jest.fn(),
      publish: jest.fn(),
      subscribe: jest.fn(() => ({ close: jest.fn() })),
      subscribeMany: jest.fn(() => ({ close: jest.fn() })),
      querySync: jest.fn(() => Promise.resolve([])),
      listConnectionStatus: jest.fn(() => new Map())
    } as any;

    MockedSimplePool.mockImplementation(() => mockPool);
    pool = new RelayPool();
  });

  afterEach(() => {
    pool.disconnect();
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should automatically reconnect when relay connection drops', async () => {
    /**
     * Bug Reproduction Steps:
     * 1. Connect to relay (succeeds)
     * 2. Status monitoring reports relay as connected
     * 3. Relay connection drops (simulated by listConnectionStatus returning false)
     * 4. Wait for monitoring loop to detect disconnection
     * 5. Expected: RelayPool calls ensureRelay() to reconnect
     * 6. Actual: RelayPool only updates status to 'disconnected', never reconnects
     */

    const relayUrl = 'ws://localhost:8080/';
    const endpoints: RelayEndpoint[] = [{ url: relayUrl }];

    // Step 1: Initial connection succeeds
    mockPool.ensureRelay.mockResolvedValue({} as any);
    mockPool.listConnectionStatus.mockReturnValue(
      new Map([[normalizeUrl(relayUrl), true]])
    );

    await pool.connect(endpoints);

    // Step 2: Verify relay is connected
    let status = pool.getStatus();
    expect(status.get(normalizeUrl(relayUrl))).toBe('connected');
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(1);

    // Step 3: Simulate relay connection drop
    mockPool.listConnectionStatus.mockReturnValue(
      new Map([[normalizeUrl(relayUrl), false]])
    );

    // Clear the ensureRelay mock to track reconnection attempts
    mockPool.ensureRelay.mockClear();

    // Step 4: Advance timers to trigger status monitoring (runs every 2s)
    await jest.advanceTimersByTimeAsync(2000);

    // Step 5: Verify status updated to 'disconnected'
    status = pool.getStatus();
    expect(status.get(normalizeUrl(relayUrl))).toBe('disconnected');

    // Step 6: Advance timers to trigger first reconnection attempt (1s backoff)
    await jest.advanceTimersByTimeAsync(1000);

    // Verify: ensureRelay() called to reconnect
    expect(mockPool.ensureRelay).toHaveBeenCalled();
    expect(mockPool.ensureRelay).toHaveBeenCalledWith(
      normalizeUrl(relayUrl),
      { connectionTimeout: 5000 }
    );
  });

  it('should use exponential backoff for reconnection attempts', async () => {
    /**
     * Expected reconnection behavior:
     * - First attempt: 1s after disconnection
     * - Second attempt: 2s after first failure
     * - Third attempt: 4s after second failure
     * - Fourth attempt: 8s after third failure
     * - Fifth attempt: 16s after fourth failure
     * - Subsequent attempts: 30s (capped)
     */

    const relayUrl = 'ws://localhost:8080/';
    const endpoints: RelayEndpoint[] = [{ url: relayUrl }];

    // Initial connection
    mockPool.ensureRelay.mockResolvedValue({} as any);
    mockPool.listConnectionStatus.mockReturnValue(
      new Map([[normalizeUrl(relayUrl), true]])
    );

    await pool.connect(endpoints);
    mockPool.ensureRelay.mockClear();

    // Simulate connection drop
    mockPool.listConnectionStatus.mockReturnValue(
      new Map([[normalizeUrl(relayUrl), false]])
    );

    // Detect disconnection (2s monitoring interval)
    await jest.advanceTimersByTimeAsync(2000);

    // First reconnection attempt should happen after 1s backoff
    mockPool.ensureRelay.mockRejectedValue(new Error('Still down'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(1);

    // Second attempt after 2s
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(2);

    // Third attempt after 4s
    await jest.advanceTimersByTimeAsync(4000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(3);

    // Fourth attempt after 8s
    await jest.advanceTimersByTimeAsync(8000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(4);

    // Fifth attempt after 16s
    await jest.advanceTimersByTimeAsync(16000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(5);

    // Sixth and subsequent attempts after 30s (capped)
    await jest.advanceTimersByTimeAsync(30000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(6);

    await jest.advanceTimersByTimeAsync(30000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(7);
  });

  it('should successfully reconnect when relay comes back online', async () => {
    /**
     * Scenario: Relay drops, then comes back online after a few attempts
     */

    const relayUrl = 'ws://localhost:8080/';
    const endpoints: RelayEndpoint[] = [{ url: relayUrl }];

    // Initial connection
    mockPool.ensureRelay.mockResolvedValue({} as any);
    mockPool.listConnectionStatus.mockReturnValue(
      new Map([[normalizeUrl(relayUrl), true]])
    );

    await pool.connect(endpoints);
    mockPool.ensureRelay.mockClear();

    // Connection drops
    mockPool.listConnectionStatus.mockReturnValue(
      new Map([[normalizeUrl(relayUrl), false]])
    );
    await jest.advanceTimersByTimeAsync(2000);

    // First two reconnection attempts fail
    mockPool.ensureRelay.mockRejectedValue(new Error('Still down'));
    await jest.advanceTimersByTimeAsync(1000); // 1st attempt fails
    await jest.advanceTimersByTimeAsync(2000); // 2nd attempt fails

    // Third attempt succeeds
    mockPool.ensureRelay.mockResolvedValue({} as any);
    mockPool.listConnectionStatus.mockReturnValue(
      new Map([[normalizeUrl(relayUrl), true]])
    );
    await jest.advanceTimersByTimeAsync(4000); // 3rd attempt succeeds

    // Next monitoring interval should detect reconnection
    await jest.advanceTimersByTimeAsync(2000);

    // Verify status is 'connected' again
    const status = pool.getStatus();
    expect(status.get(normalizeUrl(relayUrl))).toBe('connected');

    // Verify reconnection attempts stopped (no more calls after success)
    const callCount = mockPool.ensureRelay.mock.calls.length;
    await jest.advanceTimersByTimeAsync(10000);
    expect(mockPool.ensureRelay).toHaveBeenCalledTimes(callCount);
  });
});
