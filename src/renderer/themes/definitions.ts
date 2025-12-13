/**
 * Theme Definitions
 *
 * Centralized registry of all Chakra UI v3 theme configurations.
 * Each theme provides a complete color token set compatible with defineConfig().
 *
 * Semantic tokens defined per theme:
 * - appBg: Main application shell background
 * - surfaceBg: Cards, panels, header, footer backgrounds
 * - surfaceBgSubtle: Subtle surface backgrounds (hover states)
 * - surfaceBgSelected: Selected item backgrounds
 * - menuBg: Dropdown menu backgrounds
 * - border: Primary border color
 * - borderSubtle: Subtle border color
 * - text: Primary text color
 * - textMuted: Secondary/muted text color
 * - textSubtle: Most muted text (hints, timestamps)
 */

import { defineConfig } from '@chakra-ui/react';

/**
 * Theme identifier - extensible for future custom themes
 */
export type ThemeId =
  | 'light'
  | 'dark'
  | 'sunset'
  | 'ocean'
  | 'forest'
  | 'purple-haze'
  | 'ember'
  | 'twilight'
  | 'mint'
  | 'amber';

/**
 * Theme metadata for UI display
 */
export interface ThemeMetadata {
  id: ThemeId;
  name: string;
  description: string;
  previewColors: {
    primary: string;
    background: string;
    text: string;
  };
}

/**
 * Semantic color palette for consistent theming across all components
 */
export interface ThemeSemanticColors {
  appBg: string;
  surfaceBg: string;
  surfaceBgSubtle: string;
  surfaceBgSelected: string;
  menuBg: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  textSubtle: string;
}

/**
 * Complete theme definition including Chakra config
 */
export interface ThemeDefinition {
  metadata: ThemeMetadata;
  config: ReturnType<typeof defineConfig>;
  semanticColors: ThemeSemanticColors;
}

/**
 * Theme registry - single source of truth for all themes
 *
 * IMPLEMENTATION NOTE:
 * Each theme must define:
 * - Complete Chakra UI v3 color token set
 * - WCAG AA contrast ratios (4.5:1 normal text, 3:1 large text)
 * - Distinctive visual identity
 * - Compatible with all existing UI components
 */
export const THEME_REGISTRY: Record<ThemeId, ThemeDefinition> = {
  light: {
    metadata: {
      id: 'light',
      name: 'Light',
      description: 'Clean light theme with high contrast',
      previewColors: {
        primary: '#0ea5e9',
        background: '#f8fafc',
        text: '#1e293b',
      },
    },
    semanticColors: {
      appBg: '#f8fafc',
      surfaceBg: '#ffffff',
      surfaceBgSubtle: '#f1f5f9',
      surfaceBgSelected: '#e2e8f0',
      menuBg: '#ffffff',
      border: '#e2e8f0',
      borderSubtle: '#cbd5e1',
      text: '#1e293b',
      textMuted: '#475569',
      textSubtle: '#94a3b8',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#e0f7ff' },
              100: { value: '#b8ecfe' },
              200: { value: '#8ee0fb' },
              300: { value: '#63d4f8' },
              400: { value: '#0ea5e9' },
              500: { value: '#0284c7' },
              600: { value: '#0369a1' },
              700: { value: '#075985' },
              800: { value: '#0c4a6e' },
              900: { value: '#083344' },
            },
          },
        },
      },
    }),
  },

  dark: {
    metadata: {
      id: 'dark',
      name: 'Dark',
      description: 'Default dark theme (current)',
      previewColors: {
        primary: '#38bdf8',
        background: '#0f172a',
        text: '#e2e8f0',
      },
    },
    semanticColors: {
      appBg: '#0f172a',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(255, 255, 255, 0.05)',
      surfaceBgSelected: 'rgba(255, 255, 255, 0.1)',
      menuBg: '#1e293b',
      border: 'rgba(255, 255, 255, 0.1)',
      borderSubtle: 'rgba(255, 255, 255, 0.2)',
      text: '#e2e8f0',
      textMuted: '#94a3b8',
      textSubtle: '#64748b',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#e0f7ff' },
              100: { value: '#b8ecfe' },
              200: { value: '#8ee0fb' },
              300: { value: '#63d4f8' },
              400: { value: '#38bdf8' },
              500: { value: '#0ea5e9' },
              600: { value: '#0284c7' },
              700: { value: '#0369a1' },
              800: { value: '#075985' },
              900: { value: '#0c4a6e' },
            },
          },
        },
      },
    }),
  },

  sunset: {
    metadata: {
      id: 'sunset',
      name: 'Sunset',
      description: 'Warm orange and pink gradient theme',
      previewColors: {
        primary: '#fb923c',
        background: '#1a1412',
        text: '#fed7aa',
      },
    },
    semanticColors: {
      appBg: '#1a1412',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(251, 146, 60, 0.05)',
      surfaceBgSelected: 'rgba(251, 146, 60, 0.15)',
      menuBg: '#2d211d',
      border: 'rgba(251, 146, 60, 0.2)',
      borderSubtle: 'rgba(251, 146, 60, 0.3)',
      text: '#fed7aa',
      textMuted: '#f9a870',
      textSubtle: '#c67d4d',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#fff7ed' },
              100: { value: '#ffedd5' },
              200: { value: '#fed7aa' },
              300: { value: '#fdba74' },
              400: { value: '#fb923c' },
              500: { value: '#f97316' },
              600: { value: '#ea580c' },
              700: { value: '#c2410c' },
              800: { value: '#9a3412' },
              900: { value: '#7c2d12' },
            },
          },
        },
      },
    }),
  },

  ocean: {
    metadata: {
      id: 'ocean',
      name: 'Ocean',
      description: 'Cool blue-teal aquatic theme',
      previewColors: {
        primary: '#06b6d4',
        background: '#0c1821',
        text: '#99f6e4',
      },
    },
    semanticColors: {
      appBg: '#0c1821',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(6, 182, 212, 0.05)',
      surfaceBgSelected: 'rgba(6, 182, 212, 0.15)',
      menuBg: '#0f2733',
      border: 'rgba(6, 182, 212, 0.2)',
      borderSubtle: 'rgba(6, 182, 212, 0.3)',
      text: '#99f6e4',
      textMuted: '#5eead4',
      textSubtle: '#2dd4bf',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#ecfeff' },
              100: { value: '#cffafe' },
              200: { value: '#a5f3fc' },
              300: { value: '#67e8f9' },
              400: { value: '#22d3ee' },
              500: { value: '#06b6d4' },
              600: { value: '#0891b2' },
              700: { value: '#0e7490' },
              800: { value: '#155e75' },
              900: { value: '#164e63' },
            },
          },
        },
      },
    }),
  },

  forest: {
    metadata: {
      id: 'forest',
      name: 'Forest',
      description: 'Nature-inspired green theme',
      previewColors: {
        primary: '#22c55e',
        background: '#0a1f0a',
        text: '#bbf7d0',
      },
    },
    semanticColors: {
      appBg: '#0a1f0a',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(34, 197, 94, 0.05)',
      surfaceBgSelected: 'rgba(34, 197, 94, 0.15)',
      menuBg: '#0d2b0d',
      border: 'rgba(34, 197, 94, 0.2)',
      borderSubtle: 'rgba(34, 197, 94, 0.3)',
      text: '#bbf7d0',
      textMuted: '#86efac',
      textSubtle: '#4ade80',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#f0fdf4' },
              100: { value: '#dcfce7' },
              200: { value: '#bbf7d0' },
              300: { value: '#86efac' },
              400: { value: '#4ade80' },
              500: { value: '#22c55e' },
              600: { value: '#16a34a' },
              700: { value: '#15803d' },
              800: { value: '#166534' },
              900: { value: '#14532d' },
            },
          },
        },
      },
    }),
  },

  'purple-haze': {
    metadata: {
      id: 'purple-haze',
      name: 'Purple Haze',
      description: 'Vibrant purple and violet theme',
      previewColors: {
        primary: '#a855f7',
        background: '#1a0a2e',
        text: '#e9d5ff',
      },
    },
    semanticColors: {
      appBg: '#1a0a2e',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(168, 85, 247, 0.05)',
      surfaceBgSelected: 'rgba(168, 85, 247, 0.15)',
      menuBg: '#2d1050',
      border: 'rgba(168, 85, 247, 0.2)',
      borderSubtle: 'rgba(168, 85, 247, 0.3)',
      text: '#e9d5ff',
      textMuted: '#d8b4fe',
      textSubtle: '#c084fc',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#faf5ff' },
              100: { value: '#f3e8ff' },
              200: { value: '#e9d5ff' },
              300: { value: '#d8b4fe' },
              400: { value: '#c084fc' },
              500: { value: '#a855f7' },
              600: { value: '#9333ea' },
              700: { value: '#7e22ce' },
              800: { value: '#6b21a8' },
              900: { value: '#581c87' },
            },
          },
        },
      },
    }),
  },

  ember: {
    metadata: {
      id: 'ember',
      name: 'Ember',
      description: 'Bold red-orange fire theme',
      previewColors: {
        primary: '#ef4444',
        background: '#1a0a0a',
        text: '#fecaca',
      },
    },
    semanticColors: {
      appBg: '#1a0a0a',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(239, 68, 68, 0.05)',
      surfaceBgSelected: 'rgba(239, 68, 68, 0.15)',
      menuBg: '#2d1010',
      border: 'rgba(239, 68, 68, 0.2)',
      borderSubtle: 'rgba(239, 68, 68, 0.3)',
      text: '#fecaca',
      textMuted: '#fca5a5',
      textSubtle: '#f87171',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#fef2f2' },
              100: { value: '#fee2e2' },
              200: { value: '#fecaca' },
              300: { value: '#fca5a5' },
              400: { value: '#f87171' },
              500: { value: '#ef4444' },
              600: { value: '#dc2626' },
              700: { value: '#b91c1c' },
              800: { value: '#991b1b' },
              900: { value: '#7f1d1d' },
            },
          },
        },
      },
    }),
  },

  twilight: {
    metadata: {
      id: 'twilight',
      name: 'Twilight',
      description: 'Deep indigo night theme',
      previewColors: {
        primary: '#6366f1',
        background: '#0a0a1a',
        text: '#c7d2fe',
      },
    },
    semanticColors: {
      appBg: '#0a0a1a',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(99, 102, 241, 0.05)',
      surfaceBgSelected: 'rgba(99, 102, 241, 0.15)',
      menuBg: '#12122d',
      border: 'rgba(99, 102, 241, 0.2)',
      borderSubtle: 'rgba(99, 102, 241, 0.3)',
      text: '#c7d2fe',
      textMuted: '#a5b4fc',
      textSubtle: '#818cf8',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#eef2ff' },
              100: { value: '#e0e7ff' },
              200: { value: '#c7d2fe' },
              300: { value: '#a5b4fc' },
              400: { value: '#818cf8' },
              500: { value: '#6366f1' },
              600: { value: '#4f46e5' },
              700: { value: '#4338ca' },
              800: { value: '#3730a3' },
              900: { value: '#312e81' },
            },
          },
        },
      },
    }),
  },

  mint: {
    metadata: {
      id: 'mint',
      name: 'Mint',
      description: 'Fresh mint green theme',
      previewColors: {
        primary: '#10b981',
        background: '#0a1f14',
        text: '#a7f3d0',
      },
    },
    semanticColors: {
      appBg: '#0a1f14',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(16, 185, 129, 0.05)',
      surfaceBgSelected: 'rgba(16, 185, 129, 0.15)',
      menuBg: '#0d2b1a',
      border: 'rgba(16, 185, 129, 0.2)',
      borderSubtle: 'rgba(16, 185, 129, 0.3)',
      text: '#a7f3d0',
      textMuted: '#6ee7b7',
      textSubtle: '#34d399',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#ecfdf5' },
              100: { value: '#d1fae5' },
              200: { value: '#a7f3d0' },
              300: { value: '#6ee7b7' },
              400: { value: '#34d399' },
              500: { value: '#10b981' },
              600: { value: '#059669' },
              700: { value: '#047857' },
              800: { value: '#065f46' },
              900: { value: '#064e3b' },
            },
          },
        },
      },
    }),
  },

  amber: {
    metadata: {
      id: 'amber',
      name: 'Amber',
      description: 'Golden amber theme',
      previewColors: {
        primary: '#f59e0b',
        background: '#1a1410',
        text: '#fde68a',
      },
    },
    semanticColors: {
      appBg: '#1a1410',
      surfaceBg: 'rgba(0, 0, 0, 0.3)',
      surfaceBgSubtle: 'rgba(245, 158, 11, 0.05)',
      surfaceBgSelected: 'rgba(245, 158, 11, 0.15)',
      menuBg: '#2d231a',
      border: 'rgba(245, 158, 11, 0.2)',
      borderSubtle: 'rgba(245, 158, 11, 0.3)',
      text: '#fde68a',
      textMuted: '#fcd34d',
      textSubtle: '#fbbf24',
    },
    config: defineConfig({
      theme: {
        tokens: {
          colors: {
            brand: {
              50: { value: '#fffbeb' },
              100: { value: '#fef3c7' },
              200: { value: '#fde68a' },
              300: { value: '#fcd34d' },
              400: { value: '#fbbf24' },
              500: { value: '#f59e0b' },
              600: { value: '#d97706' },
              700: { value: '#b45309' },
              800: { value: '#92400e' },
              900: { value: '#78350f' },
            },
          },
        },
      },
    }),
  },
};

/**
 * Get theme definition by ID
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: string identifier for theme, nullable/undefined allowed
 *
 *   Outputs:
 *     - ThemeDefinition object for the requested theme
 *
 *   Invariants:
 *     - Always returns a valid theme (never undefined)
 *     - Invalid/null themeId returns 'dark' theme (default)
 *     - Return value contains complete Chakra config
 *
 *   Properties:
 *     - Identity: getTheme('dark') always returns dark theme definition
 *     - Fallback: getTheme(invalid) equals getTheme('dark')
 *     - Idempotent: multiple calls with same ID return same definition
 */
export function getTheme(themeId?: string | null): ThemeDefinition {
  if (themeId && isValidThemeId(themeId)) {
    return THEME_REGISTRY[themeId];
  }
  // Log warning for invalid theme IDs (helps debugging)
  if (themeId) {
    console.warn(`Invalid theme ID "${themeId}", falling back to dark theme`);
  }
  return THEME_REGISTRY.dark;
}

/**
 * Get all available themes for UI display
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - Array of ThemeMetadata objects, one per theme in registry
 *
 *   Invariants:
 *     - Returns exactly 10 themes (all themes in registry)
 *     - Order: light, dark, then themed options alphabetically
 *     - Each metadata object includes preview colors for swatches
 *
 *   Properties:
 *     - Complete: output length equals number of keys in THEME_REGISTRY
 *     - Consistent: multiple calls return same order
 */
export function getAllThemes(): ThemeMetadata[] {
  const themeOrder: ThemeId[] = [
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

  return themeOrder.map((id) => THEME_REGISTRY[id].metadata);
}

/**
 * Validate theme ID
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: string to validate, nullable/undefined allowed
 *
 *   Outputs:
 *     - boolean: true if themeId is valid and exists in registry
 *
 *   Invariants:
 *     - Returns true only for theme IDs present in THEME_REGISTRY
 *     - Returns false for null, undefined, empty string, or unknown IDs
 *
 *   Properties:
 *     - Complete: for all keys K in THEME_REGISTRY, isValidThemeId(K) = true
 *     - Exclusive: for all strings S not in THEME_REGISTRY, isValidThemeId(S) = false
 */
export function isValidThemeId(themeId?: string | null): themeId is ThemeId {
  if (!themeId || typeof themeId !== 'string') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(THEME_REGISTRY, themeId);
}
