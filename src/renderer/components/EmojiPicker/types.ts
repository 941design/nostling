/**
 * Emoji Picker Types
 *
 * Type definitions for emoji picker feature components.
 */

/**
 * Callback invoked when user selects an emoji from the picker
 */
export interface EmojiSelectHandler {
  (emoji: string): void;
}

/**
 * Props for EmojiPicker component
 */
export interface EmojiPickerProps {
  /**
   * Callback invoked when user selects an emoji
   * @param emoji - Unicode emoji character selected by user
   */
  onEmojiSelect: EmojiSelectHandler;
}

/**
 * Props for EmojiButton component
 */
export interface EmojiButtonProps {
  /**
   * Click handler for the button
   */
  onClick?: () => void;

  /**
   * Whether the button is disabled
   */
  disabled?: boolean;

  /**
   * ARIA label for accessibility
   */
  'aria-label'?: string;
}

/**
 * Return value from useEmojiInsertion hook
 */
export interface EmojiInsertionResult {
  /**
   * Function to insert emoji at current cursor position in the textarea
   * @param emoji - Unicode emoji character to insert
   */
  insertEmoji: (emoji: string) => void;

  /**
   * React ref to attach to the textarea element
   */
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

/**
 * The 24 emoji characters to display in the picker
 * Organized by category for documentation purposes
 */
export const EMOJI_SET = {
  reactions: ['😀', '😂', '😊', '😢', '😍', '🥰', '😎', '🤔'],
  gestures: ['👍', '👋', '🙏', '✌️', '👏', '💪'],
  symbols: ['❤️', '✨', '🔥', '💯', '✅', '❌'],
  objects: ['🎉', '💡', '📌', '🔔', '📝', '✉️'],
} as const;

/**
 * Flattened array of all 24 emojis for grid rendering
 */
export const ALL_EMOJIS = [
  ...EMOJI_SET.reactions,
  ...EMOJI_SET.gestures,
  ...EMOJI_SET.symbols,
  ...EMOJI_SET.objects,
] as const;
