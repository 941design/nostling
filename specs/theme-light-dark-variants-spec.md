# Theme Light/Dark Variants

## Problem Statement

Each of the 10 theme presets exists in a single mode (most are dark). Users in different lighting conditions or with different preferences have no way to switch between light and dark variants of their chosen color scheme. They must pick a completely different theme rather than simply toggling the brightness of their current one.

## Core Functionality

Extend each existing theme preset to provide both a light and a dark variant, with a toggle mechanism in the theme selector that allows users to switch between variants while keeping the same color identity.

## Functional Requirements

### Variant Definitions
- Each of the 10 existing themes provides both a light and a dark variant
- Light variants use bright backgrounds with dark text
- Dark variants use dark backgrounds with light text
- Both variants preserve the theme's distinctive color identity (e.g., Ocean stays blue in both modes)
- Both variants maintain WCAG AA contrast ratios (4.5:1 minimum)

### Variant Selection
- Theme selector shows a light/dark toggle or indicator alongside each theme
- Users can switch variant without changing the selected theme
- Variant preference persists per identity in the database
- Default variant matches the current single-mode behavior (no breaking change)

### Transition Behavior
- Smooth CSS transition when switching between light and dark variants
- Same instant-apply behavior as current theme switching
- No flash of unstyled content during variant switch

## Critical Constraints

- Backward compatible: existing theme selections continue to work without migration
- All 10 themes must have both variants before shipping (no partial rollout)
- Custom themes (if implemented) should also support optional light/dark variants
- WCAG AA compliance in all 20 variant combinations

## Integration Points

- Theme definitions (`src/renderer/themes/definitions.ts`) - extend each theme with variant tokens
- Theme context (`src/renderer/themes/ThemeContext.tsx`) - add variant state
- Theme selection panel (`src/renderer/components/ThemeSelectionPanel/`) - add variant toggle UI
- Database schema - store variant preference per identity (migration)
- Chakra UI v3 token system - all tokens must work in both modes

## Out of Scope

- System-level auto-detection (follow OS light/dark mode) - could be future enhancement
- Per-component variant overrides
- More than two variants per theme
- Scheduled variant switching (time-of-day based)
