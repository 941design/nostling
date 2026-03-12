---
epic: desktop-notifications
created: 2026-03-12T00:00:00Z
status: planned
priority: high
---

# Desktop Notifications

## Problem Statement

Nostling has no mechanism to alert users of new messages when the application is in the background or minimized. Users must actively check the application to see if new messages have arrived. This makes the application unusable as a primary messaging tool — every competing messenger (Signal, Session, SimpleX, Element, 0xchat) provides background notifications.

## Core Functionality

Display OS-native desktop notifications when new messages arrive while the application window is not focused. Notifications respect privacy by not exposing message content by default. Per-identity notification preferences allow users to control which identities trigger notifications.

## Functional Requirements

### FR-1: Notification Trigger

A desktop notification is displayed when ALL of the following conditions are met:
- A new message is received and decrypted successfully
- The sender is in the active identity's contact whitelist
- The application window is not focused (background/minimized)
- The conversation with the sender is not currently visible
- Notifications are enabled for the receiving identity

### FR-2: Notification Content

**Privacy-preserving defaults:**
- Title: sender's display name (using existing display name precedence: alias > private profile > public profile > npub)
- Body: "New message" (no message content)

**Optional content preview (configurable per identity):**
- When enabled: body shows first 100 characters of the message plaintext
- When disabled (default): body shows "New message"

### FR-3: Notification Interaction

- Clicking the notification brings the application to the foreground
- The conversation with the sender is automatically selected and scrolled to the new message
- The notification is dismissed after being clicked
- Notifications auto-dismiss after a configurable timeout (default: 10 seconds)

### FR-4: Per-Identity Configuration

Each identity can independently configure:
- Notifications enabled/disabled (default: enabled)
- Content preview enabled/disabled (default: disabled)
- Sound enabled/disabled (default: enabled, using system default notification sound)

Configuration persisted in the database as part of identity settings.

### FR-5: Do Not Disturb Respect

- Respect the operating system's Do Not Disturb / Focus mode
- On macOS: defer to the system notification center settings
- On Linux: respect the notification daemon's DND state if available

### FR-6: Notification Badges

- Display unread count badge on the application dock icon (macOS) or taskbar (Linux where supported)
- Badge count reflects total unread messages across all identities
- Badge clears when all conversations are marked as read

### FR-7: Mute Per Conversation

- Individual conversations can be muted (no notifications regardless of identity setting)
- Muted conversations still show unread badges in the contact list
- Mute state persisted in database per contact

## Non-Functional Requirements

- Notifications must not reveal message content to someone glancing at the screen (privacy default)
- Notification display latency must be under 500ms from message decryption
- Notification system must not interfere with application performance (async, non-blocking)
- Must function correctly on macOS 12+ and mainstream Linux distributions (GNOME, KDE)

## Acceptance Criteria

- New message while app is background triggers OS notification
- Clicking notification navigates to correct conversation
- No notification when app window is focused on the sender's conversation
- Privacy mode (default) shows sender name but not message content
- Muted conversations produce no notifications
- System DND mode suppresses notifications
- Per-identity enable/disable works independently
