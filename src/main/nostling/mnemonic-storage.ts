/**
 * Seed Storage Layer
 *
 * Persists and retrieves BIP39-derived seeds in the secret store.
 * Seeds are stored encrypted using Electron safeStorage (OS keychain).
 *
 * Storage model:
 * - Each identity has optional seed stored in secret-store
 * - Seed ref format: "nostr-seed:{identity-id}"
 * - Existing identities created before seed support have no seed
 * - New identities created from mnemonic have seed stored (128-char hex)
 *
 * Security: Seeds are never stored in plaintext, always encrypted via secret-store.
 *
 * BIP Standards:
 * - BIP-39: Mnemonic → Seed derivation (PBKDF2-HMAC-SHA512)
 * - BIP-32: Hierarchical Deterministic (HD) key derivation
 * - BIP-44: Multi-account hierarchy for deterministic wallets
 *
 * Derivation: mnemonic → seed (64 bytes) → HD key at path → nsec
 * Default path: m/44'/1237'/0'/0/0 (NIP-06 standard for Nostr)
 */

import type { NostlingSecretStore } from './secret-store';

// ============================================================================
// CONTRACT: getSeedRef
// ============================================================================

/**
 * Generates secret-store reference key for identity's seed
 *
 * CONTRACT:
 *   Inputs:
 *     - identityId: string, UUID of identity
 *       Example: "550e8400-e29b-41d4-a716-446655440000"
 *       Constraints: non-empty string
 *
 *   Outputs:
 *     - ref: string, secret-store reference key
 *       Format: "nostr-seed:{identityId}"
 *       Example: "nostr-seed:550e8400-e29b-41d4-a716-446655440000"
 *
 *   Invariants:
 *     - Output has prefix "nostr-seed:"
 *     - Output contains identityId after prefix
 *
 *   Properties:
 *     - Deterministic: same identityId always produces same ref
 *     - Unique: different identityId values produce different refs
 *     - Prefix convention: matches secret-store naming pattern (cf. "nostr-secret:...")
 *
 *   Implementation Notes:
 *     Simple string template: return `nostr-seed:${identityId}`
 */
export function getSeedRef(identityId: string): string {
  return `nostr-seed:${identityId}`;
}

// Legacy ref for migration support
export function getMnemonicRef(identityId: string): string {
  return `nostr-mnemonic:${identityId}`;
}

// ============================================================================
// CONTRACT: validateSeedHex
// ============================================================================

/**
 * Validates a seed hex string
 *
 * CONTRACT:
 *   Inputs:
 *     - seedHex: string, candidate seed to validate
 *
 *   Outputs:
 *     - valid: boolean, true if seedHex is valid 128-char hex
 *
 *   Properties:
 *     - Must be exactly 128 hex characters (64 bytes)
 *     - Must be valid lowercase or uppercase hex
 */
export function validateSeedHex(seedHex: string): boolean {
  if (!seedHex || typeof seedHex !== 'string') {
    return false;
  }
  return /^[0-9a-fA-F]{128}$/.test(seedHex);
}

// ============================================================================
// CONTRACT: saveSeed
// ============================================================================

/**
 * Saves a seed to secret store for an identity
 *
 * CONTRACT:
 *   Inputs:
 *     - secretStore: NostlingSecretStore, secret storage instance
 *       Constraints: initialized secret store (local or external)
 *     - identityId: string, UUID of identity to associate seed with
 *       Example: "550e8400-e29b-41d4-a716-446655440000"
 *       Constraints: non-empty string
 *     - seedHex: string, 128-character hex-encoded 64-byte seed
 *       Example: "000102030405..." (128 chars)
 *       Constraints: must be valid seed hex (validateSeedHex returns true)
 *
 *   Outputs:
 *     - ref: string, secret-store reference where seed was saved
 *       Format: "nostr-seed:{identityId}"
 *       Example: "nostr-seed:550e8400-e29b-41d4-a716-446655440000"
 *
 *   Invariants:
 *     - Seed is encrypted before storage (handled by secret-store)
 *     - Reference follows naming convention "nostr-seed:{identityId}"
 *     - After saving, getSeed(secretStore, identityId) returns same seed
 *
 *   Properties:
 *     - Round-trip: saveSeed then getSeed recovers original seed
 *     - Idempotent: saving same seed multiple times is safe (overwrites)
 *     - Security: seed never stored in plaintext
 *
 *   Error Conditions:
 *     - Invalid seed → throw Error "Invalid seed: must be 128 hex characters"
 *     - Secret store encryption unavailable → propagate SecureStorageUnavailableError from secret-store
 *
 *   Algorithm:
 *     1. Validate seedHex using validateSeedHex
 *     2. If invalid, throw error
 *     3. Generate reference key using getSeedRef(identityId)
 *     4. Call secretStore.saveSecret(seedHex, ref)
 *        - Secret store handles encryption and persistence
 *     5. Return the reference key
 *
 *   Implementation Notes:
 *     - Use getSeedRef to ensure consistent ref format
 *     - Let secret-store handle encryption and storage details
 */
export async function saveSeed(
  secretStore: NostlingSecretStore,
  identityId: string,
  seedHex: string
): Promise<string> {
  if (!validateSeedHex(seedHex)) {
    throw new Error('Invalid seed: must be 128 hex characters');
  }

  const ref = getSeedRef(identityId);
  return await secretStore.saveSecret(seedHex, ref);
}

// ============================================================================
// CONTRACT: getSeed
// ============================================================================

/**
 * Retrieves a seed from secret store for an identity
 *
 * CONTRACT:
 *   Inputs:
 *     - secretStore: NostlingSecretStore, secret storage instance
 *       Constraints: initialized secret store (local or external)
 *     - identityId: string, UUID of identity whose seed to retrieve
 *       Example: "550e8400-e29b-41d4-a716-446655440000"
 *       Constraints: non-empty string
 *
 *   Outputs:
 *     - seedHex: string or null
 *       If found: 128-character hex-encoded seed
 *       If not found: null (identity has no seed stored)
 *
 *   Invariants:
 *     - If output is non-null, it is a valid seed hex (128 chars)
 *     - If identity never had seed saved, returns null
 *
 *   Properties:
 *     - Round-trip: after saveSeed(store, id, s), getSeed(store, id) returns s
 *     - Backward compatibility: returns null for identities created before seed support
 *     - Decryption: secret store handles decryption transparently
 *
 *   Error Conditions:
 *     - Decryption failure (keychain lost, migrated machine) → propagate SecretDecryptionError from secret-store
 *     - Reference not found → return null (not an error, identity has no seed)
 *
 *   Algorithm:
 *     1. Generate reference key using getSeedRef(identityId)
 *     2. Call secretStore.getSecret(ref)
 *        - Secret store handles decryption
 *     3. If secret store returns null, return null (not found)
 *     4. If secret store returns string, return that string (decrypted seed)
 *
 *   Implementation Notes:
 *     - Use getSeedRef to ensure consistent ref format
 *     - Do NOT validate seed on retrieval (trust what's in store)
 *     - Let secret-store handle decryption errors (SecretDecryptionError)
 */
export async function getSeed(
  secretStore: NostlingSecretStore,
  identityId: string
): Promise<string | null> {
  const ref = getSeedRef(identityId);
  return await secretStore.getSecret(ref);
}

// ============================================================================
// CONTRACT: deleteSeed
// ============================================================================

/**
 * Deletes a seed from secret store for an identity
 *
 * CONTRACT:
 *   Inputs:
 *     - secretStore: NostlingSecretStore, secret storage instance
 *       Constraints: initialized secret store (local or external)
 *     - identityId: string, UUID of identity whose seed to delete
 *       Example: "550e8400-e29b-41d4-a716-446655440000"
 *       Constraints: non-empty string
 *
 *   Outputs:
 *     - none (void)
 *
 *   Invariants:
 *     - After deletion, getSeed(secretStore, identityId) returns null
 *     - Deleting non-existent seed is safe (no-op)
 *
 *   Properties:
 *     - Idempotent: deleting same seed multiple times is safe
 *     - After deletion: getSeed returns null
 *
 *   Error Conditions:
 *     - None (deletion of non-existent ref is safe no-op)
 *
 *   Algorithm:
 *     1. Generate reference key using getSeedRef(identityId)
 *     2. Call secretStore.deleteSecret(ref)
 *        - Secret store handles deletion
 *     3. Return (void)
 *
 *   Implementation Notes:
 *     - Use getSeedRef to ensure consistent ref format
 *     - Let secret-store handle deletion details
 */
export async function deleteSeed(
  secretStore: NostlingSecretStore,
  identityId: string
): Promise<void> {
  const ref = getSeedRef(identityId);
  await secretStore.deleteSecret(ref);
}

// ============================================================================
// CONTRACT: hasSeed
// ============================================================================

/**
 * Checks if an identity has a seed stored
 *
 * CONTRACT:
 *   Inputs:
 *     - secretStore: NostlingSecretStore, secret storage instance
 *       Constraints: initialized secret store (local or external)
 *     - identityId: string, UUID of identity to check
 *       Example: "550e8400-e29b-41d4-a716-446655440000"
 *       Constraints: non-empty string
 *
 *   Outputs:
 *     - exists: boolean
 *       true: identity has seed stored
 *       false: identity has no seed (created before seed support or seed deleted)
 *
 *   Invariants:
 *     - Returns true if and only if getSeed would return non-null
 *
 *   Properties:
 *     - Consistent: hasSeed(store, id) = true implies getSeed(store, id) !== null
 *     - Consistent: hasSeed(store, id) = false implies getSeed(store, id) === null
 *     - After save: saveSeed then hasSeed returns true
 *     - After delete: deleteSeed then hasSeed returns false
 *
 *   Error Conditions:
 *     - Decryption failure → propagate SecretDecryptionError from secret-store
 *
 *   Algorithm:
 *     1. Call getSeed(secretStore, identityId)
 *     2. If result is null, return false
 *     3. If result is non-null string, return true
 *
 *   Implementation Notes:
 *     - Simple wrapper around getSeed
 *     - Could optimize by checking secret-store listSecretRefs, but getSeed is simpler
 */
export async function hasSeed(
  secretStore: NostlingSecretStore,
  identityId: string
): Promise<boolean> {
  const seed = await getSeed(secretStore, identityId);
  return seed !== null;
}

// ============================================================================
// Legacy compatibility aliases
// ============================================================================

/**
 * @deprecated Use saveSeed instead. This alias exists for backward compatibility.
 */
export const saveMnemonic = saveSeed;

/**
 * @deprecated Use getSeed instead. This alias exists for backward compatibility.
 */
export const getMnemonic = getSeed;

/**
 * @deprecated Use deleteSeed instead. This alias exists for backward compatibility.
 */
export const deleteMnemonic = deleteSeed;

/**
 * @deprecated Use hasSeed instead. This alias exists for backward compatibility.
 */
export const hasMnemonic = hasSeed;
