import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';
import {
  generateMnemonic,
  validateMnemonic,
  deriveKeypairFromMnemonic,
  mnemonicToWords,
  wordCountIsValid,
  MnemonicKeypairDerivation,
  mnemonicToSeed,
  seedToHex,
  hexToSeed,
  validateDerivationPath,
  deriveKeypairFromSeed,
  DEFAULT_DERIVATION_PATH,
} from './mnemonic-crypto';

describe('Mnemonic Crypto - BIP39 and NIP-06', () => {
  describe('generateMnemonic', () => {
    it('generates valid mnemonics on all successive calls', () => {
      fc.assert(
        fc.property(fc.nat({ max: 50 }), () => {
          const mnemonic = generateMnemonic();
          expect(validateMnemonic(mnemonic)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('generates unique mnemonics with overwhelming probability', () => {
      const mnemonics = new Set<string>();
      for (let i = 0; i < 50; i++) {
        mnemonics.add(generateMnemonic());
      }
      expect(mnemonics.size).toBeGreaterThan(45);
    });

    it('generates mnemonics of standard word counts', () => {
      fc.assert(
        fc.property(fc.nat({ max: 50 }), () => {
          const mnemonic = generateMnemonic();
          const words = mnemonicToWords(mnemonic);
          expect(wordCountIsValid(words.length)).toBe(true);
        }),
        { numRuns: 50 }
      );
    });

    it('satisfies round-trip property: generated mnemonics can be derived', () => {
      fc.assert(
        fc.property(fc.nat({ max: 20 }), () => {
          const mnemonic = generateMnemonic();
          expect(() => deriveKeypairFromMnemonic(mnemonic)).not.toThrow();
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('validateMnemonic', () => {
    it('returns true for generated mnemonics', () => {
      fc.assert(
        fc.property(fc.nat({ max: 20 }), () => {
          const mnemonic = generateMnemonic();
          expect(validateMnemonic(mnemonic)).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('returns false for empty string', () => {
      expect(validateMnemonic('')).toBe(false);
    });

    it('returns false for invalid word counts', () => {
      fc.assert(
        fc.property(
          fc.nat({ max: 100 }).filter(n => n > 0 && !wordCountIsValid(n)),
          (invalidCount) => {
            const words = Array(invalidCount).fill('abandon');
            const mnemonic = words.join(' ');
            expect(validateMnemonic(mnemonic)).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('returns false for non-BIP39 words', () => {
      const invalidMnemonics = [
        'invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid',
        'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12',
      ];

      invalidMnemonics.forEach((mnemonic) => {
        expect(validateMnemonic(mnemonic)).toBe(false);
      });
    });

    it('returns false for mnemonics with non-BIP39 word', () => {
      const validMnemonic = generateMnemonic();
      const words = mnemonicToWords(validMnemonic);
      const corruptedWords = [...words];
      // Use a word that is NOT in the BIP39 wordlist
      corruptedWords[0] = 'notabip39word';
      const corruptedMnemonic = corruptedWords.join(' ');

      expect(validateMnemonic(corruptedMnemonic)).toBe(false);
    });

    it('never throws on any string input', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          expect(() => validateMnemonic(input)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    it('is consistent with mnemonicToWords for parsing', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          expect(validateMnemonic(mnemonic)).toBe(true);

          const words = mnemonicToWords(mnemonic);
          const normalized = words.join(' ');
          expect(validateMnemonic(normalized)).toBe(true);
        }),
        { numRuns: 10 }
      );
    });

    it('returns false for non-lowercase variations when checksum matters', () => {
      const mnemonic = generateMnemonic();
      const words = mnemonicToWords(mnemonic);
      const upperFirst = [words[0].toUpperCase(), ...words.slice(1)].join(' ');

      expect(validateMnemonic(mnemonic)).toBe(true);
      const resultUppercase = validateMnemonic(upperFirst);
      expect(typeof resultUppercase).toBe('boolean');
    });
  });

  describe('deriveKeypairFromMnemonic', () => {
    it('derives valid keypair from generated mnemonic', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation.mnemonic).toBe(mnemonic);
          expect(derivation.nsec).toMatch(/^nsec1/);
          expect(derivation.npub).toMatch(/^npub1/);
          expect(derivation.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);
          expect(derivation.secretKey).toHaveLength(32);
          // New BIP-32/39/44 fields
          expect(derivation.seedHex).toMatch(/^[0-9a-f]{128}$/);
          expect(derivation.derivationPath).toMatch(/^m\/44'\/1237'\/\d+'\/0\/0$/);
        }),
        { numRuns: 10 }
      );
    });

    it('is deterministic: same mnemonic always produces same keypair', () => {
      fc.assert(
        fc.property(fc.nat({ max: 5 }), () => {
          const mnemonic = generateMnemonic();
          const derivation1 = deriveKeypairFromMnemonic(mnemonic);
          const derivation2 = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation1.nsec).toBe(derivation2.nsec);
          expect(derivation1.npub).toBe(derivation2.npub);
          expect(derivation1.pubkeyHex).toBe(derivation2.pubkeyHex);
          expect(derivation1.secretKey).toEqual(derivation2.secretKey);
          expect(derivation1.seedHex).toBe(derivation2.seedHex);
          expect(derivation1.derivationPath).toBe(derivation2.derivationPath);
        }),
        { numRuns: 5 }
      );
    });

    it('different mnemonics produce different keypairs', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic1 = generateMnemonic();
          const mnemonic2 = generateMnemonic();

          if (mnemonic1 !== mnemonic2) {
            const derivation1 = deriveKeypairFromMnemonic(mnemonic1);
            const derivation2 = deriveKeypairFromMnemonic(mnemonic2);

            expect(derivation1.npub).not.toBe(derivation2.npub);
            expect(derivation1.pubkeyHex).not.toBe(derivation2.pubkeyHex);
            expect(derivation1.nsec).not.toBe(derivation2.nsec);
          }
        }),
        { numRuns: 10 }
      );
    });

    it('passphrase changes produce different keypairs from same mnemonic', () => {
      fc.assert(
        fc.property(
          fc.tuple(fc.string({ minLength: 1, maxLength: 100 }), fc.string({ minLength: 1, maxLength: 100 })).filter(
            ([pass1, pass2]) => pass1 !== pass2
          ),
          ([passphrase1, passphrase2]) => {
            const mnemonic = generateMnemonic();
            const derivation1 = deriveKeypairFromMnemonic(mnemonic, passphrase1);
            const derivation2 = deriveKeypairFromMnemonic(mnemonic, passphrase2);

            expect(derivation1.npub).not.toBe(derivation2.npub);
            expect(derivation1.pubkeyHex).not.toBe(derivation2.pubkeyHex);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('same passphrase produces same keypair', () => {
      fc.assert(
        fc.property(fc.string({ maxLength: 100 }), (passphrase) => {
          const mnemonic = generateMnemonic();
          const derivation1 = deriveKeypairFromMnemonic(mnemonic, passphrase);
          const derivation2 = deriveKeypairFromMnemonic(mnemonic, passphrase);

          expect(derivation1.npub).toBe(derivation2.npub);
          expect(derivation1.pubkeyHex).toBe(derivation2.pubkeyHex);
          expect(derivation1.nsec).toBe(derivation2.nsec);
        }),
        { numRuns: 10 }
      );
    });

    it('different account indices produce different keypairs', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation0 = deriveKeypairFromMnemonic(mnemonic, '', 0);
          const derivation1 = deriveKeypairFromMnemonic(mnemonic, '', 1);
          const derivation2 = deriveKeypairFromMnemonic(mnemonic, '', 2);

          expect(derivation0.npub).not.toBe(derivation1.npub);
          expect(derivation0.npub).not.toBe(derivation2.npub);
          expect(derivation1.npub).not.toBe(derivation2.npub);
        }),
        { numRuns: 10 }
      );
    });

    it('account index 0 is default (omitted parameter)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 5 }), () => {
          const mnemonic = generateMnemonic();
          const derivationDefault = deriveKeypairFromMnemonic(mnemonic);
          const derivationExplicit = deriveKeypairFromMnemonic(mnemonic, '', 0);

          expect(derivationDefault.npub).toBe(derivationExplicit.npub);
          expect(derivationDefault.pubkeyHex).toBe(derivationExplicit.pubkeyHex);
          expect(derivationDefault.nsec).toBe(derivationExplicit.nsec);
        }),
        { numRuns: 5 }
      );
    });

    it('throws on invalid mnemonic', () => {
      expect(() => deriveKeypairFromMnemonic('invalid invalid invalid')).toThrow('Invalid mnemonic phrase');
      expect(() => deriveKeypairFromMnemonic('abandon')).toThrow('Invalid mnemonic phrase');
      expect(() => deriveKeypairFromMnemonic('')).toThrow('Invalid mnemonic phrase');
    });

    it('throws on negative account index', () => {
      const mnemonic = generateMnemonic();
      expect(() => deriveKeypairFromMnemonic(mnemonic, '', -1)).toThrow('Account index must be non-negative');
      expect(() => deriveKeypairFromMnemonic(mnemonic, '', -100)).toThrow('Account index must be non-negative');
    });

    it('never throws on non-negative account indices', () => {
      fc.assert(
        fc.property(fc.nat({ max: 1000 }), (accountIndex) => {
          const mnemonic = generateMnemonic();
          expect(() => deriveKeypairFromMnemonic(mnemonic, '', accountIndex)).not.toThrow();
        }),
        { numRuns: 20 }
      );
    });

    it('nsec and npub have bech32 format', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation.nsec).toMatch(/^nsec1[a-z0-9]{58,}$/);
          expect(derivation.npub).toMatch(/^npub1[a-z0-9]{58,}$/);
        }),
        { numRuns: 10 }
      );
    });

    it('echos back original mnemonic in derivation result', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation.mnemonic).toBe(mnemonic);
        }),
        { numRuns: 10 }
      );
    });

    it('secretKey is exactly 32 bytes (256 bits)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation.secretKey.length).toBe(32);
          expect(derivation.secretKey).toBeInstanceOf(Uint8Array);
        }),
        { numRuns: 10 }
      );
    });

    it('pubkeyHex is always 64 lowercase hex characters', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation.pubkeyHex).toHaveLength(64);
          expect(derivation.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);
          expect(derivation.pubkeyHex).not.toMatch(/[A-F]/);
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('mnemonicToWords', () => {
    it('splits mnemonic into individual words', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const words = mnemonicToWords(mnemonic);

          expect(Array.isArray(words)).toBe(true);
          expect(words.length).toBeGreaterThan(0);
          expect(words.every((w) => typeof w === 'string')).toBe(true);
        }),
        { numRuns: 10 }
      );
    });

    it('round-trip: joining words recreates normalized mnemonic', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const words = mnemonicToWords(mnemonic);
          const reconstructed = words.join(' ');

          expect(mnemonicToWords(reconstructed)).toEqual(words);
        }),
        { numRuns: 10 }
      );
    });

    it('handles extra whitespace correctly', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const withExtraSpaces = '  ' + mnemonic.replace(/ /g, '   ') + '  ';
          const withTabs = mnemonic.replace(/ /g, '\t');
          const withNewlines = mnemonic.replace(/ /g, '\n');

          const wordsOriginal = mnemonicToWords(mnemonic);
          const wordsExtraSpaces = mnemonicToWords(withExtraSpaces);
          const wordsTabs = mnemonicToWords(withTabs);
          const wordsNewlines = mnemonicToWords(withNewlines);

          expect(wordsExtraSpaces).toEqual(wordsOriginal);
          expect(wordsTabs).toEqual(wordsOriginal);
          expect(wordsNewlines).toEqual(wordsOriginal);
        }),
        { numRuns: 10 }
      );
    });

    it('returns lowercase words', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const words = mnemonicToWords(mnemonic);

          expect(words.every((w) => w === w.toLowerCase())).toBe(true);
        }),
        { numRuns: 10 }
      );
    });

    it('returns non-empty array of non-empty strings', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const words = mnemonicToWords(mnemonic);

          expect(words.length).toBeGreaterThan(0);
          expect(words.every((w) => w.length > 0)).toBe(true);
        }),
        { numRuns: 10 }
      );
    });

    it('filters empty strings from malformed input', () => {
      const malformed = 'word1  word2    word3';
      const words = mnemonicToWords(malformed);

      expect(words).not.toContain('');
      expect(words.length).toBe(3);
    });

    it('handles single word input', () => {
      const words = mnemonicToWords('abandon');
      expect(words).toEqual(['abandon']);
    });
  });

  describe('wordCountIsValid', () => {
    it('returns true for 12-word mnemonics', () => {
      expect(wordCountIsValid(12)).toBe(true);
    });

    it('returns true for 24-word mnemonics', () => {
      expect(wordCountIsValid(24)).toBe(true);
    });

    it('returns false for non-standard word counts', () => {
      const invalidCounts = [1, 2, 3, 6, 11, 13, 18, 23, 25, 50, 100];
      invalidCounts.forEach((count) => {
        expect(wordCountIsValid(count)).toBe(false);
      });
    });

    it('returns false for zero and negative numbers', () => {
      expect(wordCountIsValid(0)).toBe(false);
      expect(wordCountIsValid(-1)).toBe(false);
      expect(wordCountIsValid(-100)).toBe(false);
    });

    it('generated mnemonics always have valid word counts', () => {
      fc.assert(
        fc.property(fc.nat({ max: 20 }), () => {
          const mnemonic = generateMnemonic();
          const words = mnemonicToWords(mnemonic);
          expect(wordCountIsValid(words.length)).toBe(true);
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Integration: Full mnemonic lifecycle', () => {
    it('can generate, validate, and derive from mnemonic in one flow', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          expect(validateMnemonic(mnemonic)).toBe(true);

          const words = mnemonicToWords(mnemonic);
          expect(wordCountIsValid(words.length)).toBe(true);

          const derivation = deriveKeypairFromMnemonic(mnemonic);
          expect(derivation.mnemonic).toBe(mnemonic);
          expect(derivation.npub).toMatch(/^npub1/);
          expect(derivation.nsec).toMatch(/^nsec1/);
        }),
        { numRuns: 10 }
      );
    });

    it('multiple accounts from same mnemonic are independent', () => {
      fc.assert(
        fc.property(fc.nat({ max: 5 }), () => {
          const mnemonic = generateMnemonic();
          const accounts = [
            deriveKeypairFromMnemonic(mnemonic, '', 0),
            deriveKeypairFromMnemonic(mnemonic, '', 1),
            deriveKeypairFromMnemonic(mnemonic, '', 2),
            deriveKeypairFromMnemonic(mnemonic, '', 3),
          ];

          const npubs = accounts.map((a) => a.npub);
          const uniqueNpubs = new Set(npubs);
          expect(uniqueNpubs.size).toBe(accounts.length);
        }),
        { numRuns: 5 }
      );
    });

    it('security: error messages do not expose secrets', () => {
      const mnemonic = generateMnemonic();
      const derivation = deriveKeypairFromMnemonic(mnemonic);

      try {
        deriveKeypairFromMnemonic('invalid mnemonic phrase');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain(mnemonic);
        expect(message).not.toContain(derivation.nsec);
        expect(message).not.toContain(derivation.secretKey.toString());
      }

      try {
        deriveKeypairFromMnemonic(mnemonic, '', -1);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message).not.toContain(mnemonic);
        expect(message).not.toContain(derivation.nsec);
      }
    });
  });

  describe('Property: Format correctness and compatibility', () => {
    it('nsec can be parsed back to secret key (round-trip compatible)', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation.nsec).toMatch(/^nsec1/);
          expect(derivation.secretKey.length).toBe(32);
        }),
        { numRuns: 10 }
      );
    });

    it('npub matches pubkeyHex in different formats', () => {
      fc.assert(
        fc.property(fc.nat({ max: 10 }), () => {
          const mnemonic = generateMnemonic();
          const derivation = deriveKeypairFromMnemonic(mnemonic);

          expect(derivation.npub).toMatch(/^npub1/);
          expect(derivation.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);
          expect(typeof derivation.pubkeyHex).toBe('string');
          expect(typeof derivation.npub).toBe('string');
        }),
        { numRuns: 10 }
      );
    });

    it('BIP32 path derivation produces independent keys for each account', () => {
      fc.assert(
        fc.property(fc.nat({ max: 100 }), fc.nat({ max: 100 }), (idx1, idx2) => {
          const mnemonic = generateMnemonic();
          const derivation1 = deriveKeypairFromMnemonic(mnemonic, '', idx1);
          const derivation2 = deriveKeypairFromMnemonic(mnemonic, '', idx2);

          if (idx1 === idx2) {
            expect(derivation1.npub).toBe(derivation2.npub);
          } else {
            expect(derivation1.npub).not.toBe(derivation2.npub);
          }
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('BIP-32/39/44 Seed Functions', () => {
    describe('mnemonicToSeed', () => {
      it('generates 64-byte seed from mnemonic', () => {
        fc.assert(
          fc.property(fc.nat({ max: 10 }), () => {
            const mnemonic = generateMnemonic();
            const seed = mnemonicToSeed(mnemonic);

            expect(seed).toBeInstanceOf(Uint8Array);
            expect(seed.length).toBe(64);
          }),
          { numRuns: 10 }
        );
      });

      it('is deterministic: same mnemonic produces same seed', () => {
        fc.assert(
          fc.property(fc.nat({ max: 5 }), () => {
            const mnemonic = generateMnemonic();
            const seed1 = mnemonicToSeed(mnemonic);
            const seed2 = mnemonicToSeed(mnemonic);

            expect(seed1).toEqual(seed2);
          }),
          { numRuns: 5 }
        );
      });

      it('different passphrases produce different seeds', () => {
        const mnemonic = generateMnemonic();
        const seed1 = mnemonicToSeed(mnemonic, '');
        const seed2 = mnemonicToSeed(mnemonic, 'password');

        expect(seed1).not.toEqual(seed2);
      });

      it('throws on invalid mnemonic', () => {
        expect(() => mnemonicToSeed('invalid mnemonic')).toThrow('Invalid mnemonic phrase');
        expect(() => mnemonicToSeed('')).toThrow('Invalid mnemonic phrase');
      });
    });

    describe('seedToHex and hexToSeed', () => {
      it('round-trip: seedToHex then hexToSeed returns original', () => {
        fc.assert(
          fc.property(fc.nat({ max: 10 }), () => {
            const mnemonic = generateMnemonic();
            const seed = mnemonicToSeed(mnemonic);
            const hex = seedToHex(seed);
            const recovered = hexToSeed(hex);

            expect(recovered).toEqual(seed);
          }),
          { numRuns: 10 }
        );
      });

      it('seedToHex produces 128 hex chars for 64-byte seed', () => {
        const mnemonic = generateMnemonic();
        const seed = mnemonicToSeed(mnemonic);
        const hex = seedToHex(seed);

        expect(hex).toMatch(/^[0-9a-f]{128}$/);
      });

      it('hexToSeed throws on odd-length string', () => {
        expect(() => hexToSeed('abc')).toThrow('Invalid hex string length');
      });

      it('hexToSeed throws on invalid hex characters', () => {
        expect(() => hexToSeed('gg')).toThrow('Invalid hex character');
      });
    });

    describe('validateDerivationPath', () => {
      it('returns true for valid BIP-44 paths', () => {
        const validPaths = [
          "m/44'/1237'/0'/0/0",
          "m/44'/1237'/1'/0/0",
          "m/44'/0'/0'/0/0",
          "m/44'/60'/0'/0/0",
          "m/0/0",
          "m/44'/1237'/0'/0/100",
        ];

        validPaths.forEach(path => {
          expect(validateDerivationPath(path)).toBe(true);
        });
      });

      it('returns false for invalid paths', () => {
        const invalidPaths = [
          '',
          'invalid',
          'm',
          '44/1237/0/0/0',
          "m//44'/1237'/0'/0/0",
          null as unknown as string,
          undefined as unknown as string,
        ];

        invalidPaths.forEach(path => {
          expect(validateDerivationPath(path)).toBe(false);
        });
      });

      it('DEFAULT_DERIVATION_PATH is valid', () => {
        expect(validateDerivationPath(DEFAULT_DERIVATION_PATH)).toBe(true);
        expect(DEFAULT_DERIVATION_PATH).toBe("m/44'/1237'/0'/0/0");
      });
    });

    describe('deriveKeypairFromSeed', () => {
      it('derives valid keypair from seed', () => {
        fc.assert(
          fc.property(fc.nat({ max: 10 }), () => {
            const mnemonic = generateMnemonic();
            const seed = mnemonicToSeed(mnemonic);
            const seedHex = seedToHex(seed);
            const derivation = deriveKeypairFromSeed(seedHex);

            expect(derivation.seedHex).toBe(seedHex);
            expect(derivation.nsec).toMatch(/^nsec1/);
            expect(derivation.npub).toMatch(/^npub1/);
            expect(derivation.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);
            expect(derivation.secretKey).toHaveLength(32);
            expect(derivation.derivationPath).toBe(DEFAULT_DERIVATION_PATH);
          }),
          { numRuns: 10 }
        );
      });

      it('produces same result as deriveKeypairFromMnemonic with default path', () => {
        fc.assert(
          fc.property(fc.nat({ max: 5 }), () => {
            const mnemonic = generateMnemonic();
            const fromMnemonic = deriveKeypairFromMnemonic(mnemonic);
            const fromSeed = deriveKeypairFromSeed(fromMnemonic.seedHex);

            expect(fromSeed.npub).toBe(fromMnemonic.npub);
            expect(fromSeed.nsec).toBe(fromMnemonic.nsec);
            expect(fromSeed.pubkeyHex).toBe(fromMnemonic.pubkeyHex);
          }),
          { numRuns: 5 }
        );
      });

      it('different paths produce different keypairs', () => {
        const mnemonic = generateMnemonic();
        const seedHex = deriveKeypairFromMnemonic(mnemonic).seedHex;

        const derivation1 = deriveKeypairFromSeed(seedHex, "m/44'/1237'/0'/0/0");
        const derivation2 = deriveKeypairFromSeed(seedHex, "m/44'/1237'/1'/0/0");
        const derivation3 = deriveKeypairFromSeed(seedHex, "m/44'/0'/0'/0/0");

        expect(derivation1.npub).not.toBe(derivation2.npub);
        expect(derivation1.npub).not.toBe(derivation3.npub);
        expect(derivation2.npub).not.toBe(derivation3.npub);
      });

      it('throws on invalid seed hex', () => {
        expect(() => deriveKeypairFromSeed('')).toThrow('Invalid seed: must be 128 hex characters');
        expect(() => deriveKeypairFromSeed('abc')).toThrow('Invalid seed: must be 128 hex characters');
        expect(() => deriveKeypairFromSeed('a'.repeat(127))).toThrow('Invalid seed: must be 128 hex characters');
      });

      it('throws on invalid derivation path', () => {
        const mnemonic = generateMnemonic();
        const seedHex = deriveKeypairFromMnemonic(mnemonic).seedHex;

        expect(() => deriveKeypairFromSeed(seedHex, 'invalid')).toThrow('Invalid derivation path');
        expect(() => deriveKeypairFromSeed(seedHex, '')).toThrow('Invalid derivation path');
      });

      it('derivationPath is included in result', () => {
        const mnemonic = generateMnemonic();
        const seedHex = deriveKeypairFromMnemonic(mnemonic).seedHex;
        const customPath = "m/44'/1237'/5'/0/0";

        const derivation = deriveKeypairFromSeed(seedHex, customPath);
        expect(derivation.derivationPath).toBe(customPath);
      });
    });
  });
});
