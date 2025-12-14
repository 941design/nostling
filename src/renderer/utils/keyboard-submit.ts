/**
 * Determines if a keyboard event should trigger form submission.
 * Returns true for Enter without Shift (submit), false for Shift+Enter (newline).
 */
export function shouldSubmitOnKeyDown(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === 'Enter' && !event.shiftKey;
}
