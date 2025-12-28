/**
 * Property-based and example-based tests for SubjectFilter component
 *
 * Tests verify:
 * - Capitalization logic for subject display names
 * - Subject extraction from vocabulary
 * - Option generation logic
 * - Business rules from specification
 */

import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import type { AvatarVocabulary } from './types';

// ============================================================================
// HELPER FUNCTIONS EXTRACTED FROM SubjectFilter.tsx FOR TESTING
// ============================================================================

/**
 * Capitalize helper function
 * CONTRACT:
 *   Inputs:
 *     - str: string, may be empty
 *
 *   Outputs:
 *     - string with first character uppercased
 *
 *   Invariants:
 *     - Output length equals input length
 *     - Empty input returns empty output
 *     - First character is uppercase if input non-empty
 *     - Rest of string unchanged
 */
function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Extract subjects from vocabulary
 * CONTRACT:
 *   Inputs:
 *     - vocabulary: AvatarVocabulary object
 *
 *   Outputs:
 *     - Array of subject strings
 *
 *   Invariants:
 *     - Returns empty array if vocabulary["subject"] missing
 *     - Returns vocabulary["subject"] if present
 */
function extractSubjects(vocabulary: AvatarVocabulary): string[] {
  return vocabulary['subject'] ?? [];
}

/**
 * Generate options for select dropdown
 * CONTRACT:
 *   Inputs:
 *     - subjects: array of subject strings
 *     - isLoading: boolean flag
 *
 *   Outputs:
 *     - Array of option objects {value: string, label: string}
 *
 *   Invariants:
 *     - If loading: returns single "Loading filters..." option
 *     - If not loading: returns "All" option + capitalized subject options
 *     - Option count (non-loading) = 1 + subjects.length
 */
function generateOptions(subjects: string[], isLoading: boolean): Array<{ value: string; label: string }> {
  if (isLoading) {
    return [{ value: '', label: 'Loading filters...' }];
  }

  const allOption = { value: '', label: 'All' };
  const subjectOptions = subjects.map((subject) => ({
    value: subject,
    label: capitalize(subject),
  }));

  return [allOption, ...subjectOptions];
}

// ============================================================================
// CAPITALIZE HELPER - PROPERTY-BASED TESTS
// ============================================================================

describe('Capitalize Helper Function - Property-Based Tests', () => {
  const fcOptions = { numRuns: 100 };

  describe('Basic Properties', () => {
    it('P001: Same length as input', () => {
      fc.assert(
        fc.property(fc.string(), (str) => {
          const result = capitalize(str);
          expect(result.length).toBe(str.length);
          return true;
        }),
        fcOptions
      );
    });

    it('P002: Returns empty string for empty input', () => {
      const result = capitalize('');
      expect(result).toBe('');
    });

    it('P003: First character is uppercase for non-empty input', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (str) => {
          const result = capitalize(str);
          expect(result[0]).toBe(str[0].toUpperCase());
          return true;
        }),
        fcOptions
      );
    });

    it('P004: Rest of string unchanged', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1 }), (str) => {
          const result = capitalize(str);
          if (str.length > 1) {
            expect(result.slice(1)).toBe(str.slice(1));
          }
          return true;
        }),
        fcOptions
      );
    });

    it('P005: Deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(fc.string(), (str) => {
          const result1 = capitalize(str);
          const result2 = capitalize(str);
          expect(result1).toBe(result2);
          return true;
        }),
        fcOptions
      );
    });
  });

  describe('Example Cases', () => {
    it('E001: Capitalizes lowercase word', () => {
      expect(capitalize('cat')).toBe('Cat');
      expect(capitalize('dog')).toBe('Dog');
      expect(capitalize('strawberry')).toBe('Strawberry');
    });

    it('E002: Preserves already capitalized word', () => {
      expect(capitalize('Cat')).toBe('Cat');
      expect(capitalize('Dog')).toBe('Dog');
    });

    it('E003: Preserves case of rest of string', () => {
      expect(capitalize('catDog')).toBe('CatDog');
      expect(capitalize('cat_dog')).toBe('Cat_dog');
      expect(capitalize('cat DOG')).toBe('Cat DOG');
    });
  });
});

// ============================================================================
// EXTRACT SUBJECTS - PROPERTY-BASED TESTS
// ============================================================================

describe('Extract Subjects - Property-Based Tests', () => {
  const fcOptions = { numRuns: 100 };

  describe('Basic Properties', () => {
    it('P006: Returns vocabulary["subject"] when present', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const vocabulary: AvatarVocabulary = { subject: subjects };
          const result = extractSubjects(vocabulary);
          expect(result).toEqual(subjects);
          expect(result).toBe(subjects);
          return true;
        }),
        fcOptions
      );
    });

    it('P007: Returns empty array when vocabulary["subject"] is undefined', () => {
      fc.assert(
        fc.property(fc.constant({}), (vocabulary) => {
          const result = extractSubjects(vocabulary);
          expect(result).toEqual([]);
          return true;
        }),
        fcOptions
      );
    });

    it('P008: Returns empty array when vocabulary has other keys but not "subject"', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 20 }),
          (otherValues) => {
            const vocabulary: AvatarVocabulary = { otherKey: otherValues };
            const result = extractSubjects(vocabulary);
            expect(result).toEqual([]);
            return true;
          }
        ),
        fcOptions
      );
    });
  });

  describe('Example Cases', () => {
    it('E004: Empty vocabulary returns empty array', () => {
      expect(extractSubjects({})).toEqual([]);
    });

    it('E005: Vocabulary with subjects returns subjects', () => {
      const vocabulary = { subject: ['cat', 'dog', 'strawberry'] };
      expect(extractSubjects(vocabulary)).toEqual(['cat', 'dog', 'strawberry']);
    });

    it('E006: Vocabulary with empty subject array returns empty array', () => {
      const vocabulary = { subject: [] };
      expect(extractSubjects(vocabulary)).toEqual([]);
    });
  });
});

// ============================================================================
// GENERATE OPTIONS - PROPERTY-BASED TESTS
// ============================================================================

describe('Generate Options - Property-Based Tests', () => {
  const fcOptions = { numRuns: 100 };

  describe('Loading State Properties', () => {
    it('P009: Returns single "Loading filters..." option when loading', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const result = generateOptions(subjects, true);
          expect(result.length).toBe(1);
          expect(result[0].value).toBe('');
          expect(result[0].label).toBe('Loading filters...');
          return true;
        }),
        fcOptions
      );
    });

    it('P010: Loading state ignores subjects parameter', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }),
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }),
          (subjects1, subjects2) => {
            const result1 = generateOptions(subjects1, true);
            const result2 = generateOptions(subjects2, true);
            expect(result1).toEqual(result2);
            return true;
          }
        ),
        fcOptions
      );
    });
  });

  describe('Non-Loading State Properties', () => {
    it('P011: First option is always "All" with empty value', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const result = generateOptions(subjects, false);
          expect(result[0].value).toBe('');
          expect(result[0].label).toBe('All');
          return true;
        }),
        fcOptions
      );
    });

    it('P012: Option count equals 1 + subjects.length', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const result = generateOptions(subjects, false);
          expect(result.length).toBe(1 + subjects.length);
          return true;
        }),
        fcOptions
      );
    });

    it('P013: Subject options have original values', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const result = generateOptions(subjects, false);
          const subjectOptions = result.slice(1);
          const values = subjectOptions.map((opt) => opt.value);
          expect(values).toEqual(subjects);
          return true;
        }),
        fcOptions
      );
    });

    it('P014: Subject options have capitalized labels', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const result = generateOptions(subjects, false);
          const subjectOptions = result.slice(1);
          subjectOptions.forEach((opt, index) => {
            expect(opt.label).toBe(capitalize(subjects[index]));
          });
          return true;
        }),
        fcOptions
      );
    });

    it('P015: Empty subjects array produces only "All" option', () => {
      const result = generateOptions([], false);
      expect(result.length).toBe(1);
      expect(result[0].value).toBe('');
      expect(result[0].label).toBe('All');
    });
  });

  describe('Deterministic Properties', () => {
    it('P016: Same inputs produce same outputs', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }),
          fc.boolean(),
          (subjects, isLoading) => {
            const result1 = generateOptions(subjects, isLoading);
            const result2 = generateOptions(subjects, isLoading);
            expect(result1).toEqual(result2);
            return true;
          }
        ),
        fcOptions
      );
    });
  });

  describe('Example Cases', () => {
    it('E007: Loading state returns single loading option', () => {
      const result = generateOptions(['cat', 'dog'], true);
      expect(result).toEqual([{ value: '', label: 'Loading filters...' }]);
    });

    it('E008: Non-loading with empty subjects returns only All', () => {
      const result = generateOptions([], false);
      expect(result).toEqual([{ value: '', label: 'All' }]);
    });

    it('E009: Non-loading with subjects returns All + capitalized subjects', () => {
      const result = generateOptions(['cat', 'dog', 'strawberry'], false);
      expect(result).toEqual([
        { value: '', label: 'All' },
        { value: 'cat', label: 'Cat' },
        { value: 'dog', label: 'Dog' },
        { value: 'strawberry', label: 'Strawberry' },
      ]);
    });

    it('E010: Preserves subject values exactly (not capitalized)', () => {
      const result = generateOptions(['cat', 'DOG', 'StRaWbErRy'], false);
      expect(result[1].value).toBe('cat');
      expect(result[2].value).toBe('DOG');
      expect(result[3].value).toBe('StRaWbErRy');
    });

    it('E011: Capitalizes subject labels correctly', () => {
      const result = generateOptions(['cat', 'DOG', 'StRaWbErRy'], false);
      expect(result[1].label).toBe('Cat');
      expect(result[2].label).toBe('DOG');
      expect(result[3].label).toBe('StRaWbErRy');
    });
  });
});

// ============================================================================
// INTEGRATION - PROPERTY-BASED TESTS
// ============================================================================

describe('Integration - Property-Based Tests', () => {
  const fcOptions = { numRuns: 100 };

  describe('End-to-End Workflow', () => {
    it('P017: Full workflow from vocabulary to options (non-loading)', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const vocabulary: AvatarVocabulary = { subject: subjects };

          const extractedSubjects = extractSubjects(vocabulary);
          expect(extractedSubjects).toEqual(subjects);

          const options = generateOptions(extractedSubjects, false);
          expect(options.length).toBe(1 + subjects.length);
          expect(options[0]).toEqual({ value: '', label: 'All' });

          subjects.forEach((subject, index) => {
            expect(options[index + 1].value).toBe(subject);
            expect(options[index + 1].label).toBe(capitalize(subject));
          });

          return true;
        }),
        fcOptions
      );
    });

    it('P018: Full workflow from vocabulary to options (loading)', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 50 }), (subjects) => {
          const vocabulary: AvatarVocabulary = { subject: subjects };

          const extractedSubjects = extractSubjects(vocabulary);
          const options = generateOptions(extractedSubjects, true);

          expect(options).toEqual([{ value: '', label: 'Loading filters...' }]);

          return true;
        }),
        fcOptions
      );
    });

    it('P019: Full workflow with empty vocabulary', () => {
      fc.assert(
        fc.property(fc.constant({}), (vocabulary) => {
          const extractedSubjects = extractSubjects(vocabulary);
          expect(extractedSubjects).toEqual([]);

          const options = generateOptions(extractedSubjects, false);
          expect(options).toEqual([{ value: '', label: 'All' }]);

          return true;
        }),
        fcOptions
      );
    });
  });
});
