/**
 * Nostr Cryptographic Operations
 *
 * Implements NIP-04 encryption/decryption, key derivation, and event signing
 * using the nostr-tools library.
 *
 * Security: Secret key bytes only exist in memory during crypto operations.
 * Never log or expose secret keys outside this module.
 */

import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import * as nip04 from 'nostr-tools/nip04';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Nostr keypair containing public key in multiple formats and secret key
 */
export interface NostrKeypair {
  npub: string;           // bech32-encoded public key (NIP-19 format)
  pubkeyHex: string;      // hex-encoded public key for relay filters
  secretKey: Uint8Array;  // raw secret key bytes (32 bytes)
}

/**
 * Nostr event as defined in NIP-01
 */
export interface NostrEvent {
  id: string;             // 32-byte hex-encoded SHA-256 hash
  pubkey: string;         // 32-byte hex-encoded public key
  created_at: number;     // Unix timestamp in seconds
  kind: number;           // Event kind (4 for encrypted direct messages)
  tags: string[][];       // Array of tag arrays
  content: string;        // Event content (ciphertext for kind-4)
  sig: string;            // 64-byte hex-encoded Schnorr signature
}

// ============================================================================
// CONTRACT: deriveKeypair
// ============================================================================

/**
 * Derives a Nostr keypair from an nsec (secret key in NIP-19 format)
 *
 * CONTRACT:
 *   Inputs:
 *     - nsec: string, bech32-encoded secret key starting with "nsec1"
 *       Example: "nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5"
 *       Constraints: must be valid bech32, must decode to 32 bytes
 *
 *   Outputs:
 *     - keypair: NostrKeypair object containing:
 *       * npub: bech32-encoded public key derived from secret key
 *       * pubkeyHex: 32-byte hex-encoded public key (64 hex characters)
 *       * secretKey: Uint8Array of 32 bytes (raw secret key)
 *
 *   Invariants:
 *     - Public key is deterministically derived from secret key via secp256k1
 *     - npub and pubkeyHex represent the same public key in different formats
 *     - secretKey has exactly 32 bytes
 *
 *   Properties:
 *     - Deterministic: same nsec always produces same keypair
 *     - Round-trip: deriveKeypair(keypair.nsec) produces same pubkeyHex
 *     - Format correctness: npub starts with "npub1", pubkeyHex matches [0-9a-f]{64}
 *
 *   Error Conditions:
 *     - Invalid bech32 format → throw Error with descriptive message
 *     - Wrong prefix (not "nsec1") → throw Error
 *     - Wrong byte length (not 32 bytes) → throw Error
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - nip19.decode(nsec) to extract secret key bytes
 *     - getPublicKey(secretKey) to derive public key
 *     - nip19.npubEncode(pubkey) to format npub
 */
export function deriveKeypair(nsec: string): NostrKeypair {
  try {
    const decoded = nip19.decode(nsec);

    if (decoded.type !== 'nsec') {
      throw new Error(`Invalid nsec format: expected 'nsec' type, got '${decoded.type}'`);
    }

    const secretKey = decoded.data as Uint8Array;

    if (secretKey.length !== 32) {
      throw new Error(`Invalid secret key length: expected 32 bytes, got ${secretKey.length}`);
    }

    const pubkeyHex = getPublicKey(secretKey);
    const npub = nip19.npubEncode(pubkeyHex);

    return {
      npub,
      pubkeyHex,
      secretKey
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to derive keypair: ${error.message}`);
    }
    throw new Error('Failed to derive keypair: unknown error');
  }
}

// ============================================================================
// CONTRACT: generateKeypair
// ============================================================================

/**
 * Generates a new random Nostr keypair
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - result: object containing:
 *       * nsec: bech32-encoded secret key (NIP-19 format)
 *       * keypair: NostrKeypair (same as deriveKeypair output)
 *
 *   Invariants:
 *     - Secret key is cryptographically random (32 random bytes)
 *     - keypair is correctly derived from generated secret key
 *
 *   Properties:
 *     - Uniqueness: successive calls produce different keys with overwhelming probability
 *     - Validity: deriveKeypair(result.nsec) produces same keypair
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - generatePrivateKey() to create random secret key
 *     - nip19.nsecEncode(secretKey) to format nsec
 *     - deriveKeypair(nsec) to produce keypair
 */
export function generateKeypair(): { nsec: string; keypair: NostrKeypair } {
  const secretKey = generateSecretKey();
  const nsec = nip19.nsecEncode(secretKey);
  const keypair = deriveKeypair(nsec);

  return { nsec, keypair };
}

// ============================================================================
// CONTRACT: isValidNsec
// ============================================================================

/**
 * Validates an nsec string
 *
 * CONTRACT:
 *   Inputs:
 *     - nsec: string, candidate nsec to validate
 *
 *   Outputs:
 *     - valid: boolean, true if nsec is valid, false otherwise
 *
 *   Invariants:
 *     - Returns true if and only if deriveKeypair(nsec) would succeed
 *
 *   Properties:
 *     - Non-throwing: never throws, always returns boolean
 *     - Consistent: isValidNsec(x) = true implies deriveKeypair(x) succeeds
 *     - Consistent: isValidNsec(x) = false implies deriveKeypair(x) throws
 *
 *   Validation Checks:
 *     1. String starts with "nsec1"
 *     2. Valid bech32 encoding
 *     3. Decodes to exactly 32 bytes
 */
export function isValidNsec(nsec: string): boolean {
  try {
    if (!nsec.startsWith('nsec1')) {
      return false;
    }

    const decoded = nip19.decode(nsec);

    if (decoded.type !== 'nsec') {
      return false;
    }

    const secretKey = decoded.data as Uint8Array;
    return secretKey.length === 32;
  } catch {
    return false;
  }
}

// ============================================================================
// CONTRACT: isValidNpub
// ============================================================================

/**
 * Validates an npub string
 *
 * CONTRACT:
 *   Inputs:
 *     - npub: string, candidate npub to validate
 *
 *   Outputs:
 *     - valid: boolean, true if npub is valid, false otherwise
 *
 *   Invariants:
 *     - Returns true if and only if npub can be decoded to a valid public key
 *
 *   Properties:
 *     - Non-throwing: never throws, always returns boolean
 *
 *   Validation Checks:
 *     1. String starts with "npub1"
 *     2. Valid bech32 encoding
 *     3. Decodes to exactly 32 bytes
 */
export function isValidNpub(npub: string): boolean {
  try {
    if (!npub.startsWith('npub1')) {
      return false;
    }

    const decoded = nip19.decode(npub);

    if (decoded.type !== 'npub') {
      return false;
    }

    const pubkey = decoded.data as string;
    return pubkey.length === 64 && /^[0-9a-f]{64}$/.test(pubkey);
  } catch {
    return false;
  }
}

// ============================================================================
// CONTRACT: encryptMessage
// ============================================================================

/**
 * Encrypts a plaintext message using NIP-04
 *
 * CONTRACT:
 *   Inputs:
 *     - plaintext: string, message content to encrypt (UTF-8)
 *       Example: "Hello, this is a secure message"
 *       Constraints: non-empty string
 *     - senderSecretKey: Uint8Array, sender's secret key (32 bytes)
 *     - recipientPubkeyHex: string, recipient's public key (64 hex characters)
 *
 *   Outputs:
 *     - ciphertext: string, NIP-04 format: "<base64_ciphertext>?iv=<base64_iv>"
 *       Example: "AbCdEf...123==?iv=XyZ789...=="
 *
 *   Invariants:
 *     - Ciphertext contains "?iv=" separator
 *     - Both ciphertext and IV portions are valid base64
 *     - Decryption with recipient's secret key recovers original plaintext
 *
 *   Properties:
 *     - Round-trip: decryptMessage(encryptMessage(m, senderSK, recipientPK), recipientSK, senderPK) = m
 *     - Non-deterministic: encrypting same message twice produces different ciphertext (random IV)
 *     - Confidentiality: ciphertext reveals no information about plaintext without secret key
 *
 *   Algorithm:
 *     NIP-04 Encryption:
 *     1. Compute shared secret via ECDH: sharedSecret = ECDH(senderSecretKey, recipientPubkey)
 *     2. Generate random 16-byte initialization vector (IV)
 *     3. Encrypt plaintext using AES-256-CBC with sharedSecret as key and IV
 *     4. Encode ciphertext and IV as base64
 *     5. Format as "<ciphertext_base64>?iv=<iv_base64>"
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - nip04.encrypt(senderSecretKey, recipientPubkeyHex, plaintext)
 *     Returns ciphertext in NIP-04 format
 */
export async function encryptMessage(
  plaintext: string,
  senderSecretKey: Uint8Array,
  recipientPubkeyHex: string
): Promise<string> {
  return nip04.encrypt(senderSecretKey, recipientPubkeyHex, plaintext);
}

// ============================================================================
// CONTRACT: decryptMessage
// ============================================================================

/**
 * Decrypts a NIP-04 ciphertext
 *
 * CONTRACT:
 *   Inputs:
 *     - ciphertext: string, NIP-04 format: "<base64_ciphertext>?iv=<base64_iv>"
 *     - recipientSecretKey: Uint8Array, recipient's secret key (32 bytes)
 *     - senderPubkeyHex: string, sender's public key (64 hex characters)
 *
 *   Outputs:
 *     - plaintext: string, decrypted message content (UTF-8), or null if decryption fails
 *
 *   Invariants:
 *     - Successful decryption recovers original plaintext from encryptMessage
 *     - Failed decryption returns null (does not throw)
 *
 *   Properties:
 *     - Round-trip: decryptMessage(encryptMessage(m, sk1, pk2), sk2, pk1) = m
 *     - Graceful failure: invalid ciphertext or wrong keys return null, not throw
 *
 *   Algorithm:
 *     NIP-04 Decryption:
 *     1. Parse ciphertext into base64_ciphertext and base64_iv components
 *     2. Decode both from base64 to bytes
 *     3. Compute shared secret via ECDH: sharedSecret = ECDH(recipientSecretKey, senderPubkey)
 *     4. Decrypt using AES-256-CBC with sharedSecret as key and IV
 *     5. Return UTF-8 plaintext
 *
 *   Error Handling:
 *     - Malformed ciphertext → return null
 *     - Invalid base64 → return null
 *     - Decryption failure (wrong key/IV) → return null
 *     - Log warning with sender pubkey (NOT content) on failure
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - nip04.decrypt(recipientSecretKey, senderPubkeyHex, ciphertext)
 *     Catch any errors and return null
 */
export async function decryptMessage(
  ciphertext: string,
  recipientSecretKey: Uint8Array,
  senderPubkeyHex: string
): Promise<string | null> {
  try {
    return nip04.decrypt(recipientSecretKey, senderPubkeyHex, ciphertext);
  } catch (error) {
    console.warn(`Failed to decrypt message from sender ${senderPubkeyHex}:`, error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

// ============================================================================
// CONTRACT: buildKind4Event
// ============================================================================

/**
 * Builds and signs a Nostr kind-4 encrypted direct message event
 *
 * CONTRACT:
 *   Inputs:
 *     - ciphertext: string, NIP-04 encrypted message content
 *     - senderKeypair: NostrKeypair, sender's keypair (for signing)
 *     - recipientPubkeyHex: string, recipient's public key (64 hex characters)
 *
 *   Outputs:
 *     - event: NostrEvent, fully signed event ready for relay publishing
 *
 *   Invariants:
 *     - event.kind = 4
 *     - event.pubkey = senderKeypair.pubkeyHex
 *     - event.content = ciphertext
 *     - event.tags contains exactly one tag: ["p", recipientPubkeyHex]
 *     - event.created_at is Unix timestamp (seconds since epoch)
 *     - event.id is valid SHA-256 hash of serialized event
 *     - event.sig is valid Schnorr signature over event.id
 *
 *   Properties:
 *     - Signature validity: verifySignature(event.id, event.sig, event.pubkey) = true
 *     - Event ID determinism: same inputs (except created_at) produce same ID format
 *     - Recipient tagged: event.tags includes ["p", recipientPubkeyHex]
 *
 *   Algorithm:
 *     NIP-01 Event Construction:
 *     1. Create event object:
 *        - kind: 4
 *        - pubkey: senderKeypair.pubkeyHex
 *        - created_at: Math.floor(Date.now() / 1000)
 *        - tags: [["p", recipientPubkeyHex]]
 *        - content: ciphertext
 *     2. Serialize event for hashing per NIP-01:
 *        JSON array: [0, pubkey, created_at, kind, tags, content]
 *     3. Compute SHA-256 hash of serialized UTF-8 bytes → event.id
 *     4. Sign event.id with senderKeypair.secretKey using Schnorr signature → event.sig
 *     5. Return complete event
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - Create event template object
 *     - finalizeEvent(template, secretKey) to compute id and sig
 */
export function buildKind4Event(
  ciphertext: string,
  senderKeypair: NostrKeypair,
  recipientPubkeyHex: string
): NostrEvent {
  const eventTemplate = {
    kind: 4,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['p', recipientPubkeyHex]],
    content: ciphertext
  };

  return finalizeEvent(eventTemplate, senderKeypair.secretKey) as NostrEvent;
}

// ============================================================================
// CONTRACT: npubToHex
// ============================================================================

/**
 * Converts npub (bech32) to hex-encoded public key
 *
 * CONTRACT:
 *   Inputs:
 *     - npub: string, bech32-encoded public key starting with "npub1"
 *
 *   Outputs:
 *     - pubkeyHex: string, 64-character hex-encoded public key
 *
 *   Invariants:
 *     - Output has exactly 64 hex characters
 *     - Represents same public key as input npub
 *
 *   Properties:
 *     - Round-trip: hexToNpub(npubToHex(x)) = x
 *
 *   Error Conditions:
 *     - Invalid bech32 → throw Error
 *     - Wrong prefix → throw Error
 *     - Wrong length → throw Error
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - nip19.decode(npub) to extract bytes
 *     - Convert bytes to hex string
 */
export function npubToHex(npub: string): string {
  try {
    const decoded = nip19.decode(npub);

    if (decoded.type !== 'npub') {
      throw new Error(`Invalid npub format: expected 'npub' type, got '${decoded.type}'`);
    }

    const pubkeyHex = decoded.data as string;

    if (pubkeyHex.length !== 64 || !/^[0-9a-f]{64}$/.test(pubkeyHex)) {
      throw new Error(`Invalid public key: expected 64 hex characters, got ${pubkeyHex.length}`);
    }

    return pubkeyHex;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to convert npub to hex: ${error.message}`);
    }
    throw new Error('Failed to convert npub to hex: unknown error');
  }
}

// ============================================================================
// CONTRACT: hexToNpub
// ============================================================================

/**
 * Converts hex-encoded public key to npub (bech32)
 *
 * CONTRACT:
 *   Inputs:
 *     - pubkeyHex: string, 64-character hex-encoded public key
 *
 *   Outputs:
 *     - npub: string, bech32-encoded public key starting with "npub1"
 *
 *   Invariants:
 *     - Output starts with "npub1"
 *     - Represents same public key as input hex
 *
 *   Properties:
 *     - Round-trip: npubToHex(hexToNpub(x)) = x
 *
 *   Error Conditions:
 *     - Invalid hex string → throw Error
 *     - Wrong length (not 64 chars) → throw Error
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - Convert hex to bytes
 *     - nip19.npubEncode(bytes) to format npub
 */
export function hexToNpub(pubkeyHex: string): string {
  try {
    if (pubkeyHex.length !== 64 || !/^[0-9a-f]{64}$/.test(pubkeyHex)) {
      throw new Error(`Invalid hex string: expected 64 hex characters, got ${pubkeyHex.length}`);
    }

    return nip19.npubEncode(pubkeyHex);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to convert hex to npub: ${error.message}`);
    }
    throw new Error('Failed to convert hex to npub: unknown error');
  }
}
