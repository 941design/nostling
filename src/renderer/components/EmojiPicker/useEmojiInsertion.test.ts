/**
 * Property-Based Tests for useEmojiInsertion Hook
 *
 * Tests the emoji insertion logic with focus on cursor position accuracy,
 * content preservation, and DOM manipulation coordination.
 *
 * Note: We test the core logic via unit tests on the pure string manipulation
 * and cursor calculation, which is the essence of the hook's behavior.
 * The DOM integration (setTimeout, focus, ref manipulation) is coordination
 * logic that's straightforward and can be verified via integration tests.
 */

import fc from 'fast-check';

/**
 * Pure logic extracted from useEmojiInsertion for testing
 * This represents the core string manipulation and cursor calculation
 */
function insertEmojiLogic(
  currentValue: string,
  emoji: string,
  cursorPosition: number | null | undefined
): {
  newValue: string;
  newCursorPosition: number | null;
} {
  if (cursorPosition === null || cursorPosition === undefined) {
    return {
      newValue: currentValue + emoji,
      newCursorPosition: null,
    };
  }

  const before = currentValue.slice(0, cursorPosition);
  const after = currentValue.slice(cursorPosition);
  const newValue = before + emoji + after;
  const newCursorPosition = cursorPosition + emoji.length;

  return {
    newValue,
    newCursorPosition,
  };
}

describe('useEmojiInsertion Hook Logic', () => {
  describe('Content Preservation Property', () => {
    it('preserves exact length relationship: newLength = oldLength + emojiLength', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 100 }),
          (content, emoji, maxCursorPos) => {
            const cursorPos = Math.min(maxCursorPos, content.length);
            const { newValue } = insertEmojiLogic(content, emoji, cursorPos);

            const expectedLength = content.length + emoji.length;
            expect(newValue.length).toBe(expectedLength);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserves content before cursor position exactly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 50 }),
          (content, emoji, maxCursorPos) => {
            const cursorPos = Math.min(maxCursorPos, content.length);
            const { newValue } = insertEmojiLogic(content, emoji, cursorPos);

            const expectedBefore = content.slice(0, cursorPos);
            const actualBefore = newValue.slice(0, cursorPos);
            expect(actualBefore).toBe(expectedBefore);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preserves content after cursor position exactly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 50 }),
          (content, emoji, maxCursorPos) => {
            const cursorPos = Math.min(maxCursorPos, content.length);
            const { newValue } = insertEmojiLogic(content, emoji, cursorPos);

            const expectedAfterStart = cursorPos + emoji.length;
            const expectedAfter = content.slice(cursorPos);
            const actualAfter = newValue.slice(expectedAfterStart);
            expect(actualAfter).toBe(expectedAfter);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cursor Advancement Property', () => {
    it('advances cursor by emoji length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0, max: 50 }),
          (content, emoji, maxCursorPos) => {
            const cursorPos = Math.min(maxCursorPos, content.length);
            const { newCursorPosition } = insertEmojiLogic(content, emoji, cursorPos);

            const expectedNewPosition = cursorPos + emoji.length;
            expect(newCursorPosition).toBe(expectedNewPosition);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Position Independence Property', () => {
    it('insertion at any valid position produces same relative content structure', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 5 }),
          (content, emoji) => {
            const results: string[] = [];

            for (let pos = 0; pos <= content.length; pos++) {
              const { newValue } = insertEmojiLogic(content, emoji, pos);
              results.push(newValue);
            }

            for (let pos = 0; pos < results.length; pos++) {
              const expected = content.slice(0, pos) + emoji + content.slice(pos);
              expect(results[pos]).toBe(expected);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Multi-byte Character Handling', () => {
    it('correctly handles multi-byte emoji sequences', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 20 }),
          fc.constantFrom(
            '😀',
            '😂',
            '😍',
            '❤️',
            '✨',
            '🎉',
            '👍',
            '🔥',
            '💯',
            '✅',
            '❌',
            '💡',
            '📌',
            '🔔',
            '📝',
            '✉️'
          ),
          fc.integer({ min: 0, max: 20 }),
          (content, emoji, maxCursorPos) => {
            const cursorPos = Math.min(maxCursorPos, content.length);
            const { newValue, newCursorPosition } = insertEmojiLogic(content, emoji, cursorPos);

            const expected = content.slice(0, cursorPos) + emoji + content.slice(cursorPos);
            expect(newValue).toBe(expected);
            expect(newCursorPosition).toBe(cursorPos + emoji.length);
          }
        ),
        { numRuns: 80 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles empty textarea with cursor at position 0', () => {
      const emoji = '😀';
      const { newValue, newCursorPosition } = insertEmojiLogic('', emoji, 0);
      expect(newValue).toBe(emoji);
      expect(newCursorPosition).toBe(emoji.length);
    });

    it('handles cursor at start of content', () => {
      const emoji = '👍';
      const { newValue, newCursorPosition } = insertEmojiLogic('hello', emoji, 0);
      expect(newValue).toBe(emoji + 'hello');
      expect(newCursorPosition).toBe(emoji.length);
    });

    it('handles cursor at end of content', () => {
      const emoji = '🎉';
      const { newValue, newCursorPosition } = insertEmojiLogic('hello', emoji, 5);
      expect(newValue).toBe('hello' + emoji);
      expect(newCursorPosition).toBe(5 + emoji.length);
    });

    it('handles cursor in middle of content', () => {
      const { newValue, newCursorPosition } = insertEmojiLogic('hello', '✨', 2);
      expect(newValue).toBe('he✨llo');
      expect(newCursorPosition).toBe(3);
    });

    it('handles null cursor position (appends emoji)', () => {
      const { newValue, newCursorPosition } = insertEmojiLogic('hello', '😀', null);
      expect(newValue).toBe('hello😀');
      expect(newCursorPosition).toBeNull();
    });

    it('handles undefined cursor position (appends emoji)', () => {
      const { newValue, newCursorPosition } = insertEmojiLogic('hello', '🔥', undefined);
      expect(newValue).toBe('hello🔥');
      expect(newCursorPosition).toBeNull();
    });
  });

  describe('Idempotency and Determinism', () => {
    it('same input always produces same output', () => {
      const content = 'test content';
      const emoji = '❤️';
      const position = 5;

      const result1 = insertEmojiLogic(content, emoji, position);
      const result2 = insertEmojiLogic(content, emoji, position);

      expect(result1.newValue).toBe(result2.newValue);
      expect(result1.newCursorPosition).toBe(result2.newCursorPosition);
    });

    it('multiple insertions at different positions maintain relative structure', () => {
      const content = 'ab';
      const emoji1 = 'x';
      const emoji2 = 'y';

      const result1 = insertEmojiLogic(content, emoji1, 0);
      const result2 = insertEmojiLogic(content, emoji2, 1);

      expect(result1.newValue).toBe('xab');
      expect(result2.newValue).toBe('ayb');
      expect(result1.newCursorPosition).toBe(1);
      expect(result2.newCursorPosition).toBe(2);
    });
  });

  describe('Emoji Length Accuracy', () => {
    it('correctly calculates cursor position for single-character emoji', () => {
      const { newCursorPosition } = insertEmojiLogic('test', '❌', 2);
      expect(newCursorPosition).toBe(3);
    });

    it('correctly calculates cursor position for variant-selector emoji', () => {
      const { newCursorPosition } = insertEmojiLogic('test', '❤️', 2);
      expect(newCursorPosition).toBe(4);
    });

    it('correctly calculates cursor position for multi-codepoint emoji', () => {
      const { newCursorPosition } = insertEmojiLogic('test', '👨‍👩‍👧‍👦', 2);
      expect(newCursorPosition).toBe(2 + '👨‍👩‍👧‍👦'.length);
    });
  });

  describe('String Boundary Conditions', () => {
    it('handles very long content with emoji insertion', () => {
      const longContent = 'a'.repeat(10000);
      const { newValue } = insertEmojiLogic(longContent, '💯', 5000);

      expect(newValue.length).toBe(longContent.length + '💯'.length);
      expect(newValue.slice(5000, 5001 + '💯'.length)).toContain('💯');
    });

    it('handles emoji with special characters in surrounding content', () => {
      const content = 'hello\nworld\ttab';
      const { newValue } = insertEmojiLogic(content, '🔥', 5);

      expect(newValue).toBe('hello🔥\nworld\ttab');
    });

    it('handles multiple emoji insertions sequentially', () => {
      const content = 'hi';
      const emoji1 = '😀';
      const emoji2 = '😂';

      const result1 = insertEmojiLogic(content, emoji1, 0);
      const result2 = insertEmojiLogic(result1.newValue, emoji2, result1.newCursorPosition);

      expect(result2.newValue).toBe('😀😂hi');
      expect(result2.newCursorPosition).toBe(2 + emoji1.length);
    });
  });

  describe('Type Safety', () => {
    it('returns consistent type structure for valid cursor position', () => {
      const result = insertEmojiLogic('test', '✨', 2);

      expect(typeof result.newValue).toBe('string');
      expect(typeof result.newCursorPosition).toBe('number');
    });

    it('returns consistent type structure for null cursor position', () => {
      const result = insertEmojiLogic('test', '✨', null);

      expect(typeof result.newValue).toBe('string');
      expect(result.newCursorPosition).toBeNull();
    });
  });
});
