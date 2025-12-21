/**
 * BIP39 Mnemonic Cryptographic Operations for Nostr Keys (NIP-06)
 *
 * Implements NIP-06 specification for deriving Nostr keys from BIP39 mnemonics.
 * Follows BIP-32, BIP-39, and BIP-44 standards for hierarchical deterministic wallets.
 *
 * Derivation process:
 *   mnemonic → seed (BIP-39 PBKDF2) → HD master key (BIP-32) → derived key (BIP-44 path)
 *
 * Default path: m/44'/1237'/0'/0/0 (NIP-06 standard for Nostr)
 *   - 44': BIP-44 purpose
 *   - 1237': Nostr coin type (SLIP-44)
 *   - 0': Account index (hardened)
 *   - 0: External chain
 *   - 0: Address index
 *
 * Security: Mnemonic phrases and seeds represent secret keys and must be handled securely.
 * Never log or expose secrets outside this module except during user backup flows.
 */

import * as nip06 from 'nostr-tools/nip06';
import * as nip19 from 'nostr-tools/nip19';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import { getPublicKey } from 'nostr-tools/pure';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default BIP-44 derivation path for Nostr keys (NIP-06 standard)
 *
 * Path components:
 *   m/44'/1237'/0'/0/0
 *   - 44': BIP-44 purpose (hardened)
 *   - 1237': Nostr coin type per SLIP-44 (hardened)
 *   - 0': Account index (hardened)
 *   - 0: External chain (non-hardened)
 *   - 0: Address index (non-hardened)
 */
export const DEFAULT_DERIVATION_PATH = "m/44'/1237'/0'/0/0";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Result of deriving a Nostr keypair from mnemonic
 */
export interface MnemonicKeypairDerivation {
  mnemonic: string;        // BIP39 mnemonic phrase (12 or 24 words)
  nsec: string;            // bech32-encoded secret key (NIP-19 format)
  npub: string;            // bech32-encoded public key (NIP-19 format)
  pubkeyHex: string;       // hex-encoded public key (64 hex characters)
  secretKey: Uint8Array;   // raw secret key bytes (32 bytes)
  seedHex: string;         // hex-encoded 64-byte seed (128 hex characters)
  derivationPath: string;  // BIP-44 path used for derivation
}

/**
 * Result of deriving a Nostr keypair from seed
 */
export interface SeedKeypairDerivation {
  seedHex: string;         // hex-encoded 64-byte seed (128 hex characters)
  nsec: string;            // bech32-encoded secret key (NIP-19 format)
  npub: string;            // bech32-encoded public key (NIP-19 format)
  pubkeyHex: string;       // hex-encoded public key (64 hex characters)
  secretKey: Uint8Array;   // raw secret key bytes (32 bytes)
  derivationPath: string;  // BIP-44 path used for derivation
}

// ============================================================================
// CONTRACT: generateMnemonic
// ============================================================================

/**
 * Generates a new BIP39 mnemonic phrase for Nostr key derivation
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - mnemonic: string, BIP39 mnemonic phrase
 *       Format: space-separated words from BIP39 word list
 *       Example: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
 *       Constraints: 12 words (128 bits entropy) or 24 words (256 bits entropy) - implementation chooses default
 *
 *   Invariants:
 *     - Output is valid BIP39 mnemonic (passes validateMnemonic check)
 *     - Output uses only words from standard BIP39 English word list
 *     - Output has correct checksum embedded in final word
 *
 *   Properties:
 *     - Uniqueness: successive calls produce different mnemonics with overwhelming probability
 *     - Cryptographic randomness: entropy is generated from secure random source
 *     - Validity: validateMnemonic(generateMnemonic()) always returns true
 *     - Derivability: deriveKeypairFromMnemonic(generateMnemonic()) always succeeds
 *
 *   Algorithm:
 *     BIP39 Mnemonic Generation (via nostr-tools nip06):
 *     1. Generate cryptographically random entropy (128 or 256 bits)
 *     2. Compute SHA-256 hash of entropy
 *     3. Take first (entropy_bits / 32) bits of hash as checksum
 *     4. Concatenate entropy + checksum
 *     5. Split concatenated bits into 11-bit groups
 *     6. Map each 11-bit group to word from BIP39 word list (2048 words)
 *     7. Return space-separated word list
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - Import { generateSeedWords } from 'nostr-tools/nip06'
 *     - Call generateSeedWords() to get mnemonic string
 *     - Library handles entropy generation, checksum, and encoding
 */
export function generateMnemonic(): string {
  return nip06.generateSeedWords();
}

// ============================================================================
// CONTRACT: validateMnemonic
// ============================================================================

/**
 * Validates a BIP39 mnemonic phrase
 *
 * CONTRACT:
 *   Inputs:
 *     - mnemonic: string, candidate BIP39 mnemonic to validate
 *       Example: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
 *       Constraints: space-separated words, may be 12 or 24 words
 *
 *   Outputs:
 *     - valid: boolean, true if mnemonic is valid BIP39, false otherwise
 *
 *   Invariants:
 *     - Returns true if and only if deriveKeypairFromMnemonic would succeed
 *     - Returns true if and only if mnemonic passes all BIP39 validation checks
 *
 *   Properties:
 *     - Non-throwing: never throws, always returns boolean
 *     - Consistent: validateMnemonic(x) = true implies deriveKeypairFromMnemonic(x) succeeds
 *     - Consistent: validateMnemonic(x) = false implies deriveKeypairFromMnemonic(x) would fail
 *     - Generated validity: validateMnemonic(generateMnemonic()) always returns true
 *
 *   Validation Checks:
 *     1. String is non-empty
 *     2. Words are space-separated
 *     3. Word count is valid (12 or 24 words for standard BIP39)
 *     4. All words exist in BIP39 English word list
 *     5. Checksum embedded in mnemonic is correct (validates entropy integrity)
 *
 *   Algorithm:
 *     BIP39 Validation (via nostr-tools nip06):
 *     1. Trim and normalize whitespace in input
 *     2. Split into individual words
 *     3. Check word count is 12 or 24
 *     4. Look up each word in BIP39 word list, get 11-bit index
 *     5. Concatenate all 11-bit indices
 *     6. Split concatenated bits into entropy bits + checksum bits
 *     7. Compute SHA-256(entropy), take first N bits as expected checksum
 *     8. Compare computed checksum with actual checksum from mnemonic
 *     9. Return true if checksums match, false otherwise
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - Import { validateWords } from 'nostr-tools/nip06'
 *     - Call validateWords(mnemonic) to check validity
 *     - Catch any errors and return false (non-throwing contract)
 */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    return nip06.validateWords(mnemonic);
  } catch {
    return false;
  }
}

// ============================================================================
// CONTRACT: deriveKeypairFromMnemonic
// ============================================================================

/**
 * Derives a Nostr keypair from BIP39 mnemonic using NIP-06 standard derivation
 *
 * CONTRACT:
 *   Inputs:
 *     - mnemonic: string, valid BIP39 mnemonic phrase (12 or 24 words)
 *       Example: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
 *       Constraints: must be valid BIP39 (validateMnemonic returns true)
 *     - passphrase: string (optional), BIP39 passphrase for additional security
 *       Example: "my secret passphrase"
 *       Constraints: any UTF-8 string, defaults to empty string if omitted
 *     - accountIndex: non-negative integer (optional), BIP32 account index for HD derivation
 *       Example: 0, 1, 2, ...
 *       Constraints: accountIndex >= 0, defaults to 0 if omitted
 *
 *   Outputs:
 *     - derivation: MnemonicKeypairDerivation object containing:
 *       * mnemonic: original input mnemonic (echoed back)
 *       * nsec: bech32-encoded secret key (NIP-19 format, starts with "nsec1")
 *       * npub: bech32-encoded public key (NIP-19 format, starts with "npub1")
 *       * pubkeyHex: 64-character hex-encoded public key
 *       * secretKey: Uint8Array of 32 bytes (raw secret key for crypto operations)
 *
 *   Invariants:
 *     - Public key is deterministically derived from secret key via secp256k1
 *     - npub and pubkeyHex represent the same public key in different formats
 *     - secretKey has exactly 32 bytes
 *     - Derivation follows NIP-06 path: m/44'/1237'/<accountIndex>'/0/0
 *
 *   Properties:
 *     - Deterministic: same mnemonic + passphrase + accountIndex always produces same keypair
 *     - Round-trip: importing nsec to Nostr client produces matching npub
 *     - Format correctness: nsec starts with "nsec1", npub starts with "npub1"
 *     - BIP32 derivation: different accountIndex values produce different independent keypairs
 *     - Passphrase security: different passphrases produce completely different keypairs
 *
 *   Error Conditions:
 *     - Invalid mnemonic (fails validateMnemonic) → throw Error "Invalid mnemonic phrase"
 *     - Negative accountIndex → throw Error "Account index must be non-negative"
 *
 *   Algorithm:
 *     NIP-06 Key Derivation:
 *     1. Validate mnemonic using BIP39 validation
 *     2. Convert mnemonic + passphrase to binary seed using BIP39 PBKDF2:
 *        - Input: mnemonic words + optional passphrase
 *        - PBKDF2-HMAC-SHA512 with 2048 iterations
 *        - Salt: "mnemonic" + passphrase (UTF-8 normalized)
 *        - Output: 64-byte seed
 *     3. Derive HD wallet master key from seed using BIP32:
 *        - Use 64-byte seed as input to BIP32 master key generation
 *        - Generate master private key and chain code
 *     4. Derive child key at path m/44'/1237'/<accountIndex>'/0/0:
 *        - m: master key
 *        - 44': BIP44 purpose (hardened)
 *        - 1237': Nostr coin type per SLIP44 (hardened)
 *        - <accountIndex>': account index (hardened, default 0)
 *        - 0: external chain (non-hardened)
 *        - 0: address index (non-hardened)
 *     5. Extract 32-byte secret key from derived child key
 *     6. Derive public key from secret key using secp256k1
 *     7. Encode secret key as nsec using NIP-19 bech32 encoding
 *     8. Encode public key as npub using NIP-19 bech32 encoding
 *     9. Return all derived values
 *
 *   Implementation Notes:
 *     Use nostr-tools:
 *     - Import { accountFromSeedWords } from 'nostr-tools/nip06'
 *     - Import { nsecEncode, npubEncode } from 'nostr-tools/nip19'
 *     - Call accountFromSeedWords(mnemonic, passphrase, accountIndex)
 *     - Returns { privateKey: Uint8Array, publicKey: string }
 *     - Encode privateKey as nsec, publicKey is already hex
 *     - Encode publicKey as npub
 */
export function deriveKeypairFromMnemonic(
  mnemonic: string,
  passphrase: string = '',
  accountIndex: number = 0
): MnemonicKeypairDerivation {
  // Validate inputs
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  if (accountIndex < 0) {
    throw new Error('Account index must be non-negative');
  }

  // Generate seed from mnemonic (BIP-39)
  const seed = mnemonicToSeedSync(mnemonic, passphrase);
  const seedHex = seedToHex(seed);

  // Build derivation path (NIP-06 standard with account index)
  const derivationPath = `m/44'/1237'/${accountIndex}'/0/0`;

  // Derive keypair using NIP-06
  const { privateKey, publicKey } = nip06.accountFromSeedWords(mnemonic, passphrase, accountIndex);

  // Encode keys in various formats
  const nsec = nip19.nsecEncode(privateKey);
  const npub = nip19.npubEncode(publicKey);

  return {
    mnemonic,
    nsec,
    npub,
    pubkeyHex: publicKey,
    secretKey: privateKey,
    seedHex,
    derivationPath,
  };
}

// ============================================================================
// CONTRACT: mnemonicToWords
// ============================================================================

/**
 * Splits a mnemonic phrase into individual words array
 *
 * CONTRACT:
 *   Inputs:
 *     - mnemonic: string, BIP39 mnemonic phrase (space-separated words)
 *       Example: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
 *       Constraints: space-separated, may contain extra whitespace
 *
 *   Outputs:
 *     - words: array of strings, individual words from mnemonic
 *       Example: ["abandon", "abandon", ..., "about"]
 *       Constraints: non-empty array, all words lowercase, no whitespace in words
 *
 *   Invariants:
 *     - Output length equals number of words in mnemonic (12 or 24 for valid mnemonics)
 *     - Joining output with spaces recreates normalized mnemonic
 *
 *   Properties:
 *     - Idempotent normalization: mnemonicToWords(x).join(' ') is normalized form of x
 *     - Whitespace handling: extra spaces, tabs, newlines are removed
 *     - Lowercase: all output words are lowercase
 *
 *   Algorithm:
 *     1. Trim leading/trailing whitespace from mnemonic
 *     2. Replace multiple whitespace characters with single space
 *     3. Convert to lowercase
 *     4. Split on single space character
 *     5. Filter out empty strings (in case of edge cases)
 *     6. Return array of words
 *
 *   Implementation Notes:
 *     Simple string manipulation:
 *     - Use trim(), replace(/\s+/g, ' '), toLowerCase(), split(' ')
 *     - Filter empty strings for robustness
 */
export function mnemonicToWords(mnemonic: string): string[] {
  return mnemonic
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .filter(word => word.length > 0);
}

// ============================================================================
// CONTRACT: wordCountIsValid
// ============================================================================

/**
 * Checks if word count matches standard BIP39 mnemonic lengths
 *
 * CONTRACT:
 *   Inputs:
 *     - wordCount: non-negative integer, number of words
 *       Example: 12, 24
 *       Constraints: wordCount >= 0
 *
 *   Outputs:
 *     - valid: boolean, true if word count is standard BIP39 length
 *
 *   Invariants:
 *     - Returns true only for 12 or 24 (standard BIP39 word counts)
 *     - Returns false for all other values
 *
 *   Properties:
 *     - Standard lengths: wordCountIsValid(12) = true, wordCountIsValid(24) = true
 *     - Non-standard lengths: wordCountIsValid(N) = false for N not in {12, 24}
 *
 *   Implementation Notes:
 *     Simple check: return wordCount === 12 || wordCount === 24
 */
export function wordCountIsValid(wordCount: number): boolean {
  return wordCount === 12 || wordCount === 24;
}

// ============================================================================
// CONTRACT: mnemonicToSeed
// ============================================================================

/**
 * Converts a BIP39 mnemonic phrase to a 64-byte seed
 *
 * CONTRACT:
 *   Inputs:
 *     - mnemonic: string, valid BIP39 mnemonic phrase (12 or 24 words)
 *       Constraints: must be valid BIP39 (validateMnemonic returns true)
 *     - passphrase: string (optional), BIP39 passphrase for additional security
 *       Constraints: any UTF-8 string, defaults to empty string if omitted
 *
 *   Outputs:
 *     - seed: Uint8Array of 64 bytes (512-bit BIP39 seed)
 *
 *   Algorithm:
 *     BIP-39 seed generation:
 *     1. Normalize mnemonic (NFKD Unicode normalization)
 *     2. Use PBKDF2-HMAC-SHA512 with:
 *        - Password: mnemonic phrase
 *        - Salt: "mnemonic" + passphrase (UTF-8)
 *        - Iterations: 2048
 *        - Output: 64 bytes (512 bits)
 *
 *   Error Conditions:
 *     - Invalid mnemonic → throw Error "Invalid mnemonic phrase"
 */
export function mnemonicToSeed(mnemonic: string, passphrase: string = ''): Uint8Array {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }
  return mnemonicToSeedSync(mnemonic, passphrase);
}

// ============================================================================
// CONTRACT: seedToHex
// ============================================================================

/**
 * Converts a seed (Uint8Array) to hex string
 *
 * CONTRACT:
 *   Inputs:
 *     - seed: Uint8Array, typically 64 bytes
 *
 *   Outputs:
 *     - hexString: lowercase hex string (128 chars for 64-byte seed)
 */
export function seedToHex(seed: Uint8Array): string {
  return Array.from(seed)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// CONTRACT: hexToSeed
// ============================================================================

/**
 * Converts a hex string back to Uint8Array seed
 *
 * CONTRACT:
 *   Inputs:
 *     - hexString: string, hex-encoded seed (128 chars for 64-byte seed)
 *       Constraints: even length, valid hex characters
 *
 *   Outputs:
 *     - seed: Uint8Array
 *
 *   Error Conditions:
 *     - Odd length string → throw Error "Invalid hex string length"
 *     - Invalid hex characters → throw Error "Invalid hex character"
 */
export function hexToSeed(hexString: string): Uint8Array {
  if (hexString.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    const byte = parseInt(hexString.substr(i, 2), 16);
    if (isNaN(byte)) {
      throw new Error('Invalid hex character');
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

// ============================================================================
// CONTRACT: validateDerivationPath
// ============================================================================

/**
 * Validates a BIP-32 derivation path
 *
 * CONTRACT:
 *   Inputs:
 *     - path: string, BIP-32 derivation path
 *       Example: "m/44'/1237'/0'/0/0"
 *
 *   Outputs:
 *     - valid: boolean, true if path is valid BIP-32 format
 *
 *   Properties:
 *     - Must start with "m/"
 *     - Path components are numbers optionally followed by ' for hardened
 *     - Non-throwing: always returns boolean
 */
export function validateDerivationPath(path: string): boolean {
  if (!path || typeof path !== 'string') {
    return false;
  }
  // BIP-32 path format: m/number'/number'/number'/number/number
  const pathRegex = /^m(\/\d+'?)+$/;
  return pathRegex.test(path);
}

// ============================================================================
// CONTRACT: deriveKeypairFromSeed
// ============================================================================

/**
 * Derives a Nostr keypair from a 64-byte seed using BIP-32 HD derivation
 *
 * CONTRACT:
 *   Inputs:
 *     - seedHex: string, hex-encoded 64-byte seed (128 hex characters)
 *       Example: "000102030405..." (128 chars)
 *     - derivationPath: string (optional), BIP-32 derivation path
 *       Default: "m/44'/1237'/0'/0/0" (NIP-06 standard)
 *       Example: "m/44'/1237'/1'/0/0" (account index 1)
 *
 *   Outputs:
 *     - derivation: SeedKeypairDerivation object
 *
 *   Algorithm:
 *     BIP-32 HD derivation:
 *     1. Convert hex seed to Uint8Array
 *     2. Create HD master key from seed
 *     3. Derive child key at specified path
 *     4. Extract 32-byte private key from derived key
 *     5. Derive public key using secp256k1
 *     6. Encode as nsec/npub
 *
 *   Error Conditions:
 *     - Invalid seed hex → throw Error "Invalid seed: must be 128 hex characters"
 *     - Invalid derivation path → throw Error "Invalid derivation path"
 *     - Derivation produces null private key → throw Error "Derivation failed"
 */
export function deriveKeypairFromSeed(
  seedHex: string,
  derivationPath: string = DEFAULT_DERIVATION_PATH
): SeedKeypairDerivation {
  // Validate seed
  if (!seedHex || seedHex.length !== 128) {
    throw new Error('Invalid seed: must be 128 hex characters');
  }

  // Validate path
  if (!validateDerivationPath(derivationPath)) {
    throw new Error('Invalid derivation path');
  }

  // Convert hex to bytes
  const seed = hexToSeed(seedHex);

  // Create HD master key and derive
  const masterKey = HDKey.fromMasterSeed(seed);
  const derivedKey = masterKey.derive(derivationPath);

  if (!derivedKey.privateKey) {
    throw new Error('Derivation failed: no private key produced');
  }

  const secretKey = derivedKey.privateKey;
  const pubkeyHex = getPublicKey(secretKey);
  const nsec = nip19.nsecEncode(secretKey);
  const npub = nip19.npubEncode(pubkeyHex);

  return {
    seedHex,
    nsec,
    npub,
    pubkeyHex,
    secretKey,
    derivationPath,
  };
}
