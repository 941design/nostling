# Relay Re-activation Not Working - Bug Report

## Bug Description
When a user deactivates a relay by unchecking the "Enabled" checkbox and then immediately tries to re-activate it, nothing happens. The relay remains inactive with no visual feedback, making it impossible to re-enable relays once they've been disabled.

## Expected Behavior
When re-activating a relay (checking the "Enabled" checkbox after it was unchecked):
1. The relay should become active again
2. The read and/or write permissions should be restored to their state before deactivation
3. The UI should reflect the active state with appropriate visual feedback
4. The relay should reconnect and function normally

## Reproduction Steps
1. Open Relay Configuration (menu → Relay Configuration)
2. Select any active relay with read/write enabled
3. Uncheck the "Enabled" checkbox for that relay
4. Immediately re-check the "Enabled" checkbox
5. Observe: Nothing happens - the relay remains inactive

## Actual Behavior
- No visual feedback occurs when re-checking the "Enabled" checkbox
- The relay stays in the disabled state (read=false, write=false)
- The relay does not reconnect to the network
- The UI does not update to show the relay as active

## Impact
- **Severity**: Critical
- **Affected Users**: All users who need to manage relay configurations
- **Affected Workflows**:
  - Relay configuration management
  - Temporary relay disabling/enabling for testing
  - Network connectivity troubleshooting
  - Users cannot re-enable relays without app restart or manual file editing

## Environment/Context
- Codebase version: 0.0.25 (based on git commit ebd94a3)
- Platform: Desktop application (Electron-based)
- UI Framework: Chakra UI v3 with React
- Operating system: macOS Darwin 25.0.0 (but affects all platforms)

## Root Cause Hypothesis
The bug is in `src/renderer/components/RelayTable.tsx:109-119` in the `handleEnabledChange` callback.

**Current implementation** (lines 109-119):
```typescript
const handleEnabledChange = useCallback(
  (details: CheckboxCheckedChangeDetails) => {
    const isEnabled = details.checked === true;
    onUpdate({
      ...relay,
      read: isEnabled ? relay.read : false,
      write: isEnabled ? relay.write : false,
    });
  },
  [relay, onUpdate]
);
```

**Problem**:
- When enabling (`isEnabled = true`), the code uses `relay.read` and `relay.write` from the current relay state
- However, when the relay was disabled, both `read` and `write` were set to `false`
- So re-enabling copies the disabled state (false, false) instead of restoring the previous active state
- The previous values before disabling are lost and cannot be recovered

**Why this happens**:
1. User disables relay → `handleEnabledChange` sets `read: false, write: false`
2. Relay state updates to `{ url: "...", read: false, write: false, order: 0 }`
3. User re-enables relay → `handleEnabledChange` evaluates `isEnabled ? relay.read : false`
4. Since `relay.read` is now `false`, it sets `read: false` (no change)
5. Same for `write: false`
6. Result: No state change occurs, relay stays disabled

**Referenced files**:
- `src/renderer/components/RelayTable.tsx:109-119` - Bug location in handleEnabledChange
- `src/renderer/components/RelayTable.tsx:135` - isEnabled calculation (`relay.read || relay.write`)
- `src/renderer/main.tsx:1288-1302` - saveRelaysForIdentity (upstream state propagation)

## Constraints
- **Backward compatibility**: Must preserve existing relay configuration file format and structure
- **Performance**: Changes should not introduce performance regressions in relay management
- **API contracts**:
  - Must preserve `NostlingRelayEndpoint` interface: `{ url: string, read: boolean, write: boolean, order: number }`
  - Must maintain IPC contract between renderer and main process for relay updates
- **User experience**: Solution must not require app restart or manual file editing
- **Test coverage**: Existing tests must continue to pass, particularly:
  - E2E tests in `e2e/ui-relay-integration.spec.ts:89-132`
  - Property tests in `src/renderer/components/RelayTable.test.ts:266-297`
  - Regression test E004 in `src/renderer/components/RelayTable.test.ts:653-668`

## Codebase Context

### Likely Location
**Primary bug location**:
- File: `src/renderer/components/RelayTable.tsx`
- Function: `SortableRelayRow` component, specifically the `handleEnabledChange` callback
- Lines: 109-119

**Related code that may need updates**:
- `src/renderer/components/RelayTable.tsx:120-133` - handleReadChange and handleWriteChange (may need similar fixes)
- `src/renderer/components/RelayTable.test.ts` - Test coverage for toggle behavior

### Related Code
**Relay state management flow**:
1. **UI Component**: `RelayTable.tsx` - Checkbox handlers update relay objects
2. **State propagation**: `main.tsx:1288-1302` - `saveRelaysForIdentity` saves to backend
3. **Backend persistence**: `src/main/nostling/relay-config-manager.ts:245-308` - File system writes
4. **Network layer**: `src/main/nostling/relay-pool.ts:157-183` - WebSocket connections respect read/write flags

**Key architectural points**:
- Relay state is stored in `NostlingRelayEndpoint` objects with boolean `read` and `write` flags
- The "Enabled" state is derived: `isEnabled = relay.read || relay.write` (line 135)
- Disabling a relay sets both `read: false` and `write: false`
- Re-enabling should restore previous read/write values, but currently doesn't

### Similar Bugs
Test file `src/renderer/components/RelayTable.test.ts` contains regression test E004 (lines 653-668):
```typescript
// E004: "Toggle enabled false then true"
// Current behavior: Once disabled, relay becomes read=false, write=false permanently
// Re-enabling doesn't restore previous state
```

This test **documents the current broken behavior** as a known limitation. The test needs to be updated once the bug is fixed.

### Recent Changes
Git history shows recent relay-related work:
- Commit `daba4f8` - "relay design" (most recent relay changes)
- Commit `aee3007` - "relay settings"
- These commits moved relay management to per-identity configuration

The bug may have been introduced or exposed during the relay design refactoring.

## Out of Scope
The following are explicitly **not** part of this bug fix:
- Refactoring the entire relay management system
- Adding new relay configuration features (e.g., relay health monitoring)
- Performance optimizations beyond the minimal fix
- Feature enhancements like "remember last state" preferences
- Changes to relay persistence format or backend architecture
- UI/UX improvements beyond fixing the re-activation behavior

## Solution Approach
The fix should:
1. Store the previous read/write state before disabling
2. Restore that state when re-enabling
3. Maintain backward compatibility with existing relay configurations
4. Pass all existing tests plus new regression tests for this specific bug
5. Be minimal and focused only on the re-activation issue
