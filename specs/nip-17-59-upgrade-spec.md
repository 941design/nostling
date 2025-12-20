# NIP-17/59 Protocol Upgrade - Requirements Specification

## Problem Statement

The application currently uses NIP-04 (kind:4) for direct messaging, which is now deprecated in favor of NIP-17/59. NIP-04 has known privacy and security limitations compared to the newer protocols. Users should send all new private messages using NIP-17/59 while maintaining backward compatibility for receiving older protocol messages.

## Core Functionality

Upgrade the direct messaging system from NIP-04 (kind:4) to NIP-17/59:
- All new outgoing direct messages must use NIP-17 encryption wrapped in NIP-59 gift wrap (kind:1059)
- Incoming kind:4 messages must still be accepted and decrypted for backward compatibility
- Existing kind:4 messages in the database must be preserved with their protocol markers
- UI must clearly distinguish between deprecated NIP-04 and current NIP-17/59 messages
- All tests must be updated to verify both protocols where applicable

## Functional Requirements

### FR-1: Outgoing Message Protocol
- **Requirement**: All new outgoing direct messages MUST use NIP-17/59 protocol
- **Acceptance Criteria**:
  - When a user sends a DM, it is encrypted using NIP-17 and wrapped in NIP-59 gift wrap
  - The resulting Nostr event has `kind: 1059` (NIP-59 gift wrap)
  - The wrapped content contains a kind:14 NIP-17 private DM event
  - No new kind:4 events are created or published

### FR-2: Incoming Message Protocol Support
- **Requirement**: System MUST accept both kind:4 (NIP-04) and kind:1059/14 (NIP-17/59) incoming messages
- **Acceptance Criteria**:
  - kind:4 events are decrypted using NIP-04 decryption
  - kind:1059 events are unwrapped and kind:14 content is decrypted using NIP-17
  - Both message types are stored with their respective `kind` field set correctly
  - Decryption failures are handled gracefully for both protocols

### FR-3: Database Message Preservation
- **Requirement**: Existing kind:4 messages MUST remain unchanged in the database
- **Acceptance Criteria**:
  - No migration modifies the `kind` field of existing messages
  - Existing kind:4 messages continue to display correctly in UI
  - Message history is fully preserved across upgrade

### FR-4: UI Protocol Indication
- **Requirement**: UI MUST clearly distinguish between NIP-04 and NIP-17/59 messages
- **Acceptance Criteria**:
  - kind:4 messages show deprecation warning (already implemented)
  - kind:14 or kind:1059 messages show as modern protocol
  - Message info modal displays correct kind labels
  - Users can visually identify which protocol was used

### FR-5: Relay Subscription Filters
- **Requirement**: System MUST subscribe to both kind:4 and kind:1059 events for receiving DMs
- **Acceptance Criteria**:
  - Relay subscription filters include `kinds: [4, 1059]` for message reception
  - Outgoing message publishing only sends kind:1059 events
  - Subscription logic correctly routes both event kinds to message processing

### FR-6: Cryptographic Implementation
- **Requirement**: Implement NIP-17 and NIP-59 cryptographic operations
- **Acceptance Criteria**:
  - NIP-17 encryption function creates valid kind:14 events
  - NIP-17 decryption function correctly unwraps kind:14 events
  - NIP-59 wrapping function creates valid kind:1059 gift wrap events
  - NIP-59 unwrapping function correctly extracts wrapped events
  - All cryptographic operations follow the NIP specifications exactly

## Critical Constraints

### CC-1: Backward Compatibility
- System MUST continue receiving and decrypting kind:4 messages
- No breaking changes to existing message database schema
- Preserve all existing message data and metadata

### CC-2: Protocol Compliance
- NIP-17 implementation MUST follow the official specification exactly
- NIP-59 implementation MUST follow the official specification exactly
- Use nostr-tools library if it provides NIP-17/59 modules, otherwise implement per spec

### CC-3: Test Coverage
- All existing tests for kind:4 must pass (for backward compatibility)
- New tests must verify NIP-17/59 message sending and receiving
- Tests must verify mixed-protocol scenarios (kind:4 receive, kind:1059 send)
- Property-based tests should cover encryption/decryption round-trips for both protocols

### CC-4: No Kind:4 Sending
- System MUST NOT create or publish new kind:4 events
- No UI option or API to send NIP-04 messages
- Only NIP-17/59 protocol used for all new outgoing messages

## Integration Points

### IP-1: Crypto Module (src/main/nostling/crypto.ts)
- Add NIP-17 encryption/decryption functions
- Add NIP-59 wrapping/unwrapping functions
- Preserve existing NIP-04 functions for receiving messages
- Update event building to use NIP-17/59 for outgoing messages

### IP-2: Service Layer (src/main/nostling/service.ts)
- Update `processIncomingEvent()` to handle kind:1059 DM events
- Update `enqueueOutgoingMessage()` to use NIP-17/59 protocol
- Update `flushOutgoingQueue()` to build NIP-17/59 events
- Update `getSubscriptionFilters()` to include kind:1059 for DMs

### IP-3: Relay Pool (src/main/nostling/relay-pool.ts)
- Ensure kind:1059 events are published correctly
- Ensure subscriptions handle kind:1059 events

### IP-4: UI Layer (src/renderer/main.tsx, MessageInfoModal.tsx)
- Verify kind:14 and kind:1059 display correctly (labels already defined)
- Ensure deprecation warning only shows for kind:4

### IP-5: Existing NIP-59 Code
- Reference `profile-receiver.ts` for NIP-59 unwrapping patterns
- Reference `profile-sender.ts` for NIP-59 wrapping patterns
- Reference `p2p-signal-handler.ts` for additional NIP-59 examples

## User Preferences

- **Protocol Choice**: Use NIP-59 wrapped (kind:1059) for all DMs as recommended by NIP-17 spec
- **Backward Compatibility**: Maintain full compatibility for receiving kind:4 messages
- **Database Preservation**: Keep all existing messages unchanged
- **Clean Cutover**: Completely disable kind:4 sending, no fallback option

## Codebase Context

See `.exploration/nip-17-59-upgrade-context.md` for exploration findings.

Key observations:
- kind field already exists in database schema and UI
- NIP-59 gift wrap implementation already exists for profiles (reference implementation)
- Message processing already routes by event kind
- UI already has NIP-17 (kind:14) label defined in MessageInfoModal

## Related Artifacts

- **Exploration Context**: `.exploration/nip-17-59-upgrade-context.md`
- **Current NIP-04 Implementation**: `src/main/nostling/crypto.ts`
- **NIP-59 Reference**: `src/main/nostling/profile-receiver.ts`, `src/main/nostling/profile-sender.ts`
- **Message Service**: `src/main/nostling/service.ts`

## Out of Scope

- Migration of existing kind:4 messages to NIP-17/59 format (keep as-is)
- Automatic protocol negotiation based on recipient capabilities
- UI toggle to switch between protocols
- Relay compatibility checking for NIP-17/59 support
- Performance optimization beyond what's needed for functionality

---

**Note**: This is a requirements specification, not an architecture design.
The exact implementation approach for NIP-17/59 cryptography (whether to use
nostr-tools modules or custom implementation), event structure details, and
test organization will be determined by the integration-architect during Phase 2.
