---
epic: disappearing-messages
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Disappearing Messages

## Problem Statement

All messages in Nostling persist indefinitely in the local SQLite database. Users have no mechanism to automatically delete messages after a set period. For privacy-sensitive communications, the ability to set auto-deletion timers reduces the risk of historical messages being compromised if a device is lost, seized, or accessed by an unauthorized party.

Signal, Session, and WhatsApp all offer disappearing messages as a core privacy feature. Its absence in Nostling undermines the privacy-first positioning.

## Core Functionality

Per-conversation configurable timers that automatically delete messages from the local database after a specified duration. Disappearing message settings are communicated to the conversation partner via encrypted control messages. Both parties must respect the timer for it to be effective — this is cooperative, not enforceable.

## Functional Requirements

### FR-1: Timer Configuration

- Per-conversation setting accessible from conversation header or context menu
- Available timer options: Off (default), 5 minutes, 1 hour, 1 day, 7 days, 30 days
- Setting change takes effect for new messages only (existing messages retain their original timer or lack thereof)
- Timer setting communicated to conversation partner via an encrypted control message

### FR-2: Timer Behavior

- Timer starts when the message is displayed/read on the recipient's device (not when sent)
- For outgoing messages: timer starts when the message is sent (or when read receipt is received, if read receipts are implemented)
- When the timer expires, the message is deleted from the local database
- Deleted messages are replaced with a "Message expired" placeholder in the conversation (preserving conversation flow)
- Attachments (media, files) associated with expired messages are also deleted from local storage and image cache

### FR-3: Visual Indicators

- Conversations with an active disappearing timer show a timer icon in the conversation header
- Individual messages subject to a timer show a subtle countdown or timer icon
- Setting changes produce a system message in the conversation: "[Identity] set disappearing messages to [duration]"
- Expired message placeholders are visually distinct (dimmed, italic, no content)

### FR-4: Control Message Protocol

- Timer setting changes communicated as a NIP-17/59 encrypted control message (not a regular chat message)
- Control message includes: timer duration, effective timestamp
- Receiving client stores the timer preference for the conversation
- If the receiving client does not support disappearing messages, the control message is silently ignored (graceful degradation)

### FR-5: Deletion Execution

- A background process checks for expired messages periodically (e.g., every 60 seconds)
- Deletion is a hard delete from the database (not soft delete) — no recovery possible
- Deletion includes: message row, associated media attachments, image cache entries
- Database VACUUM is NOT triggered on each deletion (batched or deferred to avoid performance impact)

### FR-6: Limitations Disclosure

- UI must clearly communicate that disappearing messages are cooperative: "This deletes messages from your device. Your contact's device may retain copies."
- Disappearing messages do not delete from relays (relay retention is outside Nostling's control)
- Screenshots, copy-paste, and external tools can capture message content before expiration

## Non-Functional Requirements

- Timer enforcement must work even when the application has been closed and reopened (check expired messages on startup)
- Deletion must not block UI operations (async background process)
- Database integrity maintained after deletions (foreign key relationships, index consistency)

## Acceptance Criteria

- User can set a disappearing timer per conversation
- New messages in a timed conversation expire and are deleted after the set duration
- Expired messages show "Message expired" placeholder
- Timer setting communicated to conversation partner via encrypted message
- Application startup catches up on expired messages that should have been deleted while closed
- Existing messages are not affected by a newly set timer (only new messages)
- Disabling the timer stops future auto-deletion; already-timed messages still expire on schedule
