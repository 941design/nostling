# Custom Theme Creation

## Problem Statement

Users are limited to 10 preset themes for identity customization. While the preset themes provide good variety, users who want a specific color scheme to match their personal brand or aesthetic preferences have no way to create, save, or manage custom themes.

## Core Functionality

A theme generator interface that allows users to create custom color themes using interactive controls (sliders, color pickers), preview changes in real-time, and save custom themes per identity alongside the existing presets.

## Functional Requirements

### Theme Generator UI
- Interactive controls for all theme color tokens (backgrounds, text, accents, buttons)
- Live preview showing the current identity's chat view with the custom theme applied
- Controls organized into logical groups matching the existing theme token structure:
  - Layout backgrounds (appBg, surfaceBg, surfaceBgSubtle, surfaceBgSelected, menuBg)
  - Component backgrounds (buttonPrimaryBg, buttonSecondaryBg, buttonDangerBg, inputBg, ownBubbleBg)
  - Text colors (primary, secondary, muted, link, accent)
  - Border and divider colors
- "Start from preset" option to base a custom theme on an existing preset
- Undo/revert to last saved state

### Theme Persistence
- Save custom themes to SQLite database per identity
- Custom themes appear in the theme selector alongside presets
- Edit existing custom themes
- Delete custom themes
- Custom theme name/label for identification

### Theme Selector Integration
- Custom themes listed after presets in the carousel/selector
- Visual indicator distinguishing custom from preset themes
- Same instant-apply behavior as preset themes

## Critical Constraints

- WCAG AA contrast ratios (4.5:1 minimum) should be validated or warned about during creation
- Theme tokens must be compatible with the existing Chakra UI v3 token system
- Custom themes must persist across app restarts
- Theme switching between custom and preset themes must be seamless

## Integration Points

- Existing theme system (`src/renderer/themes/`)
- Theme selection panel (`src/renderer/components/ThemeSelectionPanel/`)
- SQLite database (new table or extension of identities table)
- Per-identity theme preference storage

## Out of Scope

- Theme sharing between users/identities
- Theme import/export files
- Font customization (separate feature)
- Banner/background image customization (separate feature)
- CSS-level overrides or raw token editing
