# Failed Messages Not Auto-Retried After Relay Reconnection

**Severity**: High
**Component**: `NostlingService` / Message Queue
**Discovered**: 2026-02-16 via dual-instance testing (T05)
**Reproducible**: 100%
**Related**: `relay-no-auto-reconnect-report.md` (relay reconnection itself now works)

## Summary

When a message fails to send because the relay is down, and the relay subsequently reconnects, the failed message is **not** automatically retried. The message remains in "error" state with a "fumbled egg(s)" footer indicator until manually retried via the `messages.retry()` IPC call. Page reload also does not flush the queue.

Note: The relay **does** reconnect automatically now (the issue described in `relay-no-auto-reconnect-report.md` appears to have been fixed). The missing piece is automatic message retry after reconnection.

## Reproduction Steps

1. Start fresh dual instances: `make dev-dual` (clean data dirs + relay)
2. Create identities and contacts (Alice on A, Bob on B)
3. Verify both connected (footer shows idle/synced messages)
4. Stop the relay:
   ```bash
   docker compose -f docker-compose.e2e.yml stop nostr-relay
   ```
5. Wait 10 seconds — both instances detect disconnection (logs: "connection dropped")
6. From Instance A, send a message: `Sent while relay is down [t05]`
7. **Observe**: Message status shows error, footer shows "1 fumbled egg(s)"
8. Restart the relay:
   ```bash
   docker compose -f docker-compose.e2e.yml start nostr-relay
   ```
9. Wait 30 seconds — relay reconnects (logs: "reconnected")
10. **Observe**: Footer still shows "1 fumbled egg(s)". Message not retried.
11. Reload Instance A page
12. **Observe**: Still "1 fumbled egg(s)". Message still not retried or delivered.
13. Call `messages.retry(identityId)` via IPC
14. **Observe**: Message is now published and delivered to Instance B

**Expected**: After relay reconnects, queued/failed messages should be automatically retried.
**Actual**: Messages stay in error state indefinitely until manual IPC retry.

## Root Cause

The relay reconnection handler (`registerReconnectionHandler` in `service.ts`) restarts subscriptions when a relay transitions to `connected`, but it does not check for or retry failed/queued messages:

```typescript
this.relayPool.onStatusChange((url, status) => {
  if (status === 'connected') {
    this.scheduleSubscriptionRestart();
    // ← Missing: check for queued/failed messages and retry them
  }
});
```

Additionally:
- Page reload does not trigger a queue flush or retry of failed messages
- The polling mechanism (`pollMessages`) does not check for unsent messages in the local queue
- No periodic retry mechanism exists for failed messages

## Evidence (T05 Logs)

### Instance A timeline

```
02:00:02  Relay ws://localhost:8080/: connection dropped
02:00:12  Message send → ERROR "No writable relays available"
02:00:12  Footer: "1 fumbled egg(s)"
02:00:27  Relay restarted
02:00:33  Relay ws://localhost:8080/: reconnected
           (no message retry — 30+ seconds pass)
02:00:45  Manual messages.retry() → Publish complete: 1 succeeded
```

### Instance B

```
02:00:46  Received NIP-17 DM from 12c0a4d0...  (only after manual retry)
```

## Impact

- Messages silently stuck in error state after brief network interruptions
- Users must restart the app or use developer tools to recover
- No user-facing retry mechanism exists in the UI
- Combined with T06 (footer not showing relay status), users have no visibility into what happened

## Suggested Fix

1. In the `onStatusChange` callback (when relay transitions to `connected`), query for messages with status `error` or `queued` and retry them:

   ```typescript
   this.relayPool.onStatusChange((url, status) => {
     if (status === 'connected') {
       this.scheduleSubscriptionRestart();
       this.retryFailedMessages(); // NEW
     }
   });
   ```

2. The `retryFailedMessages()` method should:
   - Query local DB for messages with `status = 'error'` or `status = 'queued'`
   - Attempt to publish each one
   - Update status on success/failure
   - Log the retry attempt

3. Optionally add a periodic retry (e.g., every 60 seconds) as defense-in-depth, in case the status change event is missed.

4. Add a user-facing "Retry" button in the UI for messages in error state.
