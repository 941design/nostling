# Ostrich-Themed Status Messages - Requirements Specification

## Problem Statement

Nostling currently displays straightforward, technical status messages (e.g., "Checking for updates...", "Downloading update...", "3 queued (offline)"). While functional, these messages don't reflect the playful, ostrich-themed personality of the application. The user wants to replace these standard messages with creative, ostrich-themed alternatives that make the app more delightful and memorable.

## Core Functionality

Replace all user-facing status messages with ostrich-themed alternatives. When a status changes, the system should randomly select from a pool of themed message options for that status type, creating variety and surprise.

## Functional Requirements

### FR-1: Themed Message Configuration
- **Requirement**: Create a JSON configuration file mapping status types to arrays of ostrich-themed message alternatives
- **Acceptance Criteria**:
  - File contains mappings for all UpdatePhase values ('idle', 'checking', 'available', 'downloading', 'downloaded', 'verifying', 'ready', 'mounting', 'mounted', 'failed')
  - File contains mappings for all Nostling message statuses ('queued', 'sending', 'sent', 'error')
  - File contains mappings for Nostling queue summary states ('synced', 'idle', 'offline')
  - Each status type maps to an array of 1-N themed alternatives
  - JSON structure is type-safe and validated

### FR-2: Update Status Message Theming
- **Requirement**: Transform existing update status messages in `src/renderer/utils.ts::getStatusText()` to use themed alternatives
- **Acceptance Criteria**:
  - All update phases display ostrich-themed messages
  - Messages maintain any dynamic content (version numbers, download progress, error details)
  - Each status change randomly selects from available alternatives
  - Function signature remains compatible with existing callers

### FR-3: Nostling Queue Status Message Theming
- **Requirement**: Transform Nostling queue status messages in `src/renderer/nostling/state.ts` to use themed alternatives
- **Acceptance Criteria**:
  - Queue summary text ("X queued (offline)", "X sending", "Nostling synced", etc.) uses themed messages
  - Message counts and dynamic data are preserved in themed messages
  - Each status computation randomly selects from alternatives

### FR-4: Random Selection Mechanism
- **Requirement**: Implement a utility function that randomly selects a message from an array of alternatives
- **Acceptance Criteria**:
  - Function takes a status type and returns a randomly selected themed message
  - Selection is truly random on each invocation (not cached per session)
  - Works consistently across both update and Nostling statuses

### FR-5: Themed Message Design for Nostling Statuses
- **Requirement**: Create ostrich-themed alternatives for Nostling-specific statuses not covered in the original themed-messages.md
- **Acceptance Criteria**:
  - 'queued' status has 2-3 ostrich-themed alternatives
  - 'sending' status has 2-3 ostrich-themed alternatives
  - 'sent' status has 2-3 ostrich-themed alternatives
  - 'error' status has 2-3 ostrich-themed alternatives
  - 'synced' status has 2-3 ostrich-themed alternatives
  - Themes are creative, fun, and consistent with the ostrich personality
  - All alternatives fit naturally with existing message templates (e.g., "X [themed-status]")

## Critical Constraints

### C-1: Dynamic Content Preservation
- Update status messages include dynamic content (version numbers, download percentages, byte counts, speeds)
- Themed messages MUST preserve this dynamic content in appropriate places
- Example: "Downloading update: 45% (125.5 MB / 280.2 MB) @ 5.2 MB/s" → "Pecking up: 45% (125.5 MB / 280.2 MB) @ 5.2 MB/s"

### C-2: Backward Compatibility
- Existing function signatures and return types must remain unchanged
- No breaking changes to `getStatusText(updateState)` or `useNostlingState()` hook API
- Tests in `src/renderer/footer.test.ts` should continue to pass with themed messages

### C-3: Type Safety
- All themed message configurations must be type-safe
- TypeScript should catch invalid status types or missing mappings at compile time
- Configuration loading should validate the JSON structure

### C-4: No User Configuration
- Users do NOT need a toggle to switch between standard and themed messages
- Themed messages are always active (this is a personality feature, not a preference)
- No addition to AppConfig interface required

## Integration Points

### I-1: Update Status Rendering
- **File**: `src/renderer/utils.ts`
- **Function**: `getStatusText(updateState: UpdateState): string`
- **Integration**: Replace switch statement logic with themed message lookup + random selection

### I-2: Nostling Status Derivation
- **File**: `src/renderer/nostling/state.ts`
- **Hook**: `useNostlingState()`
- **Variable**: `nostlingStatusText` (computed via useMemo)
- **Integration**: Replace hardcoded status strings with themed message lookup

### I-3: Configuration Loading
- **Pattern**: Similar to `src/main/config.ts` for loading/validating JSON
- **New Module**: Create utility to load and validate themed messages configuration
- **Usage**: Both update and Nostling status renderers import and use this module

## User Preferences

- **Random every time**: Each status change should pick a fresh random alternative
- **All statuses themed**: Both update statuses AND Nostling queue statuses get themed messages
- **JSON storage**: Configuration stored in a JSON file (type-safe, versioned with codebase)
- **Always active**: No toggle needed; themed messages are always shown

## Codebase Context

### Existing Patterns

1. **Status Message Generation** (`src/renderer/utils.ts:10-48`):
   - `getStatusText()` uses a switch statement on UpdatePhase
   - Returns string with interpolated dynamic content
   - Called by Footer component to display status

2. **Nostling Status Computation** (`src/renderer/nostling/state.ts:379-386`):
   - `nostlingStatusText` uses useMemo with conditional logic
   - Derives text from `queueSummary` metrics
   - Priority: errors > sending > queued > synced > idle

3. **Configuration Loading** (`src/main/config.ts:15-28`):
   - `loadConfig()` reads JSON, validates with `normalizeConfig()`
   - Gracefully handles missing files or invalid data
   - Similar pattern can be used for themed messages

4. **Type Safety** (`src/shared/types.ts:33-43`):
   - UpdatePhase is a union type ensuring compile-time correctness
   - Similar types exist for NostlingMessageStatus

### Similar Features

- **Badge color mapping** (`src/renderer/main.tsx:879-904`): Uses object literal to map status → color
- **Status text derivation**: Priority-based conditional logic with dynamic interpolation
- **Config validation**: Normalizing enums with fallback to defaults

## Out of Scope

### Explicitly NOT Included

- **User preferences/toggles**: No UI or config option to disable themed messages
- **Localization/i18n**: Themed messages are English-only for now
- **Message queue status badges**: Only text changes; badge colors remain unchanged
- **Advanced templating**: Simple string substitution; no complex template engine
- **Animation/transitions**: No special effects when messages change
- **Persistent message selection**: Don't cache which random alternatives were chosen
- **Extensibility for custom themes**: Only ostrich theme supported

---

**Note**: This specification focuses on WHAT needs to be built, not HOW. The integration-architect agent will determine the best implementation approach during Phase 2, including:
- Exact JSON schema structure
- TypeScript type definitions for the config
- Utility function architecture
- Testing strategy
- File organization
