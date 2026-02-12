# Bug: Relay WebSocket Connections Never Reconnect After Drop

**Severity**: Critical
**Component**: `RelayPool` / `NostlingService`
**Affected files**: `src/main/nostling/relay-pool.ts`, `src/main/nostling/service.ts`
**Discovered**: 2026-02-11 via dual-instance testing (T05)
**Reproducible**: 100% (reproduced twice with full restart)

## Summary

When a relay WebSocket connection drops (e.g., relay restart, network interruption), the client permanently remains in "disconnected" state. No automatic reconnection is attempted. Messages queued during the outage cannot be delivered, and the `messages.retry()` and `relays.reload()` APIs also fail to restore connectivity.

## Reproduction Steps

1. Start dual instances: `make dev-dual`
2. Verify both instances report `"ws://localhost:8080/": "connected"`
3. Stop the relay: `docker stop nostling-dev-relay`
4. Wait 10s — both instances detect "disconnected"
5. Send a message from Instance A (will fail: "No writable relays available")
6. Restart the relay: `docker start nostling-dev-relay` (verify HTTP 200 at `:7777`)
7. Wait 30+ seconds

**Expected**: Instances automatically reconnect to the relay; queued messages are retried and delivered.
**Actual**: Both instances remain permanently "disconnected". No reconnection attempts in logs. Messages stuck in "queued" state indefinitely.

### Additional observations

- `messages.retry(identityId)` re-queues messages but fails with "No writable relays available" since the connection is never re-established
- `relays.reload(identityId)` reloads config from disk but does not trigger `relayPool.connect()`
- No user-facing mechanism exists to force reconnection short of restarting the application

## Root Cause Analysis

### 1. `startStatusMonitoring()` detects drops but doesn't reconnect

`relay-pool.ts:422-448` — The 2-second status polling loop correctly detects when `SimplePool` reports a relay as disconnected and updates the internal `statusMap`. However, it takes no corrective action:

```typescript
} else if (!isConnected && currentStatus === 'connected') {
  this.updateStatus(url, 'disconnected');
  log('warn', `Relay ${url}: connection dropped`);
  // ← No reconnection attempt here
}
```

### 2. `registerReconnectionHandler()` handles the wrong direction

`service.ts:1186-1201` — The service registers an `onStatusChange` callback that triggers subscription restarts when a relay transitions *to* `connected`. This is the right thing to do *after* reconnection, but nothing ever triggers the reconnection itself:

```typescript
this.relayPool.onStatusChange((url, status) => {
  if (status === 'connected') {
    // This is correct but never fires because nothing reconnects
    this.scheduleSubscriptionRestart();
  }
});
```

### 3. `reloadRelaysForIdentity()` is config-only

`service.ts:844-846` delegates to `RelayConfigManager.reloadRelays()` which only reloads the relay list from disk (`relay-config-manager.ts:211-214`). It never calls `relayPool.connect()`.

### 4. `SimplePool` (nostr-tools) has no built-in reconnection

The underlying `nostr-tools` `SimplePool` does not automatically reconnect dropped connections. It relies on the consumer to call `ensureRelay()` again.

## Impact

- Messages sent during or after a relay outage are silently lost (stuck in "queued"/"sending" state)
- The app becomes completely non-functional after any brief network interruption
- Users have no indication that manual action (app restart) is required
- The `messages.retry()` feature is effectively broken since it can't publish without a connection

## Suggested Fix

Add reconnection logic to `startStatusMonitoring()` in `relay-pool.ts`. When a relay transitions to `disconnected`, schedule a reconnection attempt with exponential backoff:

1. On detecting `disconnected`, call `this.pool.ensureRelay(url)` after a delay
2. Use exponential backoff (e.g., 1s, 2s, 4s, 8s, 16s, 30s cap) to avoid hammering a downed relay
3. On successful reconnection, `updateStatus(url, 'connected')` will fire the existing `registerReconnectionHandler` which restarts subscriptions
4. After reconnection, automatically retry queued messages

Additionally:
- `reloadRelaysForIdentity()` should optionally trigger reconnection (or a separate `reconnect()` API should exist)
- `messages.retry()` should check relay status and attempt reconnection before re-publishing

## Evidence (T05 Reproduction Logs)

### Instance A (Alice)

```
23:04:53 INFO  Relay ws://localhost:8080/: connected (31ms)
23:04:53 INFO  Status monitoring started. Pool reports 1/1 relays connected
23:07:53 WARN  Relay ws://localhost:8080/: connection dropped
23:08:27 ERROR No writable relays available. Configured: 1, Connected: 0
23:08:27 ERROR Relay publish failed for message a5ea8bda: No writable relays available
23:11:05 INFO  Retrying 2 failed nostling message(s)
23:11:05 ERROR No writable relays available (x2 - both retries fail)
```

### Instance B (Bob)

```
23:04:53 INFO  Relay ws://localhost:8080/: connected (27ms)
23:04:53 INFO  Status monitoring started. Pool reports 1/1 relays connected
23:07:53 WARN  Relay ws://localhost:8080/: connection dropped
(no further log entries — no reconnection attempts, no DMs received)
```

Relay was confirmed healthy (HTTP 200) at all times after `docker start`.
