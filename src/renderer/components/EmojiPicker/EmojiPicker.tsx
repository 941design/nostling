/**
 * EmojiPicker Component
 *
 * Dropdown menu displaying 26 emojis in a 4x7 grid layout.
 * Users can click an emoji to select it, which invokes the onEmojiSelect callback.
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { Menu, Box } from '@chakra-ui/react';
import { useThemeColors } from '../../themes/ThemeContext';
import { EmojiButton } from './EmojiButton';
import { ALL_EMOJIS, type EmojiPickerProps } from './types';

/**
 * EmojiPicker - Menu-based emoji selection UI
 *
 * CONTRACT:
 *   Inputs:
 *     - onEmojiSelect: callback function, receives selected emoji as Unicode string
 *       Example: onEmojiSelect("😀") when user clicks first emoji
 *
 *   Outputs:
 *     - Rendered Menu component with trigger button and emoji grid dropdown
 *     - Invokes onEmojiSelect callback when user clicks an emoji
 *
 *   Invariants:
 *     - Menu displays exactly 26 emojis from ALL_EMOJIS constant
 *     - Grid layout is 4 columns × 7 rows
 *     - Menu closes after emoji selection
 *     - Menu can be dismissed by clicking outside
 *     - All theme colors come from useThemeColors() hook
 *
 *   Properties:
 *     - Idempotent selection: Selecting same emoji multiple times produces same result
 *     - Theme-aware: All colors update when theme changes
 *     - Accessible: WCAG Level A compliant
 *       - Grid has role="grid" and aria-label
 *       - Each emoji button has role="gridcell" and descriptive aria-label
 *       - Keyboard navigation: Arrow keys move focus, Enter/Space select
 *       - Screen reader support via ARIA labels
 *
 *   Algorithm:
 *     1. Render Menu.Root container
 *     2. Menu.Trigger wraps EmojiButton component
 *     3. Portal ensures dropdown renders above other UI
 *     4. Menu.Positioner positions dropdown relative to trigger
 *     5. Menu.Content contains custom grid layout (not standard Menu.Item list)
 *     6. Grid displays ALL_EMOJIS in 4-column layout
 *     7. Each emoji is clickable button
 *     8. On click: invoke onEmojiSelect(emoji) and close menu
 *
 * IMPLEMENTATION: This is a trivial component - pure UI composition.
 * Implement directly (no delegation to pbt-dev).
 */
export function EmojiPicker({ onEmojiSelect }: EmojiPickerProps): React.ReactElement {
  const colors = useThemeColors();
  const gridRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = React.useState<number>(0);

  const COLUMNS = 4;
  const ROWS = Math.ceil(ALL_EMOJIS.length / COLUMNS);

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
  };

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const { key } = event;
    let newIndex = focusedIndex;

    switch (key) {
      case 'ArrowRight':
        event.preventDefault();
        newIndex = Math.min(focusedIndex + 1, ALL_EMOJIS.length - 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        newIndex = Math.max(focusedIndex - 1, 0);
        break;
      case 'ArrowDown':
        event.preventDefault();
        newIndex = Math.min(focusedIndex + COLUMNS, ALL_EMOJIS.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        newIndex = Math.max(focusedIndex - COLUMNS, 0);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleEmojiClick(ALL_EMOJIS[focusedIndex]);
        return;
      default:
        return;
    }

    setFocusedIndex(newIndex);
  }, [focusedIndex, COLUMNS]);

  useEffect(() => {
    if (gridRef.current && focusedIndex >= 0 && focusedIndex < ALL_EMOJIS.length) {
      const buttons = gridRef.current.querySelectorAll('button');
      const targetButton = buttons[focusedIndex] as HTMLButtonElement | undefined;
      targetButton?.focus();
    }
  }, [focusedIndex]);

  return (
    <Menu.Root closeOnSelect positioning={{ placement: 'top-end' }}>
      <Menu.Trigger asChild>
        <EmojiButton />
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content
            bg={colors.menuBg}
            borderColor={colors.borderSubtle}
            borderWidth="1px"
            borderRadius="md"
            p="2"
            minW="200px"
            data-testid="emoji-picker-menu"
          >
            <Box
              ref={gridRef}
              display="grid"
              gridTemplateColumns="repeat(4, 1fr)"
              gap="1"
              role="grid"
              aria-label="Emoji picker grid"
              data-testid="emoji-grid"
              onKeyDown={handleKeyDown}
            >
              {ALL_EMOJIS.map((emoji, index) => (
                <Box
                  key={emoji}
                  as="button"
                  role="gridcell"
                  aria-label={`Insert emoji ${emoji}`}
                  onClick={() => handleEmojiClick(emoji)}
                  onFocus={() => setFocusedIndex(index)}
                  tabIndex={index === focusedIndex ? 0 : -1}
                  fontSize="2xl"
                  p="2"
                  cursor="pointer"
                  borderRadius="md"
                  _hover={{ bg: colors.surfaceBgSubtle }}
                  _focus={{ bg: colors.surfaceBgSubtle, outline: `2px solid ${colors.borderSubtle}` }}
                  transition="background 0.15s"
                  data-testid={`emoji-${emoji}`}
                >
                  {emoji}
                </Box>
              ))}
            </Box>
          </Menu.Content>
        </Menu.Positioner>
    </Menu.Root>
  );
}
