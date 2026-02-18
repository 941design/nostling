# Acceptance Criteria: Default Blossom Server and UI Configuration

Generated: 2026-02-16T10:45:00Z
Source: spec.md

## Criteria

### AC-001: Default Server Initialization
- **Description**: New identities must have `https://cdn.satellite.earth` configured as default blossom server with label "Satellite CDN" and position 0. Existing identities must not be affected.
- **Verification**:
  - Unit test: Create identity, query blossom_servers table, verify default server exists
  - Integration test: Call NostlingService.createIdentity(), call BlossomServerService.listServers(), verify default server in list
  - E2E test: Create identity in UI, navigate to blossom server settings, verify default server appears
- **Type**: unit, integration, e2e

### AC-002: UI Component Implementation
- **Description**: BlossomServerSettings component must render server list, support add/remove operations, display health status indicators, show empty state, enforce HTTPS validation, and handle errors with toast notifications
- **Verification**:
  - Component test: Render with mock data, verify server list displays correctly
  - Component test: Simulate add server with http:// URL, verify error message shown
  - Component test: Simulate remove server, verify confirmation dialog appears with correct text
  - Component test: Mock failed add operation, verify toast shown and UI rollback occurs
  - E2E test: Navigate to settings, interact with add/remove buttons, verify UI updates
- **Type**: component, e2e

### AC-003: Settings Integration
- **Description**: Blossom server settings must be accessible in identity settings panel, render correctly when identity is selected, and match existing Chakra UI theme and patterns
- **Verification**:
  - Visual inspection: Navigate to identity settings, verify "Blossom Servers" section appears
  - E2E test: Select identity, verify settings render with correct theme colors and spacing
  - Code review: Verify Chakra UI components used consistently with existing patterns
- **Type**: e2e, manual

### AC-004: Comprehensive Testing Coverage
- **Description**: Implementation must include unit tests for default initialization logic, component tests for UI, integration tests for identity creation flow, E2E tests for UI workflow, and dual-instance E2E test for media upload flow
- **Verification**:
  - Test suite: Run `npm test`, verify new tests added and passing
  - Test coverage: Verify BlossomServerService.initializeDefaults covered
  - Test coverage: Verify BlossomServerSettings component covered
  - E2E suite: Run single-instance E2E tests, verify add/remove/health check scenarios
  - Dual-instance suite: Run dual-instance test, verify Instance A → Instance B media flow works
- **Type**: unit, component, integration, e2e

## E2E Test Plan

### Scenario 1: New Identity Default Server Initialization
- **Setup**: Single-instance Electron app with Docker relay (make dev)
- **Steps**:
  1. Launch Nostling app via Playwright
  2. Create new identity with label "Test Identity"
  3. Navigate to identity settings → Blossom Servers section
  4. Verify default server `https://cdn.satellite.earth` appears in list
  5. Verify server label is "Satellite CDN"
  6. Verify health indicator is present (green/yellow/red)
- **Expected**: Default server visible immediately after identity creation
- **Test File**: `e2e/blossom-default-server.spec.ts`

### Scenario 2: Add Custom Blossom Server
- **Setup**: Single-instance Electron app with existing identity
- **Steps**:
  1. Launch Nostling app, select identity
  2. Navigate to Blossom Servers settings
  3. Enter custom server URL `https://example-blossom.com` with label "Custom Server"
  4. Click "Add" button
  5. Verify server appears in list below default server
  6. Attempt to add server with `http://insecure.com` URL
  7. Verify error toast appears with HTTPS requirement message
  8. Verify insecure server NOT added to list
- **Expected**: Custom HTTPS servers can be added; HTTP servers rejected with error
- **Test File**: `e2e/blossom-settings-ui.spec.ts`

### Scenario 3: Remove Blossom Server
- **Setup**: Single-instance Electron app with identity having 2+ servers
- **Steps**:
  1. Launch Nostling app, select identity with multiple servers
  2. Navigate to Blossom Servers settings
  3. Click "Remove" button on second server
  4. Verify confirmation dialog appears with text "Remove blossom server [URL]?"
  5. Click "Cancel" button
  6. Verify server still in list
  7. Click "Remove" button again
  8. Click "Remove" in confirmation dialog
  9. Verify server removed from list
  10. Verify toast notification indicates success
- **Expected**: Confirmation required for removal; cancellation preserves server
- **Test File**: `e2e/blossom-settings-ui.spec.ts`

### Scenario 4: Dual-Instance Media Upload with Default Server
- **Setup**: Dual-instance Docker environment (make dev-dual)
  - Instance A (CDP port 9222): Fresh identity with default blossom server
  - Instance B (CDP port 9223): Existing identity, mutual contact with Instance A
  - Docker services: relay-a, relay-b, blossom-server (test Blossom server on localhost:3000)
- **Steps**:
  1. **Instance A**: Create new identity "Alice"
  2. **Instance A**: Verify default blossom server configured (check settings UI)
  3. **Instance A**: Add Instance B's identity as contact via QR exchange
  4. **Instance B**: Accept contact request from Instance A
  5. **Instance A**: Select conversation with Instance B
  6. **Instance A**: Click attachment button (paperclip icon)
  7. **Instance A**: Select test image file (e.g., `test-fixtures/sample-image.png`)
  8. **Instance A**: Verify attachment preview appears in compose area
  9. **Instance A**: Click "Send" button
  10. **Instance A**: Verify message with attachment shows "uploading" status
  11. **Instance A**: Wait for upload to complete (verify status changes to "sent")
  12. **Instance B**: Verify message with media attachment appears in conversation
  13. **Instance B**: Verify media thumbnail displays (loaded from blossom server URL)
  14. **Instance B**: Click thumbnail to expand media in lightbox/overlay
  15. **Instance B**: Verify full-size media displays correctly
- **Expected**:
  - Default server automatically used for upload
  - Media uploads successfully to `https://cdn.satellite.earth` (or test blossom-server)
  - Instance B receives message with blossom URL
  - Media renders correctly in both preview and full-size views
- **Test File**: `e2e/dual-instance-blossom-default-upload.spec.ts`
- **Notes**:
  - May require configuring test blossom server URL override for CI/testing
  - Should verify blossom server URL in message event tags matches default server
  - Should check network logs to confirm upload to correct server

### Scenario 5: Empty State Display
- **Setup**: Single-instance with identity having no blossom servers (requires removing default)
- **Steps**:
  1. Launch Nostling app, select identity
  2. Navigate to Blossom Servers settings
  3. Remove all servers (including default)
  4. Verify empty state message appears: "No blossom servers configured. Add one to enable media uploads."
  5. Verify "Add Server" button/form still accessible
  6. Add a server via form
  7. Verify empty state disappears and server list shows
- **Expected**: Clear empty state guidance when no servers configured
- **Test File**: `e2e/blossom-settings-ui.spec.ts`

### Scenario 6: Health Check on Mount
- **Setup**: Single-instance with identity having multiple servers (one unreachable)
- **Steps**:
  1. Configure identity with 2 servers:
     - Server 1: `https://cdn.satellite.earth` (reachable)
     - Server 2: `https://unreachable-blossom-test.invalid` (unreachable)
  2. Navigate away from Blossom Servers settings
  3. Navigate back to Blossom Servers settings
  4. Observe health indicators during mount
  5. Verify Server 1 shows yellow (checking) then green (healthy)
  6. Verify Server 2 shows yellow (checking) then red (failed/timeout after 3s)
  7. Verify no ongoing polling after initial check
- **Expected**: Health checks performed once on mount; no periodic updates
- **Test File**: `e2e/blossom-health-check.spec.ts`
- **Notes**: May require mocking network or using test Blossom server with configurable responses

## Verification Plan

### Phase 1: Unit and Component Tests (Pre-Integration)
- Run unit tests for `BlossomServerService.initializeDefaults()`
- Run unit tests for default server insertion on `NostlingService.createIdentity()`
- Run component tests for `BlossomServerSettings` UI interactions
- Verify HTTPS validation, error handling, toast notifications
- Target: 100% code coverage for new methods

### Phase 2: Integration Tests (Service Layer)
- Test full identity creation flow with default blossom server initialization
- Verify database persistence (blossom_servers table)
- Verify IPC handlers work correctly (add/remove/list operations)
- Test error cases (duplicate URLs, invalid formats, network failures)

### Phase 3: Single-Instance E2E Tests (UI Workflow)
- Execute Scenarios 1-3, 5-6 in single-instance Docker environment
- Verify UI renders correctly with Chakra UI theme
- Verify user interactions (add, remove, confirmation dialogs)
- Verify error toasts and rollback behavior
- Verify health check indicators display correctly

### Phase 4: Dual-Instance E2E Test (End-to-End Media Flow)
- Execute Scenario 4 in dual-instance Docker environment
- Critical verification: media uploaded to default server is accessible by receiver
- Confirm default server URL appears in message event tags
- Verify no manual server configuration required for basic media sharing

### Phase 5: Regression Check
- Run full test suite (`npm test`)
- Verify no existing tests broken
- Verify no regressions in identity creation, relay config, or existing blossom functionality

### Success Criteria
- All acceptance criteria marked as verified
- All E2E scenarios pass (100% pass rate)
- No regressions detected in regression check
- Code review confirms Chakra UI consistency and HTTPS enforcement
