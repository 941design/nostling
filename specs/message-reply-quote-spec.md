---
epic: message-reply-quote
created: 2026-03-12T00:00:00Z
status: planned
priority: high
---

# Message Reply and Quote

## Problem Statement

Users cannot reply to or quote specific messages in a conversation. Without this capability, multi-topic conversations become confusing — there is no way to indicate which message a response refers to. Reply/quote is a baseline expectation in every modern messaging application (Signal, WhatsApp, Telegram, Slack, Discord, Element).

## Core Functionality

Allow users to select a specific message and compose a reply that references it. The referenced message is displayed as a compact quote above the reply in the conversation view. The reply relationship is preserved in the Nostr event structure for protocol-level interoperability.

## Functional Requirements

### FR-1: Reply Trigger

- Right-click or long-press on a message bubble shows a context menu with "Reply" option
- Alternatively, a reply icon button appears on hover over a message bubble
- Selecting "Reply" activates reply mode in the message input area

### FR-2: Reply Compose UI

- When reply mode is active, a compact preview of the referenced message appears above the text input
- Preview shows: sender name, truncated message text (first 100 characters), and a close (X) button
- Close button cancels reply mode and returns to normal composition
- Text input retains focus for immediate typing
- Escape key cancels reply mode
- Sending the message includes the reply reference; reply mode deactivates after send

### FR-3: Reply Display in Conversation

- Messages that are replies display a compact quote block above the message content
- Quote block shows: sender name and truncated text of the referenced message
- Quote block is visually distinct (indented, different background, vertical accent bar)
- Clicking the quote block scrolls to and briefly highlights the original message in the conversation
- If the original message is not available (deleted or not loaded), show "Original message unavailable"

### FR-4: Nostr Event Structure

Replies use NIP-10 threading conventions adapted for NIP-17/59 DMs:

- The reply event includes an `e` tag referencing the original message's event ID
- Tag marker: `["e", "<event-id>", "<relay-url>", "reply"]`
- The `e` tag is placed inside the encrypted kind:14 rumor (not in the outer gift wrap), preserving metadata privacy
- For interoperability: clients that don't understand the reply tag simply display the message without the quote — graceful degradation

### FR-5: Database Storage

- Store the reply reference (parent event ID) in the `nostr_messages` table
- Store a cached snapshot of the parent message content for display (avoids lookup on every render)
- The cached snapshot includes: sender npub, first 200 characters of content, timestamp

### FR-6: Incoming Reply Handling

- When receiving a message with an `e` reply tag, resolve the referenced event ID against local message history
- If found: display the reply with the quote block
- If not found: display the message normally with a "Reply to unknown message" indicator
- Never fetch the referenced message from relays (privacy: do not reveal which messages you have)

## Non-Functional Requirements

- Reply references must be inside the encrypted envelope (no metadata leakage)
- Reply display must not degrade conversation scroll performance
- Quote block rendering must handle edge cases: very long messages, messages with media, messages from deleted contacts

## Acceptance Criteria

- User can reply to any message in a conversation
- Reply appears with a visible quote of the original message
- Clicking the quote scrolls to the original message
- Reply reference is encrypted inside the NIP-17/59 envelope
- Incoming replies from other NIP-17 clients display correctly
- Replying to a reply works (nested quotes show only the immediate parent)
