/**
 * Theme Loader
 *
 * Loads theme JSON files and resolves inheritance.
 * Uses static imports for Jest compatibility.
 */

import type {
  ThemeId,
  ThemeJSON,
  ResolvedTheme,
  BrandColors,
  SemanticColors,
  Typography,
  Radii,
  Shadows,
} from './schema';

// Static imports for all theme JSON files
// This approach works in both Vite and Jest
import defaultTheme from './json/default.json';
import lightTheme from './json/light.json';
import darkTheme from './json/dark.json';
import sunsetTheme from './json/sunset.json';
import oceanTheme from './json/ocean.json';
import forestTheme from './json/forest.json';
import purpleHazeTheme from './json/purple-haze.json';
import emberTheme from './json/ember.json';
import twilightTheme from './json/twilight.json';
import mintTheme from './json/mint.json';
import amberTheme from './json/amber.json';
import slateTheme from './json/slate.json';
import roseTheme from './json/rose.json';
import neonTheme from './json/neon.json';
import sandstoneTheme from './json/sandstone.json';
import arcticTheme from './json/arctic.json';
import mochaTheme from './json/mocha.json';
import sakuraTheme from './json/sakura.json';
import midnightTheme from './json/midnight.json';
import lavenderTheme from './json/lavender.json';
import copperTheme from './json/copper.json';

// All theme modules
const themeModules: Record<string, ThemeJSON> = {
  default: defaultTheme as ThemeJSON,
  light: lightTheme as ThemeJSON,
  dark: darkTheme as ThemeJSON,
  sunset: sunsetTheme as ThemeJSON,
  ocean: oceanTheme as ThemeJSON,
  forest: forestTheme as ThemeJSON,
  'purple-haze': purpleHazeTheme as ThemeJSON,
  ember: emberTheme as ThemeJSON,
  twilight: twilightTheme as ThemeJSON,
  mint: mintTheme as ThemeJSON,
  amber: amberTheme as ThemeJSON,
  slate: slateTheme as ThemeJSON,
  rose: roseTheme as ThemeJSON,
  neon: neonTheme as ThemeJSON,
  sandstone: sandstoneTheme as ThemeJSON,
  arctic: arcticTheme as ThemeJSON,
  mocha: mochaTheme as ThemeJSON,
  sakura: sakuraTheme as ThemeJSON,
  midnight: midnightTheme as ThemeJSON,
  lavender: lavenderTheme as ThemeJSON,
  copper: copperTheme as ThemeJSON,
};

// Raw theme cache (before inheritance resolution)
const rawThemeCache: Map<string, ThemeJSON> = new Map();

// Resolved theme cache (after inheritance resolution)
const resolvedThemeCache: Map<string, ResolvedTheme> = new Map();

/**
 * Initialize theme cache from imported modules
 */
function initializeCache(): void {
  if (rawThemeCache.size > 0) return;

  for (const [id, themeData] of Object.entries(themeModules)) {
    rawThemeCache.set(id, themeData);
  }
}

/**
 * Deep merge two objects, with source overriding target
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = deepMerge(
          targetValue as object,
          sourceValue as object
        );
      } else if (sourceValue !== undefined) {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Get the default theme (base theme with all values)
 */
function getDefaultTheme(): ResolvedTheme {
  initializeCache();

  const defaultJson = rawThemeCache.get('default');
  if (!defaultJson) {
    throw new Error('Default theme not found. Ensure default.json exists in themes/json/');
  }

  return {
    id: 'default' as ThemeId,
    name: defaultJson.name,
    description: defaultJson.description,
    metadata: defaultJson.metadata,
    colors: {
      brand: defaultJson.colors.brand as BrandColors,
      semantic: defaultJson.colors.semantic as SemanticColors,
      previewColors: defaultJson.colors.previewColors,
    },
    typography: defaultJson.typography as Required<Typography>,
    radii: defaultJson.radii as Required<Radii>,
    shadows: defaultJson.shadows as Required<Shadows>,
  };
}

/**
 * Resolve a theme with its inheritance chain
 */
export function resolveTheme(themeId: string): ResolvedTheme {
  initializeCache();

  // Check cache first
  if (resolvedThemeCache.has(themeId)) {
    return resolvedThemeCache.get(themeId)!;
  }

  // Get raw theme data
  const theme = rawThemeCache.get(themeId);
  if (!theme) {
    console.warn(`Theme "${themeId}" not found, falling back to dark`);
    return resolveTheme('dark');
  }

  // Base case: default theme has no parent
  if (themeId === 'default' || !theme.extends) {
    if (themeId === 'default') {
      const resolved = getDefaultTheme();
      resolvedThemeCache.set(themeId, resolved);
      return resolved;
    }
    // Theme without extends inherits from default
    theme.extends = 'default';
  }

  // Recursive case: merge with parent
  const parent = resolveTheme(theme.extends);

  const resolved: ResolvedTheme = {
    id: theme.id as ThemeId,
    name: theme.name,
    description: theme.description,
    metadata: deepMerge(parent.metadata, theme.metadata),
    colors: {
      brand: deepMerge(parent.colors.brand, theme.colors.brand || {}),
      semantic: deepMerge(parent.colors.semantic, theme.colors.semantic || {}),
      previewColors: theme.colors.previewColors,
    },
    typography: deepMerge(parent.typography, theme.typography || {}),
    radii: deepMerge(parent.radii, theme.radii || {}),
    shadows: deepMerge(parent.shadows, theme.shadows || {}),
  };

  resolvedThemeCache.set(themeId, resolved);
  return resolved;
}

/**
 * Get all available theme IDs
 */
export function getAllThemeIds(): ThemeId[] {
  initializeCache();
  // Filter out 'default' as it's not user-selectable
  return Array.from(rawThemeCache.keys()).filter((id) => id !== 'default') as ThemeId[];
}

/**
 * Get all resolved themes
 */
export function getAllThemes(): ResolvedTheme[] {
  return getAllThemeIds().map((id) => resolveTheme(id));
}

/**
 * Check if a theme ID is valid
 */
export function isValidThemeId(id: string): id is ThemeId {
  initializeCache();
  return rawThemeCache.has(id) && id !== 'default';
}

/**
 * Get semantic colors for a theme
 */
export function getSemanticColors(themeId: string): SemanticColors {
  const theme = resolveTheme(themeId);
  return theme.colors.semantic;
}

/**
 * Get brand colors for a theme
 */
export function getBrandColors(themeId: string): BrandColors {
  const theme = resolveTheme(themeId);
  return theme.colors.brand;
}

/**
 * Get theme metadata
 */
export function getThemeMetadata(
  themeId: string
): ResolvedTheme['metadata'] & { name: string; description: string; previewColors: ResolvedTheme['colors']['previewColors'] } {
  const theme = resolveTheme(themeId);
  return {
    ...theme.metadata,
    name: theme.name,
    description: theme.description,
    previewColors: theme.colors.previewColors,
  };
}
