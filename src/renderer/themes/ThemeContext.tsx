/**
 * Theme Context
 *
 * Provides semantic colors to all components in the app.
 * Components can use the useThemeColors() hook to access current theme colors.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { getSemanticColors, type ThemeSemanticColors } from './useTheme';
import type { ThemeId } from './definitions';

/**
 * Theme context value
 */
interface ThemeContextValue {
  themeId: ThemeId;
  colors: ThemeSemanticColors;
}

/**
 * Default context value (dark theme)
 */
const defaultColors = getSemanticColors('dark');
const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'dark',
  colors: defaultColors,
});

/**
 * Theme provider props
 */
interface ThemeProviderProps {
  themeId: ThemeId;
  children: React.ReactNode;
}

/**
 * Theme Provider Component
 *
 * Wraps the app to provide theme colors to all child components.
 * Updates when themeId changes to reflect new theme selection.
 *
 * CONTRACT:
 *   Inputs:
 *     - themeId: Current theme identifier
 *     - children: Child components to wrap
 *
 *   Outputs:
 *     - Context provider with current theme colors
 *
 *   Invariants:
 *     - Colors always correspond to the provided themeId
 *     - Invalid themeId falls back to 'dark' colors
 */
export function ThemeProvider({ themeId, children }: ThemeProviderProps): React.ReactElement {
  const contextValue = useMemo(
    () => ({
      themeId,
      colors: getSemanticColors(themeId),
    }),
    [themeId]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access current theme colors
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - ThemeSemanticColors object with all semantic color tokens
 *
 *   Invariants:
 *     - Returns colors from the nearest ThemeProvider
 *     - Falls back to dark theme if no provider exists
 *
 *   Usage:
 *     const colors = useThemeColors();
 *     <Box bg={colors.appBg} color={colors.text}>...</Box>
 */
export function useThemeColors(): ThemeSemanticColors {
  const context = useContext(ThemeContext);
  return context.colors;
}

/**
 * Hook to access full theme context (includes themeId)
 *
 * CONTRACT:
 *   Inputs:
 *     - none
 *
 *   Outputs:
 *     - ThemeContextValue with themeId and colors
 *
 *   Invariants:
 *     - Returns context from the nearest ThemeProvider
 *     - Falls back to dark theme if no provider exists
 */
export function useThemeContext(): ThemeContextValue {
  return useContext(ThemeContext);
}
