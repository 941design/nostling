/**
 * Update Status Text with Themed Messages
 *
 * Integrates ostrich-themed messages into the update status text rendering.
 */

import type { UpdateState } from '../shared/types';
import { formatBytes } from './utils';
import { getThemedMessage } from './themed-messages';

/**
 * Generates user-facing status text for app update states with ostrich-themed messages.
 *
 * This is a refactored version of the original getStatusText() function that uses
 * themed message alternatives while preserving all dynamic content.
 *
 * CONTRACT:
 *   Inputs:
 *     - updateState: object containing phase, version, detail, and optional progress
 *       - phase: UpdatePhase enum value ('idle', 'checking', 'available', etc.)
 *       - version: optional string, trimmed or undefined/null
 *       - detail: optional string, trimmed or undefined/null (used for error messages)
 *       - progress: optional object with { percent, transferred, total, bytesPerSecond }
 *
 *   Outputs:
 *     - string: human-readable status message combining themed text and dynamic content
 *
 *   Invariants:
 *     - Result is never empty string
 *     - Dynamic content is preserved exactly:
 *       * Version numbers (when present and non-empty) included in 'available' and 'ready' phases
 *       * Progress percentages, byte counts, speeds (when progress exists) included in 'downloading' phase
 *       * Progress percentages (when progress exists) included in 'mounting' phase
 *       * Error details (when present and non-empty) included in 'failed' phase
 *     - Themed message is randomly selected from alternatives on each invocation
 *     - For phases without dynamic content, result equals the themed message directly
 *
 *   Properties:
 *     - Variability: Multiple calls with same phase (no dynamic content) may return different themed messages
 *     - Completeness: All UpdatePhase enum values have corresponding themed alternatives
 *     - Dynamic preservation: When updateState includes dynamic data, that data appears in result
 *     - Format consistency: Dynamic content format matches original implementation patterns
 *
 *   Algorithm:
 *     For each update phase:
 *     1. Retrieve random themed message for the phase using getThemedMessage()
 *     2. If phase requires dynamic content:
 *        a. Extract dynamic values from updateState (version, progress, detail)
 *        b. Format dynamic values (bytes, percentages, speeds)
 *        c. Compose final message by combining themed text with formatted dynamic content
 *     3. Return composed message
 *
 *     Dynamic content patterns:
 *     - 'available': If version exists and non-empty → "[themed]: v{version}", else "[themed]"
 *     - 'downloading': If progress exists → "[themed]: {percent}% ({transferred} / {total}) @ {speed}", else "[themed]"
 *     - 'mounting': If progress exists → "[themed] {percent}%", else "[themed]"
 *     - 'ready': If version exists and non-empty → "[themed]: v{version}", else "[themed]"
 *     - 'failed': If detail exists and non-empty → "[themed]: {detail}", else "[themed]"
 *     - All other phases: "[themed]" only
 *
 *   Examples:
 *     Input: { phase: 'idle' }
 *     Output: "Standing tall" (or another 'idle' alternative)
 *
 *     Input: { phase: 'available', version: '1.2.3' }
 *     Output: "Hatching updates: v1.2.3" (or another 'available' alternative + version)
 *
 *     Input: { phase: 'downloading', progress: { percent: 45.2, transferred: 131621519, total: 293601280, bytesPerSecond: 5452595 } }
 *     Output: "Pecking up: 45% (125.5 MB / 280.2 MB) @ 5.2 MB/s"
 *
 *     Input: { phase: 'failed', detail: 'Network timeout' }
 *     Output: "Head in sand: Network timeout"
 */
export function getStatusTextThemed(updateState: UpdateState): string {
  const { phase, version: newVersion, detail, progress } = updateState;
  const themed = getThemedMessage(phase);

  switch (phase) {
    case 'idle':
    case 'checking':
    case 'downloaded':
    case 'verifying':
      return themed;

    case 'available':
      return newVersion && newVersion.trim() ? `${themed}: v${newVersion}` : themed;

    case 'downloading':
      if (progress) {
        const percent = Math.round(progress.percent);
        const transferred = formatBytes(progress.transferred);
        const total = formatBytes(progress.total);
        const speed = formatBytes(progress.bytesPerSecond) + '/s';
        return `${themed}: ${percent}% (${transferred} / ${total}) @ ${speed}`;
      }
      return themed;

    case 'mounting':
      if (progress) {
        const percent = Math.round(progress.percent);
        return `${themed} ${percent}%`;
      }
      return themed;

    case 'mounted':
      return themed;

    case 'ready':
      return newVersion && newVersion.trim() ? `${themed}: v${newVersion}` : themed;

    case 'failed':
      return detail && detail.trim() ? `${themed}: ${detail}` : themed;

    default:
      return themed;
  }
}
