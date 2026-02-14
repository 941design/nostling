# Footer Does Not Show Relay Connection Status - Bug Report

## Bug Description

The application footer does not reflect relay connection state. When a relay disconnects, the footer continues showing idle/synced status messages ("Preening peacefully", "Nostling idle", "Flock in harmony"). Users have no visible indication that their relay connection has dropped unless they navigate to the relay configuration view and inspect the `RelayTable` status dots.

## Expected Behavior

The footer should clearly indicate relay connectivity:
- **Connected**: Normal status (current themed messages are fine)
- **Disconnected**: Prominent disconnection indicator (e.g., red text, "Relay disconnected", or themed equivalent like "Flock scattered")
- **Reconnecting**: Transitional state visible to user

The status should transition automatically: connected -> disconnected -> reconnecting -> connected.

## Reproduction Steps

1. Start two instances with `make dev-dual` (identities and contacts configured)
2. Verify both instances show footer status (e.g., "Preening peacefully", "Nostling idle")
3. Stop the relay:
   ```bash
   docker compose -f docker-compose.e2e.yml stop nostr-relay
   ```
4. Wait 15 seconds for disconnection detection
5. **Observe**: Footer text unchanged on both instances — still shows idle/synced messages
6. Check logs to confirm backend detected the disconnection:
   ```bash
   grep "connection dropped" /tmp/nostling-a.log
   # Output: Relay ws://localhost:8080/: connection dropped
   ```
7. Restart the relay:
   ```bash
   docker compose -f docker-compose.e2e.yml start nostr-relay
   ```
8. Wait 15 seconds — footer still shows same status, no reconnection indication

## Actual Behavior

The footer shows queue-based status from `getNostlingStatusTextThemed()` (`state.themed.ts:89-129`), which only considers message queue state:

| Priority | Condition | Example Output |
|----------|-----------|----------------|
| 1 | Bridge unavailable | "Nostling bridge unavailable" |
| 2 | Errors > 0 | "1 fumbled egg(s)" |
| 3 | Sending > 0 | "1 flinging feathers" |
| 4 | Queued > 0 | "1 nestled in queue (offline)" |
| 5 | Has last activity | "Flock in harmony" / "Nostling synced" |
| 6 | Default | "Nostling idle" / "Preening peacefully" |

Only priority 4 mentions "offline" — and only when messages are actively queued. If the user isn't sending messages when the relay drops, the footer shows no disconnection signal.

## Root Cause

The footer's `nostlingStatus` prop is derived solely from `queueSummary` (message queue counters). It does not consume `relayStatus` state, even though relay status IS tracked:

- **IPC channel exists**: `nostling:relay-status-changed` broadcasts `(url, status)` on connect/disconnect
- **State is tracked**: `main.tsx:1900` — `const [relayStatus, setRelayStatus] = useState<Record<string, string>>({})`
- **RelayTable uses it**: `RelayTable.tsx:56-92` — colored `StatusDot` components (green/red/yellow)
- **Footer ignores it**: `getNostlingStatusTextThemed()` has no `relayStatus` parameter

The relay status and footer status are completely decoupled — the information exists in the renderer but is never wired to the footer component.

## Impact

- Severity: **Medium** — UX/discoverability issue
- Users cannot tell if they're connected to relays without navigating to relay settings
- Messages may silently fail to send without any visible cause
- Automatic reconnection happens invisibly

## Relevant Code

| File | Lines | Purpose |
|------|-------|---------|
| `src/renderer/nostling/state.themed.ts` | 89-129 | `getNostlingStatusTextThemed()` — footer text logic |
| `src/renderer/main.tsx` | 450, 2595 | Footer component props — receives `nostlingStatus` |
| `src/renderer/main.tsx` | 1900, 2362-2375 | Relay status state tracking (unused by footer) |
| `src/renderer/components/RelayTable.tsx` | 56-92 | `StatusDot` — per-relay status indicator (only in config view) |
| `src/renderer/themed-messages.json` | — | Themed status messages (has "offline" variants) |
| `src/preload/index.ts` | 173-180 | Relay status IPC bridge |

## Suggested Fix

Wire `relayStatus` into the footer status text. In `getNostlingStatusTextThemed()`, add a relay connectivity check as the highest priority (after bridge unavailable):

```typescript
// Priority 1.5: Relay disconnected
if (relayStatus && Object.values(relayStatus).every(s => s !== 'connected')) {
  return randomSelect(config.nostlingQueueStates.offline);
}
```

Or add a separate visual indicator (colored dot, icon) to the footer that reflects aggregate relay connectivity.
