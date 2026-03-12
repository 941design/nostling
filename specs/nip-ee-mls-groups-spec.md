---
epic: nip-ee-mls-groups
created: 2026-03-12T00:00:00Z
status: planned
priority: low
---

# End-to-End Encrypted Group Messaging via MLS (NIP-EE)

## Problem Statement

NIP-29 relay-enforced groups (specified separately) do not provide end-to-end encryption — the relay operator can read all group messages. For privacy-focused users, this is an unacceptable tradeoff for sensitive group conversations. The Nostr ecosystem is developing NIP-EE (based on IETF RFC 9420, Messaging Layer Security) to provide cryptographically secure group messaging with forward secrecy and post-compromise security.

NIP-EE is not yet merged into the official Nostr NIPs but has working implementations (White Noise, 0xchat) and has undergone a security audit (Marmot Protocol, 18 hardening PRs merged). This spec tracks the planned adoption of NIP-EE for Nostling.

## Core Functionality

End-to-end encrypted group conversations using the MLS (Messaging Layer Security) protocol, transmitted via Nostr relays. MLS provides logarithmic-complexity key management for groups (efficient even with hundreds of members), forward secrecy (compromised keys cannot decrypt past messages), and post-compromise security (security recovers after a compromise through key rotation).

## Current Protocol Status

- **NIP-EE PR**: Open on nostr-protocol/nips (PR #1427), not merged
- **Implementations**: White Noise (alpha, iOS/Android), 0xchat (partial)
- **Rust crates**: Four crates created for MLS over Nostr
- **Security audit**: Completed (Marmot Protocol)
- **Maturity**: Experimental — API may change before NIP merge

## Functional Requirements (Draft — Pending NIP-EE Stabilization)

### FR-1: MLS Group Creation

- Create an MLS group with a set of initial members (by npub)
- Generate MLS KeyPackage for the creating identity
- Publish KeyPackage to relays for discoverability
- Create MLS group state and distribute Welcome messages to invited members

### FR-2: MLS Group Joining

- Receive and process MLS Welcome messages
- Initialize local MLS group state from the Welcome
- Subscribe to group message events on the group's relay(s)
- Confirm join via an MLS Commit message

### FR-3: Encrypted Group Messaging

- Encrypt outgoing group messages using MLS application messages
- Decrypt incoming group messages using local MLS group state
- Update local group state after each message (ratchet forward)
- Handle out-of-order message delivery (MLS epoch tracking)

### FR-4: Member Management

- Add members: create MLS Add proposal, commit, distribute Welcome to new member
- Remove members: create MLS Remove proposal, commit, update group key material
- Key rotation automatic on member changes (forward secrecy property)
- Display member list with join timestamps

### FR-5: UI Integration

- MLS-encrypted groups appear alongside NIP-29 groups in the sidebar
- Visual indicator distinguishing E2E encrypted groups (lock icon) from relay-visible groups
- Group creation wizard with encryption option: "Encrypted (E2E)" vs "Relay-managed (NIP-29)"
- Encrypted group metadata (name, picture) also encrypted (only visible to members)

### FR-6: Key Management

- MLS epoch keys stored in local database (encrypted at rest)
- KeyPackages published to configured relays
- KeyPackage rotation on configurable interval
- Device-specific key material (each device in a multi-device setup has its own MLS leaf)

## Non-Functional Requirements

- MLS state storage must be durable (loss of MLS state = inability to decrypt group messages)
- MLS operations (encrypt, decrypt, commit) should complete in under 100ms for groups up to 100 members
- Protocol implementation should use audited MLS libraries (e.g., OpenMLS for Rust, or the NIP-EE TypeScript reference)

## Acceptance Criteria (Draft)

- Users can create an E2E encrypted group and invite members
- Messages in the group are encrypted and only visible to members
- Adding/removing members triggers key rotation
- Group messages survive application restart
- Relay operators cannot read group message content
- UI clearly distinguishes encrypted groups from NIP-29 groups

## Dependencies

- NIP-EE must be merged or reach sufficient stability in the Nostr community
- MLS library availability for TypeScript/Node.js (or WebAssembly wrapper for Rust implementation)
- NIP-29 group messaging should be implemented first (provides group UI foundation)
- Multi-device support should be implemented first (MLS requires per-device key management)

## Risks

- NIP-EE may change significantly before merge — implementation may need revision
- MLS complexity is high — implementation and testing effort is substantial
- Interoperability with White Noise and 0xchat implementations must be verified
- TypeScript MLS libraries may have fewer security audits than Rust equivalents
