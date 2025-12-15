/**
 * Theme Filtering Logic
 *
 * Pure functions for filtering theme lists based on user-selected criteria.
 * Now uses theme metadata for filtering instead of hardcoded mappings.
 */

import { ThemeMetadata } from '../../themes/definitions';
import { ThemeFilters, ColorFamilyFilter, BrightnessFilter } from './types';

/**
 * Filter themes based on brightness and color family criteria
 *
 * CONTRACT:
 *   Inputs:
 *     - themes: collection of ThemeMetadata objects, non-empty
 *     - filters: ThemeFilters object containing brightness and colorFamily criteria
 *
 *   Outputs:
 *     - filtered collection of ThemeMetadata objects
 *     - collection size: 0 <= output.length <= input.length
 *
 *   Invariants:
 *     - When both filters are 'all', output equals input (no filtering)
 *     - Output is subset of input (no new themes added)
 *     - Order preserved: output themes appear in same order as input
 *     - Empty input produces empty output
 *
 *   Properties:
 *     - Identity: filterThemes(themes, {brightness: 'all', colorFamily: 'all'}) equals themes
 *     - Subset: every theme in output exists in input
 *     - Order preservation: for themes A,B in output where A appears before B in input, A appears before B in output
 *     - Commutative filtering: brightness filter then color family filter equals color family then brightness
 *     - Monotonic: more restrictive filters never increase output size
 */
export function filterThemes(themes: ThemeMetadata[], filters: ThemeFilters): ThemeMetadata[] {
  return themes.filter(
    (theme) =>
      matchesBrightness(theme, filters.brightness) &&
      matchesColorFamily(theme, filters.colorFamily)
  );
}

/**
 * Check if theme matches brightness filter
 *
 * Uses theme.brightness metadata when available, falls back to legacy logic.
 *
 * CONTRACT:
 *   Inputs:
 *     - theme: ThemeMetadata object
 *     - filter: BrightnessFilter value ('all', 'light', or 'dark')
 *
 *   Outputs:
 *     - boolean: true if theme matches filter criteria
 *
 *   Invariants:
 *     - filter 'all' always returns true
 *     - filter matches theme.brightness when metadata is present
 */
export function matchesBrightness(theme: ThemeMetadata, filter: BrightnessFilter): boolean {
  if (filter === 'all') return true;

  // Use theme metadata if available
  if (theme.brightness) {
    return theme.brightness === filter;
  }

  // Legacy fallback for themes without brightness metadata
  if (filter === 'light') {
    return theme.id === 'light';
  }
  return theme.id !== 'light';
}

/**
 * Check if theme matches color family filter
 *
 * Uses theme.colorFamily metadata when available, falls back to legacy logic.
 *
 * CONTRACT:
 *   Inputs:
 *     - theme: ThemeMetadata object
 *     - filter: ColorFamilyFilter value ('all', 'blues', 'greens', 'warm', 'purple', 'pink', 'neutral')
 *
 *   Outputs:
 *     - boolean: true if theme matches filter criteria
 *
 *   Invariants:
 *     - filter 'all' always returns true
 *     - filter matches theme.colorFamily when metadata is present
 */
export function matchesColorFamily(theme: ThemeMetadata, filter: ColorFamilyFilter): boolean {
  if (filter === 'all') return true;

  // Use theme metadata if available
  if (theme.colorFamily) {
    return theme.colorFamily === filter;
  }

  // Legacy fallback for themes without colorFamily metadata
  const legacyColorFamilies: Record<string, string[]> = {
    blues: ['light', 'dark', 'ocean', 'twilight', 'arctic'],
    greens: ['forest', 'mint', 'neon'],
    warm: ['sunset', 'ember', 'amber', 'sandstone', 'mocha', 'copper'],
    purple: ['purple-haze', 'lavender'],
    pink: ['rose', 'sakura'],
    neutral: ['slate', 'midnight'],
  };

  return legacyColorFamilies[filter]?.includes(theme.id) ?? false;
}
