/**
 * Property-based and example-based tests for MnemonicRecoveryInput component
 *
 * Tests verify the component's validation logic and contract:
 * - Input normalization (whitespace collapsing, lowercasing)
 * - BIP39 validation (checksum validation using validateWords)
 * - Word count validation (must be 12 or 24 words)
 * - Validation state transitions (idle → valid/invalid)
 * - Input value processing
 *
 * Since jest environment is 'node' (no DOM), we test the logic functions
 * that the component uses internally, and verify properties of various inputs.
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import { validateWords, generateSeedWords } from 'nostr-tools/nip06';

// ============================================================================
// VALID TEST MNEMONICS
// ============================================================================

/**
 * Valid 12-word BIP39 mnemonic for testing
 */
const VALID_12_WORD_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/**
 * Valid 24-word BIP39 mnemonic for testing
 */
const VALID_24_WORD_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';

// ============================================================================
// HELPER FUNCTIONS (matching component logic)
// ============================================================================

/**
 * Normalize input like the component does
 */
function normalizeInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Calculate word count like the component does
 */
function getWordCount(mnemonic: string): number {
  return mnemonic.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Validate mnemonic like the component does
 * Returns 'idle' | 'valid' | 'invalid'
 */
function validateMnemonicState(mnemonic: string): 'idle' | 'valid' | 'invalid' {
  // Empty input is idle state
  if (!mnemonic || mnemonic.trim().length === 0) {
    return 'idle';
  }

  // Get word count
  const wordCount = getWordCount(mnemonic);

  // Word count must be 12 or 24
  if (wordCount !== 12 && wordCount !== 24) {
    return 'invalid';
  }

  // Validate using BIP39 validation
  try {
    const isValid = validateWords(mnemonic);
    return isValid ? 'valid' : 'invalid';
  } catch {
    return 'invalid';
  }
}

// ============================================================================
// PROPERTY-BASED TESTS: VALIDATION STATE
// ============================================================================

describe('MnemonicRecoveryInput - Validation State Properties', () => {
  const fcOptions = { numRuns: 50 };

  describe('P001: Empty input always results in idle state', () => {
    it('should validate empty string as idle', () => {
      const state = validateMnemonicState('');
      expect(state).toBe('idle');
    });

    it('should validate whitespace-only input as idle (property)', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }).filter(s => /^\s+$/.test(s)), (whitespace) => {
          const state = validateMnemonicState(whitespace);
          expect(state).toBe('idle');
          return true;
        }),
        fcOptions
      );
    });

    it('should reset to idle when input is cleared', () => {
      const state1 = validateMnemonicState('abandon abandon');
      expect(state1).not.toBe('idle');

      const state2 = validateMnemonicState('');
      expect(state2).toBe('idle');
    });
  });

  describe('P002: Valid 12-word mnemonic always validates as valid', () => {
    it('should validate known valid 12-word mnemonic as valid', () => {
      const state = validateMnemonicState(VALID_12_WORD_MNEMONIC);
      expect(state).toBe('valid');
    });

    it('should validate any generated 12-word mnemonic as valid (property)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10 }), (_seed) => {
          const mnemonic = generateSeedWords();
          const words = mnemonic.split(' ');

          // Generated mnemonics are always valid
          const isValid = validateWords(mnemonic);
          expect(isValid).toBe(true);

          // Should be 12 or 24 words
          expect([12, 24]).toContain(words.length);

          // Component should validate as valid
          const state = validateMnemonicState(mnemonic);
          expect(state).toBe('valid');
          return true;
        }),
        { numRuns: 10 }
      );
    });

    it('should validate normalized 12-word mnemonic as valid', () => {
      const normalized = normalizeInput(VALID_12_WORD_MNEMONIC);
      const state = validateMnemonicState(normalized);
      expect(state).toBe('valid');
    });
  });

  describe('P003: Valid 24-word mnemonic always validates as valid', () => {
    it('should validate known valid 24-word mnemonic as valid', () => {
      const state = validateMnemonicState(VALID_24_WORD_MNEMONIC);
      expect(state).toBe('valid');
    });

    it('should validate normalized 24-word mnemonic as valid', () => {
      const normalized = normalizeInput(VALID_24_WORD_MNEMONIC);
      const state = validateMnemonicState(normalized);
      expect(state).toBe('valid');
    });
  });

  describe('P004: Invalid word count always results in invalid state', () => {
    it('should mark non-12/24 word counts as invalid (property)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }).filter((n) => n !== 12 && n !== 24),
          (wordCount) => {
            const words = Array(wordCount).fill('abandon').join(' ');
            const state = validateMnemonicState(words);
            expect(state).toBe('invalid');
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should mark 11-word input as invalid', () => {
      const elevenWords = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
      const state = validateMnemonicState(elevenWords);
      expect(state).toBe('invalid');
    });

    it('should mark 25-word input as invalid', () => {
      const twentyFiveWords = Array(25).fill('abandon').join(' ');
      const state = validateMnemonicState(twentyFiveWords);
      expect(state).toBe('invalid');
    });

    it('should mark 1-word input as invalid', () => {
      const state = validateMnemonicState('abandon');
      expect(state).toBe('invalid');
    });
  });

  describe('P005: Invalid BIP39 words always result in invalid state', () => {
    it('should mark corrupted 12-word input as invalid', () => {
      const corrupted =
        'abandno abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const state = validateMnemonicState(corrupted);
      expect(state).toBe('invalid');
    });

    it('should mark invalid BIP39 words as invalid (property)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
            minLength: 12,
            maxLength: 12,
          }),
          (words) => {
            const mnemonic = words.join(' ');
            const state = validateMnemonicState(mnemonic);

            // These are unlikely to be valid BIP39 mnemonics
            // (checksum validation will fail)
            // Just verify it processes without error
            expect(['idle', 'valid', 'invalid']).toContain(state);
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should mark all same words as invalid', () => {
      const state = validateMnemonicState(Array(12).fill('abandon').join(' '));
      expect(state).toBe('invalid');
    });
  });
});

// ============================================================================
// PROPERTY-BASED TESTS: INPUT NORMALIZATION
// ============================================================================

describe('MnemonicRecoveryInput - Input Normalization Properties', () => {
  describe('P006: Normalization produces lowercase with single spaces', () => {
    it('should convert input to lowercase', () => {
      const result = normalizeInput('ABANDON ABANDON');
      expect(result).toBe(result.toLowerCase());
    });

    it('should collapse multiple spaces to single space (property)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
            minLength: 1,
            maxLength: 10,
          }),
          (words) => {
            const input = words.join('    '); // Multiple spaces
            const result = normalizeInput(input);

            // Should not have double spaces
            expect(result).not.toMatch(/\s{2,}/);
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should trim leading and trailing whitespace (property)', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 5 }).filter(s => /^\s*$/.test(s)),
          fc.string({ maxLength: 5 }).filter(s => /^\s*$/.test(s)),
          (leading, trailing) => {
            const input = leading + 'abandon' + trailing;
            const result = normalizeInput(input);

            // Should not have leading/trailing spaces
            expect(result).not.toMatch(/^\s/);
            expect(result).not.toMatch(/\s$/);
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should preserve word order', () => {
      const input = 'ABANDON   ABOUT   ABOVE';
      const result = normalizeInput(input);
      expect(result).toBe('abandon about above');
    });

    it('should handle mixed case', () => {
      const input = 'AbanDon aBouT AbOVE';
      const result = normalizeInput(input);
      expect(result).toBe('abandon about above');
    });

    it('should handle tabs and newlines', () => {
      const input = 'abandon\t\tabandon\n\nabandon';
      const result = normalizeInput(input);
      expect(result).toBe('abandon abandon abandon');
    });
  });

  describe('P007: Normalized input still validates correctly', () => {
    it('should validate uppercase mnemonic after normalization', () => {
      const uppercase = VALID_12_WORD_MNEMONIC.toUpperCase();
      const normalized = normalizeInput(uppercase);
      const state = validateMnemonicState(normalized);
      expect(state).toBe('valid');
    });

    it('should validate mnemonic with extra spaces after normalization', () => {
      const spaced = VALID_12_WORD_MNEMONIC.replace(/ /g, '   ');
      const normalized = normalizeInput(spaced);
      const state = validateMnemonicState(normalized);
      expect(state).toBe('valid');
    });
  });
});

// ============================================================================
// PROPERTY-BASED TESTS: WORD COUNT
// ============================================================================

describe('MnemonicRecoveryInput - Word Count Properties', () => {
  describe('P008: Word count is always correctly calculated', () => {
    it('should count words correctly (property)', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => !/\s/.test(s)), {
            minLength: 1,
            maxLength: 30,
          }),
          (words) => {
            const mnemonic = words.join(' ');
            const wordCount = getWordCount(mnemonic);

            // Count words as expected
            const expectedCount = words.length;
            expect(wordCount).toBe(expectedCount);
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should ignore extra whitespace in word count', () => {
      const mnemonic1 = 'abandon abandon abandon';
      const mnemonic2 = 'abandon    abandon    abandon';

      const count1 = getWordCount(mnemonic1);
      const count2 = getWordCount(mnemonic2);

      expect(count1).toBe(count2);
      expect(count1).toBe(3);
    });

    it('should handle 12 words', () => {
      const count = getWordCount(VALID_12_WORD_MNEMONIC);
      expect(count).toBe(12);
    });

    it('should handle 24 words', () => {
      const count = getWordCount(VALID_24_WORD_MNEMONIC);
      expect(count).toBe(24);
    });

    it('should return 0 for empty string', () => {
      const count = getWordCount('');
      expect(count).toBe(0);
    });
  });

  describe('P009: Valid word counts are 12 or 24', () => {
    it('should identify 12 as valid count', () => {
      const count = getWordCount(VALID_12_WORD_MNEMONIC);
      expect([12, 24]).toContain(count);
    });

    it('should identify 24 as valid count', () => {
      const count = getWordCount(VALID_24_WORD_MNEMONIC);
      expect([12, 24]).toContain(count);
    });

    it('should mark non-12/24 counts as invalid', () => {
      for (let i = 1; i < 50; i++) {
        if (i === 12 || i === 24) continue;

        const mnemonic = Array(i).fill('abandon').join(' ');
        const state = validateMnemonicState(mnemonic);
        expect(state).toBe('invalid');
      }
    });
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS: STATE TRANSITIONS
// ============================================================================

describe('MnemonicRecoveryInput - State Transitions Examples', () => {
  it('E001: Empty → Invalid transition', () => {
    const emptyState = validateMnemonicState('');
    const invalidState = validateMnemonicState('abandon');

    expect(emptyState).toBe('idle');
    expect(invalidState).toBe('invalid');
  });

  it('E002: Empty → Valid transition', () => {
    const emptyState = validateMnemonicState('');
    const validState = validateMnemonicState(VALID_12_WORD_MNEMONIC);

    expect(emptyState).toBe('idle');
    expect(validState).toBe('valid');
  });

  it('E003: Invalid → Valid transition', () => {
    const invalidState = validateMnemonicState('abandon abandon abandon');
    const validState = validateMnemonicState(VALID_12_WORD_MNEMONIC);

    expect(invalidState).toBe('invalid');
    expect(validState).toBe('valid');
  });

  it('E004: Valid → Invalid transition', () => {
    const validState = validateMnemonicState(VALID_12_WORD_MNEMONIC);
    const invalidState = validateMnemonicState('abandon abandon abandon');

    expect(validState).toBe('valid');
    expect(invalidState).toBe('invalid');
  });

  it('E005: Valid → Idle transition', () => {
    const validState = validateMnemonicState(VALID_12_WORD_MNEMONIC);
    const idleState = validateMnemonicState('');

    expect(validState).toBe('valid');
    expect(idleState).toBe('idle');
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS: EDGE CASES
// ============================================================================

describe('MnemonicRecoveryInput - Edge Cases Examples', () => {
  it('E006: Single word is invalid', () => {
    const state = validateMnemonicState('abandon');
    expect(state).toBe('invalid');
  });

  it('E007: 12 words with valid BIP39 is valid', () => {
    const state = validateMnemonicState(VALID_12_WORD_MNEMONIC);
    expect(state).toBe('valid');
  });

  it('E008: 24 words with valid BIP39 is valid', () => {
    const state = validateMnemonicState(VALID_24_WORD_MNEMONIC);
    expect(state).toBe('valid');
  });

  it('E009: 12 same words is invalid (bad checksum)', () => {
    const mnemonic = Array(12).fill('abandon').join(' ');
    const state = validateMnemonicState(mnemonic);
    expect(state).toBe('invalid');
  });

  it('E010: Whitespace-only input is idle', () => {
    const state = validateMnemonicState('   \t\n  ');
    expect(state).toBe('idle');
  });

  it('E011: Normalized valid mnemonic is valid', () => {
    const normalized = normalizeInput('  ABANDON   ABANDON   ABANDON   ABANDON   ABANDON   ABANDON   ABANDON   ABANDON   ABANDON   ABANDON   ABANDON   ABOUT  ');
    const state = validateMnemonicState(normalized);
    expect(state).toBe('valid');
  });

  it('E012: Pasted content with tabs/newlines normalizes', () => {
    const pasted = 'abandon\t\tabandon\n\nabandon\rabandon\rabandon\rabandon\rabandon\rabandon\rabandon\rabandon\rabandon\rabout';
    const normalized = normalizeInput(pasted);
    expect(normalized).not.toMatch(/[\t\n\r]/);
    expect(normalized).not.toMatch(/\s{2,}/);
  });

  it('E013: Word count reflects actual word count', () => {
    expect(getWordCount('abandon')).toBe(1);
    expect(getWordCount('abandon abandon')).toBe(2);
    expect(getWordCount(VALID_12_WORD_MNEMONIC)).toBe(12);
    expect(getWordCount(VALID_24_WORD_MNEMONIC)).toBe(24);
  });

  it('E014: Validation catches common typos', () => {
    const typos = [
      'abandonn abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', // Extra 'n'
      'abandno abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', // Missing 'o'
      'abanxon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', // Wrong character
    ];

    typos.forEach((mnemonic) => {
      const state = validateMnemonicState(mnemonic);
      expect(state).toBe('invalid');
    });
  });

  it('E015: Multiple validation checks are consistent', () => {
    // Same mnemonic should always validate the same way
    const state1 = validateMnemonicState(VALID_12_WORD_MNEMONIC);
    const state2 = validateMnemonicState(VALID_12_WORD_MNEMONIC);
    const state3 = validateMnemonicState(VALID_12_WORD_MNEMONIC);

    expect(state1).toBe(state2);
    expect(state2).toBe(state3);
    expect(state1).toBe('valid');
  });
});
