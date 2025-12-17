# Identity Profile Editor Panel - Requirements Specification

## Problem Statement

Users need a way to edit their identity profiles (name, picture, banner, bio, etc.) within the Nostling application. Currently, profiles can only be created/updated through backend operations. This feature provides a UI panel where users can view and edit all profile fields for their identities, with changes being sent as private profile updates to all their contacts.

## Core Functionality

Add an "Identities" menu item to the hamburger menu that opens a dedicated panel for editing identity profiles. The panel follows the established sub-panel pattern (like theme selection) with:
- Identity list displayed in sidebar (contact list hidden)
- Selected identity's profile details displayed in main area
- All standard profile fields editable
- Cancel/Apply buttons to stage and commit changes
- Private profile update events sent to all contacts on Apply (when content changes)

## Functional Requirements

### FR1: Menu Item Integration
- Add "Identities" menu item to hamburger menu in header
- Menu item should be available regardless of whether an identity is selected
- Clicking menu item opens the Identities panel view

**Acceptance Criteria:**
- "Identities" appears in hamburger menu
- Clicking item transitions to identities view
- Menu item has appropriate icon (e.g., user/person icon)
- Menu item has test ID for e2e testing

### FR2: View State Management
- Add 'identities' to AppView union type
- Implement handler to transition to identities view
- Support Escape key to return to chat view
- Maintain view state during panel lifecycle

**Acceptance Criteria:**
- `currentView === 'identities'` when panel is active
- Escape key returns to chat view
- View state is properly managed (no flickering or race conditions)

### FR3: Sidebar Identity List
- When identities view is active, sidebar shows identity list (contacts hidden)
- Identity list displays all user identities (same data as normal identity selector)
- Each identity shows: label, profile name (if available), and profile picture
- Selected identity is visually highlighted
- Clicking an identity selects it for editing

**Acceptance Criteria:**
- Contact list is hidden when identities panel is active
- Identity list is visible and scrollable in sidebar
- Selected identity has visual indication (highlight/background color)
- Identity display matches existing identity list styling
- Clicking identity updates main panel to show that identity's details

### FR4: Profile Detail Editing (Main Panel)
- Main panel uses SubPanel component with title "Edit Identity Profile"
- Displays all editable fields for selected identity:
  - **Label** (internal identifier, stored in nostr_identities table)
  - **Name** (public profile field, from ProfileContent)
  - **About** (bio/description)
  - **Picture** (avatar URL)
  - **Banner** (header image URL)
  - **Website** (personal website URL)
  - **NIP-05** (verification identifier)
  - **LUD16** (Lightning address)
- Fields use text inputs with proper labels
- Image URL fields show current image if URL is valid
- All fields are optional (can be empty)

**Acceptance Criteria:**
- All 8 fields are displayed and editable
- Label field updates nostr_identities.label
- Other fields update ProfileContent fields
- Image previews display when valid URLs are entered
- Empty fields are allowed (no required validation)
- Field layout is clean and follows app design patterns

### FR5: Live Preview / Staging Pattern
- Changes to fields update staged state immediately (live editing)
- Cancel button reverts all changes to original values
- Apply button commits all staged changes
- Staging pattern matches theme selection panel behavior

**Acceptance Criteria:**
- Typing in fields updates preview/staged state immediately
- Cancel reverts all fields to their original values
- Apply commits changes to database and sends profile events
- No changes are persisted until Apply is clicked

### FR6: Identity Switching Protection
- While editing an identity with unsaved changes, selecting another identity is blocked
- Attempting to switch identities shows visual feedback (e.g., disabled state or no response)
- Must Cancel or Apply current changes before switching identities
- Visual indicator shows when editing is "dirty" (has unsaved changes)

**Acceptance Criteria:**
- Cannot select different identity when current has unsaved changes
- Other identities appear disabled/non-interactive when editing
- Clear visual feedback indicates editing is in progress
- Cancel or Apply re-enables identity switching

### FR7: Profile Update on Apply
- Clicking Apply validates profile content (non-empty object check)
- Updates label in nostr_identities table
- Updates/creates private_authored profile in nostr_profiles table
- Sends NIP-59 wrapped profile event to all contacts of that identity
- Only sends if profile content has changed (idempotent via hash comparison)
- Shows success/error feedback after Apply

**Acceptance Criteria:**
- Label is updated in nostr_identities table on Apply
- Profile content is validated before saving
- Private profile event is created (kind 30078)
- Event is NIP-59 wrapped and sent to all contacts
- Send is skipped if content hash matches last sent profile
- User sees success message on successful update
- User sees error message if update/send fails
- Apply button is disabled during save operation

### FR8: Return to Chat View
- Cancel button returns to chat view without saving changes
- Apply button returns to chat view after successfully saving
- Escape key returns to chat view (same as Cancel)

**Acceptance Criteria:**
- Cancel returns to chat immediately, discards changes
- Apply saves, then returns to chat on success
- Apply stays on panel if save fails (shows error)
- Escape key behaves same as Cancel button

## Critical Constraints

### C1: Private Profile Sharing
- Profile updates MUST use existing private profile infrastructure
- Events MUST be NIP-59 wrapped before sending to contacts
- Profile content MUST conform to kind:0 structure (ProfileContent type)
- MUST use existing `updatePrivateProfile()` or equivalent service method
- MUST leverage existing idempotence checking (content hash comparison)

### C2: Data Integrity
- Label updates affect nostr_identities table only
- Profile field updates affect ProfileContent in nostr_profiles table
- Changes MUST be atomic (all-or-nothing per identity)
- No partial updates allowed

### C3: Consistency with Existing Patterns
- MUST use SubPanel component for main panel layout
- MUST follow theme selection panel pattern for sidebar content swapping
- MUST use existing IdentityList component or similar styling
- MUST follow app's color theming via useThemeColors hook
- MUST include data-testid attributes for e2e testing

### C4: No Public Profile Publishing
- This feature does NOT publish kind:0 public profile events
- All profile sharing is private (NIP-59 wrapped to contacts only)
- Public profile discovery is read-only and remains unchanged

### C5: Contact List Restoration
- When returning to chat view, contact list must be restored to sidebar
- No side effects on contact list state from identities panel
- Sidebar state transitions must be clean (no flicker)

## Integration Points

### I1: Menu System
- Hamburger menu in Header component (main.tsx lines 277-346)
- Add menu item between existing items with appropriate separator
- Hook up onClick handler to view state setter

### I2: View Routing
- AppView type union (main.tsx:1741)
- View state management (currentView state)
- Conditional rendering in main panel area (main.tsx:2231-2294)

### I3: Sidebar Content Swapping
- Sidebar component receives props to determine content mode
- Pattern: `isIdentitiesMode` similar to `isThemeMode` (main.tsx:1665-1691)
- When true, show identity list instead of contact list
- Identity list uses existing identity data from useNostlingState hook

### I4: Profile Service
- Use existing profile service methods from `profile-service-integration.ts`:
  - `updatePrivateProfile(identityId, content)` for saving profile
- Use existing profile types from `profile-types.ts`:
  - `ProfileContent` interface for field structure
  - `UpdatePrivateProfileRequest` and `UpdatePrivateProfileResult` types
- Profile sender automatically handles NIP-59 wrapping and send state tracking

### I5: Identity Data Access
- Read identities from `useNostlingState().identities`
- Each identity has `id`, `label`, `profileName`, `picture` fields
- Read profile for identity using IPC call or service method
- Update identity label via IPC call (updateIdentityLabel or similar)

### I6: IPC Calls
- `updateIdentityLabel(identityId, label)` - update label field
- `updatePrivateProfile(identityId, profileContent)` - update profile and send to contacts
- `getPrivateProfile(identityId)` - fetch current private_authored profile for identity
- Error handling for IPC failures with user-visible messages

## User Preferences

### UP1: Staging Pattern
- User prefers live preview with Cancel/Apply pattern (like theme selection)
- Familiar UX from theme panel reduces learning curve
- Clear separation between preview and commit actions

### UP2: Sidebar Layout
- User prefers sidebar for identity list (consistent with theme panel approach)
- Keeps main panel focused on editing details
- Leverages existing sidebar content-swapping pattern

### UP3: Full Field Support
- User wants all standard profile fields editable (not just core fields)
- Includes NIP-05 and Lightning address for comprehensive profile management
- Supports both social (name, about, picture) and utility (website, nip05, lud16) fields

### UP4: Label Distinction
- User wants separate internal label and public profile name
- Label is user-facing identifier in app UI ("Work", "Personal", etc.)
- Profile name is shared with contacts via private profile events

## Codebase Context

### Existing Sub-Panel Pattern
The app has a well-established pattern for sub-panels (relay config, about, theme selection):
1. Menu item in header triggers view state change
2. AppView state controls which panel is rendered
3. SubPanel component provides consistent header with title and action buttons
4. Sidebar content can be swapped based on view state (see theme panel)
5. Escape key returns to chat view

**Key Files:**
- `src/renderer/components/SubPanel.tsx` - reusable panel container
- `src/renderer/components/ThemeSelectionPanel/ThemeSelectionPanel.tsx` - advanced example with staging
- `src/renderer/main.tsx` - view routing and sidebar content swapping

### Profile Management Infrastructure
The app has complete private profile sharing infrastructure:
- Kind 30078 events for private profiles (never published unwrapped)
- NIP-59 gift wrapping for encryption
- Content hashing for idempotent sends
- Send state tracking per contact
- Integration with display name resolution

**Key Files:**
- `src/shared/profile-types.ts` - ProfileContent and related types
- `src/main/nostling/profile-event-builder.ts` - event creation and validation
- `src/main/nostling/profile-service-integration.ts` - updatePrivateProfile()
- `src/main/nostling/profile-sender.ts` - NIP-59 wrapping and batch sending

### Identity Data Model
Identities are stored in `nostr_identities` table with fields:
- `id` (UUID)
- `npub` (Nostr public key in bech32 format)
- `label` (user-friendly internal name)
- `secret_ref` (reference to secret storage)
- `relays` (JSON array of relay URLs)
- `theme` (optional theme ID)
- `created_at` (timestamp)

Profile data comes from `nostr_profiles` table with source `private_authored`.

### Similar Features
Theme selection panel provides excellent reference:
- Sidebar shows theme info + sliders (content swap pattern)
- Main panel shows theme carousel/preview
- Cancel/Apply buttons with staging
- Keyboard navigation (Escape to cancel)
- Disabled state while applying changes

## Out of Scope

### OS1: Public Profile Publishing
This feature does NOT create or publish public kind:0 profile events. Public profiles are discovered from relays (read-only) and displayed alongside private profiles, but this panel only edits private profiles sent to contacts.

### OS2: Profile Field Validation
No advanced validation beyond basic non-empty checks. URL validation, NIP-05 verification, and Lightning address validation are out of scope. Users are responsible for entering valid data.

### OS3: Image Upload
No image upload functionality. Users must provide image URLs. Future enhancement could add image hosting integration.

### OS4: Relay Configuration per Identity
No relay management in this panel. Relay configuration has its own dedicated panel and remains separate.

### OS5: Identity Creation/Deletion
This panel is for editing existing identities only. Identity creation and deletion remain in existing modals/workflows.

### OS6: Contact-Specific Profile Filtering
No ability to send different profiles to different contacts. All contacts of an identity receive the same profile update.

### OS7: Profile History/Versioning
No ability to view or rollback to previous profile versions. Only current profile is editable.

---

**Note**: This is a requirements specification, not an architecture design. The integration-architect will determine component structure, state management approach, form implementation details, and testing strategy during the architecture phase.
