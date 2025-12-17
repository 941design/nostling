import fs from 'fs';
import path from 'path';
import { safeStorage } from 'electron';
import { randomUUID } from 'crypto';
import { log } from '../logging';
import { getUserDataPath } from '../paths';

/**
 * Custom error thrown when decryption of an existing secret fails.
 * This occurs when:
 * - Keychain/keyring was lost or reset
 * - App was migrated to different machine
 * - Encryption backend changed
 *
 * Recovery: User must re-enter their nsec to recreate the identity.
 */
export class SecretDecryptionError extends Error {
  name = 'SecretDecryptionError';

  constructor(message: string, cause?: Error) {
    super(message);
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Custom error thrown when secure storage is unavailable for new secrets.
 * This occurs when:
 * - Electron safeStorage.isEncryptionAvailable() returns false
 * - On Linux: safeStorage backend is 'basic_text' (plaintext)
 *
 * Recovery: User should use external secrets manager (e.g., gopass, 1Password).
 */
export class SecureStorageUnavailableError extends Error {
  name = 'SecureStorageUnavailableError';

  constructor(message: string) {
    super(message);
  }
}

export type SecretStoreKind = 'local' | 'external';

export interface NostlingSecretStore {
  kind: SecretStoreKind;
  getSecret(ref: string): Promise<string | null>;
  saveSecret(secret: string, ref?: string): Promise<string>;
  deleteSecret(ref: string): Promise<void>;
  listSecretRefs(): Promise<string[]>;
}

export interface SecretStoreOptions {
  /**
   * Optional external provider implementation. When supplied, no secrets are
   * persisted locally and the reference returned from saveSecret should be
   * treated as opaque.
   */
  externalProvider?: NostlingSecretStore;
  /**
   * Override location for the local store payload. Primarily used for tests.
   */
  storagePath?: string;
}

interface LocalSecretPayload {
  refs: Record<string, string>;
}

class LocalSecretStore implements NostlingSecretStore {
  public readonly kind: SecretStoreKind = 'local';
  private readonly storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(getUserDataPath(), 'nostling-secrets.json');
  }

  async getSecret(ref: string): Promise<string | null> {
    const payload = this.readPayload();
    const encoded = payload.refs[ref];
    if (!encoded) {
      return null;
    }
    return this.decode(encoded);
  }

  async saveSecret(secret: string, ref?: string): Promise<string> {
    const targetRef = ref || this.generateRef();
    const payload = this.readPayload();
    payload.refs[targetRef] = this.encode(secret);
    this.persist(payload);
    return targetRef;
  }

  async deleteSecret(ref: string): Promise<void> {
    const payload = this.readPayload();
    if (payload.refs[ref]) {
      delete payload.refs[ref];
      this.persist(payload);
    }
  }

  async listSecretRefs(): Promise<string[]> {
    const payload = this.readPayload();
    return Object.keys(payload.refs);
  }

  private generateRef(): string {
    return `nostr-secret:${randomUUID()}`;
  }

  /**
   * IMPLEMENTATION CONTRACT: encode(secret: string): string
   *
   * Inputs:
   *   - secret: string, non-empty UTF-8 text (typically nsec key)
   *
   * Outputs:
   *   - encoded: base64 string representing encrypted secret
   *
   * Invariants:
   *   - MUST use safeStorage.encryptString when encryption available
   *   - MUST throw SecureStorageUnavailableError when encryption unavailable
   *   - MUST NOT store plaintext secrets under any circumstance
   *   - MUST check platform-specific insecure backends (Linux: basic_text)
   *
   * Properties:
   *   - Security: output is always encrypted, never plaintext
   *   - Deterministic check: isEncryptionAvailable() status determines success/failure
   *   - Platform-specific: on Linux, additionally reject basic_text backend
   *   - Fail-fast: throw immediately if secure storage unavailable
   *
   * Algorithm:
   *   1. Check if safeStorage.isEncryptionAvailable() returns false
   *      → throw SecureStorageUnavailableError with message recommending external secrets manager
   *   2. On Linux platform, additionally check safeStorage.getSelectedStorageBackend()
   *      → if returns 'basic_text', throw SecureStorageUnavailableError
   *   3. Encrypt using safeStorage.encryptString(secret)
   *   4. Convert encrypted Buffer to base64 string
   *   5. Return base64-encoded encrypted string
   *
   * Error messages:
   *   - General unavailable: "Secure storage is unavailable. Cannot store secrets securely. Consider using an external secrets manager like gopass or 1Password."
   *   - Linux basic_text: "Linux secure storage backend is 'basic_text' (plaintext). Cannot store secrets securely. Please configure a secure keyring (gnome-keyring, kwallet) or use an external secrets manager."
   *
   * NO LONGER:
   *   - ✗ Check process.env.NOSTLING_DATA_DIR (dev mode)
   *   - ✗ Fall back to plaintext base64 encoding
   *   - ✗ Log warnings and continue with insecure storage
   */
  private encode(secret: string): string {
    const isAvailable = safeStorage.isEncryptionAvailable();

    if (!isAvailable) {
      throw new SecureStorageUnavailableError(
        'Secure storage is not available. Your system does not have a secure keychain configured. ' +
          'Consider using an external secrets manager like gopass, or set up a system keychain ' +
          '(Keychain on macOS, Secret Service on Linux, Credential Manager on Windows).'
      );
    }

    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend();
      if (backend === 'basic_text') {
        throw new SecureStorageUnavailableError(
          'Secure storage is not available. Your system does not have a secure keychain configured. ' +
            'Consider using an external secrets manager like gopass, or set up a system keychain ' +
            '(Keychain on macOS, Secret Service on Linux, Credential Manager on Windows).'
        );
      }
    }

    const encrypted = safeStorage.encryptString(secret);
    return encrypted.toString('base64');
  }

  /**
   * IMPLEMENTATION CONTRACT: decode(encoded: string): string
   *
   * Inputs:
   *   - encoded: base64 string representing encrypted secret
   *
   * Outputs:
   *   - secret: decrypted UTF-8 string (original secret)
   *
   * Invariants:
   *   - MUST use safeStorage.decryptString for all decryption
   *   - MUST throw SecretDecryptionError when decryption fails
   *   - MUST NOT fall back to UTF-8 decoding under any circumstance
   *   - Error message MUST explain recovery action (re-enter nsec)
   *
   * Properties:
   *   - Security: never attempts plaintext interpretation of encrypted data
   *   - Fail-fast: throw immediately on decryption failure
   *   - Cause preservation: original error attached as { cause }
   *   - Round-trip: decode(encode(secret)) equals secret (when keychain stable)
   *
   * Algorithm:
   *   1. Convert base64 encoded string to Buffer
   *   2. Attempt to decrypt using safeStorage.decryptString(buffer)
   *   3. If decryption succeeds, return decrypted string
   *   4. If decryption throws:
   *      a. Wrap original error in SecretDecryptionError
   *      b. Include user-actionable message explaining cause
   *      c. Preserve original error as { cause }
   *      d. Throw SecretDecryptionError
   *
   * Error message:
   *   "Failed to decrypt secret. This typically occurs when the system keychain was reset or the app was moved to a different machine. Please delete this identity and recreate it by re-entering your nsec."
   *
   * NO LONGER:
   *   - ✗ Check process.env.NOSTLING_DATA_DIR (dev mode)
   *   - ✗ Fall back to buffer.toString('utf8') on decryption failure
   *   - ✗ Log error and continue with garbage data
   *   - ✗ Try-catch with silent fallback
   */
  private decode(encoded: string): string {
    try {
      const buffer = Buffer.from(encoded, 'base64');
      return safeStorage.decryptString(buffer);
    } catch (error) {
      throw new SecretDecryptionError(
        'Failed to decrypt secret. This usually means your system keychain has changed or been reset. ' +
          'To recover: delete the corrupted identity and re-enter your nsec.',
        error instanceof Error ? error : undefined
      );
    }
  }

  private readPayload(): LocalSecretPayload {
    try {
      const raw = fs.readFileSync(this.storagePath, 'utf8');
      const parsed = JSON.parse(raw) as LocalSecretPayload;
      if (!parsed?.refs || typeof parsed.refs !== 'object') {
        return { refs: {} };
      }
      return { refs: parsed.refs };
    } catch {
      return { refs: {} };
    }
  }

  private persist(payload: LocalSecretPayload): void {
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
  }
}

/**
 * Factory to choose the active secret-store implementation.
 *
 * - If an external provider is supplied, it is returned directly and is
 *   expected to handle its own persistence. No secrets are written to the
 *   local filesystem in that mode.
 * - Otherwise, a local encrypted store backed by Electron safeStorage is used.
 */
export function createSecretStore(options: SecretStoreOptions = {}): NostlingSecretStore {
  if (options.externalProvider) {
    log('info', 'Using external nostling secret store provider');
    return options.externalProvider;
  }

  const storagePath = options.storagePath;
  return new LocalSecretStore(storagePath);
}

export { LocalSecretStore };
