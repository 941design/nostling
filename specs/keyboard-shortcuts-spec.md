---
epic: keyboard-shortcuts
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Keyboard Shortcuts and Global Search

## Problem Statement

Nostling has minimal keyboard navigation beyond basic tab/arrow key support and the emoji picker's WCAG compliance. Power users — the primary audience for a desktop privacy messaging app — expect keyboard-driven workflows for efficient navigation. Cmd+K (or Ctrl+K) fuzzy search is now standard in desktop applications (Slack, Discord, VS Code, Spotlight, Raycast). Its absence forces mouse-driven navigation for every conversation switch, identity change, or panel access.

## Core Functionality

A comprehensive keyboard shortcut system with a command palette (Cmd+K / Ctrl+K) for fuzzy search across conversations, contacts, identities, and actions. All primary navigation actions accessible via keyboard without mouse interaction.

## Functional Requirements

### FR-1: Command Palette (Cmd+K / Ctrl+K)

- Global keyboard shortcut opens a search/command overlay
- Fuzzy search across: contact names, identity labels, recent messages, menu actions
- Results categorized: Conversations, Identities, Actions
- Enter selects the top result; arrow keys navigate results
- Escape closes the palette
- Results update in real-time as the user types (debounced 100ms)

**Action commands (prefixed with ">"):**
- `> New Identity` — opens identity creation
- `> Add Contact` — opens contact addition modal
- `> Relay Config` — opens relay manager
- `> Theme` — opens theme selection
- `> Edit Profile` — opens profile editor

### FR-2: Navigation Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl+K | Open command palette |
| Cmd/Ctrl+F | Focus message search |
| Cmd/Ctrl+N | New conversation (add contact) |
| Cmd/Ctrl+, | Open settings/configuration |
| Cmd/Ctrl+1-9 | Switch to conversation by position |
| Cmd/Ctrl+[ | Previous conversation |
| Cmd/Ctrl+] | Next conversation |
| Cmd/Ctrl+Shift+E | Toggle emoji picker |
| Escape | Close current panel/modal, or deselect |
| Up (in empty input) | Edit last sent message (future) |

### FR-3: Conversation Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Send message |
| Shift+Enter | New line in message |
| Cmd/Ctrl+Shift+U | Jump to first unread message |
| Cmd/Ctrl+Up | Scroll to top of conversation |
| Cmd/Ctrl+Down | Scroll to bottom of conversation |

### FR-4: Shortcut Discovery

- Keyboard shortcut reference accessible via Help menu or Cmd/Ctrl+/
- Shows all available shortcuts organized by category
- Shortcuts shown in context (e.g., tooltip on buttons shows the keyboard shortcut)

### FR-5: Customization (Future)

- Architecture should support user-defined shortcut overrides
- No customization UI in this phase — but the mapping should be data-driven (not hardcoded) for future extensibility

## Non-Functional Requirements

- Shortcuts must not conflict with OS-level shortcuts (macOS Cmd shortcuts, Linux Ctrl shortcuts)
- Platform-appropriate modifier key: Cmd on macOS, Ctrl on Linux
- Command palette search must be fast (< 50ms for 1000 items)
- Shortcuts must not interfere with text input in message composition or form fields

## Acceptance Criteria

- Cmd/Ctrl+K opens the command palette from any view
- Typing in the palette fuzzy-matches conversations, contacts, and actions
- Enter navigates to the selected result
- All documented shortcuts work as specified
- Shortcuts reference is accessible and accurate
- No shortcut conflicts with OS-level shortcuts on macOS or Linux
