# Theme System - Requirements Specification

## Problem Statement

Nostling currently has a hardcoded dark theme defined inline in the main React component (main.tsx lines 80-101). Users cannot customize the visual appearance of the application, and there's no visual distinction between different identities. This limits personalization and makes it harder to distinguish between multiple identity contexts (e.g., work vs personal).

## Core Functionality

Implement a comprehensive theme system that allows users to select from 10 predefined color themes on a per-identity basis. When an identity is selected, the entire UI should apply that identity's chosen theme. The system should support future extensibility for custom themes.

## Functional Requirements

### FR1: Theme Palette
- **10 predefined themes** total:
  - 1 light theme
  - 1 dark theme (current default)
  - 8 friendly/themed color schemes combining:
    - Vibrant/bold colors (purple, teal, orange)
    - Nature-inspired colors (forest green, ocean blue, sunset, etc.)
- Each theme must define a complete Chakra UI color token set compatible with the existing `defineConfig()` structure
- Themes must provide sufficient contrast for accessibility (text readability)
- Each theme should have a distinctive name (e.g., "Sunset", "Ocean", "Forest", "Purple Haze")

### FR2: Per-Identity Theme Scoping
- Each identity has its own theme selection
- When user switches between identities, the UI theme updates to match the selected identity's theme
- Theme preference persists per identity in the database
- New identities prompt user to select a theme during creation (in the Create Identity modal)

### FR3: Theme Selection UI
- **Location**: Hamburger menu (existing menu in header)
- **Presentation**: Flat list of all 10 themes with visual color indicators (swatches/badges)
- **Behavior**: Immediate application (no save button - theme applies on selection)
- Menu structure should be:
  - Existing menu items (Relay Configuration, Help)
  - Separator
  - "Theme" submenu/section with:
    - Light theme option with indicator
    - Dark theme option with indicator
    - 8 themed options with indicators

### FR4: Identity Creation Integration
- Extend Create Identity modal to include theme selection
- Default to current dark theme if user doesn't select one
- Theme selection should be intuitive and visually clear (color swatches/preview)
- Theme selection is optional during creation (can be changed later via hamburger menu)

### FR5: Theme Application
- When theme is selected, entire UI must update immediately:
  - All Chakra UI components (Box, Text, Button, Badge, etc.)
  - Header, Footer, Sidebar backgrounds and borders
  - Modal dialogs and overlays
  - Status badges and indicators
  - All text colors for proper contrast
- No page reload required - React state update triggers re-render
- Smooth transition (no flash of unstyled content)

### FR6: Theme Persistence
- Theme selection stored in identity record (new `theme` field)
- Persists across app restarts
- Survives identity switching
- Default theme (current dark theme) applies if no theme is set

### FR7: Extensibility
- Theme system architecture must support future custom themes
- Theme definitions should be centralized and easy to extend
- Consider structure that allows:
  - Adding new themes without modifying existing code
  - Future user-defined custom themes
  - Theme import/export (future consideration)

## Critical Constraints

### Technical Constraints
- **Must use Chakra UI v3** token system (`defineConfig()` with theme.tokens.colors)
- **Must not break existing UI** - all current components must work with all themes
- **Must integrate with existing identity system** - no changes to identity creation/deletion logic
- **Performance**: Theme switching must be instant (< 100ms perceived delay)
- **Database**: Add `theme` field to `nostr_identities` table

### UX Constraints
- Theme selection must be accessible within 2 clicks from any screen
- Theme preview must be clear enough to distinguish themes at a glance
- Current theme must be visually indicated in the menu (checkmark, highlight, etc.)
- Must not disrupt existing workflows (identity creation, relay config, messaging)

### Accessibility Constraints
- All themes must meet WCAG AA contrast ratios for text (4.5:1 for normal text, 3:1 for large text)
- Color should not be the only indicator of state (use icons/text labels as well)
- Theme names should be descriptive and accessible to screen readers

## Integration Points

### Database Schema
- **Table**: `nostr_identities`
- **New Field**: `theme` (TEXT, nullable, default: 'dark')
- **Migration**: Add column via Knex migration, existing identities default to 'dark'

### Existing Code
- **main.tsx (lines 80-101)**: Replace inline theme config with dynamic theme selection based on identity
- **IdentityModal component**: Add theme selection UI to creation flow
- **Header component**: Extend hamburger menu with theme submenu
- **useNostlingState hook**: May need to expose current identity's theme for reactivity
- **Database state.ts**: Consider whether to use app_state table or identity record for persistence

### IPC/API
- Theme changes may require IPC call to persist theme selection to database
- Or use existing identity update mechanism if theme stored in identity record
- Real-time theme updates when identity switches

## User Preferences

### Architectural Preferences
- **Theme storage**: Store theme in identity record (not separate app_state table) for atomic identity data
- **Theme definitions**: Centralized theme registry/map for easy extension
- **Menu implementation**: Use Chakra UI Menu with nested submenus for theme selection

### Implementation Philosophy
- Keep theme definitions declarative and data-driven
- Minimize duplication - define each theme once
- Leverage Chakra UI's existing theming capabilities
- Ensure type safety for theme names/IDs

## Codebase Context

### Current Theme Implementation
- **File**: `src/renderer/main.tsx` (lines 80-101)
- **Structure**:
  ```typescript
  const config = defineConfig({
    theme: {
      tokens: {
        colors: {
          brand: { 50-900 scale }
        }
      }
    }
  });
  const system = createSystem(defaultConfig, config);
  ```
- **Usage**: `ChakraProvider value={system}` wraps entire app

### Similar Patterns
- **Per-identity relay configs**: Already implemented in `RelayConfigManager` with per-identity file storage
  - Shows pattern for identity-scoped settings
  - Demonstrates conflict handling and persistence
- **State persistence**: `window.api.state.get/set` available for key-value storage
  - Could be used for theme preference if not stored in identity record

### Existing Identity System
- **Database**: SQLite via `nostr_identities` table
- **Fields**: `id`, `npub`, `secret_ref`, `label`, `relays`, `created_at`
- **Creation**: `NostlingService.createIdentity()` in `src/main/nostling/service.ts`
- **UI**: `IdentityModal` component in `main.tsx` (lines 892-960)

### UI Components Affected
All components using color props:
- Header (line 240-308): `bg`, `borderColor`, `color`
- Footer (line 329-409): `bg`, `borderColor`, `color`
- Sidebar (line 1148-1197): `bg`, `borderColor`
- IdentityList, ContactList, MessageBubble, etc.: All use Chakra color tokens
- Modal dialogs: Dialog components with bg/border colors

## Out of Scope

- **Custom theme creation by users**: Architecture supports it, but UI for creating custom themes is out of scope
- **Theme sharing/export**: No import/export functionality for themes
- **Animated theme transitions**: Immediate switch only, no fade animations
- **Per-contact themes**: Only per-identity, not per-contact or per-conversation
- **System theme detection**: No automatic light/dark mode based on OS settings
- **Theme editor**: No UI for editing theme color values
- **Preview mode**: No preview-before-apply functionality (immediate apply only)

---

**Note**: This is a requirements specification, not an architecture design. Implementation details such as:
- Exact color values for each theme
- Component-level implementation approach
- State management strategy for theme reactivity
- Database migration specifics

...will be determined by the integration-architect during Phase 2 of the `/feature-execute` workflow.
