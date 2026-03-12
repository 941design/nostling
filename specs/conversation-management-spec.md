---
epic: conversation-management
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Conversation Management

## Problem Statement

Nostling's conversation list is a flat, chronologically-sorted contact list with no organizational features. As users accumulate contacts, finding and managing conversations becomes increasingly difficult. Mainstream messaging apps provide pinning, muting, archiving, and shared media browsing — all absent in Nostling.

## Core Functionality

Conversation organization features that help users manage their contact list and access conversation-related information efficiently.

## Functional Requirements

### FR-1: Pin Conversations

- Right-click context menu or long-press on a contact shows "Pin conversation"
- Pinned conversations appear at the top of the contact list, above unpinned conversations
- Pinned conversations have a visual indicator (pin icon)
- Unpin via context menu
- Pin state persisted in database per identity+contact
- Maximum 5 pinned conversations per identity (prevent abuse of the feature)

### FR-2: Mute Conversations

- Right-click context menu: "Mute conversation" with sub-options: 1 hour, 8 hours, 1 day, 7 days, Forever
- Muted conversations suppress desktop notifications (if implemented)
- Muted conversations show a mute icon in the contact list
- Muted conversations still appear in the list and show unread badges
- Unmute via context menu
- Mute state and expiration persisted in database

### FR-3: Archive Conversations

- Right-click context menu: "Archive conversation"
- Archived conversations are hidden from the main contact list
- "Archived" section accessible from the contact list footer or hamburger menu
- New messages from an archived contact automatically unarchive the conversation
- Archive state persisted in database

### FR-4: Shared Media Gallery

- Accessible from conversation header or context menu: "Shared Media"
- Gallery view shows all media exchanged in the conversation (images, files, links)
- Organized by type: Images, Files, Links (tab navigation)
- Images displayed as a grid of thumbnails
- Files displayed as a list with name, size, date
- Links displayed as a list with URL and page title (if available from link previews)
- Clicking an item navigates to the message containing it in the conversation
- Media loaded from local database and image cache (offline-capable)

### FR-5: Conversation Info Panel

- Accessible from conversation header: click contact name or info icon
- Panel shows:
  - Contact profile summary (avatar, name, about)
  - Contact npub (with copy button)
  - Notification preference for this conversation
  - Shared media summary (counts: X images, Y files, Z links)
  - "View Full Profile" link (navigates to contacts panel)
  - "Block contact" / "Delete contact" actions
- Panel slides in from the right (standard three-panel messaging layout pattern)

### FR-6: Unread Jump

- If a conversation has unread messages, selecting it auto-scrolls to the first unread message
- A "Jump to unread" button appears when scrolled away from unread messages
- Unread message divider: a visual separator line with "X new messages" label between read and unread messages

## Non-Functional Requirements

- Pin, mute, and archive states must survive application restarts
- Context menu must be accessible via keyboard (menu key or Shift+F10)
- Shared media gallery must handle conversations with 1000+ media items without performance degradation (pagination or virtual scrolling)
- All features respect the per-identity contact scope (no cross-identity data)

## Acceptance Criteria

- Pinned conversations appear at the top of the contact list
- Muted conversations show mute icon and suppress notifications
- Archived conversations are hidden until new message arrives
- Shared media gallery displays all exchanged media organized by type
- Conversation info panel shows contact details and conversation metadata
- Unread jump navigates to first unread message in a conversation
- All states persist across application restarts
