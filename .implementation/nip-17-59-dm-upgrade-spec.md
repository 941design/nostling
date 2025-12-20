# NIP-17/59 DM Protocol Upgrade - Implementation Specification

## FOR: pbt-dev agent

This specification describes the complete upgrade of the direct messaging protocol from NIP-04 (kind:4) to NIP-17/59 (kind:14 wrapped in kind:1059).

## SCOPE

Modify existing TypeScript/Node.js codebase to:
1. Add NIP-17/59 encryption/wrapping functions to crypto module
2. Add NIP-17/59 decryption/unwrapping functions to crypto module
3. Update message sending to use NIP-17/59 protocol
4. Update message receiving to handle both NIP-04 and NIP-17/59 protocols
5. Ensure all tests pass (both existing and new)

## FILES TO MODIFY

1. `src/main/nostling/crypto.ts` - Add NIP-17/59 crypto functions
2. `src/main/nostling/service.ts` - Update message processing and sending
3. New test file: `src/main/nostling/nip17-crypto.test.ts` - Test NIP-17/59 functions

## CRITICAL CONSTRAINTS

- MUST maintain backward compatibility: continue receiving and decrypting kind:4 messages
- MUST NOT create or publish new kind:4 events
- MUST preserve existing message data unchanged
- MUST use nostr-tools library functions for NIP-17/59 (already available in dependencies)
- MUST follow existing code patterns and conventions
- ALL existing tests MUST continue to pass
- Store kind:14 in database for NIP-17/59 DMs (the unwrapped rumor kind, not kind:1059)

## IMPLEMENTATION DETAILS

### Part 1: Crypto Module Extensions (`src/main/nostling/crypto.ts`)

Add the following functions to the crypto module. Insert them after the existing `buildKind4Event` function (around line 408).

#### Function 1: `encryptNip17Message`

```typescript
/**
 * Encrypts a plaintext message using NIP-17 and wraps in NIP-59 gift wrap
 *
 * CONTRACT:
 *   Inputs:
 *     - plaintext: string, message content to encrypt
 *       Constraints: non-empty string
 *     - senderSecretKey: Uint8Array, sender's secret key (32 bytes)
 *     - recipientPubkeyHex: string, recipient's public key (64 hex characters)
 *
 *   Outputs:
 *     - wrappedEvent: NostrEvent, NIP-59 gift wrap event (kind:1059)
 *       Contains: encrypted kind:14 DM event inside
 *
 *   Invariants:
 *     - Output event has kind: 1059 (NIP-59 gift wrap)
 *     - Output event is signed and has valid id
 *     - Inner content is a kind:14 private direct message (NIP-17)
 *     - Recipient can unwrap and decrypt to recover plaintext
 *
 *   Properties:
 *     - Round-trip: unwrapNip17Message(encryptNip17Message(m, senderSK, recipientPK), recipientSK) recovers plaintext m
 *     - Non-deterministic: encrypting same message twice produces different events (random seal keys)
 *     - Protocol compliance: follows NIP-17 and NIP-59 specifications exactly
 *
 *   Algorithm:
 *     NIP-17/59 Encryption:
 *     1. Create kind:14 event template:
 *        - kind: 14
 *        - content: plaintext message
 *        - tags: [["p", recipientPubkeyHex]]
 *        - created_at: current Unix timestamp
 *     2. Use nostr-tools NIP-17 wrapEvent to encrypt and wrap:
 *        - Encrypts kind:14 event as a "rumor" (unsigned inner event)
 *        - Creates NIP-44 encrypted seal
 *        - Wraps seal in NIP-59 gift wrap (kind:1059)
 *     3. Return the outer kind:1059 event
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - Import { wrapEvent } from 'nostr-tools/nip17'
 *     - Call wrapEvent(senderSecretKey, { publicKey: recipientPubkeyHex }, plaintext)
 *     - Returns signed kind:1059 event ready for publishing
 *
 *   Error Conditions:
 *     - Invalid recipient public key → throw Error "Invalid recipient public key"
 *     - Empty plaintext → throw Error "Message content cannot be empty"
 */
export function encryptNip17Message(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPubkeyHex: string
): NostrEvent {
  // TODO (pbt-dev): Implement using nostr-tools nip17.wrapEvent
  throw new Error('Not implemented');
}
```

#### Function 2: `decryptNip17Message`

```typescript
/**
 * Unwraps NIP-59 gift wrap and decrypts NIP-17 message content
 *
 * CONTRACT:
 *   Inputs:
 *     - wrappedEvent: NostrEvent, NIP-59 gift wrap event (kind:1059)
 *       Constraints: valid NIP-59 structure with encrypted seal
 *     - recipientSecretKey: Uint8Array, recipient's secret key (32 bytes)
 *
 *   Outputs:
 *     - result: object containing:
 *       * plaintext: string, decrypted message content
 *       * senderPubkeyHex: string, sender's public key from inner event
 *       * kind: number, inner event kind (should be 14 for DMs)
 *       * eventId: string, ID of the inner rumor event
 *       * timestamp: number, created_at from inner event (Unix timestamp)
 *     - OR null if decryption fails
 *
 *   Invariants:
 *     - If result is not null, plaintext is non-empty string
 *     - If result is not null, senderPubkeyHex is 64-character hex string
 *     - If result is not null, kind equals 14 for DMs
 *     - Null return indicates decryption failure (wrong key or corrupted data)
 *
 *   Properties:
 *     - Selective success: returns null for invalid/corrupted wraps, not errors
 *     - Round-trip: decryptNip17Message(encryptNip17Message(m, senderSK, recipientPK), recipientSK).plaintext = m
 *     - Authenticated: recovered senderPubkeyHex matches original sender
 *
 *   Algorithm:
 *     NIP-17/59 Decryption:
 *     1. Use nostr-tools NIP-17 unwrapEvent to decrypt:
 *        - Unwraps kind:1059 gift wrap
 *        - Decrypts NIP-44 seal
 *        - Extracts inner rumor (kind:14 event)
 *     2. Validate inner event is kind:14
 *     3. Extract plaintext from rumor.content
 *     4. Extract sender pubkey from rumor.pubkey
 *     5. Return structured result object
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - Import { unwrapEvent } from 'nostr-tools/nip17'
 *     - Call unwrapEvent(wrappedEvent, recipientSecretKey)
 *     - Returns rumor object with { id, pubkey, created_at, kind, tags, content }
 *     - Handle decryption errors by returning null
 *
 *   Error Conditions:
 *     - Decryption failure (wrong key, corrupted data) → return null (do not throw)
 *     - Inner event is not kind:14 → return null (may be other wrapped content)
 */
export async function decryptNip17Message(
  wrappedEvent: NostrEvent,
  recipientSecretKey: Uint8Array
): Promise<{
  plaintext: string;
  senderPubkeyHex: string;
  kind: number;
  eventId: string;
  timestamp: number;
} | null> {
  // TODO (pbt-dev): Implement using nostr-tools nip17.unwrapEvent
  throw new Error('Not implemented');
}
```

**Import additions needed at top of crypto.ts:**
```typescript
import * as nip17 from 'nostr-tools/nip17';
```

### Part 2: Service Layer Updates (`src/main/nostling/service.ts`)

#### Change 1: Update `enqueueOutgoingMessage` (line 1288-1339)

Current code sets:
```typescript
const kind = 4; // NIP-04 encrypted direct message
```

Change to:
```typescript
const kind = 14; // NIP-17 private direct message (will be wrapped in kind:1059)
```

**Reasoning**: We store the inner rumor kind (14) in the database, not the outer wrapper kind (1059). This matches how profiles are stored and allows the UI to distinguish protocol versions.

#### Change 2: Update `flushOutgoingQueue` (line 1341-1392)

Current code builds kind:4 events:
```typescript
// Encrypt plaintext on-the-fly for relay publish
const ciphertext = await encryptMessage(message.content, senderSecretKey, recipientPubkeyHex);
const event = buildKind4Event(ciphertext, keypair, recipientPubkeyHex);
```

Replace with:
```typescript
// Encrypt and wrap message using NIP-17/59
const event = encryptNip17Message(message.content, senderSecretKey, recipientPubkeyHex);
```

**Contract for this change**:
- Input: `message.content` (plaintext string), `senderSecretKey` (Uint8Array), `recipientPubkeyHex` (string)
- Output: `event` (NostrEvent with kind:1059)
- Invariant: event is ready for publishing to relays
- Effect: All outgoing messages now use NIP-17/59 protocol

#### Change 3: Extend `processGiftWrapEvent` (line 1237-1256)

Current code only handles private profiles. Extend to handle NIP-17 DMs:

```typescript
/**
 * Processes NIP-59 gift wrap events (kind:1059)
 *
 * Handles both:
 * - Private profiles (kind:30078 inner events)
 * - NIP-17 DMs (kind:14 inner events)
 *
 * CONTRACT:
 *   Inputs:
 *     - identityId: string, recipient identity UUID
 *     - event: NostrEvent, NIP-59 gift wrap (kind:1059)
 *
 *   Outputs:
 *     - void (side effects: database updates, callbacks)
 *
 *   Invariants:
 *     - Attempts to unwrap using recipient's secret key
 *     - Routes unwrapped content by inner event kind
 *     - Logs warnings for unwrapping failures (does not throw)
 *
 *   Properties:
 *     - Multi-protocol: handles both profiles and DMs
 *     - Non-blocking: failures logged but don't prevent processing
 *
 *   Algorithm:
 *     1. Load recipient secret key
 *     2. Try profile unwrapping first (existing handleReceivedWrappedEvent)
 *     3. If profile unwrapping returns null, try NIP-17 DM unwrapping
 *     4. If DM unwrapping succeeds:
 *        a. Extract plaintext, senderPubkey, eventId, timestamp
 *        b. Convert senderPubkey to npub format
 *        c. Get recipient npub from identityId
 *        d. Call ingestIncomingMessage with kind:14
 *     5. If both unwrapping attempts fail, log and return
 */
private async processGiftWrapEvent(identityId: string, event: NostrEvent): Promise<void> {
  const recipientSecretKey = await this.loadSecretKey(identityId);

  try {
    // Try unwrapping as profile first (existing code)
    const profileRecord = await handleReceivedWrappedEvent(event, recipientSecretKey, this.database);

    if (profileRecord) {
      log('info', `Received private profile from ${profileRecord.ownerPubkey.slice(0, 8)}...`);

      // Notify all registered callbacks about profile update
      for (const callback of this.profileUpdateCallbacks) {
        callback(identityId);
      }
      return; // Profile handled, done
    }

    // Profile unwrap returned null, try NIP-17 DM unwrap
    const dmResult = await decryptNip17Message(event, recipientSecretKey);

    if (dmResult && dmResult.kind === 14) {
      // Successfully unwrapped a NIP-17 DM
      const senderNpub = hexToNpub(dmResult.senderPubkeyHex);
      const recipientNpub = this.getIdentityNpub(identityId);

      await this.ingestIncomingMessage({
        identityId,
        senderNpub,
        recipientNpub,
        content: dmResult.plaintext,
        eventId: dmResult.eventId,
        timestamp: new Date(dmResult.timestamp * 1000).toISOString(),
        kind: 14, // NIP-17 private DM
      });

      log('info', `Received NIP-17 DM from ${dmResult.senderPubkeyHex.slice(0, 8)}...`);
      return;
    }

    // Neither profile nor DM - may be other wrapped content
    log('debug', `Gift wrap event ${event.id} contained neither profile nor DM`);
  } catch (error) {
    log('warn', `Failed to process gift wrap event ${event.id}: ${this.toErrorMessage(error)}`);
  }
}
```

**Import additions needed in service.ts:**
```typescript
import { encryptNip17Message, decryptNip17Message } from './crypto';
```

### Part 3: Property-Based Tests (`src/main/nostling/nip17-crypto.test.ts`)

Create comprehensive property-based tests for NIP-17/59 functions using fast-check.

```typescript
import { describe, it, expect } from '@jest/globals';
import * as fc from 'fast-check';
import { generateKeypair, encryptNip17Message, decryptNip17Message } from './crypto';

describe('NIP-17/59 Encryption', () => {
  /**
   * Property: Round-trip encryption/decryption recovers plaintext
   *
   * For any plaintext message and valid keypairs:
   * decryptNip17Message(encryptNip17Message(plaintext, senderSK, recipientPK), recipientSK).plaintext === plaintext
   */
  it('property: round-trip encryption recovers original message', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 1000 }), // Plaintext message
        async (plaintext) => {
          const sender = generateKeypair();
          const recipient = generateKeypair();

          const wrappedEvent = encryptNip17Message(
            plaintext,
            sender.secretKey,
            recipient.pubkeyHex
          );

          expect(wrappedEvent.kind).toBe(1059); // NIP-59 gift wrap

          const result = await decryptNip17Message(wrappedEvent, recipient.secretKey);

          expect(result).not.toBeNull();
          expect(result!.plaintext).toBe(plaintext);
          expect(result!.senderPubkeyHex).toBe(sender.pubkeyHex);
          expect(result!.kind).toBe(14); // NIP-17 DM
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Decryption with wrong key returns null
   *
   * For any encrypted message, attempting to decrypt with a different recipient's key fails gracefully.
   */
  it('property: wrong recipient key returns null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (plaintext) => {
          const sender = generateKeypair();
          const correctRecipient = generateKeypair();
          const wrongRecipient = generateKeypair();

          const wrappedEvent = encryptNip17Message(
            plaintext,
            sender.secretKey,
            correctRecipient.pubkeyHex
          );

          const result = await decryptNip17Message(wrappedEvent, wrongRecipient.secretKey);

          expect(result).toBeNull(); // Decryption should fail gracefully
        }
      ),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Non-deterministic encryption
   *
   * Encrypting the same message twice produces different ciphertext (different random seal keys).
   */
  it('property: encryption is non-deterministic', () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const plaintext = 'Test message';

    const event1 = encryptNip17Message(plaintext, sender.secretKey, recipient.pubkeyHex);
    const event2 = encryptNip17Message(plaintext, sender.secretKey, recipient.pubkeyHex);

    // Events should be different (different IDs, different content)
    expect(event1.id).not.toBe(event2.id);
    expect(event1.content).not.toBe(event2.content);

    // But both should decrypt to same plaintext
    expect(decryptNip17Message(event1, recipient.secretKey)).resolves.toMatchObject({
      plaintext,
    });
    expect(decryptNip17Message(event2, recipient.secretKey)).resolves.toMatchObject({
      plaintext,
    });
  });

  /**
   * Property: Event structure compliance
   *
   * All wrapped events have correct structure per NIP-59.
   */
  it('property: wrapped events have correct structure', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (plaintext) => {
          const sender = generateKeypair();
          const recipient = generateKeypair();

          const event = encryptNip17Message(plaintext, sender.secretKey, recipient.pubkeyHex);

          // NIP-59 gift wrap requirements
          expect(event.kind).toBe(1059);
          expect(event.pubkey).toBeDefined(); // Random ephemeral key
          expect(event.pubkey).toMatch(/^[0-9a-f]{64}$/); // Valid hex pubkey
          expect(event.id).toBeDefined();
          expect(event.sig).toBeDefined();
          expect(event.content).toBeDefined(); // Encrypted seal
          expect(event.tags).toContainEqual(['p', recipient.pubkeyHex]); // Recipient tag
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Edge case: Empty message
   */
  it('rejects empty plaintext', () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();

    expect(() => {
      encryptNip17Message('', sender.secretKey, recipient.pubkeyHex);
    }).toThrow('Message content cannot be empty');
  });

  /**
   * Edge case: Invalid recipient key
   */
  it('rejects invalid recipient public key', () => {
    const sender = generateKeypair();

    expect(() => {
      encryptNip17Message('Test', sender.secretKey, 'invalid_key');
    }).toThrow('Invalid recipient public key');
  });
});

describe('Backward Compatibility: NIP-04', () => {
  /**
   * Existing NIP-04 functions must continue to work unchanged.
   * This ensures backward compatibility for receiving kind:4 messages.
   */
  it('existing NIP-04 encryption/decryption still works', async () => {
    const { encryptMessage, decryptMessage } = await import('./crypto');
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const plaintext = 'Legacy NIP-04 message';

    const ciphertext = await encryptMessage(plaintext, sender.secretKey, recipient.pubkeyHex);
    const decrypted = await decryptMessage(ciphertext, recipient.secretKey, sender.pubkeyHex);

    expect(decrypted).toBe(plaintext);
  });
});
```

### Part 4: Integration Test Updates

Existing tests in `src/main/nostling/nostr-keys.test.ts` and `src/main/nostling/service.test.ts` should continue to pass. These tests validate NIP-04 functionality which must remain working for backward compatibility.

Add integration test to verify mixed-protocol scenarios in `src/main/nostling/service.test.ts`:

```typescript
describe('NIP-17/59 and NIP-04 Mixed Protocol', () => {
  it('service receives NIP-04 message and sends NIP-17 reply', async () => {
    // Setup identities and service
    const db = createTestDatabase();
    const secretStore = new NostlingSecretStore();
    const service = new NostlingService(db, secretStore, '/tmp/test-config', { online: true });

    const alice = await service.createIdentity({ label: 'Alice' });
    const bobKeypair = generateKeypair();
    const bob = await service.addContact({ identityId: alice.id, npub: bobKeypair.npub, alias: 'Bob' });

    // Bob sends Alice a legacy NIP-04 message (kind:4)
    const aliceSecretKey = await secretStore.getSecretKey(alice.secretRef);
    const aliceKeypair = deriveKeypair(/* alice nsec */);
    const nip04Ciphertext = await encryptMessage('Hello from NIP-04', bobKeypair.secretKey, aliceKeypair.pubkeyHex);
    const kind4Event = buildKind4Event(nip04Ciphertext, bobKeypair, aliceKeypair.pubkeyHex);

    // Alice receives the kind:4 message
    await service.ingestIncomingMessage({
      identityId: alice.id,
      senderNpub: bobKeypair.npub,
      recipientNpub: alice.npub,
      content: 'Hello from NIP-04', // Already decrypted in this test
      eventId: kind4Event.id,
      kind: 4,
    });

    // Verify message stored with kind:4
    const messages = await service.listMessages(alice.id, bob.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe(4);
    expect(messages[0].content).toBe('Hello from NIP-04');

    // Alice replies using new NIP-17/59 protocol
    const replyMessage = await service.sendMessage({
      identityId: alice.id,
      contactId: bob.id,
      content: 'Reply using NIP-17',
    });

    // Verify reply stored with kind:14
    expect(replyMessage.kind).toBe(14);

    // Verify outgoing queue has kind:14 message
    const queue = await service.getOutgoingQueue();
    const replyInQueue = queue.find(m => m.id === replyMessage.id);
    expect(replyInQueue).toBeDefined();
    expect(replyInQueue!.kind).toBe(14);
  });
});
```

## TESTING STRATEGY

1. **Unit Tests**: Property-based tests for encryption/decryption round-trips
2. **Integration Tests**: Mixed-protocol scenarios (receive NIP-04, send NIP-17)
3. **Regression Tests**: All existing tests must pass
4. **Manual Verification**: Run `npm test` to confirm zero regressions

## VERIFICATION CHECKLIST

After implementation, verify:
- [ ] `npm test` passes with zero regressions
- [ ] New `nip17-crypto.test.ts` tests pass
- [ ] Outgoing messages use kind:1059 (outer) and kind:14 (inner, stored in DB)
- [ ] Incoming kind:4 messages still decrypt correctly
- [ ] Incoming kind:1059 wrapped kind:14 messages decrypt correctly
- [ ] Database stores kind:14 for NIP-17 DMs, kind:4 for legacy DMs
- [ ] UI displays kind:14 with "Private DM (NIP-17)" label (already implemented)
- [ ] UI displays kind:4 with deprecation warning (already implemented)
- [ ] No new kind:4 events are created or published

## REFERENCES

- NIP-17 spec: https://github.com/nostr-protocol/nips/blob/master/17.md
- NIP-59 spec: https://github.com/nostr-protocol/nips/blob/master/59.md
- nostr-tools nip17: /Users/mrother/Projects/941design/nostling/node_modules/nostr-tools/lib/types/nip17.d.ts
- nostr-tools nip59: /Users/mrother/Projects/941design/nostling/node_modules/nostr-tools/lib/types/nip59.d.ts
- Existing NIP-59 reference: src/main/nostling/profile-receiver.ts
- Existing NIP-59 reference: src/main/nostling/profile-sender.ts
