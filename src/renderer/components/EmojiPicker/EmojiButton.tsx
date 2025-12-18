/**
 * EmojiButton Component
 *
 * Trigger button for opening the emoji picker dropdown.
 * Displays a smiley emoji icon and follows theme colors.
 */

import React, { forwardRef } from 'react';
import { IconButton } from '@chakra-ui/react';
import { useThemeColors } from '../../themes/ThemeContext';
import type { EmojiButtonProps } from './types';

/**
 * EmojiButton - IconButton that triggers emoji picker
 *
 * CONTRACT:
 *   Inputs:
 *     - onClick: optional callback function invoked on button click
 *     - disabled: optional boolean indicating if button is disabled
 *     - aria-label: optional string for accessibility (defaults to "Insert emoji")
 *     - ref: forwarded ref for positioning (required for Menu.Trigger asChild)
 *
 *   Outputs:
 *     - Rendered IconButton component with emoji icon
 *
 *   Invariants:
 *     - Button always uses current theme colors from useThemeColors()
 *     - Icon is always "😊" (smiley face emoji)
 *     - Button size is "sm" (small)
 *     - Button variant is "ghost" (transparent background, visible on hover)
 *
 *   Properties:
 *     - Theme-aware: Button colors update when theme changes
 *     - Accessible: Has proper ARIA label for screen readers
 *     - Ref-forwardable: Supports ref forwarding for positioning in Menu.Trigger
 *
 * IMPLEMENTATION: This is a trivial component - just an IconButton wrapper.
 * Implement directly (no delegation to pbt-dev).
 */
export const EmojiButton = forwardRef<HTMLButtonElement, EmojiButtonProps>(
  function EmojiButton(
    { onClick, disabled = false, 'aria-label': ariaLabel = 'Insert emoji', ...rest },
    ref
  ) {
    const colors = useThemeColors();

    return (
      <IconButton
        ref={ref}
        aria-label={ariaLabel}
        onClick={onClick}
        disabled={disabled}
        variant="ghost"
        size="sm"
        color={colors.textMuted}
        _hover={{ color: colors.text, bg: colors.surfaceBgSubtle }}
        fontSize="lg"
        {...rest}
      >
        😊
      </IconButton>
    );
  }
);
