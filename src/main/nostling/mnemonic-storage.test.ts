/**
 * Unit tests for seed storage functionality
 *
 * Tests verify that seeds are correctly persisted, retrieved, and deleted
 * through the secret store abstraction layer, with proper encryption handling.
 *
 * Note: Seeds are 64-byte values stored as 128-character hex strings.
 * This follows BIP-39 seed derivation from mnemonic phrases.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fc from 'fast-check';
import {
  getSeedRef,
  getMnemonicRef,
  validateSeedHex,
  saveSeed,
  getSeed,
  deleteSeed,
  hasSeed,
  // Legacy aliases
  saveMnemonic,
  getMnemonic,
  deleteMnemonic,
  hasMnemonic,
} from './mnemonic-storage';
import type { NostlingSecretStore } from './secret-store';
import { generateMnemonic, mnemonicToSeed, seedToHex } from './mnemonic-crypto';

// Helper to generate valid seed hex
function generateSeedHex(): string {
  const mnemonic = generateMnemonic();
  const seed = mnemonicToSeed(mnemonic);
  return seedToHex(seed);
}

describe('mnemonic-storage (seed-based)', () => {
  let mockStore: jest.Mocked<NostlingSecretStore>;

  beforeEach(() => {
    mockStore = {
      kind: 'local',
      getSecret: jest.fn(),
      saveSecret: jest.fn(),
      deleteSecret: jest.fn(),
      listSecretRefs: jest.fn(),
    };
  });

  // ============================================================================
  // getSeedRef() - Function Contract Tests
  // ============================================================================

  describe('getSeedRef()', () => {
    describe('Property: generates correct reference format', () => {
      it('should always prefix output with "nostr-seed:"', () => {
        fc.assert(
          fc.property(fc.uuid(), (identityId) => {
            const ref = getSeedRef(identityId);
            expect(ref).toMatch(/^nostr-seed:/);
          })
        );
      });

      it('should include full identityId after prefix', () => {
        fc.assert(
          fc.property(fc.uuid(), (identityId) => {
            const ref = getSeedRef(identityId);
            expect(ref).toBe(`nostr-seed:${identityId}`);
          })
        );
      });
    });

    describe('Property: deterministic and unique', () => {
      it('should be deterministic: same input produces same output', () => {
        fc.assert(
          fc.property(fc.uuid(), (identityId) => {
            const ref1 = getSeedRef(identityId);
            const ref2 = getSeedRef(identityId);
            expect(ref1).toBe(ref2);
          })
        );
      });

      it('should be unique: different inputs produce different outputs', () => {
        fc.assert(
          fc.property(
            fc.tuple(fc.uuid(), fc.uuid()),
            ([id1, id2]) => {
              fc.pre(id1 !== id2);
              const ref1 = getSeedRef(id1);
              const ref2 = getSeedRef(id2);
              expect(ref1).not.toBe(ref2);
            }
          )
        );
      });
    });

    it('Example: should generate correct ref for UUID', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const ref = getSeedRef(id);
      expect(ref).toBe('nostr-seed:550e8400-e29b-41d4-a716-446655440000');
    });
  });

  // ============================================================================
  // getMnemonicRef() - Legacy compatibility
  // ============================================================================

  describe('getMnemonicRef() - legacy', () => {
    it('should generate legacy mnemonic ref format', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const ref = getMnemonicRef(id);
      expect(ref).toBe('nostr-mnemonic:550e8400-e29b-41d4-a716-446655440000');
    });
  });

  // ============================================================================
  // validateSeedHex() - Function Contract Tests
  // ============================================================================

  describe('validateSeedHex()', () => {
    it('should return true for valid 128-char hex string', () => {
      const validSeed = 'a'.repeat(128);
      expect(validateSeedHex(validSeed)).toBe(true);
    });

    it('should return true for generated seed hex', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const seedHex = generateSeedHex();
          expect(validateSeedHex(seedHex)).toBe(true);
        }),
        { numRuns: 10 }
      );
    });

    it('should return false for non-128-char strings', () => {
      expect(validateSeedHex('a'.repeat(127))).toBe(false);
      expect(validateSeedHex('a'.repeat(129))).toBe(false);
      expect(validateSeedHex('')).toBe(false);
      expect(validateSeedHex('abc')).toBe(false);
    });

    it('should return false for non-hex characters', () => {
      expect(validateSeedHex('g'.repeat(128))).toBe(false);
      expect(validateSeedHex('z'.repeat(128))).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(validateSeedHex(null as unknown as string)).toBe(false);
      expect(validateSeedHex(undefined as unknown as string)).toBe(false);
    });

    it('should accept both lowercase and uppercase hex', () => {
      const lowerHex = 'abcdef0123456789'.repeat(8);
      const upperHex = 'ABCDEF0123456789'.repeat(8);
      expect(validateSeedHex(lowerHex)).toBe(true);
      expect(validateSeedHex(upperHex)).toBe(true);
    });
  });

  // ============================================================================
  // saveSeed() - Function Contract Tests
  // ============================================================================

  describe('saveSeed()', () => {
    describe('Property: validates seed before saving', () => {
      it('should throw for invalid seeds', async () => {
        const identityId = fc.sample(fc.uuid(), 1)[0];
        await expect(
          saveSeed(mockStore, identityId, 'invalid')
        ).rejects.toThrow('Invalid seed: must be 128 hex characters');
      });

      it('should throw for seeds with wrong length', async () => {
        const identityId = '550e8400-e29b-41d4-a716-446655440000';
        await expect(saveSeed(mockStore, identityId, 'a'.repeat(127)))
          .rejects.toThrow('Invalid seed: must be 128 hex characters');
      });
    });

    describe('Property: calls secret store with correct parameters', () => {
      it('should call saveSecret with seed and correct ref', async () => {
        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const validSeed = generateSeedHex();
            const expectedRef = getSeedRef(identityId);

            mockStore.saveSecret.mockResolvedValue(expectedRef);

            const result = await saveSeed(mockStore, identityId, validSeed);

            expect(mockStore.saveSecret).toHaveBeenCalledWith(validSeed, expectedRef);
            expect(result).toBe(expectedRef);
          })
        );
      });
    });

    describe('Property: round-trip save and retrieve', () => {
      it('should persist seed such that getSeed retrieves it', async () => {
        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const seed = generateSeedHex();
            const ref = getSeedRef(identityId);

            mockStore.saveSecret.mockResolvedValue(ref);
            mockStore.getSecret.mockResolvedValue(seed);

            await saveSeed(mockStore, identityId, seed);
            const retrieved = await getSeed(mockStore, identityId);

            expect(retrieved).toBe(seed);
          })
        );
      });
    });

    describe('Property: idempotent saves', () => {
      it('should safely overwrite when saving same seed twice', async () => {
        const identityId = fc.sample(fc.uuid(), 1)[0];
        const seed = generateSeedHex();
        const ref = getSeedRef(identityId);

        mockStore.saveSecret.mockResolvedValue(ref);

        await saveSeed(mockStore, identityId, seed);
        await saveSeed(mockStore, identityId, seed);

        expect(mockStore.saveSecret).toHaveBeenCalledTimes(2);
        expect(mockStore.saveSecret).toHaveBeenNthCalledWith(1, seed, ref);
        expect(mockStore.saveSecret).toHaveBeenNthCalledWith(2, seed, ref);
      });
    });

    describe('Example: concrete seed save', () => {
      it('should correctly save a valid seed hex', async () => {
        const identityId = '550e8400-e29b-41d4-a716-446655440000';
        const seed = 'a'.repeat(128);
        const expectedRef = 'nostr-seed:550e8400-e29b-41d4-a716-446655440000';

        mockStore.saveSecret.mockResolvedValue(expectedRef);

        const result = await saveSeed(mockStore, identityId, seed);

        expect(mockStore.saveSecret).toHaveBeenCalledWith(seed, expectedRef);
        expect(result).toBe(expectedRef);
      });
    });
  });

  // ============================================================================
  // getSeed() - Function Contract Tests
  // ============================================================================

  describe('getSeed()', () => {
    describe('Property: returns null for missing seeds', () => {
      it('should return null when secret store returns null', async () => {
        mockStore.getSecret.mockResolvedValue(null);

        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const result = await getSeed(mockStore, identityId);
            expect(result).toBeNull();
          })
        );
      });
    });

    describe('Property: returns stored seed value', () => {
      it('should return seed string when secret store has it', async () => {
        const seed = generateSeedHex();
        mockStore.getSecret.mockResolvedValue(seed);

        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const result = await getSeed(mockStore, identityId);
            expect(result).toBe(seed);
          })
        );
      });
    });

    describe('Property: uses correct reference key', () => {
      it('should call getSecret with seed ref', async () => {
        mockStore.getSecret.mockResolvedValue(null);

        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const expectedRef = getSeedRef(identityId);
            await getSeed(mockStore, identityId);
            expect(mockStore.getSecret).toHaveBeenCalledWith(expectedRef);
          })
        );
      });
    });

    describe('Example: retrieve saved seed', () => {
      it('should retrieve the exact seed that was saved', async () => {
        const seed = 'abcd'.repeat(32);
        mockStore.getSecret.mockResolvedValue(seed);

        const result = await getSeed(mockStore, '550e8400-e29b-41d4-a716-446655440000');

        expect(result).toBe(seed);
      });
    });
  });

  // ============================================================================
  // deleteSeed() - Function Contract Tests
  // ============================================================================

  describe('deleteSeed()', () => {
    describe('Property: deletes using correct reference', () => {
      it('should call deleteSecret with seed ref', async () => {
        mockStore.deleteSecret.mockResolvedValue(undefined);

        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const expectedRef = getSeedRef(identityId);
            await deleteSeed(mockStore, identityId);
            expect(mockStore.deleteSecret).toHaveBeenCalledWith(expectedRef);
          })
        );
      });
    });

    describe('Property: leaves seed inaccessible after deletion', () => {
      it('should result in getSeed returning null after deletion', async () => {
        const identityId = fc.sample(fc.uuid(), 1)[0];
        const seed = generateSeedHex();
        const ref = getSeedRef(identityId);

        mockStore.saveSecret.mockResolvedValue(ref);
        mockStore.getSecret.mockResolvedValueOnce(seed);

        await saveSeed(mockStore, identityId, seed);
        const savedResult = await getSeed(mockStore, identityId);
        expect(savedResult).toBe(seed);

        mockStore.deleteSecret.mockResolvedValue(undefined);
        mockStore.getSecret.mockResolvedValueOnce(null);

        await deleteSeed(mockStore, identityId);
        const deletedResult = await getSeed(mockStore, identityId);

        expect(deletedResult).toBeNull();
      });
    });

    describe('Property: idempotent deletion', () => {
      it('should safely delete non-existent seeds (no-op)', async () => {
        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            mockStore.deleteSecret.mockClear();
            mockStore.deleteSecret.mockResolvedValue(undefined);

            await deleteSeed(mockStore, identityId);
            await deleteSeed(mockStore, identityId);

            const ref = getSeedRef(identityId);
            expect(mockStore.deleteSecret).toHaveBeenCalledWith(ref);
            expect(mockStore.deleteSecret).toHaveBeenCalledTimes(2);
          })
        );
      });
    });

    describe('Example: delete existing seed', () => {
      it('should properly delete a stored seed', async () => {
        const identityId = '550e8400-e29b-41d4-a716-446655440000';
        const expectedRef = 'nostr-seed:550e8400-e29b-41d4-a716-446655440000';

        mockStore.deleteSecret.mockResolvedValue(undefined);

        await deleteSeed(mockStore, identityId);

        expect(mockStore.deleteSecret).toHaveBeenCalledWith(expectedRef);
      });
    });
  });

  // ============================================================================
  // hasSeed() - Function Contract Tests
  // ============================================================================

  describe('hasSeed()', () => {
    describe('Property: returns true iff seed exists', () => {
      it('should return true when getSeed returns non-null', async () => {
        const seed = generateSeedHex();
        mockStore.getSecret.mockResolvedValue(seed);

        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const result = await hasSeed(mockStore, identityId);
            expect(result).toBe(true);
          })
        );
      });

      it('should return false when getSeed returns null', async () => {
        mockStore.getSecret.mockResolvedValue(null);

        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const result = await hasSeed(mockStore, identityId);
            expect(result).toBe(false);
          })
        );
      });
    });

    describe('Property: consistency with getSeed', () => {
      it('should return true after successful save', async () => {
        const identityId = fc.sample(fc.uuid(), 1)[0];
        const seed = generateSeedHex();
        const ref = getSeedRef(identityId);

        mockStore.saveSecret.mockResolvedValue(ref);
        mockStore.getSecret.mockResolvedValue(seed);

        await saveSeed(mockStore, identityId, seed);
        const result = await hasSeed(mockStore, identityId);

        expect(result).toBe(true);
      });

      it('should return false after deletion', async () => {
        const identityId = fc.sample(fc.uuid(), 1)[0];
        const ref = getSeedRef(identityId);

        mockStore.deleteSecret.mockResolvedValue(undefined);
        mockStore.getSecret.mockResolvedValue(null);

        await deleteSeed(mockStore, identityId);
        const result = await hasSeed(mockStore, identityId);

        expect(result).toBe(false);
      });
    });

    describe('Example: check for seed existence', () => {
      it('should return true for identity with stored seed', async () => {
        const seed = 'a'.repeat(128);
        mockStore.getSecret.mockResolvedValue(seed);

        const result = await hasSeed(mockStore, '550e8400-e29b-41d4-a716-446655440000');

        expect(result).toBe(true);
      });

      it('should return false for identity without seed', async () => {
        mockStore.getSecret.mockResolvedValue(null);

        const result = await hasSeed(mockStore, '550e8400-e29b-41d4-a716-446655440000');

        expect(result).toBe(false);
      });
    });
  });

  // ============================================================================
  // Legacy aliases
  // ============================================================================

  describe('Legacy compatibility aliases', () => {
    it('saveMnemonic should be alias for saveSeed', () => {
      expect(saveMnemonic).toBe(saveSeed);
    });

    it('getMnemonic should be alias for getSeed', () => {
      expect(getMnemonic).toBe(getSeed);
    });

    it('deleteMnemonic should be alias for deleteSeed', () => {
      expect(deleteMnemonic).toBe(deleteSeed);
    });

    it('hasMnemonic should be alias for hasSeed', () => {
      expect(hasMnemonic).toBe(hasSeed);
    });
  });

  // ============================================================================
  // Integration: Full workflow - Property-based
  // ============================================================================

  describe('Full workflow: save, retrieve, check, delete', () => {
    describe('Property: complete lifecycle preserves invariants', () => {
      it('should support full create-retrieve-delete cycle', async () => {
        await fc.assert(
          fc.asyncProperty(fc.uuid(), async (identityId) => {
            const seed = generateSeedHex();
            const ref = getSeedRef(identityId);

            mockStore.saveSecret.mockResolvedValueOnce(ref);
            mockStore.getSecret.mockResolvedValueOnce(seed);
            mockStore.getSecret.mockResolvedValueOnce(seed);
            mockStore.deleteSecret.mockResolvedValueOnce(undefined);
            mockStore.getSecret.mockResolvedValueOnce(null);

            const saveRef = await saveSeed(mockStore, identityId, seed);
            expect(saveRef).toBe(ref);

            const retrieved = await getSeed(mockStore, identityId);
            expect(retrieved).toBe(seed);

            const exists = await hasSeed(mockStore, identityId);
            expect(exists).toBe(true);

            await deleteSeed(mockStore, identityId);

            const afterDelete = await hasSeed(mockStore, identityId);
            expect(afterDelete).toBe(false);
          })
        );
      });
    });

    describe('Property: multiple identities are independent', () => {
      it('should handle multiple identities without interference', async () => {
        await fc.assert(
          fc.asyncProperty(
            fc.tuple(fc.uuid(), fc.uuid()),
            async ([id1, id2]) => {
              fc.pre(id1 !== id2);

              const seed1 = generateSeedHex();
              const seed2 = generateSeedHex();
              const ref1 = getSeedRef(id1);
              const ref2 = getSeedRef(id2);

              mockStore.saveSecret
                .mockResolvedValueOnce(ref1)
                .mockResolvedValueOnce(ref2);
              mockStore.getSecret.mockImplementation(async (ref) => {
                if (ref === ref1) return seed1;
                if (ref === ref2) return seed2;
                return null;
              });

              await saveSeed(mockStore, id1, seed1);
              await saveSeed(mockStore, id2, seed2);

              const retrieved1 = await getSeed(mockStore, id1);
              const retrieved2 = await getSeed(mockStore, id2);

              expect(retrieved1).toBe(seed1);
              expect(retrieved2).toBe(seed2);
              expect(retrieved1).not.toBe(retrieved2);
            }
          )
        );
      });
    });
  });

  // ============================================================================
  // Integration: Error propagation from secret store
  // ============================================================================

  describe('Error handling: propagates secret store errors', () => {
    it('should propagate SecureStorageUnavailableError from save', async () => {
      const identityId = '550e8400-e29b-41d4-a716-446655440000';
      const seed = generateSeedHex();
      const storageError = new Error('Secure storage unavailable');

      mockStore.saveSecret.mockRejectedValue(storageError);

      await expect(saveSeed(mockStore, identityId, seed)).rejects.toBe(
        storageError
      );
    });

    it('should propagate SecretDecryptionError from retrieve', async () => {
      const identityId = '550e8400-e29b-41d4-a716-446655440000';
      const decryptError = new Error('Decryption failed');

      mockStore.getSecret.mockRejectedValue(decryptError);

      await expect(getSeed(mockStore, identityId)).rejects.toBe(decryptError);
    });

    it('should propagate errors from delete', async () => {
      const identityId = '550e8400-e29b-41d4-a716-446655440000';
      const deleteError = new Error('Delete failed');

      mockStore.deleteSecret.mockRejectedValue(deleteError);

      await expect(deleteSeed(mockStore, identityId)).rejects.toBe(
        deleteError
      );
    });
  });
});
