/**
 * Unit tests for secret store functionality
 *
 * Bug report: bug-reports/identity-secret-loading-dev-mode-report.md
 *
 * Tests verify that secrets persist correctly in dev mode (NOSTLING_DATA_DIR set)
 * and use encrypted storage in production mode.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import fc from 'fast-check';

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp'),
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn().mockReturnValue(false),
    encryptString: jest.fn(),
    decryptString: jest.fn(),
    getSelectedStorageBackend: jest.fn().mockReturnValue('unknown'),
  },
}));

import { createSecretStore, LocalSecretStore, SecureStorageUnavailableError, SecretDecryptionError } from './secret-store';
import { safeStorage } from 'electron';

describe('SecretStore dev mode persistence', () => {
  let testDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Create temporary directory for test
    testDir = path.join(tmpdir(), `nostling-secret-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    // Save original env
    originalEnv = process.env.NOSTLING_DATA_DIR;

    // Mock encryption as available for integration tests
    (safeStorage.isEncryptionAvailable as jest.Mock).mockReturnValue(true);
    (safeStorage.encryptString as jest.Mock).mockImplementation((secret: unknown) => {
      // Simple deterministic encryption for testing
      return Buffer.from(`encrypted:${secret}`);
    });
    (safeStorage.decryptString as jest.Mock).mockImplementation((buffer: unknown) => {
      const str = (buffer as Buffer).toString();
      if (str.startsWith('encrypted:')) {
        return str.slice('encrypted:'.length);
      }
      throw new Error('Failed to decrypt');
    });
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Restore env
    if (originalEnv) {
      process.env.NOSTLING_DATA_DIR = originalEnv;
    } else {
      delete process.env.NOSTLING_DATA_DIR;
    }

    jest.clearAllMocks();
  });

  it('should persist secrets across store instances in dev mode', async () => {
    // Set dev mode environment
    process.env.NOSTLING_DATA_DIR = testDir;

    const storagePath = path.join(testDir, 'nostling-secrets.json');

    // First store instance: save a secret
    const store1 = new LocalSecretStore(storagePath);
    const testSecret = 'nsec1test12345678901234567890123456789012345678901234567890';
    const ref = await store1.saveSecret(testSecret);

    expect(ref).toMatch(/^nostr-secret:/);

    // Second store instance (simulates app restart): retrieve the secret
    const store2 = new LocalSecretStore(storagePath);
    const retrieved = await store2.getSecret(ref);

    // BUG FIX verification: Secret should be retrievable after "restart"
    expect(retrieved).toBe(testSecret);
  });

  it('should handle multiple secrets in dev mode', async () => {
    process.env.NOSTLING_DATA_DIR = testDir;

    const storagePath = path.join(testDir, 'nostling-secrets.json');
    const store = new LocalSecretStore(storagePath);

    const secret1 = 'nsec1aaa';
    const secret2 = 'nsec1bbb';
    const secret3 = 'nsec1ccc';

    const ref1 = await store.saveSecret(secret1);
    const ref2 = await store.saveSecret(secret2);
    const ref3 = await store.saveSecret(secret3);

    // All refs should be different
    expect(new Set([ref1, ref2, ref3]).size).toBe(3);

    // All secrets should be retrievable
    expect(await store.getSecret(ref1)).toBe(secret1);
    expect(await store.getSecret(ref2)).toBe(secret2);
    expect(await store.getSecret(ref3)).toBe(secret3);

    // After "restart", all should still work
    const store2 = new LocalSecretStore(storagePath);
    expect(await store2.getSecret(ref1)).toBe(secret1);
    expect(await store2.getSecret(ref2)).toBe(secret2);
    expect(await store2.getSecret(ref3)).toBe(secret3);
  });

  it('should delete secrets correctly in dev mode', async () => {
    process.env.NOSTLING_DATA_DIR = testDir;

    const storagePath = path.join(testDir, 'nostling-secrets.json');
    const store = new LocalSecretStore(storagePath);

    const secret = 'nsec1test';
    const ref = await store.saveSecret(secret);

    expect(await store.getSecret(ref)).toBe(secret);

    await store.deleteSecret(ref);

    expect(await store.getSecret(ref)).toBeNull();
  });

  it('should list secret refs correctly', async () => {
    process.env.NOSTLING_DATA_DIR = testDir;

    const storagePath = path.join(testDir, 'nostling-secrets.json');
    const store = new LocalSecretStore(storagePath);

    expect(await store.listSecretRefs()).toEqual([]);

    const ref1 = await store.saveSecret('nsec1aaa');
    const ref2 = await store.saveSecret('nsec1bbb');

    const refs = await store.listSecretRefs();
    expect(refs.sort()).toEqual([ref1, ref2].sort());
  });

  it('should return null for non-existent refs', async () => {
    process.env.NOSTLING_DATA_DIR = testDir;

    const storagePath = path.join(testDir, 'nostling-secrets.json');
    const store = new LocalSecretStore(storagePath);

    expect(await store.getSecret('nostr-secret:nonexistent')).toBeNull();
  });
});

describe('LocalSecretStore.encode() - Property-Based Tests', () => {
  let testDir: string;
  let originalPlatform: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `nostling-pbt-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')?.value || 'darwin';
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    jest.clearAllMocks();
  });

  describe('Property: encode() throws when encryption unavailable', () => {
    it('should throw SecureStorageUnavailableError when isEncryptionAvailable() returns false', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);

      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (secret) => {
          expect(() => {
            // Access private method for testing purposes
            (store as any).encode(secret);
          }).toThrow(SecureStorageUnavailableError);
        })
      );

      jest.restoreAllMocks();
    });

    it('should include user-actionable error message', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(false);

      try {
        (store as any).encode('test-secret');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecureStorageUnavailableError);
        expect((error as Error).message).toContain('external secrets manager');
        expect((error as Error).message).toContain('gopass');
      }

      jest.restoreAllMocks();
    });
  });

  describe('Property: encode() on Linux throws when backend is basic_text', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });

    it('should throw SecureStorageUnavailableError when backend is basic_text', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);
      jest.spyOn(safeStorage, 'getSelectedStorageBackend').mockReturnValue('basic_text');

      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (secret) => {
          expect(() => {
            (store as any).encode(secret);
          }).toThrow(SecureStorageUnavailableError);
        })
      );

      jest.restoreAllMocks();
    });

    it('should not throw when backend is not basic_text on Linux', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);
      jest.spyOn(safeStorage, 'getSelectedStorageBackend').mockReturnValue('gnome_libsecret');

      const testSecret = Buffer.from('encrypted-test-data');
      jest
        .spyOn(safeStorage, 'encryptString')
        .mockReturnValue(testSecret);

      const result = (store as any).encode('test-secret');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');

      jest.restoreAllMocks();
    });
  });

  describe('Property: encode() never returns plaintext', () => {
    it('should never return plaintext for any input when encryption available', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);

      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (secret) => {
          const testSecret = Buffer.from('encrypted-binary-data');
          jest
            .spyOn(safeStorage, 'encryptString')
            .mockReturnValue(testSecret);

          const encoded = (store as any).encode(secret);

          // Result should not equal original secret
          expect(encoded).not.toBe(secret);

          // Result should be base64-encoded
          const decoded = Buffer.from(encoded, 'base64');
          expect(decoded.toString()).not.toBe(secret);

          jest.restoreAllMocks();
        })
      );
    });

    it('should return different encoded values for different secrets', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);

      fc.assert(
        fc.property(
          fc.tuple(fc.string({ minLength: 1 }), fc.string({ minLength: 1 })),
          ([secret1, secret2]) => {
            fc.pre(secret1 !== secret2);

            let callCount = 0;
            jest.spyOn(safeStorage, 'encryptString').mockImplementation((s) => {
              callCount++;
              return Buffer.from(`encrypted-${s}-${callCount}`);
            });

            const encoded1 = (store as any).encode(secret1);
            const encoded2 = (store as any).encode(secret2);

            expect(encoded1).not.toBe(encoded2);

            jest.restoreAllMocks();
          }
        )
      );
    });
  });

  describe('Property: encode() returns valid base64 when successful', () => {
    it('should return valid base64-encoded encrypted data', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);

      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (secret) => {
          const testEncryptedData = Buffer.from(`encrypted:${secret}`);
          jest
            .spyOn(safeStorage, 'encryptString')
            .mockReturnValue(testEncryptedData);

          const encoded = (store as any).encode(secret);

          // Should be valid base64
          expect(() => {
            Buffer.from(encoded, 'base64');
          }).not.toThrow();

          // Decoding should produce the original encrypted bytes
          const decoded = Buffer.from(encoded, 'base64');
          expect(decoded.toString()).toBe(testEncryptedData.toString());

          jest.restoreAllMocks();
        })
      );
    });

    it('should use safeStorage.encryptString for encryption', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);
      const encryptMock = jest
        .spyOn(safeStorage, 'encryptString')
        .mockReturnValue(Buffer.from('test-encrypted'));

      (store as any).encode('test-secret');

      expect(encryptMock).toHaveBeenCalledWith('test-secret');
      expect(encryptMock).toHaveBeenCalledTimes(1);

      jest.restoreAllMocks();
    });
  });

  describe('Property: encode() respects platform-specific requirements', () => {
    it('should skip Linux backend check on non-Linux platforms', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);
      const backendMock = jest.spyOn(safeStorage, 'getSelectedStorageBackend');

      const testSecret = Buffer.from('encrypted');
      jest
        .spyOn(safeStorage, 'encryptString')
        .mockReturnValue(testSecret);

      (store as any).encode('test-secret');

      // Should not check backend on non-Linux
      expect(backendMock).not.toHaveBeenCalled();

      jest.restoreAllMocks();
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
        configurable: true,
      });
    });
  });
});

describe('LocalSecretStore.decode() - Property-Based Tests', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(tmpdir(), `nostling-decode-pbt-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe('Property: decode() throws SecretDecryptionError when decryption fails', () => {
    it('should throw SecretDecryptionError on decryption failure', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      const decryptError = new Error('Decryption failed: corrupted data');
      jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
        throw decryptError;
      });

      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (encoded) => {
          expect(() => {
            (store as any).decode(encoded);
          }).toThrow(SecretDecryptionError);
        })
      );
    });

    it('should include user-actionable error message', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      try {
        (store as any).decode(Buffer.from('test').toString('base64'));
        fail('Should have thrown SecretDecryptionError');
      } catch (error) {
        expect(error).toBeInstanceOf(SecretDecryptionError);
        expect((error as Error).message).toContain('system keychain');
        expect((error as Error).message).toContain('re-enter');
        expect((error as Error).message).toContain('nsec');
      }
    });

    it('should preserve original error as cause', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      const originalError = new Error('Original decryption error');
      jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
        throw originalError;
      });

      try {
        (store as any).decode(Buffer.from('test').toString('base64'));
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SecretDecryptionError);
        expect((error as Error).cause).toBe(originalError);
      }
    });
  });

  describe('Property: decode() never falls back to UTF-8 decoding', () => {
    it('should never interpret encrypted data as plaintext UTF-8', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      fc.assert(
        fc.property(fc.uint8Array({ minLength: 1 }), (data) => {
          const encoded = Buffer.from(data).toString('base64');

          expect(() => {
            (store as any).decode(encoded);
          }).toThrow(SecretDecryptionError);
        })
      );
    });
  });

  describe('Property: decode() round-trip with encode()', () => {
    it('should successfully decrypt valid encrypted data', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (secret) => {
          jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);

          const encryptedBuffer = Buffer.from(`encrypted:${secret}`);
          jest
            .spyOn(safeStorage, 'encryptString')
            .mockReturnValue(encryptedBuffer);
          jest
            .spyOn(safeStorage, 'decryptString')
            .mockReturnValue(secret);

          const encoded = (store as any).encode(secret);
          expect(typeof encoded).toBe('string');

          const decoded = (store as any).decode(encoded);
          expect(decoded).toBe(secret);

          jest.restoreAllMocks();
        })
      );
    });
  });

  describe('Property: decode() fails on tampered data', () => {
    it('should throw when decryption fails due to tampered/invalid data', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      let callCount = 0;
      jest.spyOn(safeStorage, 'decryptString').mockImplementation((buffer) => {
        callCount++;
        throw new Error(`Failed to decrypt: Invalid data at byte ${callCount}`);
      });

      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (encodedSecret) => {
          expect(() => {
            (store as any).decode(encodedSecret);
          }).toThrow(SecretDecryptionError);
        })
      );
    });
  });

  describe('Property: decode() uses safeStorage.decryptString', () => {
    it('should pass base64-decoded buffer to safeStorage.decryptString', () => {
      jest.clearAllMocks();

      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      const mockDecrypt = jest
        .spyOn(safeStorage, 'decryptString')
        .mockImplementation((buffer) => {
          expect(Buffer.isBuffer(buffer)).toBe(true);
          return 'decrypted-secret';
        });

      const testSecret = 'test-secret-data';
      const encoded = Buffer.from(testSecret).toString('base64');

      const result = (store as any).decode(encoded);

      expect(mockDecrypt).toHaveBeenCalled();
      expect(result).toBe('decrypted-secret');
    });
  });

  describe('Property: decode() does not check environment variables', () => {
    it('should not use NOSTLING_DATA_DIR or any env checks for decoding', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      process.env.NOSTLING_DATA_DIR = testDir;

      jest.spyOn(safeStorage, 'decryptString').mockReturnValue('decrypted');

      const encoded = Buffer.from('test').toString('base64');
      const result = (store as any).decode(encoded);

      expect(result).toBe('decrypted');

      delete process.env.NOSTLING_DATA_DIR;

      jest.spyOn(safeStorage, 'decryptString').mockReturnValue('decrypted-again');
      const result2 = (store as any).decode(encoded);

      expect(result2).toBe('decrypted-again');
    });
  });

  describe('Example-based tests: decode() critical cases', () => {
    it('should decrypt a successfully encrypted secret', async () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      const testSecret = 'nsec1test12345678901234567890123456789012345678901234567890';

      jest.spyOn(safeStorage, 'isEncryptionAvailable').mockReturnValue(true);

      const encryptedBuffer = Buffer.from(`encrypted:${testSecret}`);
      jest
        .spyOn(safeStorage, 'encryptString')
        .mockReturnValue(encryptedBuffer);
      jest
        .spyOn(safeStorage, 'decryptString')
        .mockReturnValue(testSecret);

      const ref = await store.saveSecret(testSecret);
      const retrieved = await store.getSecret(ref);

      expect(retrieved).toBe(testSecret);
    });

    it('should fail gracefully on keychain reset with clear error', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      const keychainError = new Error('Keychain is locked');
      jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
        throw keychainError;
      });

      expect(() => {
        (store as any).decode(Buffer.from('corrupted-secret').toString('base64'));
      }).toThrow(SecretDecryptionError);

      try {
        (store as any).decode(Buffer.from('corrupted-secret').toString('base64'));
      } catch (error) {
        expect((error as SecretDecryptionError).cause).toBe(keychainError);
        expect((error as Error).message).toContain('keychain');
        expect((error as Error).message).toContain('nsec');
      }
    });

    it('should never return garbage data on decryption failure', () => {
      const storagePath = path.join(testDir, 'secrets.json');
      const store = new LocalSecretStore(storagePath);

      jest.spyOn(safeStorage, 'decryptString').mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const garbageInput = Buffer.from('garbage-binary-data').toString('base64');

      let errorThrown = false;
      let result: string | null = null;

      try {
        result = (store as any).decode(garbageInput);
      } catch (error) {
        errorThrown = true;
        expect(error).toBeInstanceOf(SecretDecryptionError);
      }

      expect(errorThrown).toBe(true);
      expect(result).toBeNull();
    });
  });
});
