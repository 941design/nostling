---
epic: typing-indicators
created: 2026-03-12T00:00:00Z
status: planned
priority: low
---

# Typing Indicators

## Problem Statement

Users cannot see when their conversation partner is actively composing a message. Typing indicators are a standard real-time messaging feature that improves conversational flow by signaling that a response is being prepared, reducing the "are they there?" uncertainty.

## Core Functionality

Display a visual indicator when the conversation partner is typing. Typing state is communicated via ephemeral NIP-17/59 encrypted events that are NOT persisted by relays or the local database.

## Functional Requirements

### FR-1: Sending Typing State

- When the user begins typing in the message input, send a "typing" indicator to the current conversation partner
- Typing indicator is an ephemeral event: kind:10007 (or suitable ephemeral kind) wrapped in NIP-17/59 gift wrap
- Debounced: send at most once every 3 seconds while typing continues
- Stop signal: when the user stops typing for 5 seconds, or clears the input, or navigates away from the conversation
- Typing events are ephemeral: relays should NOT persist them (set appropriate NIP-01 ephemeral kind range)

### FR-2: Receiving Typing State

- When a typing event is received from a whitelisted contact:
  - Display a typing indicator in the conversation (e.g., animated dots "..." below the last message)
  - Auto-dismiss the indicator after 6 seconds if no follow-up typing event is received
  - Dismiss immediately when a new message from the contact arrives
- Typing events from non-whitelisted contacts are silently discarded (whitelist enforced)

### FR-3: Privacy Controls

- Typing indicators can be disabled per identity (default: enabled)
- When disabled: the identity does not send typing events AND does not display received typing indicators
- This is a local-only setting (not communicated to the partner — avoidance of metadata about preferences)

### FR-4: Visual Display

- Typing indicator appears at the bottom of the message list (below the last message)
- Shows contact's avatar and animated dots ("...")
- Indicator is theme-aware and non-intrusive
- Does not shift conversation scroll position (appears in the input-adjacent area)

## Non-Functional Requirements

- Typing events must be encrypted (NIP-17/59) — relay must not learn who is typing to whom
- Typing event transmission must not noticeably impact message input responsiveness
- Typing events must NOT be stored in the database (truly ephemeral)
- Bandwidth overhead must be minimal (small event size, debounced sending)

## Acceptance Criteria

- User A typing shows indicator on User B's screen within 2 seconds
- Indicator auto-dismisses after User A stops typing
- Indicator dismissed immediately when a message from User A arrives
- Disabling typing indicators prevents both sending and display
- Typing events are encrypted and not persisted
- No typing indicator shown for non-whitelisted contacts
