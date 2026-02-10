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

## Suggested Fix

Apply a kind-specific lookback window that accounts for NIP-17's timestamp randomization:

```typescript
// For kind 1059 (NIP-17 gift wraps): ±2 days randomization + buffer
const NIP17_TIMESTAMP_WINDOW = 3 * 24 * 60 * 60; // 3 days

const sinceTimestamp = lastTimestamp
  ? lastTimestamp - (kind === 1059 ? NIP17_TIMESTAMP_WINDOW : CLOCK_SKEW_BUFFER)
  : Math.floor(Date.now() / 1000) - (kind === 1059 ? NIP17_TIMESTAMP_WINDOW : FIRST_STREAM_LOOKBACK);
```

Additionally, consider including kind 1059 in the polling mechanism (`pollMessages`) as a secondary catch-up path.
