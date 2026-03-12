---
epic: web-of-trust
created: 2026-03-12T00:00:00Z
status: planned
priority: medium
---

# Web-of-Trust Integration

## Problem Statement

Nostling's whitelist-based contact management is a strong privacy boundary: only messages from explicitly added contacts are accepted. However, this creates a cold-start problem — users must manually add every contact by npub or QR code before any communication is possible.

The Nostr ecosystem is converging on Web-of-Trust (WoT) patterns — PageRank-style trust graph filtering where trust flows transitively through the follow/contact graph. Integrating WoT with Nostling's whitelist model creates a layered trust system: explicit whitelist (full trust), WoT-recommended (qualified trust), and unknown (blocked by default).

## Core Functionality

Augment the existing whitelist-based contact system with a Web-of-Trust layer that surfaces "trusted strangers" — pubkeys that are followed by your existing contacts but not yet in your whitelist. This enables contact discovery without abandoning the privacy guarantees of the whitelist model.

## Functional Requirements

### FR-1: Trust Graph Construction

- Build a local trust graph from the active identity's contacts' follow lists (NIP-02, kind:3 events)
- Query configured relays for kind:3 events from whitelisted contacts
- Extract followed pubkeys from each contact's follow list
- Compute trust scores: pubkeys followed by multiple of your contacts rank higher
- Trust graph refreshed periodically (e.g., every 6 hours) and on identity switch

### FR-2: Contact Suggestions

- "Suggested contacts" section in the contact management UI
- Shows pubkeys that appear in multiple contacts' follow lists, ranked by trust score
- Each suggestion displays: display name (if discoverable), trust score indicator (e.g., "followed by 3 of your contacts"), and the names of contacts who follow them
- "Add" button to add the suggested pubkey to the whitelist
- "Dismiss" button to hide the suggestion (persisted, not shown again)

### FR-3: Message Request Queue (Optional Enhancement)

- Messages from non-whitelisted but WoT-trusted pubkeys are not silently discarded
- Instead, they enter a "Message Requests" queue visible in the UI
- Message request shows: sender display name, trust score, message preview (first line)
- User can: Accept (adds to whitelist, delivers message), Decline (discards message, blocks sender), or Ignore (keeps in queue)
- This is opt-in per identity (default: disabled, maintaining current whitelist-only behavior)

### FR-4: Trust Score Computation

- Score based on number of your direct contacts who follow the pubkey
- Score = count of your contacts whose kind:3 follow list includes the pubkey
- Minimum threshold to appear as suggestion: followed by at least 2 of your contacts
- No recursive trust (only first-degree follows of your contacts, not follows-of-follows)
- Score decays if contacts unfollow (on next trust graph refresh)

### FR-5: Privacy Constraints

- Trust graph computation happens entirely locally (no data sent to external services)
- Kind:3 events are public by Nostr protocol — querying them does not leak additional metadata
- Nostling does NOT publish its own kind:3 follow list (preserving the private-contact model)
- The message request queue (if enabled) still requires explicit user action to accept — no automatic whitelist expansion

## Non-Functional Requirements

- Trust graph computation must not block UI (async background task)
- Kind:3 event fetching should be batched and rate-limited to avoid relay abuse
- Local trust graph storage bounded (cache only first-degree follow data, not the entire network)
- Trust graph data stored in memory or temporary database table (not permanent — rebuilt on refresh)

## Acceptance Criteria

- Suggested contacts appear based on overlap in contacts' follow lists
- Trust score accurately reflects the number of shared connections
- Adding a suggested contact works the same as manual contact addition (whitelist, profile request)
- Dismissing a suggestion prevents it from reappearing
- Message request queue (if enabled) correctly gates non-whitelisted WoT-trusted messages
- Disabling WoT features returns to pure whitelist behavior (no suggestions, no message requests)
- No kind:3 events published by Nostling (follow list remains private)
