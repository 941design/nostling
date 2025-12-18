/**
 * useEmojiInsertion Hook
 *
 * Custom React hook for inserting emojis at cursor position in a textarea.
 * Manages textarea ref and provides insertEmoji function.
 */

import { useRef } from 'react';
import type { EmojiInsertionResult } from './types';

/**
 * useEmojiInsertion - Hook for emoji insertion at cursor position
 *
 * CONTRACT:
 *   Inputs:
 *     - currentValue: string, current textarea content
 *     - onChange: callback function (newValue: string) => void, invoked with updated content after insertion
 *
 *   Outputs:
 *     - insertEmoji: function (emoji: string) => void, inserts emoji at cursor position
 *     - textareaRef: React ref object to attach to textarea element
 *
 *   Invariants:
 *     - If cursor position exists (selectionStart is defined), emoji inserted at that position
 *     - If no cursor position (textarea not focused or no selection), emoji appended to end
 *     - Content before cursor position is preserved exactly
 *     - Content after cursor position is preserved exactly
 *     - After insertion, cursor position moves to immediately after inserted emoji
 *     - After insertion, textarea regains focus
 *
 *   Properties:
 *     - Idempotent position: Calling insertEmoji twice with same emoji at same position produces same result as calling once then moving cursor
 *     - Preserves content: length(newValue) = length(currentValue) + length(emoji)
 *     - Cursor advancement: newCursorPosition = oldCursorPosition + length(emoji)
 *
 *   Algorithm:
 *     1. Get textarea DOM element from ref
 *     2. If textarea is null, append emoji to end of currentValue and invoke onChange
 *     3. Read cursor position from textarea.selectionStart
 *     4. If selectionStart is null/undefined, append emoji to end
 *     5. Otherwise:
 *        a. Split currentValue at cursor position: before = currentValue[0:selectionStart], after = currentValue[selectionStart:]
 *        b. Concatenate: newValue = before + emoji + after
 *        c. Invoke onChange(newValue)
 *        d. Calculate new cursor position: newCursor = selectionStart + emoji.length
 *        e. After React re-render (use setTimeout or requestAnimationFrame):
 *           - Set textarea.selectionStart = newCursor
 *           - Set textarea.selectionEnd = newCursor
 *           - Call textarea.focus()
 *
 * IMPLEMENTATION: This is NON-TRIVIAL - involves DOM manipulation, cursor position tracking,
 * and timing coordination with React rendering cycle.
 * DELEGATE to pbt-dev for property-based testing of cursor position logic.
 */
export function useEmojiInsertion(
  currentValue: string,
  onChange: (newValue: string) => void
): EmojiInsertionResult {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertEmoji = (emoji: string): void => {
    const textarea = textareaRef.current;

    if (!textarea) {
      onChange(currentValue + emoji);
      return;
    }

    const cursorPosition = textarea.selectionStart;

    if (cursorPosition === null || cursorPosition === undefined) {
      onChange(currentValue + emoji);
      return;
    }

    const before = currentValue.slice(0, cursorPosition);
    const after = currentValue.slice(cursorPosition);
    const newValue = before + emoji + after;
    const newCursorPosition = cursorPosition + emoji.length;

    onChange(newValue);

    setTimeout(() => {
      if (textarea) {
        textarea.selectionStart = newCursorPosition;
        textarea.selectionEnd = newCursorPosition;
        textarea.focus();
      }
    }, 0);
  };

  return {
    insertEmoji,
    textareaRef,
  };
}
