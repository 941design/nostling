# Exploration Context: NIP-17/59 Protocol Upgrade

> **For integration-architect**: This captures preliminary codebase exploration for upgrading DM protocol from NIP-04 (kind:4) to NIP-17/59.
> Trust findings for what's listed. Investigate items in "Gaps" section.

## Exploration Scope

**Feature**: Upgrade message protocol to NIP-17/59 for DMs, deprecate kind:4
**Approach**: Searched for kind:4 implementation, message encryption/decryption, test coverage, and architecture
**Coverage assessment**: Comprehensive scan of message handling, encryption, UI, and test infrastructure

## Findings

### Current NIP-04 (kind:4) Implementation

| Component | Location | Purpose |
|-----------|----------|---------|
| Encryption/Decryption | src/main/nostling/crypto.ts | NIP-04 ECDH+AES-256-CBC encryption |
| Event Building | src/main/nostling/crypto.ts:395 | `buildKind4Event()` - creates signed kind:4 events |
| Message Lifecycle | src/main/nostling/service.ts | Queuing, encryption, publishing, receipt, decryption |
| Relay Publishing | src/main/nostling/relay-pool.ts | WebSocket publish/subscribe for kind:4 events |
| Database Schema | src/main/database/migrations | `kind` column in `nostr_messages` table |
| UI Display | src/renderer/main.tsx:917-928 | Warning icon for kind:4 with "deprecated protocol" label |
| Message Info Modal | src/renderer/components/MessageInfoModal.tsx | Shows kind with human-readable labels |

### Similar Features (NIP-59 Gift Wrap)

| Feature | Location | Relevance |
|---------|----------|-----------|
| Gift Wrap Unwrapping | src/main/nostling/profile-receiver.ts | Handles kind:1059 events (NIP-59 wrapped profiles) |
| Profile Event Builder | src/main/nostling/profile-event-builder.ts | Builds kind:30078 private profile events |
| Profile Sender | src/main/nostling/profile-sender.ts | NIP-59 wrapping for profile transmission |
| P2P Signal Handler | src/main/nostling/p2p-signal-handler.ts | NIP-59 wrapping for P2P signals (kind:443) |

### Key Patterns Observed

| Pattern | Where | Notes |
|---------|-------|-------|
| Event Kind Routing | service.ts:1191-1236 | `processIncomingEvent()` routes by `event.kind` |
| Kind Field Tracking | Database + Types | `kind` column already exists, UI already displays it |
| NIP-59 Gift Wrap | profile-receiver.ts | Existing implementation of unwrapping kind:1059 |
| Encryption Abstraction | crypto.ts | Clear separation: encrypt/decrypt/buildEvent functions |
| Subscription Filters | service.ts:683-723 | `getSubscriptionFilters()` builds relay filters by kind |

### Key Files

| File | Purpose |
|------|---------|
| src/main/nostling/crypto.ts | All cryptographic operations (NIP-04 currently) |
| src/main/nostling/service.ts | Message lifecycle management and event processing |
| src/main/nostling/relay-pool.ts | Relay communication and event pub/sub |
| src/main/nostling/profile-receiver.ts | NIP-59 unwrapping (reference implementation) |
| src/shared/types.ts | Type definitions including `NostlingMessage.kind` |
| src/renderer/main.tsx | UI rendering with kind:4 deprecation warning |
| src/renderer/components/MessageInfoModal.tsx | Kind labeling (already has NIP-17 placeholders) |

### Potential Integration Points

| Integration Point | Existing Code | Notes |
|-------------------|---------------|-------|
| Message Encryption | crypto.ts:encryptMessage() | Need NIP-17/59 encryption functions |
| Message Decryption | crypto.ts:decryptMessage() | Need NIP-17/59 decryption functions |
| Event Building | crypto.ts:buildKind4Event() | Need NIP-17/59 event builders |
| Event Processing | service.ts:processIncomingEvent() | Already routes by kind, easy to extend |
| Subscription Filters | service.ts:getSubscriptionFilters() | Need to add kind:14/1059 filters for DMs |
| UI Kind Display | MessageInfoModal.tsx:38-52 | Already has NIP-17 (kind:14) label defined! |

### Test Coverage

| Test File | Coverage |
|-----------|----------|
| src/main/nostling/nostr-keys.test.ts | NIP-04 encryption, decryption, kind:4 events |
| src/main/nostling/service.test.ts | Message ingestion, decryption failure handling |
| src/main/nostling/p2p-signal-handler.test.ts | NIP-59 wrapping (reference for implementation) |
| src/main/nostling/profile-receiver.test.ts | NIP-59 unwrapping (reference for implementation) |
| src/renderer/components/MessageInfoModal.test.ts | Kind labeling tests |
| e2e/message-info-modal.spec.ts | Integration test for message UI |

## Gaps & Uncertainties

**Could not determine:**
- [ ] **NIP-17 vs NIP-59 for DMs**: Does NIP-17 use kind:14 directly, or is it always wrapped in kind:1059? Need to research specs.
- [ ] **Backward Compatibility**: Should we still support receiving kind:4 messages? What about migration of existing messages?
- [ ] **Relay Support**: Do configured relays support NIP-17/59? Need compatibility checks?
- [ ] **Key Management**: Does NIP-17/59 use different key derivation than NIP-04?

**Areas not examined:**
- Nostr-tools library support for NIP-17/59 (need to check if nip17/nip59 modules exist)
- Migration strategy for existing kind:4 messages in database
- Error handling for mixed-protocol conversations (some clients on NIP-04, others on NIP-17)

## Recommendations for Architect

Before finalizing architecture:
1. **NIP Specification Research**: Determine exact NIP-17 and NIP-59 implementation details (event structure, encryption, wrapping)
2. **Nostr-tools API**: Check if nostr-tools library has nip17/nip59 modules or if custom implementation needed
3. **Migration Strategy**: Decide on backward compatibility approach and database migration
4. **Testing Strategy**: Plan for testing mixed-protocol scenarios and migration edge cases

---
**Explored by**: /feature router
**For use by**: integration-architect
