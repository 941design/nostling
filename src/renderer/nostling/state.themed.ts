/**
 * Nostling Queue Status Text with Themed Messages
 *
 * Integrates ostrich-themed messages into Nostling queue status text computation.
 */

import { getThemedMessage, getThemedMessagesConfig } from '../themed-messages';

// Helper to randomly select from array
function randomSelect<T>(arr: T[]): T {
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}

/**
 * Queue summary information used to derive status text.
 */
export interface QueueSummary {
  queued: number;
  sending: number;
  errors: number;
  lastActivity?: string;
}

/**
 * Generates user-facing status text for Nostling queue state with ostrich-themed messages.
 *
 * This function derives a themed status message based on queue summary data,
 * preserving message counts and state priority logic from the original implementation.
 *
 * CONTRACT:
 *   Inputs:
 *     - queueSummary: object containing queue statistics
 *       - queued: non-negative integer, count of queued messages
 *       - sending: non-negative integer, count of messages currently sending
 *       - errors: non-negative integer, count of messages with errors
 *       - lastActivity: optional ISO-8601 timestamp string of last message activity
 *     - hasBridge: boolean, true if Nostling API bridge is available
 *
 *   Outputs:
 *     - string: human-readable Nostling queue status message with themed text
 *
 *   Invariants:
 *     - Result is never empty string
 *     - Message counts are preserved in result (when > 0)
 *     - Priority order (highest to lowest): no bridge > errors > sending > queued > synced > idle
 *     - For states with counts, count appears before themed status (e.g., "3 [themed-status]")
 *
 *   Properties:
 *     - Completeness: All possible queue states have corresponding themed alternatives
 *     - Priority enforcement: Error state shown even if queued/sending > 0; sending shown even if queued > 0
 *     - Variability: Multiple calls with same state may return different themed messages
 *     - Count accuracy: Numeric counts in result match input queueSummary counts exactly
 *
 *   Algorithm:
 *     Decision tree (first match wins):
 *     1. If hasBridge = false → return "Nostling bridge unavailable" (no theming for unavailable state)
 *     2. If errors > 0 → return "{errors} {themed-error-message}"
 *        Select random themed message for 'error' status
 *     3. If sending > 0 → return "{sending} {themed-sending-message}"
 *        Select random themed message for 'sending' status
 *     4. If queued > 0 → return "{queued} {themed-queued-message} ({themed-offline-message})"
 *        Select random themed message for 'queued' status
 *        Select random themed message for 'offline' queue state
 *     5. If lastActivity exists (non-null/undefined) → return "{themed-synced-message}"
 *        Select random themed message for 'synced' queue state
 *     6. Otherwise → return "{themed-idle-message}"
 *        Select random themed message for 'idle' queue state
 *
 *   Examples:
 *     Input: { hasBridge: false, queueSummary: { queued: 0, sending: 0, errors: 0 } }
 *     Output: "Nostling bridge unavailable"
 *
 *     Input: { hasBridge: true, queueSummary: { queued: 0, sending: 0, errors: 3 } }
 *     Output: "3 fumbled egg(s)" (or another 'error' alternative)
 *
 *     Input: { hasBridge: true, queueSummary: { queued: 0, sending: 2, errors: 0 } }
 *     Output: "2 launching eggs" (or another 'sending' alternative)
 *
 *     Input: { hasBridge: true, queueSummary: { queued: 5, sending: 0, errors: 0 } }
 *     Output: "5 nestled in queue (offline)" (or other 'queued' + 'offline' alternatives)
 *
 *     Input: { hasBridge: true, queueSummary: { queued: 0, sending: 0, errors: 0, lastActivity: '2025-12-12T10:30:00Z' } }
 *     Output: "Nostling synced" (or another 'synced' alternative)
 *
 *     Input: { hasBridge: true, queueSummary: { queued: 0, sending: 0, errors: 0 } }
 *     Output: "Nostling idle" (or another 'idle' alternative)
 */
export function getNostlingStatusTextThemed(hasBridge: boolean, queueSummary: QueueSummary): string {
  const config = getThemedMessagesConfig();

  // Priority 1: Bridge unavailable (no theming for unavailable state)
  if (!hasBridge) {
    return 'Nostling bridge unavailable';
  }

  // Priority 2: Error messages
  if (queueSummary.errors > 0) {
    const themedError = getThemedMessage('error');
    return `${queueSummary.errors} ${themedError}`;
  }

  // Priority 3: Sending messages
  if (queueSummary.sending > 0) {
    const themedSending = getThemedMessage('sending');
    return `${queueSummary.sending} ${themedSending}`;
  }

  // Priority 4: Queued messages (offline)
  if (queueSummary.queued > 0) {
    const themedQueued = getThemedMessage('queued');
    // Note: 'offline' is a nostlingQueueState, not a NostlingMessageStatus
    // Must access directly to avoid ambiguity with updatePhases
    const themedOffline = randomSelect(config.nostlingQueueStates.offline);
    return `${queueSummary.queued} ${themedQueued} (${themedOffline})`;
  }

  // Priority 5: Synced state (has last activity)
  if (queueSummary.lastActivity !== undefined && queueSummary.lastActivity !== null) {
    // Note: 'synced' is a nostlingQueueState with no ambiguity
    // Use direct access for consistency with offline/idle
    return randomSelect(config.nostlingQueueStates.synced);
  }

  // Priority 6: Idle state (default)
  // Note: 'idle' exists in both UpdatePhase and nostlingQueueStates
  // Must access nostlingQueueStates.idle directly to avoid ambiguity
  return randomSelect(config.nostlingQueueStates.idle);
}
