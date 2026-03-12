---
epic: message-reactions
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Message Reactions

## Problem Statement

Users cannot react to messages with emoji. Reactions are a lightweight, expressive interaction pattern that reduces unnecessary reply messages ("thanks", "ok", "lol") and provides social feedback. Every major messaging platform (Signal, Slack, Discord, WhatsApp, Telegram, Element) supports emoji reactions. Their absence makes Nostling feel incomplete for conversational use.

## Core Functionality

Allow users to add emoji reactions to individual messages. Reactions are displayed inline below the message bubble. Reactions are transmitted to the conversation partner via NIP-25 reaction events wrapped in NIP-17/59 encryption.

## Functional Requirements

### FR-1: Adding a Reaction

- Hover over a message bubble reveals a reaction trigger (emoji icon or "+" button)
- Clicking the trigger opens a compact emoji picker (subset of the existing emoji set or full picker)
- Selecting an emoji adds the reaction to the message
- Double-clicking a message adds a default reaction (configurable, default: 👍)
- A user can add only one reaction per message (selecting a different emoji replaces the previous one)
- A user can remove their own reaction by clicking it again

### FR-2: Reaction Display

- Reactions appear as compact emoji badges below the message bubble
- Each unique emoji shows the emoji and a count of users who reacted with it
- Own reactions are visually highlighted (border or background accent)
- If only one participant reacted, show the emoji without a count
- Reaction badges are theme-aware

### FR-3: Nostr Event Structure

- Reactions are NIP-25 reaction events (kind:7)
- The reaction event references the original message via `e` tag
- The reaction content is the emoji character
- Reaction events are wrapped in NIP-17/59 gift wrap (privacy: relay cannot see who reacted to what)
- Removing a reaction sends a NIP-25 reaction with content "-" (deletion marker)

### FR-4: Incoming Reaction Handling

- When receiving a kind:7 reaction event inside a gift wrap:
  - Resolve the `e` tag to a local message
  - Store the reaction in the database
  - Update the message display to show the reaction
- If the referenced message is not found locally, silently discard the reaction (do not fetch from relay)
- Handle reaction removal ("-" content) by removing the stored reaction

### FR-5: Persistence

- Reactions stored in a dedicated database table: message_id, reactor_npub, emoji, event_id, timestamp
- Reactions loaded with message queries (batch query, not N+1)
- Reactions survive application restart

## Non-Functional Requirements

- Reaction events must be encrypted (inside NIP-17/59 gift wrap) — relay must not see reaction content or target
- Adding a reaction must feel instant (optimistic UI update, async relay publish)
- Reaction display must not degrade message list scroll performance

## Acceptance Criteria

- User can add an emoji reaction to any message
- Reaction appears immediately below the message
- Conversation partner sees the reaction after relay delivery
- Reactions survive app restart
- Removing a reaction works for both sender and receiver
- Reactions are encrypted inside the NIP-17/59 envelope
