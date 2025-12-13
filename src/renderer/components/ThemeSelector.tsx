/**
 * Theme Selector Component
 *
 * Dropdown menu for theme selection integrated into hamburger menu.
 * Shows all available themes with visual color swatches.
 * Persists selection to database via IPC.
 */

import React, { useState } from 'react';
import { Menu, HStack, Box, Text } from '@chakra-ui/react';
import { ThemeMetadata, type ThemeId, getAllThemes } from '../themes/definitions';

export interface ThemeSelectorProps {
  /**
   * Currently selected theme ID
   */
  currentTheme: ThemeId;

  /**
   * Callback when user selects a theme
   * Should persist to database and update UI state
   */
  onThemeChange: (themeId: ThemeId) => Promise<void>;

  /**
   * Current identity ID for persistence
   * If null, theme selection is disabled (no active identity)
   */
  identityId: string | null;
}

/**
 * Theme color swatch component
 *
 * CONTRACT:
 *   Inputs:
 *     - metadata: ThemeMetadata object with preview colors
 *     - isSelected: boolean indicating if this theme is currently active
 *
 *   Outputs:
 *     - React element rendering theme preview with:
 *       * Color swatch showing theme's primary color
 *       * Theme name
 *       * Visual indicator if selected (checkmark icon)
 *
 *   Invariants:
 *     - Swatch uses metadata.previewColors.primary as background
 *     - Text color ensures WCAG AA contrast with swatch background
 *     - Selected state clearly visible (icon + highlight)
 *
 *   Properties:
 *     - Accessible: keyboard navigable, screen reader friendly
 *     - Visual: swatch color matches theme's actual primary color
 *     - Distinctive: easy to identify theme at a glance
 */
function ThemeSwatch({
  metadata,
  isSelected,
}: {
  metadata: ThemeMetadata;
  isSelected: boolean;
}): React.ReactElement {
  const isLightTheme = metadata.id === 'light';
  const textColor = isLightTheme ? '#1a202c' : '#e2e8f0';

  return (
    <Box data-testid={`theme-swatch-${metadata.id}`}>
      <HStack gap={2}>
        <Box
          width="20px"
          height="20px"
          borderRadius="full"
          backgroundColor={metadata.previewColors.primary}
          border={isSelected ? '2px solid' : 'none'}
          borderColor="brand.500"
          aria-label={`${metadata.name} theme color`}
        />
        <Text fontSize="sm" color={textColor}>
          {metadata.name}
        </Text>
        {isSelected && (
          <Box
            as="span"
            marginLeft="auto"
            data-testid={`theme-swatch-checkmark-${metadata.id}`}
          >
            <CheckmarkIcon />
          </Box>
        )}
      </HStack>
    </Box>
  );
}

/**
 * Checkmark icon component
 */
function CheckmarkIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

/**
 * Theme selector menu component
 *
 * CONTRACT:
 *   Inputs:
 *     - currentTheme: ThemeId of currently active theme
 *     - onThemeChange: async callback to persist theme change
 *     - identityId: ID of current identity, null if no identity selected
 *
 *   Outputs:
 *     - React element containing:
 *       * Menu trigger (for hamburger menu integration)
 *       * Menu content with all available themes
 *       * Each theme as selectable item with swatch
 *
 *   Invariants:
 *     - Displays all 10 themes from theme registry
 *     - Current theme visually indicated
 *     - Disabled when identityId is null (no active identity)
 *     - Theme change triggers onThemeChange callback immediately
 *     - Menu order: light, dark, then themed alphabetically
 *
 *   Properties:
 *     - Immediate: theme applies on click (no save button)
 *     - Complete: shows all themes from getAllThemes()
 *     - Responsive: provides loading state during theme change
 *     - Error handling: shows error if theme change fails
 *
 *   Algorithm:
 *     1. Fetch all themes from getAllThemes()
 *     2. For each theme, render ThemeSwatch with selection state
 *     3. On click:
 *        a. If same as current theme → no-op
 *        b. Otherwise → call onThemeChange(themeId)
 *        c. Handle loading state during async call
 *        d. Handle error if persistence fails
 *     4. Disable all interactions if identityId is null
 */
export function ThemeSelector({
  currentTheme,
  onThemeChange,
  identityId,
}: ThemeSelectorProps): React.ReactElement {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const themes = getAllThemes();
  const isDisabled = identityId === null;

  const handleThemeSelect = async (themeId: ThemeId) => {
    if (themeId === currentTheme) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onThemeChange(themeId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to change theme';
      console.error('Failed to change theme:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box>
      <Menu.Root>
        <Menu.Trigger asChild>
          <button
            disabled={isDisabled}
            style={{
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.5 : 1,
              background: 'none',
              border: 'none',
              padding: 0,
            }}
            aria-label="Select theme"
            data-testid="theme-selector-trigger"
          >
            <Text fontSize="sm">Theme</Text>
          </button>
        </Menu.Trigger>
        <Menu.Content>
          {themes.map((metadata) => (
            <Menu.Item
              key={metadata.id}
              value={metadata.id}
              onClick={() => handleThemeSelect(metadata.id)}
              disabled={isLoading}
              data-testid={`theme-option-${metadata.id}`}
              aria-checked={metadata.id === currentTheme}
            >
              <ThemeSwatch
                metadata={metadata}
                isSelected={metadata.id === currentTheme}
              />
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Root>
      {error && (
        <Text fontSize="xs" color="red.500" marginTop={1} data-testid="theme-error">
          {error}
        </Text>
      )}
    </Box>
  );
}
