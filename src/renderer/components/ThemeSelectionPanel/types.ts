/**
 * Type Definitions for Theme Selection Panel
 *
 * Shared types and interfaces used across all theme selection components.
 */

import { ThemeId, ThemeMetadata, ColorFamily } from '../../themes/definitions';

/**
 * Brightness filter option
 */
export type BrightnessFilter = 'all' | 'light' | 'dark';

/**
 * Color family filter option - matches ColorFamily from schema plus 'all'
 */
export type ColorFamilyFilter = 'all' | ColorFamily;

/**
 * Complete filter state
 */
export interface ThemeFilters {
  brightness: BrightnessFilter;
  colorFamily: ColorFamilyFilter;
}

/**
 * Theme carousel navigation direction
 */
export type CarouselDirection = 'prev' | 'next';
