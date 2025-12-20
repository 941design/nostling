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
  it('property: round-trip encryption recovers original message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 1000 }), // Plaintext message
        async (plaintext) => {
          const sender = generateKeypair();
          const recipient = generateKeypair();

          const wrappedEvent = encryptNip17Message(
            plaintext,
            sender.keypair.secretKey,
            recipient.keypair.pubkeyHex
          );

          expect(wrappedEvent.kind).toBe(1059); // NIP-59 gift wrap

          const result = await decryptNip17Message(wrappedEvent, recipient.keypair.secretKey);

          expect(result).not.toBeNull();
          expect(result!.plaintext).toBe(plaintext);
          expect(result!.senderPubkeyHex).toBe(sender.keypair.pubkeyHex);
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
  it('property: wrong recipient key returns null', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (plaintext) => {
          const sender = generateKeypair();
          const correctRecipient = generateKeypair();
          const wrongRecipient = generateKeypair();

          const wrappedEvent = encryptNip17Message(
            plaintext,
            sender.keypair.secretKey,
            correctRecipient.keypair.pubkeyHex
          );

          const result = await decryptNip17Message(wrappedEvent, wrongRecipient.keypair.secretKey);

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
  it('property: encryption is non-deterministic', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const plaintext = 'Test message';

    const event1 = encryptNip17Message(plaintext, sender.keypair.secretKey, recipient.keypair.pubkeyHex);
    const event2 = encryptNip17Message(plaintext, sender.keypair.secretKey, recipient.keypair.pubkeyHex);

    // Events should be different (different IDs, different content)
    expect(event1.id).not.toBe(event2.id);
    expect(event1.content).not.toBe(event2.content);

    // But both should decrypt to same plaintext
    const decrypt1 = await decryptNip17Message(event1, recipient.keypair.secretKey);
    const decrypt2 = await decryptNip17Message(event2, recipient.keypair.secretKey);

    expect(decrypt1).toMatchObject({ plaintext });
    expect(decrypt2).toMatchObject({ plaintext });
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

          const event = encryptNip17Message(plaintext, sender.keypair.secretKey, recipient.keypair.pubkeyHex);

          // NIP-59 gift wrap requirements
          expect(event.kind).toBe(1059);
          expect(event.pubkey).toBeDefined(); // Random ephemeral key
          expect(event.pubkey).toMatch(/^[0-9a-f]{64}$/); // Valid hex pubkey
          expect(event.id).toBeDefined();
          expect(event.sig).toBeDefined();
          expect(event.content).toBeDefined(); // Encrypted seal
          expect(event.tags).toContainEqual(['p', recipient.keypair.pubkeyHex]); // Recipient tag
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property: Sender verification
   *
   * Decrypted message contains correct sender information that can be verified.
   */
  it('property: decrypted message contains correct sender info', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 500 }),
        async (plaintext) => {
          const sender = generateKeypair();
          const recipient = generateKeypair();

          const wrappedEvent = encryptNip17Message(
            plaintext,
            sender.keypair.secretKey,
            recipient.keypair.pubkeyHex
          );

          const result = await decryptNip17Message(wrappedEvent, recipient.keypair.secretKey);

          expect(result).not.toBeNull();
          expect(result!.senderPubkeyHex).toBe(sender.keypair.pubkeyHex);
          expect(result!.eventId).toBeTruthy();
          expect(result!.timestamp).toBeGreaterThan(0);
        }
      ),
      { numRuns: 25 }
    );
  });

  /**
   * Edge case: Empty message
   */
  it('rejects empty plaintext', () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();

    expect(() => {
      encryptNip17Message('', sender.keypair.secretKey, recipient.keypair.pubkeyHex);
    }).toThrow('Message content cannot be empty');
  });

  /**
   * Edge case: Invalid recipient key
   */
  it('rejects invalid recipient public key', () => {
    const sender = generateKeypair();

    expect(() => {
      encryptNip17Message('Test', sender.keypair.secretKey, 'invalid_key');
    }).toThrow('Invalid recipient public key');
  });

  /**
   * Edge case: Whitespace-only message
   */
  it('accepts whitespace-only messages', async () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const plaintext = '   \n\t  ';

    const wrappedEvent = encryptNip17Message(
      plaintext,
      sender.keypair.secretKey,
      recipient.keypair.pubkeyHex
    );

    const result = await decryptNip17Message(wrappedEvent, recipient.keypair.secretKey);

    expect(result).not.toBeNull();
    expect(result!.plaintext).toBe(plaintext);
  });

  /**
   * Property: Large messages
   *
   * Protocol correctly handles large message payloads.
   */
  it('property: handles large messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1000, maxLength: 100000 }),
        async (plaintext) => {
          const sender = generateKeypair();
          const recipient = generateKeypair();

          const wrappedEvent = encryptNip17Message(
            plaintext,
            sender.keypair.secretKey,
            recipient.keypair.pubkeyHex
          );

          const result = await decryptNip17Message(wrappedEvent, recipient.keypair.secretKey);

          expect(result).not.toBeNull();
          expect(result!.plaintext).toBe(plaintext);
        }
      ),
      { numRuns: 5 }
    );
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

    const ciphertext = await encryptMessage(plaintext, sender.keypair.secretKey, recipient.keypair.pubkeyHex);
    const decrypted = await decryptMessage(ciphertext, recipient.keypair.secretKey, sender.keypair.pubkeyHex);

    expect(decrypted).toBe(plaintext);
  });
});
