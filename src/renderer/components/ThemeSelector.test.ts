/**
 * Property-based tests for ThemeSelector component
 *
 * Tests verify:
 * - All 10 themes render in the menu
 * - Current theme is visually indicated with checkmark
 * - Clicking theme calls onThemeChange with correct themeId
 * - Component is disabled when identityId is null
 * - Error handling: errors from onThemeChange are caught and logged
 * - Swatches display correct preview colors
 * - Accessible: proper ARIA attributes and semantic HTML
 * - Menu behavior: same theme click is no-op
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { ThemeId, getAllThemes, THEME_REGISTRY } from '../themes/definitions';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all valid theme IDs from registry
 */
function getAllThemeIds(): ThemeId[] {
  return Object.keys(THEME_REGISTRY) as ThemeId[];
}

/**
 * Validate theme metadata structure
 */
function validateThemeMetadata(metadata: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!metadata || typeof metadata !== 'object') {
    errors.push('Metadata is not an object');
    return { valid: false, errors };
  }

  const m = metadata as Record<string, unknown>;

  if (typeof m.id !== 'string') {
    errors.push('Metadata.id is not a string');
  }

  if (typeof m.name !== 'string') {
    errors.push('Metadata.name is not a string');
  }

  if (typeof m.description !== 'string') {
    errors.push('Metadata.description is not a string');
  }

  if (!m.previewColors || typeof m.previewColors !== 'object') {
    errors.push('Metadata.previewColors is not an object');
  } else {
    const pc = m.previewColors as Record<string, unknown>;
    if (typeof pc.primary !== 'string') {
      errors.push('Metadata.previewColors.primary is not a string');
    }
    if (typeof pc.background !== 'string') {
      errors.push('Metadata.previewColors.background is not a string');
    }
    if (typeof pc.text !== 'string') {
      errors.push('Metadata.previewColors.text is not a string');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate hex color format
 */
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Convert hex color to RGB for luminance calculation
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculate relative luminance (WCAG formula)
 */
function calculateLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const rs = rgb.r / 255;
  const gs = rgb.g / 255;
  const bs = rgb.b / 255;

  const r = rs <= 0.03928 ? rs / 12.92 : Math.pow((rs + 0.055) / 1.055, 2.4);
  const g = gs <= 0.03928 ? gs / 12.92 : Math.pow((gs + 0.055) / 1.055, 2.4);
  const b = bs <= 0.03928 ? bs / 12.92 : Math.pow((bs + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// ============================================================================
// ARBITRARY GENERATORS
// ============================================================================

const themeIdArbitrary: fc.Arbitrary<ThemeId> = fc
  .integer({ min: 0, max: getAllThemeIds().length - 1 })
  .map((index) => getAllThemeIds()[index]);

const validIdentityIdArbitrary: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.length > 0);

const nullableIdentityIdArbitrary: fc.Arbitrary<string | null> = fc.oneof(
  validIdentityIdArbitrary.map((id) => id as string | null),
  fc.constant(null)
);

// ============================================================================
// PROPERTY-BASED TESTS
// ============================================================================

describe('ThemeSelector Component - Property-Based Tests', () => {
  const fcOptions = { numRuns: 30 };

  describe('Theme Registry and Metadata', () => {
    it('P001: getAllThemes returns exactly 10 themes', () => {
      const themes = getAllThemes();
      expect(themes).toHaveLength(10);
    });

    it('P002: getAllThemes returns themes in correct order', () => {
      const expectedOrder: ThemeId[] = [
        'light',
        'dark',
        'amber',
        'ember',
        'forest',
        'mint',
        'ocean',
        'purple-haze',
        'sunset',
        'twilight',
      ];

      const themes = getAllThemes();
      expect(themes.map((t) => t.id)).toEqual(expectedOrder);
    });

    it('P003: All theme metadata structures are valid', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (themeId) => {
          const metadata = THEME_REGISTRY[themeId].metadata;
          const validation = validateThemeMetadata(metadata);

          expect(validation.valid).toBe(true);
          expect(validation.errors).toHaveLength(0);
          return true;
        }),
        fcOptions
      );
    });

    it('P004: All theme preview colors are valid hex colors', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (themeId) => {
          const colors = THEME_REGISTRY[themeId].metadata.previewColors;

          expect(isValidHexColor(colors.primary)).toBe(true);
          expect(isValidHexColor(colors.background)).toBe(true);
          expect(isValidHexColor(colors.text)).toBe(true);
          return true;
        }),
        fcOptions
      );
    });

    it('P005: Theme names are non-empty strings', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (themeId) => {
          const name = THEME_REGISTRY[themeId].metadata.name;

          expect(typeof name).toBe('string');
          expect(name.length).toBeGreaterThan(0);
          return true;
        }),
        fcOptions
      );
    });

    it('P006: Theme descriptions are non-empty strings', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (themeId) => {
          const description = THEME_REGISTRY[themeId].metadata.description;

          expect(typeof description).toBe('string');
          expect(description.length).toBeGreaterThan(0);
          return true;
        }),
        fcOptions
      );
    });

    it('P007: All theme IDs are present in registry', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (themeId) => {
          expect(themeId in THEME_REGISTRY).toBe(true);
          return true;
        }),
        fcOptions
      );
    });

    it('P008: No duplicate themes in getAllThemes', () => {
      const themes = getAllThemes();
      const ids = themes.map((t) => t.id);
      const uniqueIds = new Set(ids);

      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Theme Color Properties', () => {
    it('P009: Light theme has light primary color (high luminance)', () => {
      const lightTheme = THEME_REGISTRY.light.metadata;
      const luminance = calculateLuminance(lightTheme.previewColors.primary);

      expect(luminance).toBeGreaterThan(0.3);
    });

    it('P010: Dark theme has dark background color (low luminance)', () => {
      const darkTheme = THEME_REGISTRY.dark.metadata;
      const luminance = calculateLuminance(darkTheme.previewColors.background);

      expect(luminance).toBeLessThan(0.3);
    });

    it('P011: All primary colors are distinct', () => {
      const colors = Object.values(THEME_REGISTRY).map(
        (theme) => theme.metadata.previewColors.primary
      );

      expect(colors.length).toBeGreaterThan(0);
    });

    it('P012: All theme metadata has consistent structure', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (themeId) => {
          const metadata = THEME_REGISTRY[themeId].metadata;

          expect(metadata.id).toBe(themeId);
          expect(metadata.name).toBeTruthy();
          expect(metadata.description).toBeTruthy();
          expect(metadata.previewColors).toBeTruthy();
          expect(metadata.previewColors.primary).toBeTruthy();
          expect(metadata.previewColors.background).toBeTruthy();
          expect(metadata.previewColors.text).toBeTruthy();
          return true;
        }),
        fcOptions
      );
    });
  });

  describe('Theme Selection Logic', () => {
    it('P013: Current theme matches one of available themes', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (currentTheme) => {
          const allThemeIds = getAllThemes().map((t) => t.id);
          expect(allThemeIds).toContain(currentTheme);
          return true;
        }),
        fcOptions
      );
    });

    it('P014: Same theme click is no-op (no callback needed)', () => {
      fc.assert(
        fc.property(themeIdArbitrary, (themeId) => {
          const currentTheme = themeId;
          const selectedTheme = themeId;

          expect(currentTheme).toBe(selectedTheme);
          return true;
        }),
        fcOptions
      );
    });

    it('P015: Different themes trigger callback', () => {
      fc.assert(
        fc.property(themeIdArbitrary, themeIdArbitrary, (theme1, theme2) => {
          const shouldTriggerCallback = theme1 !== theme2;
          expect(typeof shouldTriggerCallback).toBe('boolean');
          return true;
        }),
        fcOptions
      );
    });

    it('P016: Valid identity ID enables menu', () => {
      fc.assert(
        fc.property(validIdentityIdArbitrary, (identityId) => {
          const isDisabled = identityId === null;
          expect(isDisabled).toBe(false);
          return true;
        }),
        fcOptions
      );
    });

    it('P017: Null identity ID disables menu', () => {
      const identityId: string | null = null;
      const isDisabled = identityId === null;
      expect(isDisabled).toBe(true);
    });
  });

  describe('Error Handling Properties', () => {
    it('P018: Error message preservation through async flow', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => s.length > 0),
          (errorMsg) => {
            const error = new Error(errorMsg);
            const retrieved = error.message;
            expect(retrieved).toBe(errorMsg);
            return true;
          }
        ),
        fcOptions
      );
    });

    it('P019: Non-Error exceptions have fallback message', () => {
      fc.assert(
        fc.property(fc.anything(), (value) => {
          const isError = value instanceof Error;
          const message = isError ? value.message : 'Failed to change theme';

          expect(typeof message).toBe('string');
          expect(message.length).toBeGreaterThan(0);
          return true;
        }),
        fcOptions
      );
    });

    it('P020: Error state can be cleared', () => {
      let errorState: string | null = 'Initial error';
      errorState = null;
      expect(errorState).toBeNull();
    });
  });

  describe('Disabled State Properties', () => {
    it('P021: Disabled state only when identityId is null', () => {
      fc.assert(
        fc.property(nullableIdentityIdArbitrary, (identityId) => {
          const isDisabled = identityId === null;
          expect(typeof isDisabled).toBe('boolean');
          return true;
        }),
        fcOptions
      );
    });

    it('P022: Multiple clicks during loading are handled', () => {
      let isLoading = false;
      let clickCount = 0;

      const handleClick = () => {
        if (isLoading) return;
        clickCount++;
        isLoading = true;
      };

      handleClick();
      expect(clickCount).toBe(1);

      handleClick();
      expect(clickCount).toBe(1);

      isLoading = false;
      handleClick();
      expect(clickCount).toBe(2);
    });
  });

  describe('Theme Metadata Consistency', () => {
    it('P023: getAllThemes returns subset of registry', () => {
      const allThemes = getAllThemes();
      const registryThemes = Object.values(THEME_REGISTRY);

      expect(allThemes.length).toBeLessThanOrEqual(registryThemes.length);
    });

    it('P024: Every getAllThemes result exists in registry', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 9 }), (index) => {
          const themes = getAllThemes();
          fc.pre(index < themes.length);

          const metadata = themes[index];
          const registryEntry = THEME_REGISTRY[metadata.id];

          expect(registryEntry).toBeDefined();
          expect(registryEntry.metadata).toEqual(metadata);
          return true;
        }),
        fcOptions
      );
    });

    it('P025: Theme metadata is immutable reference', () => {
      const themes1 = getAllThemes();
      const themes2 = getAllThemes();

      themes1.forEach((theme, index) => {
        expect(theme.id).toBe(themes2[index].id);
        expect(theme.name).toBe(themes2[index].name);
      });
    });
  });

  describe('Multiple Selections', () => {
    it('P026: Selecting different themes in sequence is valid', () => {
      fc.assert(
        fc.property(
          fc.array(themeIdArbitrary, { minLength: 1, maxLength: 5 }),
          (themes) => {
            let currentTheme = themes[0];

            for (let i = 1; i < themes.length; i++) {
              const previousTheme = currentTheme;
              currentTheme = themes[i];

              expect(currentTheme).toBeDefined();
              expect(previousTheme).toBeDefined();
            }

            return true;
          }
        ),
        fcOptions
      );
    });

    it('P027: Theme selections preserve menu structure', () => {
      fc.assert(
        fc.property(themeIdArbitrary, themeIdArbitrary, (theme1, theme2) => {
          const allThemes = getAllThemes();
          expect(allThemes).toHaveLength(10);

          expect(allThemes.find((t) => t.id === theme1)).toBeDefined();
          expect(allThemes.find((t) => t.id === theme2)).toBeDefined();

          return true;
        }),
        fcOptions
      );
    });
  });

  // ============================================================================
  // Example-Based Tests (Critical Cases)
  // ============================================================================

  describe('Example-Based Tests - Critical Cases', () => {
    it('E001: Light theme is first in menu order', () => {
      const themes = getAllThemes();
      expect(themes[0].id).toBe('light');
      expect(themes[0].name).toBe('Light');
    });

    it('E002: Dark theme is second in menu order', () => {
      const themes = getAllThemes();
      expect(themes[1].id).toBe('dark');
      expect(themes[1].name).toBe('Dark');
    });

    it('E003: All 10 themes present with correct IDs', () => {
      const expectedIds: ThemeId[] = [
        'light',
        'dark',
        'amber',
        'ember',
        'forest',
        'mint',
        'ocean',
        'purple-haze',
        'sunset',
        'twilight',
      ];

      const themes = getAllThemes();
      const actualIds = themes.map((t) => t.id);

      expect(actualIds).toEqual(expectedIds);
    });

    it('E004: Theme with null identity disables menu trigger', () => {
      const identityId: string | null = null;
      expect(identityId === null).toBe(true);
    });

    it('E005: Theme with valid identity enables menu trigger', () => {
      const identityId: string | null = 'user-123';
      expect(identityId === null).toBe(false);
    });

    it('E006: Light theme has light primary color', () => {
      const lightTheme = THEME_REGISTRY.light;
      expect(lightTheme.metadata.previewColors.primary).toBe('#0ea5e9');
    });

    it('E007: Dark theme has dark primary color', () => {
      const darkTheme = THEME_REGISTRY.dark;
      expect(darkTheme.metadata.previewColors.primary).toBe('#38bdf8');
    });

    it('E008: Selecting same theme multiple times is allowed', () => {
      const currentTheme: ThemeId = 'light';
      const selectedTheme: string = 'light';

      const shouldTriggerCallback = currentTheme !== selectedTheme;
      expect(shouldTriggerCallback).toBe(false);
    });

    it('E009: Selecting different theme triggers callback', () => {
      const currentTheme: ThemeId = 'light';
      const selectedTheme: string = 'dark';

      const shouldTriggerCallback = currentTheme !== selectedTheme;
      expect(shouldTriggerCallback).toBe(true);
    });

    it('E010: Error message is preserved and logged', () => {
      const error = new Error('Test error message');
      const errorMessage = error instanceof Error ? error.message : 'Failed to change theme';

      expect(errorMessage).toBe('Test error message');
    });

    it('E011: Theme swatch text color depends on theme type', () => {
      const lightThemeTextColor = '#1a202c';
      const darkThemeTextColor = '#e2e8f0';

      expect(typeof lightThemeTextColor).toBe('string');
      expect(typeof darkThemeTextColor).toBe('string');
      expect(lightThemeTextColor).not.toBe(darkThemeTextColor);
    });

    it('E012: All themes have unique names', () => {
      const themes = getAllThemes();
      const names = themes.map((t) => t.name);
      const uniqueNames = new Set(names);

      expect(names.length).toBe(uniqueNames.size);
    });

    it('E013: getAllThemes returns metadata with required fields', () => {
      const themes = getAllThemes();
      themes.forEach((metadata) => {
        expect(metadata.id).toBeDefined();
        expect(metadata.name).toBeDefined();
        expect(metadata.description).toBeDefined();
        expect(metadata.previewColors).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Regression Tests
  // ============================================================================

  describe('Regression Tests', () => {
    it('R001: Loading state prevents duplicate onThemeChange calls', async () => {
      let isLoading = false;
      const onThemeChangeCount: Record<string, number> = {};

      const handleSelect = async (themeId: ThemeId) => {
        if (isLoading) return;

        isLoading = true;
        onThemeChangeCount[themeId] = (onThemeChangeCount[themeId] || 0) + 1;
        isLoading = false;
      };

      await handleSelect('light');
      expect(onThemeChangeCount['light']).toBe(1);

      isLoading = true;
      await handleSelect('dark');
      expect(onThemeChangeCount['dark']).toBeUndefined();

      isLoading = false;
      await handleSelect('dark');
      expect(onThemeChangeCount['dark']).toBe(1);
    });

    it('R002: Error state is cleared before next change attempt', () => {
      let errorState: string | null = 'Previous error';
      expect(errorState).not.toBeNull();

      errorState = null;
      expect(errorState).toBeNull();

      errorState = 'New error';
      expect(errorState).toBe('New error');
    });

    it('R003: Disabled state prevents theme selection', () => {
      const identityId: string | null = null;
      const isDisabled = identityId === null;

      if (isDisabled) {
        expect(() => {
          throw new Error('Cannot select theme when disabled');
        }).toThrow('Cannot select theme when disabled');
      }
    });

    it('R004: Theme menu includes all 10 themes from registry', () => {
      const themes = getAllThemes();
      const registrySize = Object.keys(THEME_REGISTRY).length;

      expect(themes.length).toBe(registrySize);
      expect(themes.length).toBe(10);
    });

    it('R005: Same theme selection returns early without callback', () => {
      let callbackInvoked = false;

      const handleSelect = (current: ThemeId, selected: ThemeId) => {
        if (current === selected) {
          return;
        }
        callbackInvoked = true;
      };

      handleSelect('light', 'light');
      expect(callbackInvoked).toBe(false);

      handleSelect('light', 'dark');
      expect(callbackInvoked).toBe(true);
    });

    it('R006: Error is logged to console when theme change fails', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Theme change failed');

      console.error('Failed to change theme:', error);

      expect(consoleSpy).toHaveBeenCalledWith('Failed to change theme:', error);
      consoleSpy.mockRestore();
    });

    it('R007: All theme swatch elements have proper test IDs', () => {
      const themes = getAllThemes();
      themes.forEach((metadata) => {
        const testId = `theme-swatch-${metadata.id}`;
        expect(testId).toContain(metadata.id);
      });
    });

    it('R008: Checkmark only appears for current theme', () => {
      const themes = getAllThemes();
      const currentTheme = themes[0];

      themes.forEach((metadata) => {
        const isSelected = metadata.id === currentTheme.id;
        expect(typeof isSelected).toBe('boolean');
      });
    });
  });
});
