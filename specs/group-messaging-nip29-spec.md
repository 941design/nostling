---
epic: group-messaging-nip29
created: 2026-03-12T00:00:00Z
status: planned
priority: high
---

# Group Messaging (NIP-29)

## Problem Statement

Nostling supports only 1:1 direct messages. Group communication — the most requested missing feature across competing Nostr messaging clients — is absent. Without group messaging, Nostling cannot serve teams, friend groups, communities, or any multi-party communication scenario.

The Nostr ecosystem offers several group messaging standards. NIP-29 (relay-enforced groups) is the most pragmatically implementable, with working server implementations and client support in 0xchat and chachi.chat. NIP-EE (MLS-based end-to-end encrypted groups) is the long-term ideal but is not yet merged into the official NIPs and has limited client support.

This spec covers NIP-29 as the first group messaging implementation, with an architecture that allows future NIP-EE/MLS overlay.

## Core Functionality

Join and participate in relay-enforced group conversations. The relay manages group membership, permissions, and message ordering. Messages within groups are visible to all members but NOT end-to-end encrypted (the relay can read them). End-to-end encrypted groups via NIP-EE are planned as a separate, follow-up epic.

## Terminology

- **Group**: A NIP-29 relay-enforced chat group identified by a group ID on a specific relay
- **Group relay**: A Nostr relay that implements NIP-29 group management
- **Group admin**: A member with permissions to manage the group (invite, remove, set metadata)
- **Group member**: A pubkey authorized to post in the group

## Functional Requirements

### FR-1: Group Discovery and Joining

- Join a group by entering a group ID + relay URL (manual entry)
- Join a group via an invite link (naddr or custom URI format)
- Display available public groups on a relay (if the relay supports group listing)
- Request to join private groups (requires admin approval)
- Groups scoped per identity (each identity has its own group memberships)

### FR-2: Group UI

- Groups appear in the sidebar alongside DM contacts
- Visual distinction between groups and DM contacts (group icon badge, member count)
- Selecting a group opens the group conversation in the main pane
- Group conversation shows messages from all members with sender identification (avatar, display name)
- Message composition uses the same input as DMs (text, emoji, future: media)

### FR-3: Group Message Display

- Messages displayed chronologically with sender identification
- Each message shows: sender avatar, sender display name, timestamp, message content
- Own messages right-aligned (same as DM outgoing), others left-aligned
- System messages for group events: member joined, member left, metadata changed

### FR-4: Group Management

- Group metadata display: name, about, picture, member count
- Member list view (accessible from group header)
- Admin actions (if the identity has admin role): invite member, remove member, edit group metadata
- Leave group action (accessible from group context menu or settings)

### FR-5: Group Creation

- Create a new group on a specified NIP-29-capable relay
- Set group name, description, picture
- Set initial privacy (public/private)
- Invite initial members by npub

### FR-6: Event Handling

**Outgoing:**
- Group messages published as kind:9 events (NIP-29 group chat message)
- Events tagged with `h` (group ID) and sent to the group relay

**Incoming:**
- Subscribe to kind:9 events from joined groups on their respective relays
- Subscribe to group metadata events (kind:39000-39009) for group info updates
- Subscribe to admin events (kind:9000-9009) for membership changes

### FR-7: Persistence

- Group memberships stored in database per identity
- Group messages stored locally (same pattern as DM messages)
- Group metadata cached locally
- Member profiles resolved via existing profile discovery/caching system

## Non-Functional Requirements

- Group messages are NOT end-to-end encrypted in this implementation (relay can read them)
- This limitation must be clearly communicated in the UI (e.g., a shield icon indicating "relay-visible" alongside group names)
- Architecture must not preclude future NIP-EE/MLS encrypted group overlay
- Group subscription management must not degrade DM relay performance (separate subscription lifecycle)

## Acceptance Criteria

- User can join an existing NIP-29 group and see messages
- User can send messages to a group visible to all members
- Group appears in sidebar with visual distinction from DM contacts
- Group member list is viewable
- Admin can invite/remove members (if identity has admin role)
- User can create a new group on a NIP-29 relay
- User can leave a group
- UI clearly indicates that group messages are not end-to-end encrypted
- Group messages persist across application restarts

## Future: NIP-EE/MLS Encrypted Groups

This spec explicitly defers end-to-end encrypted group messaging to a follow-up epic. When NIP-EE stabilizes and merges into the official NIPs, a separate spec will cover:
- MLS key management (tree-based group key agreement)
- Forward secrecy and post-compromise security for group messages
- Encrypted group message storage
- Key rotation on member add/remove
