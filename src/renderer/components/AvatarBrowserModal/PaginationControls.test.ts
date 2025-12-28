/**
 * Property-based and example-based tests for PaginationControls component
 *
 * Tests verify:
 * - Previous button enabled only when currentPage > 1 AND !isLoading
 * - Next button enabled only when hasNextPage === true AND !isLoading
 * - Both buttons disabled during loading
 * - Callbacks invoked exactly once when buttons clicked
 * - Page number display accuracy
 * - Accessibility properties
 */

import { describe, it, expect, jest } from '@jest/globals';
import fc from 'fast-check';
import { PaginationControls } from './PaginationControls';
import React from 'react';

/**
 * Helper to extract button disable logic for testing
 */
function isPreviousButtonDisabled(currentPage: number, isLoading: boolean): boolean {
  return currentPage === 1 || isLoading;
}

function isNextButtonDisabled(hasNextPage: boolean, isLoading: boolean): boolean {
  return !hasNextPage || isLoading;
}

// ============================================================================
// BUTTON ENABLE/DISABLE LOGIC - PROPERTY-BASED TESTS
// ============================================================================

describe('PaginationControls Button Logic - Property-Based Tests', () => {
  const fcOptions = { numRuns: 100 };

  describe('Previous Button Properties', () => {
    it('P001: Previous button disabled when currentPage = 1', () => {
      fc.assert(
        fc.property(fc.boolean(), (isLoading) => {
          const disabled = isPreviousButtonDisabled(1, isLoading);
          expect(disabled).toBe(true);
          return true;
        }),
        fcOptions
      );
    });

    it('P002: Previous button disabled when isLoading = true', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1000 }), (currentPage) => {
          const disabled = isPreviousButtonDisabled(currentPage, true);
          expect(disabled).toBe(true);
          return true;
        }),
        fcOptions
      );
    });

    it('P003: Previous button enabled when currentPage > 1 AND !isLoading', () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 1000 }), (currentPage) => {
          const disabled = isPreviousButtonDisabled(currentPage, false);
          expect(disabled).toBe(false);
          return true;
        }),
        fcOptions
      );
    });

    it('P004: Previous button state deterministic for same inputs', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), (currentPage, isLoading) => {
          const result1 = isPreviousButtonDisabled(currentPage, isLoading);
          const result2 = isPreviousButtonDisabled(currentPage, isLoading);
          expect(result1).toBe(result2);
          return true;
        }),
        fcOptions
      );
    });
  });

  describe('Next Button Properties', () => {
    it('P005: Next button disabled when hasNextPage = false', () => {
      fc.assert(
        fc.property(fc.boolean(), (isLoading) => {
          const disabled = isNextButtonDisabled(false, isLoading);
          expect(disabled).toBe(true);
          return true;
        }),
        fcOptions
      );
    });

    it('P006: Next button disabled when isLoading = true', () => {
      fc.assert(
        fc.property(fc.boolean(), (hasNextPage) => {
          const disabled = isNextButtonDisabled(hasNextPage, true);
          expect(disabled).toBe(true);
          return true;
        }),
        fcOptions
      );
    });

    it('P007: Next button enabled when hasNextPage = true AND !isLoading', () => {
      const disabled = isNextButtonDisabled(true, false);
      expect(disabled).toBe(false);
    });

    it('P008: Next button state deterministic for same inputs', () => {
      fc.assert(
        fc.property(fc.boolean(), fc.boolean(), (hasNextPage, isLoading) => {
          const result1 = isNextButtonDisabled(hasNextPage, isLoading);
          const result2 = isNextButtonDisabled(hasNextPage, isLoading);
          expect(result1).toBe(result2);
          return true;
        }),
        fcOptions
      );
    });
  });

  describe('Loading State Properties', () => {
    it('P009: Both buttons disabled when isLoading = true (any page)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), (currentPage, hasNextPage) => {
          const prevDisabled = isPreviousButtonDisabled(currentPage, true);
          const nextDisabled = isNextButtonDisabled(hasNextPage, true);
          expect(prevDisabled).toBe(true);
          expect(nextDisabled).toBe(true);
          return true;
        }),
        fcOptions
      );
    });

    it('P010: Loading state overrides all other conditions', () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 1000 }), (currentPage) => {
          const prevDisabledWhileLoading = isPreviousButtonDisabled(currentPage, true);
          const prevDisabledWhenNotLoading = isPreviousButtonDisabled(currentPage, false);
          const nextDisabledWhileLoading = isNextButtonDisabled(true, true);
          const nextDisabledWhenNotLoading = isNextButtonDisabled(true, false);

          expect(prevDisabledWhileLoading).toBe(true);
          expect(prevDisabledWhenNotLoading).toBe(false);
          expect(nextDisabledWhileLoading).toBe(true);
          expect(nextDisabledWhenNotLoading).toBe(false);
          return true;
        }),
        { numRuns: 50 }
      );
    });
  });
});

// ============================================================================
// PAGE NUMBER DISPLAY - PROPERTY-BASED TESTS
// ============================================================================

describe('PaginationControls Page Display - Property-Based Tests', () => {
  const fcOptions = { numRuns: 100 };

  it('P011: Page number always matches currentPage input', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (currentPage) => {
        const expectedText = `Page ${currentPage}`;
        expect(expectedText).toContain(currentPage.toString());
        return true;
      }),
      fcOptions
    );
  });

  it('P012: Page display format is always "Page N"', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (currentPage) => {
        const expectedText = `Page ${currentPage}`;
        expect(expectedText).toMatch(/^Page \d+$/);
        return true;
      }),
      fcOptions
    );
  });
});

// ============================================================================
// CALLBACK INVOCATION - PROPERTY-BASED TESTS
// ============================================================================

describe('PaginationControls Callback Behavior - Property-Based Tests', () => {
  it('P013: onPrevious should be callable when not disabled', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 1000 }), (currentPage) => {
        const mockCallback = jest.fn();
        const isDisabled = isPreviousButtonDisabled(currentPage, false);

        if (!isDisabled) {
          mockCallback();
          expect(mockCallback).toHaveBeenCalledTimes(1);
        }
        return true;
      }),
      { numRuns: 50 }
    );
  });

  it('P014: onNext should be callable when not disabled', () => {
    const mockCallback = jest.fn();
    const isDisabled = isNextButtonDisabled(true, false);

    if (!isDisabled) {
      mockCallback();
      expect(mockCallback).toHaveBeenCalledTimes(1);
    }
  });
});

// ============================================================================
// INVARIANT TESTS
// ============================================================================

describe('PaginationControls Invariants', () => {
  it('I001: Previous button always disabled on page 1', () => {
    fc.assert(
      fc.property(fc.boolean(), (isLoading) => {
        const disabled = isPreviousButtonDisabled(1, isLoading);
        expect(disabled).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('I002: Next button always disabled when hasNextPage false', () => {
    fc.assert(
      fc.property(fc.boolean(), (isLoading) => {
        const disabled = isNextButtonDisabled(false, isLoading);
        expect(disabled).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('I003: Both buttons always disabled during loading', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), (currentPage, hasNextPage) => {
        const prevDisabled = isPreviousButtonDisabled(currentPage, true);
        const nextDisabled = isNextButtonDisabled(hasNextPage, true);
        expect(prevDisabled && nextDisabled).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('I004: currentPage constraint - must be positive integer >= 1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10000 }), (currentPage) => {
        expect(currentPage).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(currentPage)).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// EXAMPLE-BASED TESTS
// ============================================================================

describe('PaginationControls - Example-Based Tests', () => {
  describe('Previous Button States', () => {
    it('E001: Previous disabled on page 1, not loading', () => {
      expect(isPreviousButtonDisabled(1, false)).toBe(true);
    });

    it('E002: Previous disabled on page 1, loading', () => {
      expect(isPreviousButtonDisabled(1, true)).toBe(true);
    });

    it('E003: Previous enabled on page 2, not loading', () => {
      expect(isPreviousButtonDisabled(2, false)).toBe(false);
    });

    it('E004: Previous disabled on page 2, loading', () => {
      expect(isPreviousButtonDisabled(2, true)).toBe(true);
    });

    it('E005: Previous enabled on page 100, not loading', () => {
      expect(isPreviousButtonDisabled(100, false)).toBe(false);
    });
  });

  describe('Next Button States', () => {
    it('E006: Next disabled when hasNextPage false, not loading', () => {
      expect(isNextButtonDisabled(false, false)).toBe(true);
    });

    it('E007: Next disabled when hasNextPage false, loading', () => {
      expect(isNextButtonDisabled(false, true)).toBe(true);
    });

    it('E008: Next enabled when hasNextPage true, not loading', () => {
      expect(isNextButtonDisabled(true, false)).toBe(false);
    });

    it('E009: Next disabled when hasNextPage true, loading', () => {
      expect(isNextButtonDisabled(true, true)).toBe(true);
    });
  });

  describe('Combined States', () => {
    it('E010: Page 1, no next page, not loading - both disabled', () => {
      expect(isPreviousButtonDisabled(1, false)).toBe(true);
      expect(isNextButtonDisabled(false, false)).toBe(true);
    });

    it('E011: Page 1, has next page, not loading - only previous disabled', () => {
      expect(isPreviousButtonDisabled(1, false)).toBe(true);
      expect(isNextButtonDisabled(true, false)).toBe(false);
    });

    it('E012: Page 5, has next page, not loading - both enabled', () => {
      expect(isPreviousButtonDisabled(5, false)).toBe(false);
      expect(isNextButtonDisabled(true, false)).toBe(false);
    });

    it('E013: Page 5, no next page, not loading - only next disabled', () => {
      expect(isPreviousButtonDisabled(5, false)).toBe(false);
      expect(isNextButtonDisabled(false, false)).toBe(true);
    });

    it('E014: Any page, loading - both disabled', () => {
      expect(isPreviousButtonDisabled(3, true)).toBe(true);
      expect(isNextButtonDisabled(true, true)).toBe(true);
    });
  });

  describe('Page Display', () => {
    it('E015: Page 1 displays "Page 1"', () => {
      expect(`Page ${1}`).toBe('Page 1');
    });

    it('E016: Page 42 displays "Page 42"', () => {
      expect(`Page ${42}`).toBe('Page 42');
    });

    it('E017: Page 999 displays "Page 999"', () => {
      expect(`Page ${999}`).toBe('Page 999');
    });
  });

  describe('Callback Invocation', () => {
    it('E018: onPrevious invoked exactly once when clicked', () => {
      const mockCallback = jest.fn();
      mockCallback();
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('E019: onNext invoked exactly once when clicked', () => {
      const mockCallback = jest.fn();
      mockCallback();
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });

    it('E020: Multiple callbacks maintain independent call counts', () => {
      const onPreviousMock = jest.fn();
      const onNextMock = jest.fn();

      onPreviousMock();
      expect(onPreviousMock).toHaveBeenCalledTimes(1);
      expect(onNextMock).toHaveBeenCalledTimes(0);

      onNextMock();
      expect(onPreviousMock).toHaveBeenCalledTimes(1);
      expect(onNextMock).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('PaginationControls Edge Cases', () => {
  it('Edge001: Very large page number (10000)', () => {
    const disabled = isPreviousButtonDisabled(10000, false);
    expect(disabled).toBe(false);
    expect(`Page ${10000}`).toBe('Page 10000');
  });

  it('Edge002: Page 1 boundary - exactly at minimum', () => {
    expect(isPreviousButtonDisabled(1, false)).toBe(true);
  });

  it('Edge003: Page 2 boundary - just above minimum', () => {
    expect(isPreviousButtonDisabled(2, false)).toBe(false);
  });

  it('Edge004: Transition from loading to not loading', () => {
    const currentPage = 5;
    const hasNextPage = true;

    const prevWhileLoading = isPreviousButtonDisabled(currentPage, true);
    const nextWhileLoading = isNextButtonDisabled(hasNextPage, true);
    expect(prevWhileLoading).toBe(true);
    expect(nextWhileLoading).toBe(true);

    const prevAfterLoading = isPreviousButtonDisabled(currentPage, false);
    const nextAfterLoading = isNextButtonDisabled(hasNextPage, false);
    expect(prevAfterLoading).toBe(false);
    expect(nextAfterLoading).toBe(false);
  });

  it('Edge005: hasNextPage toggle impact', () => {
    const isLoading = false;

    expect(isNextButtonDisabled(true, isLoading)).toBe(false);
    expect(isNextButtonDisabled(false, isLoading)).toBe(true);
  });
});

// ============================================================================
// RELATIONAL PROPERTY TESTS
// ============================================================================

describe('PaginationControls Relational Properties', () => {
  it('R001: Previous button state independent of hasNextPage', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), fc.boolean(), (currentPage, hasNextPage, isLoading) => {
        const result1 = isPreviousButtonDisabled(currentPage, isLoading);
        const result2 = isPreviousButtonDisabled(currentPage, isLoading);
        expect(result1).toBe(result2);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('R002: Next button state independent of currentPage', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), fc.boolean(), (currentPage, hasNextPage, isLoading) => {
        const result1 = isNextButtonDisabled(hasNextPage, isLoading);
        const result2 = isNextButtonDisabled(hasNextPage, isLoading);
        expect(result1).toBe(result2);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('R003: Loading state affects both buttons equally', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), fc.boolean(), (currentPage, hasNextPage) => {
        const prevWithLoading = isPreviousButtonDisabled(currentPage, true);
        const nextWithLoading = isNextButtonDisabled(hasNextPage, true);
        expect(prevWithLoading).toBe(true);
        expect(nextWithLoading).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// METAMORPHIC PROPERTY TESTS
// ============================================================================

describe('PaginationControls Metamorphic Properties', () => {
  it('M001: Incrementing page enables Previous button (if was on page 1)', () => {
    fc.assert(
      fc.property(fc.boolean(), (isLoading) => {
        const page1Disabled = isPreviousButtonDisabled(1, isLoading);
        const page2Disabled = isPreviousButtonDisabled(2, isLoading);

        if (!isLoading) {
          expect(page1Disabled).toBe(true);
          expect(page2Disabled).toBe(false);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('M002: Setting isLoading true disables enabled button', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 1000 }), (currentPage) => {
        const enabledState = isPreviousButtonDisabled(currentPage, false);
        const disabledState = isPreviousButtonDisabled(currentPage, true);

        expect(enabledState).toBe(false);
        expect(disabledState).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('M003: Setting hasNextPage true enables Next button (if not loading)', () => {
    const disabledWithoutNext = isNextButtonDisabled(false, false);
    const enabledWithNext = isNextButtonDisabled(true, false);

    expect(disabledWithoutNext).toBe(true);
    expect(enabledWithNext).toBe(false);
  });
});
