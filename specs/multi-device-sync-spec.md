---
epic: multi-device-sync
created: 2026-03-12T00:00:00Z
status: planned
priority: high
---

# Multi-Device Synchronization

## Problem Statement

Nostling operates as a single-device application. Users who want to use Nostling on multiple machines (e.g., work laptop and personal desktop) must choose one or duplicate their identity manually. This is a significant limitation for a desktop messaging app — users expect to access conversations from any device.

Nostr's keypair-based identity model is architecturally superior to Signal's linked-device model for multi-device support: any device that possesses the private key is co-equal. There is no "primary device" requirement. This architectural advantage is currently unexploited.

## Core Functionality

Enable the same Nostr identity to operate on multiple Nostling installations simultaneously, with message history synchronized via relay-based event replay. Each device is a peer — no device acts as primary or gateway.

## Functional Requirements

### FR-1: Identity Import on New Device

- Import an existing identity to a new Nostling installation via mnemonic phrase or nsec
- On import, the application detects that the identity already exists on relays (messages present)
- Trigger a historical message sync to populate the local database

### FR-2: Historical Message Sync

- On identity import (or on demand), query configured relays for all kind:1059 events addressed to the identity's pubkey
- Replay events through the existing decryption pipeline to populate the local message database
- Handle deduplication: skip messages already present (by event_id)
- Sync window: configurable, default last 30 days (to limit initial sync time and bandwidth)
- Progress indicator during sync: "Syncing messages: X found, Y decrypted"

### FR-3: Real-Time Cross-Device Consistency

- Messages sent from Device A are published to relays and received by Device B via normal relay subscription
- Messages received on Device A are also received on Device B (both subscribe to the same pubkey)
- Contact additions on one device become visible on another after the contact sends/receives a message (contacts are implicitly discovered, not explicitly synced)
- Read status is device-local (not synced — too much metadata leakage risk)

### FR-4: Conflict Handling

- Identity profile edits on one device propagate via private profile broadcast (existing mechanism)
- Relay configuration is per-device (not synced — different network environments may need different relays)
- Theme selection is per-device (personal preference may vary by display)
- Contact whitelist conflicts: if both devices add different contacts, both are valid (union, not conflict)

### FR-5: Device Awareness (Optional)

- Display a "linked devices" indicator showing how many devices are using this identity (detected by observing kind:1059 events signed by the identity's key but not sent from this device)
- This is informational only — no device management or revocation in this phase

## Non-Functional Requirements

- Historical sync must not overwhelm relays with broad time-range queries (use pagination or windowed queries)
- Sync must be resumable (track last-synced timestamp per relay)
- No additional metadata leakage beyond what normal relay subscriptions already expose
- No central coordination server — all sync operates via standard Nostr relay protocol

## Acceptance Criteria

- Identity imported on Device B via mnemonic retrieves message history from relays
- Messages sent from Device A appear on Device B within normal relay delivery latency
- Messages sent from Device B appear on Device A
- Deduplication prevents duplicate messages in the UI
- Sync progress is visible to the user
- Different relay configurations on each device work independently
- Contact lists converge over time as messages are exchanged

## Limitations and Future Work

- Read receipts are NOT synced (privacy: syncing read status would require additional protocol events)
- Contact lists are NOT explicitly synced (implicit convergence via message exchange)
- Identity deletion on one device does not propagate to others (each device manages its own state)
- Future: consider a dedicated device-sync NIP for explicit state synchronization if the community develops one
