# NIP-17 Dual-Instance E2E Test Infrastructure

## Summary

The NIP-17 timestamp lookback fix (epic-nip17-timestamp-lookback) is currently verified only by property-based unit/integration tests that mock the relay interaction. There are no e2e tests that exercise the full stack: two Electron instances exchanging NIP-17 encrypted DMs through an actual strfry relay, validating that messages with randomized `created_at` timestamps are delivered end-to-end.

## Motivation

- The existing e2e fixture (`e2e/fixtures.ts`) launches a single Electron instance. NIP-17 message delivery requires two instances (sender and recipient).
- The dual-instance Playwright setup (`make dev-dual`) exists for manual testing but has no automated test harness.
- Property-based tests verify the subscription filter logic in isolation. They cannot catch bugs in event processing, relay roundtrip, decryption, or UI rendering.

## Scope

### In Scope

1. **Dual-instance e2e fixture** extending the existing Playwright Electron fixture to launch two isolated Electron apps, each with its own data directory, both connected to the same strfry relay via `NOSTLING_DEV_RELAY`.

2. **E2e helper functions** for:
   - Creating an identity on an instance (programmatically via IPC or through the UI)
   - Adding a contact by npub
   - Sending a NIP-17 DM from one instance to another
   - Waiting for message delivery on the recipient instance
   - Reading the npub of the current identity

3. **E2e test cases** covering:
   - Bidirectional NIP-17 message delivery (Alice sends to Bob, Bob sends to Alice)
   - Message content arrives intact
   - Messages with `created_at` timestamps older than 24 hours are still received (validates the lookback window fix)

### Out of Scope

- Kind 4 (legacy DM) e2e testing
- Performance/load testing
- Relay failure scenarios
- P2P/WebRTC messaging

## Technical Context

### Existing Infrastructure

- **Single-instance fixture:** `e2e/fixtures.ts` launches one Electron app with isolated data dir
- **Docker relay:** `docker-compose.e2e.yml` starts strfry on port 8080
- **Dev relay env var:** `NOSTLING_DEV_RELAY` configures relay URL
- **E2e Docker runner:** `npm run test:e2e:docker` builds and runs full e2e suite in Docker
- **Dual-instance dev setup:** `make dev-dual` (manual only, no test harness)

### Key Challenges

- **Two Electron apps in one Playwright test:** Playwright's Electron support launches apps via `_electron.launch()`. The fixture must manage two independent app lifecycles, ensuring both are ready before tests begin and both are torn down after.
- **Message delivery timing:** NIP-17 messages may take a few seconds to arrive due to relay roundtrip, subscription polling, and decryption. Tests need appropriate wait strategies (poll for message appearance rather than fixed timeouts).
- **Timestamp randomization:** NIP-17 randomizes `created_at` up to 2 days in the past. E2e tests can't control this randomization directly, but can verify that all sent messages are eventually received regardless of their randomized timestamp.

## Acceptance Criteria

1. A dual-instance Playwright fixture exists that launches two Electron apps connected to the same relay
2. At least one e2e test sends a NIP-17 DM from instance A to B and verifies delivery
3. At least one e2e test sends a NIP-17 DM from instance B to A and verifies delivery
4. Tests run via `npm run test:e2e:docker` alongside existing tests
5. Tests are isolated (clean data dirs, no state leakage between runs)
