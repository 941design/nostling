# Remove Status Dashboard - Requirements Specification

## Problem Statement

The current UI displays status information (Version, Platform, Last Update Check) in the main content area as part of a Status Dashboard. This creates visual clutter and redundancy. The information should be simplified and moved to more appropriate locations.

## Core Functionality

Simplify the UI by removing the Status Dashboard from the main area entirely, moving the "Last Update Check" timestamp to the footer, and ensuring that update checking behavior is properly tested.

## Functional Requirements

### FR1: Remove Status Dashboard from Main Area
- Remove the entire `StatusDashboard` component from the main content area
- Remove the "Status dashboard" heading
- Remove all three info cards:
  - Version card
  - Platform card
  - Last Update Check card
- Remove the log panel ("Recent update logs")
- The main content area should become **completely empty** (no content displayed)

**Acceptance Criteria:**
- Main content area contains no visible elements
- No "Status dashboard" heading visible
- No info cards visible
- No log panel visible
- Layout remains stable with empty main area

### FR2: Move Last Update Check to Footer
- Add "Last Update Check" timestamp display to the footer
- Display format: "Last check: [timestamp]" or "Last check: Not yet checked"
- Use the same timestamp formatting as the previous implementation (localized date/time string)
- Position alongside existing footer content (version and manifest verification text)

**Acceptance Criteria:**
- Footer displays last update check timestamp
- Timestamp updates after checking for updates
- Shows "Not yet checked" when no check has been performed
- Footer layout accommodates new content without overflow

### FR3: Playwright Test for Update Check Timestamp
- Create new Playwright test verifying that checking for updates updates the timestamp
- Test should:
  1. Wait for app to be ready
  2. Record initial "Last check" state (should be "Not yet checked")
  3. Trigger update check via button click
  4. Wait for check to complete (phase returns to 'idle' or changes to 'available')
  5. Verify "Last check" timestamp is now populated with a valid date/time
  6. Verify timestamp format is valid (contains date/time elements)

**Acceptance Criteria:**
- Test passes on clean app start (no previous checks)
- Test verifies timestamp changes from "Not yet checked" to actual timestamp
- Test verifies timestamp format is valid
- Test is reliable and doesn't flake

### FR4: Adapt/Remove Existing Playwright Tests
- Review and update tests in `e2e/app.spec.ts` that verify Status Dashboard
- Specifically address the test: "should display status dashboard" (lines 29-36)
- Options:
  - Remove test entirely if it only validates removed UI
  - Adapt test to verify new footer timestamp display
- Review other tests to ensure they don't depend on removed Status Dashboard elements

**Acceptance Criteria:**
- Test suite passes without failures
- No tests reference removed Status Dashboard elements
- Test coverage for footer timestamp is adequate
- All existing update flow tests continue to pass

## Critical Constraints

### C1: Preserve Update Functionality
- Removing the Status Dashboard UI must NOT affect update checking logic
- Update state management must remain unchanged
- IPC communication between main and renderer must remain intact
- Sidebar update controls must continue to function normally

### C2: Maintain Footer Layout
- Footer must accommodate new timestamp without breaking layout
- Existing footer elements (version, manifest verification) must remain visible
- Footer should remain single-line if possible, wrap gracefully if needed
- Responsive behavior should be maintained

### C3: Data Flow Integrity
- The `lastUpdateCheck` state in main process must continue to update
- The renderer must continue to receive `lastUpdateCheck` via `getStatus()` IPC call
- The timestamp must update in real-time when updates are checked

### C4: Test Reliability
- New Playwright test must be deterministic (no race conditions)
- Test must properly wait for async update check to complete
- Test must handle both dev mode and production mode scenarios

## Integration Points

### I1: Main Process (src/main/index.ts)
- `lastUpdateCheck` variable (line 17) - continues to be set when checking for updates
- `getStatus()` function (lines 125-133) - already returns `lastUpdateCheck`
- Auto-updater event handler "checking-for-update" (line 62) - sets `lastUpdateCheck`

### I2: Renderer Process (src/renderer/main.tsx)
- Remove `StatusDashboard` component (lines 137-149)
- Remove `InfoCard` component (lines 151-158)
- Remove `LogPanel` component (lines 160-178)
- Update `Footer` component (lines 66-73) to display `lastUpdateCheck`
- Update `App` component (lines 180-195) to remove StatusDashboard from render

### I3: Preload API (src/preload/index.ts)
- No changes needed - `getStatus()` already exposes `lastUpdateCheck`
- Existing IPC channels remain unchanged

### I4: Shared Types (src/shared/types.ts)
- `AppStatus` interface (lines 16-22) already includes `lastUpdateCheck?: string`
- No type changes required

### I5: Existing Tests
- `e2e/app.spec.ts` - Test "should display status dashboard" (lines 29-36) needs removal or adaptation
- `e2e/updates.spec.ts` - Tests may reference update state display, verify they still pass
- `e2e/logs.spec.ts` - Log panel tests will need removal (entire file may be obsolete)

## User Preferences

### UP1: Minimalist UI
- User prefers cleaner, simpler interface
- Main area should be completely empty (no placeholder text, no empty states)
- Information moved to footer where it's less prominent but still accessible

### UP2: Footer-Based Information
- User wants timestamp in footer rather than attempting to customize Electron's native About dialog
- Footer should be the single source of truth for "Last Update Check"

## Codebase Context

### Current Status Dashboard Implementation
The Status Dashboard is implemented in `src/renderer/main.tsx`:
- `StatusDashboard` component renders a heading + grid of 3 cards + log panel
- Info cards display: Version (from status.version), Platform (from status.platform), Last Update Check (from status.lastUpdateCheck)
- Log panel displays recent logs from status.logs array
- Grid layout uses CSS classes `.dashboard`, `.grid`, `.card`

### Current Footer Implementation
The Footer is a simple component showing:
- Version number (e.g., "v0.0.6")
- Text: "RSA manifest verification enabled"
- CSS class: `.app-footer`

### Data Flow
1. Main process maintains `lastUpdateCheck` as ISO string
2. Set in auto-updater "checking-for-update" event handler (line 62 of main/index.ts)
3. Exposed via `getStatus()` IPC handler
4. Renderer calls `window.api.getStatus()` on mount
5. Status state includes `lastUpdateCheck` field

### Test Patterns
Existing update tests in `e2e/updates.spec.ts` use:
- `waitForAppReady()` helper to ensure app loaded
- `getUpdatePhase()` helper to read current phase
- `waitForUpdatePhase()` helper to wait for specific phase
- `electronApp.evaluate()` to send fake update states for testing
- `page.locator()` with semantic CSS selectors

### Similar Features
No similar features in codebase - this is a removal/simplification task rather than adding new functionality.

## Out of Scope

### OS1: Customizing Electron's About Dialog
- The native About dialog (Help > About) is managed by Electron
- Customizing it requires platform-specific code and is complex
- Not attempting to modify the native About dialog

### OS2: Adding New About Dialog Modal
- Not creating a custom About dialog component
- Not adding menu items or keyboard shortcuts to trigger About
- Footer timestamp is sufficient for user's needs

### OS3: Reorganizing Sidebar
- Sidebar layout and content remain unchanged
- Update controls remain in sidebar
- No new sidebar elements added

### OS4: Logging System Changes
- Log collection and storage remain unchanged
- `getRecentLogs()` function remains (may be used elsewhere)
- Only removing log panel UI component

### OS5: Styling Overhaul
- Only making minimal CSS changes required for footer timestamp
- Not redesigning footer layout comprehensively
- Not changing color scheme, fonts, or spacing beyond what's necessary

---

**Note**: This is a requirements specification, not an architecture design.
Implementation approach, component structure, and styling details will be
determined by the integration-architect during Phase 2.
