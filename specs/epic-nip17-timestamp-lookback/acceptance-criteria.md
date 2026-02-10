# Acceptance Criteria: NIP-17 Timestamp Lookback

Generated: 2026-02-10T22:15:00Z
Source: spec.md

## Overview

These criteria verify that NIP-17 gift wrap messages (kind 1059) with randomized timestamps are reliably delivered, regardless of their timestamp offset within the NIP-17 specification range (up to 2 days in the past). The fix must eliminate silent message loss while maintaining existing kind 4 DM delivery behavior.

## Criteria

### AC-001: NIP-17 Timestamp Coverage

- **Description**: Any NIP-17 gift wrap (kind 1059) with `created_at` randomized within NIP-17 spec range (up to 2 days in the past) MUST be received by the subscriber. No message loss due to timestamp randomization shall occur.
- **Verification**:
  1. Start two Nostling instances with cleared data directories (`/tmp/nostling-a`, `/tmp/nostling-b`)
  2. Send 10 messages bidirectionally (20 total)
  3. Query relay directly via WebSocket for all kind 1059 events
  4. Verify that `created_at` timestamps span the full range (some events >24h in past)
  5. Confirm all events with randomized timestamps were delivered (check `Received NIP-17 DM` log entries)
- **Type**: e2e
- **Source**: Spec AC-001, Root Cause Analysis

### AC-002: Dual-Instance Test Pass

- **Description**: 100% delivery rate in dual-instance test environment. Send 10 messages each direction (Alice → Bob, Bob → Alice) with freshly started instances. All 20 messages must show `Received NIP-17 DM` in recipient logs.
- **Verification**:
  1. Run `make dev-dual` to start dual-instance environment
  2. Create identities on both instances and add mutual contacts
  3. Send 10 messages from instance A to instance B
  4. Send 10 messages from instance B to instance A
  5. Take screenshots using Playwright MCP (`browser_take_screenshot`) showing received messages in UI
  6. Check logs at `/tmp/nostling-a.log` and `/tmp/nostling-b.log` for exactly 10 `Received NIP-17 DM` entries per instance
  7. Verify 20/20 messages delivered (100% delivery rate)
- **Type**: e2e
- **Source**: Spec AC-002, CLAUDE.md Dual-Instance Test Protocol

### AC-003: Zero Log Gaps

- **Description**: When relay confirms events exist (via direct WebSocket query), recipient logs MUST show corresponding `Received NIP-17 DM` entries. No silent message loss.
- **Verification**:
  1. After running dual-instance test (AC-002), query relay for all kind 1059 events addressed to each instance
  2. Count events returned by relay (expected: 10 per recipient)
  3. Count `Received NIP-17 DM` log entries in `/tmp/nostling-a.log` and `/tmp/nostling-b.log`
  4. Verify counts match exactly (relay events = log entries)
  5. If mismatch exists, check `created_at` timestamps of missing events against subscription `since` filter
- **Type**: integration
- **Source**: Spec AC-003, Evidence section

### AC-004: No Kind 4 Regression

- **Description**: Existing kind 4 DM delivery must not be negatively affected. Kind 4 messages should continue using 24-hour lookback.
- **Verification**:
  1. Run existing e2e test suite: `npm run test:e2e:docker`
  2. Verify all tests pass (no failures, no new warnings)
  3. Inspect `src/main/nostling/service.ts` to confirm kind 4 still uses `FIRST_STREAM_LOOKBACK` (24h)
  4. Manually send kind 4 DM in dual-instance environment and verify delivery
- **Type**: integration
- **Source**: Spec AC-004

## Verification Plan

### Automated Tests
- **Integration tests**: AC-004 (via existing e2e test suite)
- **E2E tests**: AC-001, AC-002, AC-003

### Manual Verification

#### Pre-Flight Setup
1. Clear data directories: `rm -rf /tmp/nostling-a /tmp/nostling-b /tmp/nostling-*.log`
2. Start dual-instance environment: `make dev-dual`
3. Add Playwright MCP config snippet to `.mcp.json` (printed by `make dev-dual`)
4. Launch instances and create identities (Alice on instance A, Bob on instance B)
5. Exchange npubs and add mutual contacts

#### Test Execution (AC-001, AC-002, AC-003)
1. Use Playwright MCP `playwright-a` to navigate instance A and send 10 messages to Bob
2. Use Playwright MCP `playwright-b` to navigate instance B and verify all 10 messages appear in UI
3. Take screenshot using `browser_take_screenshot` on instance B showing received messages
4. Use Playwright MCP `playwright-b` to send 10 messages from Bob to Alice
5. Use Playwright MCP `playwright-a` to verify all 10 messages appear in instance A UI
6. Take screenshot on instance A showing received messages
7. Check logs:
   - `tail -f /tmp/nostling-a.log | grep "Received NIP-17 DM"` (expect 10 entries)
   - `tail -f /tmp/nostling-b.log | grep "Received NIP-17 DM"` (expect 10 entries)
8. Query relay directly to confirm all 20 events exist (use WebSocket client or `wscat`)
9. Verify some events have `created_at` more than 24 hours in the past

#### Regression Verification (AC-004)
1. Run automated test suite: `npm run test:e2e:docker`
2. Confirm zero test failures
3. Send kind 4 DM in dual-instance environment (if supported) and verify delivery

### Success Criteria
- All 20 NIP-17 messages delivered (100% rate)
- Zero log gaps (relay events match `Received NIP-17 DM` counts)
- Events with timestamps >24h in past are successfully received
- All existing e2e tests pass
- No kind 4 DM delivery regression observed

## Coverage Matrix

| Spec Requirement | Acceptance Criteria |
|------------------|---------------------|
| NIP-17 gift wraps with randomized timestamps must be received | AC-001, AC-002 |
| No silent message loss when relay confirms event exists | AC-003 |
| Kind 4 DM delivery must not regress | AC-004 |
| Subscription lookback window must account for NIP-17 timestamp randomization | AC-001, AC-002 |
| Polling mechanism must include kind 1059 | AC-002, AC-003 |
| 100% delivery rate in dual-instance test | AC-002 |
