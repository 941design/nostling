# State Machine Event Handler Tests Specification

## Context

The auto-updater system (index.ts) has event handlers that manage state transitions through the update lifecycle. These handlers currently lack test coverage, preventing verification of FR4 (UI never gets stuck in checking) and correct state machine behavior.

## Target File

**Location**: `/Users/mrother/Projects/941design/slim-chat/src/main/index.test.ts`

**Purpose**: Property-based tests for autoUpdater event handlers and state machine transitions

## Requirements

### FR4 Verification (CRITICAL)
- **Acceptance Criteria**: "checking → failed on errors"
- **Property**: When autoUpdater emits 'error' event while in 'checking' phase, state transitions to 'failed'
- **Property**: State never remains in 'checking' indefinitely after error events

### State Machine Properties

**Event Handler Coverage:**
1. `checking-for-update` → state becomes `{ phase: 'checking' }`
2. `update-available` → state becomes `{ phase: 'available', version: info.version }`
3. `download-progress` → state becomes `{ phase: 'downloading', version: ... }`
4. `update-not-available` → state becomes `{ phase: 'idle' }`
5. `error` → state becomes `{ phase: 'failed', detail: error message }`
6. `update-downloaded` → triggers verification workflow (downloaded → verifying → ready/failed)

**State Transition Properties:**
- **Deterministic**: Same event from same state always produces same next state
- **Broadcast Consistency**: Every state change calls `broadcastUpdateStateToMain()`
- **Version Tracking**: Version info preserved through downloading/verifying/ready phases
- **Error Handling**: All error events result in 'failed' state with detail message
- **Verification Flow**: update-downloaded triggers sequence: downloaded → verifying → (ready|failed)

### Functional Requirements

**Test Coverage Requirements:**
- ✓ Each event handler updates `updateState` correctly
- ✓ Each event handler calls `broadcastUpdateStateToMain()`
- ✓ Error events transition to 'failed' from any phase (especially 'checking' for FR4)
- ✓ Verification workflow on update-downloaded follows correct sequence
- ✓ Version information propagates correctly through states
- ✓ Logging calls happen for error and update-available events

**Mocking Requirements:**
- Mock `autoUpdater` event emitter
- Mock `broadcastUpdateStateToMain` to verify calls
- Mock `verifyDownloadedUpdate` to test success/failure paths
- Mock `log` function
- Access to internal `updateState` variable (via module exports or rewire)

### Testing Strategy

**Property-Based Approach:**
- Generate arbitrary event sequences
- Verify state consistency after each event
- Verify broadcastUpdateStateToMain called exactly once per event
- Verify version tracking through multi-phase transitions

**Example Properties:**
1. **Idempotent Error Recovery**: Emitting 'error' from 'checking' always reaches 'failed' (FR4)
2. **Broadcast Completeness**: For any event, broadcastUpdateStateToMain is called
3. **Version Preservation**: If version set in 'available', it persists through downloading → verifying → ready
4. **Verification Success Path**: update-downloaded + successful verify → 'ready' state
5. **Verification Failure Path**: update-downloaded + verify throws → 'failed' state

## Integration Points

**Dependencies (already implemented):**
- `setupUpdater()` from controller.ts (mocked in tests)
- `verifyDownloadedUpdate()` from integration.ts (mocked in tests)
- `broadcastUpdateStateToMain()` from index.ts (exported for testing)
- Electron's `autoUpdater` (mocked as EventEmitter)

**Test File Structure:**
```
describe('Auto-updater state machine event handlers', () => {
  // Property-based tests for event handlers
  // Mock autoUpdater as EventEmitter
  // Trigger events, verify state transitions
  // Verify broadcastUpdateStateToMain calls
});
```

## Constraints

- **C1 Production Safety**: Tests must not enable dev mode features
- **Existing Tests**: 276 tests currently passing, must not regress
- **Testing Framework**: Jest + fast-check (TypeScript property-based testing)
- **No Implementation Changes**: Only create tests, do not modify index.ts implementation

## Success Criteria

1. ✓ Test file created at `/Users/mrother/Projects/941design/slim-chat/src/main/index.test.ts`
2. ✓ All autoUpdater event handlers have property-based test coverage
3. ✓ FR4 acceptance criteria verified: 'checking' → 'failed' on error
4. ✓ State transition properties validated
5. ✓ All tests pass
6. ✓ Zero regressions (276+ tests passing)

## Notes

- This specification is for TEST CREATION ONLY
- Do not modify index.ts implementation
- Use mocking to isolate event handler logic
- Focus on state transition correctness and broadcast consistency
- Ensure FR4 is explicitly verified (critical gap from system-verifier)
