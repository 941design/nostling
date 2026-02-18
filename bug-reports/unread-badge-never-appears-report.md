# Unread Badge Never Appears — Conversation Auto-Selects on Reload

**Severity**: High
**Component**: Renderer / Contact Selection State
**Discovered**: 2026-02-16 via dual-instance testing (T03)
**Reproducible**: 100%

## Summary

The unread message badge never appears because the application auto-selects the last active contact's conversation on page load/reload. When a contact is added and the page reloads, that contact's conversation is immediately opened. Any incoming messages are then automatically marked as read upon arrival, preventing the unread badge from ever displaying.

This is distinct from the "badge not clearing" issue (`unread-badge-not-clearing-report.md`). This bug prevents the badge from appearing in the first place.

## Reproduction Steps

1. Start fresh dual instances: `make dev-dual` (clean data dirs + relay)
2. Create Alice on Instance A, Bob on Instance B
3. Add mutual contacts (Bob on A, Alice on B)
4. On Instance B, after adding Alice as contact, reload the page
5. **Observe**: Alice's conversation is auto-selected (message input visible, conversation pane active)
6. From Instance A, send 3 messages to Bob
7. Wait 15 seconds
8. **Observe**: Messages arrive on Instance B and are immediately marked as read — no badge appears

**Expected**: Messages arriving for a non-active conversation should show an unread badge.
**Actual**: The conversation is always active (auto-selected), so messages are never "unread".

## Root Cause

Two compounding issues:

### 1. No "no conversation selected" state after reload

When the app reloads, it restores the previously selected contact from persisted state. If only one contact exists, it is always selected. There is no empty/neutral state where no conversation is open.

### 2. No mechanism to deselect a conversation

The UI provides no way to close or deselect a conversation once opened. Clicking elsewhere (headings, empty space) has no effect. This means once a contact is selected, it remains selected permanently.

### Combined effect

Since the conversation is always open, incoming messages are immediately processed by the "mark as read" logic that fires when messages arrive in the active conversation. The unread badge counter never increments because `isRead` is set to `true` on arrival.

## Impact

- Users with a single contact will **never** see unread badges
- Users with multiple contacts will only see badges for non-selected contacts
- The unread badge feature is effectively non-functional for the most common use case (1:1 messaging with a primary contact)

## Relevant Code

| File | Lines | Purpose |
|------|-------|---------|
| `src/renderer/main.tsx` | ~2414-2419 | `onSelectContact` — fires `markMessagesRead` |
| `src/renderer/nostling/state.ts` | ~474-514 | `markMessagesRead()` state management |
| `src/renderer/main.tsx` | ~807 | Contact selection persistence/restore |

## Suggested Fix

Option A (preferred): Don't auto-mark messages as read on arrival. Only mark as read when the user scrolls to them or when the conversation transitions from "not selected" to "selected". Messages arriving while a conversation is already open should be marked read, but messages arriving during app startup (before user interaction) should not.

Option B: Add a "no conversation selected" default state on startup. Don't auto-restore the last selected contact. Show a "Select a contact to start messaging" placeholder until the user explicitly clicks a contact.

Option C: Decouple badge state from read state. Track "last seen message timestamp" per contact separately from `isRead`, and show a badge when new messages arrive after the last user interaction with that conversation.
