import { describe, expect, it } from '@jest/globals';
import { shouldSubmitOnKeyDown } from './keyboard-submit';

describe('keyboard submit utility', () => {
  it('returns true for Enter without Shift (submit)', () => {
    expect(shouldSubmitOnKeyDown({ key: 'Enter', shiftKey: false })).toBe(true);
  });

  it('returns false for Shift+Enter (newline)', () => {
    expect(shouldSubmitOnKeyDown({ key: 'Enter', shiftKey: true })).toBe(false);
  });

  it('returns false for other keys', () => {
    expect(shouldSubmitOnKeyDown({ key: 'a', shiftKey: false })).toBe(false);
    expect(shouldSubmitOnKeyDown({ key: 'Tab', shiftKey: false })).toBe(false);
    expect(shouldSubmitOnKeyDown({ key: 'Escape', shiftKey: false })).toBe(false);
  });

  it('returns false for other keys with Shift', () => {
    expect(shouldSubmitOnKeyDown({ key: 'a', shiftKey: true })).toBe(false);
    expect(shouldSubmitOnKeyDown({ key: 'Tab', shiftKey: true })).toBe(false);
  });
});
