---
epic: nip17-timestamp-lookback
created: 2026-02-10T21:54:17Z
status: initializing
---

# Bug: NIP-17 Gift Wraps Missed Due to Insufficient Subscription Lookback Window

## Summary

The streaming subscription's `since` filter uses a 24-hour lookback (`FIRST_STREAM_LOOKBACK`), but NIP-17 gift wrap events (kind 1059) use randomized `created_at` timestamps within ±2 days for metadata privacy. This causes a probabilistic message loss where ~25% of incoming NIP-17 DMs are silently dropped because their randomized timestamp falls outside the 24-hour window.

## Severity

**High** — Messages are silently lost with no error, warning, or retry mechanism. The sender sees successful delivery (relay accepted the event), but the recipient never receives it.

## Reproduction

### Environment

- Two Nostling instances (Alice and Bob) connected to a local strfry relay (`ws://localhost:8080`) via `NOSTLING_DEV_RELAY`
- Both instances freshly started (no prior timestamp state in the database)

### Steps

1. Start two Nostling instances with separate data directories
2. Create identities (Alice, Bob) and add mutual contacts
3. Send a message from Alice to Bob — Bob receives it
4. Send a message from Bob to Alice — Alice does **not** receive it

### Evidence

**Alice's outgoing gift wrap** (received by Bob):
```
created_at: 2026-02-08T23:00:32Z  →  within Bob's 24h window  →  DELIVERED
```

**Bob's outgoing gift wraps** (never received by Alice):
```
created_at: 2026-02-08T10:26:48Z  →  ~33h before Alice's since  →  MISSED
created_at: 2026-02-07T21:23:32Z  →  ~45h before Alice's since  →  MISSED
```

**Alice's logs** show continuous subscription polling but zero `Received NIP-17 DM` entries. **Bob's logs** confirm `Publish complete: 1 succeeded` for both messages, and the events are confirmed present on the relay via direct WebSocket query.

## Root Cause

In `src/main/nostling/service.ts`, the `startSubscription` method adds a `since` filter to all subscription filters:

```typescript
// Line 69
const FIRST_STREAM_LOOKBACK = 24 * 60 * 60; // 24h

// Lines 1421-1432 (inside startSubscription)
const filtersWithSince = baseFilters.map(f => {
  const kind = f.kinds?.[0];
  if (!kind) return f;

  const lastTimestamp = getMinTimestampForKind(this.database, identityId, kind);

  const sinceTimestamp = lastTimestamp
    ? lastTimestamp - CLOCK_SKEW_BUFFER      // CLOCK_SKEW_BUFFER = 60s
    : Math.floor(Date.now() / 1000) - FIRST_STREAM_LOOKBACK;  // 24h ago

  return { ...f, since: sinceTimestamp };
});
```

For first-time startup (no stored timestamps), the `since` for kind 1059 is set to `now - 86400` (24 hours ago). NIP-17 specifies that gift wrap `created_at` should be randomized within ±2 days (172800 seconds). Any gift wrap whose random timestamp lands more than 24 hours in the past will be filtered out by the relay and never forwarded to the subscriber — neither during initial catch-up nor during live streaming.

### Contributing factors

1. **The `since` filter applies to both historical replay and live events.** Even though the relay receives the gift wrap in real-time, the Nostr protocol `since` filter compares against `created_at`, not relay arrival time. So the relay correctly withholds the event.

2. **No kind-specific lookback.** The same `FIRST_STREAM_LOOKBACK` is applied to all event kinds. Kind 4 DMs use real timestamps and 24h is reasonable; kind 1059 gift wraps use randomized timestamps and need a wider window.

3. **Polling doesn't cover kind 1059.** The `pollMessages` method only queries for kind 4 filters (via `getKind4Filters`), so the periodic polling mechanism cannot compensate for missed gift wraps.

4. **No feedback to the user.** The message is silently lost. The sender sees success, the recipient sees nothing.

## Acceptance Criteria

The fix is complete when ALL of the following conditions are met:

1. **AC-001: NIP-17 Timestamp Coverage**
   - Any NIP-17 gift wrap (kind 1059) with `created_at` randomized within NIP-17 spec range (up to 2 days in the past) MUST be received by the subscriber
   - No message loss due to timestamp randomization

2. **AC-002: Dual-Instance Test Pass**
   - 100% delivery rate in dual-instance test environment
   - Test: Send 10 messages each direction (Alice → Bob, Bob → Alice) with freshly started instances
   - All 20 messages must show `Received NIP-17 DM` in recipient logs

3. **AC-003: Zero Log Gaps**
   - When relay confirms events exist (via direct WebSocket query), recipient logs MUST show corresponding `Received NIP-17 DM` entries
   - No silent message loss

4. **AC-004: No Kind 4 Regression**
   - Existing kind 4 DM delivery must not be negatively affected
   - Kind 4 messages should continue using 24-hour lookback

## Scope

This fix includes TWO required components:

### 1. Subscription Lookback Window (Required)
Apply kind-specific lookback window that accounts for NIP-17's timestamp randomization:

```typescript
// For kind 1059 (NIP-17 gift wraps): 2 days randomization + 1 day safety margin
const NIP17_TIMESTAMP_WINDOW = 3 * 24 * 60 * 60; // 3 days

const sinceTimestamp = lastTimestamp
  ? lastTimestamp - (kind === 1059 ? NIP17_TIMESTAMP_WINDOW : CLOCK_SKEW_BUFFER)
  : Math.floor(Date.now() / 1000) - (kind === 1059 ? NIP17_TIMESTAMP_WINDOW : FIRST_STREAM_LOOKBACK);
```

**Rationale for 3-day buffer:**
- NIP-17 spec: "up to 2 days in the past"
- 1-day safety margin for clock skew, relay delays, and boundary conditions
- Conservative approach to prevent any edge-case message loss

### 2. Polling Mechanism Enhancement (Required)
Include kind 1059 in the polling mechanism (`pollMessages`) as a secondary catch-up path for defense-in-depth.

**Rationale:**
- Provides redundant delivery path if subscription misses events
- Aligns with existing kind 4 polling behavior
- Critical for high-reliability messaging

## Verification Strategy

The fix MUST be verified using BOTH methods:

### Manual Verification (Required)
Per CLAUDE.md dual-instance test protocol:
1. Start two Nostling instances with cleared data directories (`/tmp/nostling-a`, `/tmp/nostling-b`)
2. Create identities (Alice, Bob) and add mutual contacts
3. Send 10 messages from Alice → Bob
4. Send 10 messages from Bob → Alice
5. Take screenshots showing received messages in UI for both instances
6. Check logs at `/tmp/nostling-a.log` and `/tmp/nostling-b.log`:
   - Alice should show 10 `Received NIP-17 DM` entries
   - Bob should show 10 `Received NIP-17 DM` entries
7. Query relay directly to confirm all 20 events exist with randomized timestamps
8. Verify `created_at` values span the full NIP-17 range (some should be >24h in past)

### Automated Verification (Required)
Run e2e tests with docker environment:
```bash
npm run test:e2e:docker
```
All existing tests must pass with no regressions.
