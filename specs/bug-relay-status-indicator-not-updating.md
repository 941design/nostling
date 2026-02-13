# BUG: Relay Status Indicator Does Not Reflect Connection State Changes

## Summary

The application footer does not update when relay connectivity changes. During a full disconnect/reconnect cycle, the footer continues showing static ostrich-themed messages (e.g., "All eggs hatched", "Nostling synced") with no visual change to indicate the relay is down or reconnecting.

## Severity

**Medium** -- Users have no way to know when their relay connection is lost or being restored. Messages sent during an undetected outage will silently queue without feedback.

## Specification References

- **FR9: Relay Status in Footer** (`specs/nostr-protocol-integration.md:163-172`):
  - "Show error state if all relays disconnected: 'Relays: disconnected'"
  - "Status updates in real-time as connections change"
  - "Clear visual distinction between healthy/degraded/disconnected"
- **IPC event**: `nostling:relay:status` is specified to emit when relay connection status changes (`specs/nostr-protocol-integration.md:157`)
- **Acceptance criteria** (`specs/nostling-acceptance-criteria.md:144`): Previously passed with "6 relays - 4 connected - 2 failed" in the relay panel, but footer-level status was not verified against live disconnect events.

## Steps to Reproduce

1. Start dual-instance environment (`make dev-dual`)
2. Verify both instances show connected status in footer
3. Stop the relay: `docker compose -f docker-compose.e2e.yml stop nostr-relay`
4. Wait 15 seconds
5. Observe footer -- **no change** from connected state
6. Restart the relay: `docker compose -f docker-compose.e2e.yml start nostr-relay`
7. Wait 15 seconds
8. Observe footer -- **no change** from prior state

## Expected Behavior

Footer transitions through three distinct states:
1. **Connected**: Current ostrich-themed messages (e.g., "All eggs hatched") -- acceptable
2. **Disconnected**: Visual change indicating relay is down (e.g., different themed message from the 'offline' pool, color change, or icon)
3. **Reconnecting**: Optional intermediate state showing reconnection attempts

## Actual Behavior

Footer displays the same static ostrich-themed message throughout all three states. No text, color, or icon changes occur during disconnect or reconnect.

## Backend Evidence (Working Correctly)

The relay connection layer works as expected. Logs from both instances during the test show:

```
14:44:37 - Relay ws://localhost:8080/: connection dropped
14:44:38 - Reconnection attempt 1 failed
14:44:40 - Reconnection attempt 2 failed
14:44:44 - Reconnection attempt 3 failed (exponential backoff)
14:44:52 - Reconnection attempt 4 failed
14:45:08 - Reconnection attempt 5 failed
14:45:38 - Reconnection succeeded
14:45:39 - Reconnected
14:45:40 - Restarted subscriptions for identity(ies)
```

## Likely Root Cause

The Nostling status text is derived from queue summary metrics (`queueSummary` in `src/renderer/nostling/state.ts`), which tracks message send/queue counts. It does not appear to incorporate relay connection state from the `nostling:relay:status` IPC event. The ostrich-themed message pool includes an 'offline' category (`specs/ostrich-themed-status-messages-spec.md:18`), but this may only trigger when messages are actively queued, not when the relay connection itself drops.

## Investigation Starting Points

- `src/renderer/nostling/state.ts` -- `nostlingStatusText` derivation logic (does it consume relay status?)
- `src/renderer/utils.ts` -- `getStatusText()` and themed message selection
- IPC event `nostling:relay:status` -- Is it emitted? Is the renderer listening?
- Themed messages JSON -- Does the 'offline' pool get selected when relay disconnects with no queued messages?

## Test Reference

Discovered during **T06: Relay Status Indicator** in the dual-instance test suite (`docs/dual-instance-testing.md`).
