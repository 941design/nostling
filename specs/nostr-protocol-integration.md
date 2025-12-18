# Nostr Protocol Integration - Feature Specification

## Problem Statement

The Nostling MVP has complete UI scaffolding and data persistence but lacks actual Nostr protocol functionality. Messages are stored as plaintext without encryption, relay connections are simulated, and key derivation is missing. This blocks the system from exchanging real encrypted messages over Nostr relays.

**Why this feature exists:**
- Enable actual NIP-04 encrypted messaging between users
- Connect to Nostr relays for publishing and subscribing to events
- Derive keypairs from nsec for proper identity management
- Poll relays for incoming messages to complete the connection flow

**References:**
- Parent spec: `specs/nostling.md`
- Implementation gaps: `docs/nostling-implementation-plan.md`

## Core Functionality

Implement the Nostr protocol layer using `nostr-tools` library to enable real encrypted messaging over WebSocket relay connections. The system must handle key derivation, NIP-04 encryption/decryption, relay connection management, and message subscription/polling.

## Functional Requirements

### FR1: Dependency Installation
- **What**: Add nostr-tools library for Nostr protocol operations
- **Acceptance Criteria**:
  - `nostr-tools` package installed and available in main process
  - TypeScript types available for all used APIs

### FR2: Key Derivation
- **What**: Derive keypair (npub + secret key) from nsec input
- **Location**: New utility module `src/main/nostling/crypto.ts`
- **Interface**:
  ```typescript
  interface NostrKeypair {
    npub: string;        // bech32-encoded public key
    pubkeyHex: string;   // hex-encoded public key (for relay filters)
    secretKey: Uint8Array;
  }

  function deriveKeypair(nsec: string): NostrKeypair;
  function generateKeypair(): { nsec: string; keypair: NostrKeypair };
  function isValidNsec(nsec: string): boolean;
  function isValidNpub(npub: string): boolean;
  ```
- **Acceptance Criteria**:
  - Importing nsec produces correct npub (verifiable with external tools)
  - Generating new identity produces valid nsec + npub pair
  - Invalid nsec input throws descriptive error
  - Secret key bytes never logged or exposed outside crypto module

### FR3: NIP-04 Encryption/Decryption
- **What**: Encrypt outgoing messages and decrypt incoming messages per NIP-04
- **Location**: Extend `src/main/nostling/crypto.ts`
- **Interface**:
  ```typescript
  function encryptMessage(
    plaintext: string,
    senderSecretKey: Uint8Array,
    recipientPubkeyHex: string
  ): Promise<string>;  // returns ciphertext

  function decryptMessage(
    ciphertext: string,
    recipientSecretKey: Uint8Array,
    senderPubkeyHex: string
  ): Promise<string>;  // returns plaintext
  ```
- **Acceptance Criteria**:
  - Messages encrypted with shared secret derived from sender private + recipient public
  - Encrypted messages decryptable by recipient
  - Decryption failure returns null/throws (does not crash)
  - Interoperable with other NIP-04 implementations

### FR4: Relay Connection Manager
- **What**: Manage WebSocket connections to configured relays
- **Location**: New module `src/main/nostling/relay-pool.ts`
- **Interface**:
  ```typescript
  interface RelayPool {
    connect(urls: string[]): Promise<void>;
    disconnect(): void;
    publish(event: NostrEvent): Promise<PublishResult[]>;
    subscribe(filters: Filter[], onEvent: (event: NostrEvent) => void): Subscription;
    getStatus(): Map<string, 'connecting' | 'connected' | 'disconnected' | 'error'>;
    onStatusChange(callback: (url: string, status: string) => void): void;
  }

  interface PublishResult {
    relay: string;
    success: boolean;
    message?: string;
  }

  interface Subscription {
    close(): void;
  }
  ```
- **Acceptance Criteria**:
  - Connects to multiple relays concurrently
  - Automatic reconnection on disconnect (exponential backoff, max 30s)
  - Publishes to all write-enabled relays
  - Subscribes on all read-enabled relays
  - Status changes emitted for UI updates
  - Graceful shutdown on app quit

### FR5: Event Builder
- **What**: Construct and sign Nostr kind-4 events
- **Location**: Extend `src/main/nostling/crypto.ts`
- **Interface**:
  ```typescript
  function buildKind4Event(
    ciphertext: string,
    senderKeypair: NostrKeypair,
    recipientPubkeyHex: string
  ): NostrEvent;  // signed event ready for publishing
  ```
- **Acceptance Criteria**:
  - Event has correct kind (4), pubkey, tags, content, created_at
  - Event signature validates against pubkey
  - Recipient tagged in `p` tag

### FR6: Service Integration
- **What**: Integrate crypto and relay pool into NostlingService
- **Location**: Modify `src/main/nostling/service.ts`
- **Changes**:
  - `createIdentity()`: Use `deriveKeypair()` when nsec provided, `generateKeypair()` otherwise
  - `sendMessage()`: Encrypt plaintext before storing, publish to relays
  - `flushOutgoingQueue()`: Publish queued messages to relays, update status based on result
  - New `startSubscriptions()`: Subscribe to kind-4 events for all identities
  - New `stopSubscriptions()`: Close all subscriptions
  - `ingestIncomingMessage()`: Decrypt ciphertext before storing
- **Acceptance Criteria**:
  - Messages stored with actual ciphertext (not plaintext)
  - Publish failures reflected in message status
  - Incoming events validated, decrypted, and stored
  - Unknown senders still silently discarded

### FR7: Message Polling
- **What**: Periodically fetch new messages from relays
- **Location**: `src/main/nostling/service.ts` + IPC integration
- **Behavior**:
  - On app start: Subscribe to kind-4 events for all identity pubkeys
  - Filter: `kinds: [4], #p: [identityPubkeyHex]` for each identity
  - On event received: Validate sender in whitelist, decrypt, store, emit to renderer
  - On identity added/removed: Update subscriptions
- **Acceptance Criteria**:
  - New messages appear without manual refresh
  - Subscription filters match only whitelisted contacts
  - Duplicate events (same event_id) ignored
  - Renderer notified of new messages via IPC event

### FR8: Renderer State Updates
- **What**: Update renderer when new messages arrive from relays
- **Location**: Modify `src/main/ipc/handlers.ts` and `src/renderer/nostling/state.ts`
- **IPC Events**:
  - `nostling:message:received` - Emitted when new message ingested
  - `nostling:relay:status` - Emitted when relay connection status changes
- **Acceptance Criteria**:
  - `useNostlingState` hook listens for message events and updates state
  - Relay status exposed in state for UI display
  - No polling interval needed in renderer (push-based updates)

### FR9: Relay Status in Footer
- **What**: Display relay connection status in application footer
- **Location**: Modify `src/renderer/main.tsx`
- **Behavior**:
  - Show count of connected relays: "Relays: 2/3 connected"
  - Show error state if all relays disconnected: "Relays: disconnected"
  - Clicking status could open relay config (optional)
- **Acceptance Criteria**:
  - Status updates in real-time as connections change
  - Clear visual distinction between healthy/degraded/disconnected

## Non-Functional Requirements

### NFR1: Security
- Secret keys only exist in memory during crypto operations
- No secret key material in logs (use `[REDACTED]` placeholder)
- Encryption/decryption happens in main process only
- Failed decryption attempts logged with sender pubkey (not content)

### NFR2: Performance
- Relay connections established within 5s of app start
- Message encryption/decryption < 10ms per message
- Subscription setup < 100ms per identity

### NFR3: Reliability
- Relay disconnects auto-reconnect with backoff
- Partial publish success (some relays fail) still marks message as sent
- Local storage remains authoritative (relay is secondary)

### NFR4: Offline Behavior
- App functions fully offline with existing data
- Queued messages publish when connectivity restored
- No crashes or errors when all relays unreachable

## Testing Requirements

### Unit Tests
- Key derivation: Valid nsec produces expected npub
- Key derivation: Invalid nsec throws
- Encryption roundtrip: Encrypt then decrypt returns original
- Event building: Signature validates

### Integration Tests
- Full flow: Create identity → add contact → send message → verify encrypted in DB
- Relay mock: Publish event → verify relay receives correctly formatted event
- Subscription mock: Relay sends event → verify decrypted and stored

## Acceptance Criteria Summary

1. **Identity creation** derives correct npub from nsec input
2. **New identity** generates valid nsec + npub pair
3. **Sending message** encrypts content before storage and relay publish
4. **Receiving message** decrypts content after relay delivery
5. **Relay connections** established on app start with status visible
6. **Relay failures** reflected in message status and footer
7. **Incoming messages** appear without manual refresh
8. **Unknown senders** still silently discarded (whitelist enforced)
9. **Offline operation** queues messages, publishes on reconnect

## Implementation Notes

- Use `nostr-tools` v2.x APIs: `nip04.encrypt`, `nip04.decrypt`, `nip19.decode`, `finalizeEvent`
- Relay pool can use `nostr-tools/relay` or `nostr-tools/pool` depending on API fit
- Consider `SimplePool` from nostr-tools for managed relay connections
- Store `pubkeyHex` alongside `npub` in identity record to avoid repeated decoding
