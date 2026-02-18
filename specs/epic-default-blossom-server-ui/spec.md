---
epic: default-blossom-server-ui
created: 2026-02-16T17:04:52Z
status: initializing
---

# Feature: Default Blossom Server and UI Configuration

## Overview

Add default blossom server initialization for new identities and implement the UI for managing blossom servers, similar to relay configuration.

## Clarifications (from validation)

1. **Health Checks**: Check on component mount only. Status indicators:
   - Green = HTTP 200 OK response within 3s timeout
   - Yellow = Currently checking (loading state)
   - Red = Failed (non-200 response or timeout)
   - No periodic polling or manual refresh

2. **Error Handling**: Toast notification + rollback optimistic update. User retries manually.
   - addServer fails → show error toast, don't add to list
   - removeServer fails → show error toast, keep in list
   - reorderServers fails → show error toast, revert to previous order

3. **Drag-and-Drop**: Out of scope for MVP. Users manage servers with add/remove only.

4. **Dual-Instance Testing**: Required. Verify end-to-end media upload flow works with default server:
   - Instance A creates identity with default server
   - Instance A uploads media attachment using default server
   - Instance B receives message and can view media from default server URL

## Problem Statement

Currently, when users create a new identity:
1. No blossom servers are configured by default (listServers returns empty array)
2. Users must manually add a blossom server before they can upload media attachments
3. The BlossomServerSettings UI component exists but is not implemented (stub throws error)

This creates friction for new users who want to share media. They must:
- Know what a blossom server is
- Find and manually configure a public blossom server URL
- Understand the relationship between blossom servers and media uploads

Similar to how relays have DEFAULT_RELAYS that are automatically configured for new identities, blossom servers should have sensible defaults.

## Proposed Solution

### 1. Default Blossom Server Initialization

**Pattern**: Follow the existing DEFAULT_RELAYS pattern used for relay initialization.

**Implementation**:
- Add `DEFAULT_BLOSSOM_SERVERS` constant in BlossomServerService.ts
- Default server: `https://cdn.satellite.earth` (label: "Satellite CDN")
- When creating a new identity, initialize with default blossom server(s)
- Initialization happens in BlossomServerService.initialize() or via a dedicated initializeDefaults() method

**Integration Point**:
- Hook into identity creation flow in NostlingService.createIdentity()
- After saving relay defaults, also save blossom server defaults
- Pattern:
  ```typescript
  // Initialize relay config file with defaults
  await this.relayConfigManager.saveRelays(id, DEFAULT_RELAYS);

  // Initialize blossom servers with defaults
  await blossomServerService.initializeDefaults(identityPubkey);
  ```

**Backward Compatibility**:
- Existing identities without blossom servers remain unchanged
- Only new identities get defaults
- Users can still remove the default server if desired

### 2. Blossom Server Settings UI Component

**Component**: `BlossomServerSettings.tsx` (currently stubbed)

**Features**:
- List configured blossom servers with URL, label, and position
- Health status indicator for each server (green = healthy, yellow = checking, red = failed)
  - Check health on component mount only (no polling)
  - Use existing BlossomServerService.checkHealth() method
- Add server: URL input + optional label input with "Add" button
- Remove server: Delete button on each server row with confirmation dialog
  - Confirmation text: "Remove blossom server [URL]?"
  - Buttons: "Remove" (destructive), "Cancel"
- Empty state: "No blossom servers configured. Add one to enable media uploads."
- Validation: Enforce HTTPS requirement (reject http:// URLs with error message)
- Note: Drag-and-drop reordering is out of scope for MVP

**UI Layout**:
```
┌─ Blossom Servers ────────────────────────────┐
│                                              │
│  ● cdn.satellite.earth                       │
│    Satellite CDN                      [Remove]│
│                                              │
│  [Add Server]                                │
│                                              │
│  ┌─ Add Blossom Server ──────────────────┐  │
│  │ URL:   [https://...]                  │  │
│  │ Label: [Optional label]               │  │
│  │                              [Add]    │  │
│  └───────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**API Integration**:
- Use existing blossom-api.ts functions:
  - `blossomApi.listServers(identityPubkey)`
  - `blossomApi.addServer(identityPubkey, url, label?)`
  - `blossomApi.removeServer(identityPubkey, url)`
  - `blossomApi.reorderServers(identityPubkey, urls)`
  - `blossomApi.checkHealth(url)`

**State Management**:
- Fetch server list on mount
- Optimistic updates for add/remove with rollback on failure
  - addServer: Optimistically add to UI, rollback if IPC call fails
  - removeServer: Optimistically remove from UI, rollback if IPC call fails
- Health checks on mount only (no polling, no caching)
- Error handling with toast notifications:
  - Show error toast with descriptive message
  - Rollback optimistic UI changes
  - User retries manually by repeating the action

### 3. UI Integration into Identity Settings

**Location**: Identity settings panel (where relay settings would be located)

**Integration Pattern**:
- Find the identity settings component/panel
- Add a new section titled "Blossom Servers" (or "Media Servers")
- Render `<BlossomServerSettings identityPubkey={selectedIdentity.pubkey} />`
- Position: Below relay configuration section (if exists) or in a logical settings area

**Access**:
- Accessible when an identity is selected
- Same permission model as other identity-specific settings

## Functional Requirements

### FR-1: Default Server Initialization
- **FR-1.1**: New identities are created with `https://cdn.satellite.earth` as default blossom server
- **FR-1.2**: Default server has label "Satellite CDN" and position 0
- **FR-1.3**: Existing identities without blossom servers are not modified
- **FR-1.4**: Initialization is idempotent (safe to call multiple times)

### FR-2: Blossom Server Settings UI
- **FR-2.1**: Display list of configured servers with URL, label, and health status
- **FR-2.2**: Add server via URL input (with optional label)
- **FR-2.3**: Validate HTTPS requirement before adding (reject http://)
- **FR-2.4**: Remove server with confirmation dialog ("Remove blossom server [URL]?" with "Remove"/"Cancel" buttons)
- **FR-2.5**: ~~Reorder servers via drag-and-drop~~ (Out of scope for MVP)
- **FR-2.6**: Show empty state when no servers configured ("No blossom servers configured. Add one to enable media uploads.")
- **FR-2.7**: Display health status indicator (color-coded: green=200 OK within 3s, yellow=checking, red=failed/timeout)
- **FR-2.8**: Health checks performed on component mount only (no periodic polling)
- **FR-2.9**: Real-time updates when servers are added/removed
- **FR-2.10**: Error handling with toast notifications and rollback on failure

### FR-3: Settings Integration
- **FR-3.1**: Blossom server settings accessible from identity settings panel
- **FR-3.2**: Settings only visible when an identity is selected
- **FR-3.3**: UI follows existing Chakra UI theme and design patterns

## Non-Functional Requirements

### NFR-1: Consistency
- Follow existing patterns from relay configuration (code structure, UI layout)
- Use same validation patterns (HTTPS requirement)
- Consistent error messaging and user feedback

### NFR-2: Performance
- Health checks performed on component mount only (no ongoing network requests)
- UI should be responsive even with many servers configured
- Optimistic updates provide immediate feedback before IPC roundtrip

### NFR-3: User Experience
- Clear error messages for invalid URLs or failed operations
- Confirmation dialogs for destructive actions (remove server)
- Helpful empty state messaging
- Accessible UI (keyboard navigation, ARIA labels, screen reader support)

## Acceptance Criteria

### AC-1: Default Server Initialization
- [ ] New identities have `https://cdn.satellite.earth` configured as default blossom server
- [ ] Default server has label "Satellite CDN" and position 0
- [ ] Existing identities are not affected
- [ ] Tests verify default initialization on identity creation

### AC-2: UI Implementation
- [ ] BlossomServerSettings component renders server list correctly
- [ ] Add server form accepts URL and optional label
- [ ] HTTPS validation rejects http:// URLs with error message
- [ ] Remove server shows confirmation dialog with correct text and buttons ("Remove blossom server [URL]?" / "Remove" / "Cancel")
- [ ] Health status indicators display correctly (green=healthy, yellow=checking, red=failed) checked on mount only
- [ ] Empty state shown when no servers configured with message: "No blossom servers configured. Add one to enable media uploads."
- [ ] All UI interactions work correctly (add, remove)
- [ ] Error handling with toast + rollback works for failed operations

### AC-3: Settings Integration
- [ ] Blossom server settings accessible in identity settings panel
- [ ] Settings render correctly when identity is selected
- [ ] UI matches existing Chakra UI theme and patterns

### AC-4: Testing
- [ ] Unit tests for default server initialization logic
- [ ] Component tests for BlossomServerSettings UI
- [ ] Integration tests verifying default server on new identity creation
- [ ] E2E tests for UI workflow (add/remove servers)
- [ ] Dual-instance E2E test: Instance A creates identity with default server, uploads media, Instance B receives and views media

## Implementation Guidance

### Phase 1: Default Server Infrastructure
1. Add `DEFAULT_BLOSSOM_SERVERS` constant to BlossomServerService.ts
2. Implement `initializeDefaults(identityPubkey)` method in BlossomServerService
3. Hook into NostlingService.createIdentity() to call initializeDefaults
4. Add unit tests for default initialization

### Phase 2: UI Component Implementation
1. Implement BlossomServerSettings component with:
   - Server list rendering
   - Add server form with validation
   - Remove server with confirmation
   - Health status indicators
   - Empty state
2. Add component tests

### Phase 3: Settings Integration
1. Locate identity settings panel component
2. Add "Blossom Servers" section
3. Render BlossomServerSettings with selected identity pubkey
4. Verify UI consistency with existing settings

### Phase 4: E2E Testing
1. Add Playwright test for new identity creation with default server
2. Add Playwright test for UI workflow (add/remove servers)
3. Add dual-instance Playwright test:
   - Instance A: Create identity (verify default server configured)
   - Instance A: Upload media attachment (uses default blossom server)
   - Instance B: Receive message with media
   - Instance B: Verify media displays correctly from default server URL

## Dependencies

- Existing BlossomServerService with add/remove/reorder/checkHealth methods (already implemented)
- Existing blossom-api.ts with IPC bridge (already implemented)
- Existing identity creation flow in NostlingService (already implemented)
- Chakra UI components and theme system (already in use)

## Risks and Mitigations

### Risk 1: Default Server Availability
**Risk**: cdn.satellite.earth might be unavailable or change policies
**Mitigation**:
- Document default server as a user-replaceable setting
- Provide clear UI for adding alternative servers
- Health check will indicate if default server is unavailable

### Risk 2: UI Integration Complexity
**Risk**: Finding the right place to integrate settings UI might be complex
**Mitigation**:
- Explore codebase for existing settings patterns
- Follow established patterns for identity-specific settings
- Start with basic integration, enhance incrementally

### Risk 3: Backward Compatibility
**Risk**: Existing identities might break if default initialization is applied retroactively
**Mitigation**:
- Only initialize defaults for NEW identities
- Existing identities remain unchanged (empty blossom servers list)
- Document migration path if user wants to add defaults to existing identities

## Testing Strategy

### Unit Tests
- BlossomServerService.initializeDefaults() creates default server
- NostlingService.createIdentity() calls blossom defaults initialization
- HTTPS validation rejects http:// URLs
- Health check integration with UI component

### Component Tests
- BlossomServerSettings renders server list correctly
- Add server form validation works
- Remove server confirmation flow
- Empty state display
- Error handling and toast notifications

### Integration Tests
- New identity creation includes default blossom server
- Default server persisted in database correctly
- IPC bridge works for all operations

### E2E Tests
- Create new identity → verify default server appears in UI
- Add custom server → verify appears in list
- Remove server → verify removed from list
- Health status indicators display correctly

## Success Metrics

- [ ] New identities have default blossom server configured (0% → 100%)
- [ ] Users can add/remove/reorder blossom servers via UI
- [ ] HTTPS validation prevents insecure server addition
- [ ] All tests pass (unit, component, integration, E2E)
- [ ] No regressions in existing functionality
- [ ] UI matches existing Chakra UI theme and design patterns

## References

- Existing implementation: `src/main/blossom/BlossomServerService.ts`
- UI component stub: `src/renderer/components/BlossomServerSettings/BlossomServerSettings.tsx`
- Relay defaults pattern: `src/main/nostling/relay-config-manager.ts` (DEFAULT_RELAYS)
- Identity creation: `src/main/nostling/service.ts` (createIdentity method)
- Epic spec: `specs/epic-blossom-media-uploads/spec.md` (FR-5: Blossom Server Configuration)
