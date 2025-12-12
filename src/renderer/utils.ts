import type { UpdateState, UpdatePhase } from '../shared/types';
import { getStatusTextThemed } from './utils.themed';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

/**
 * Generates user-facing status text for app update states.
 *
 * This function now delegates to getStatusTextThemed() which provides
 * ostrich-themed message alternatives while preserving all dynamic content.
 *
 * @param updateState - The current update state
 * @returns Human-readable status message with themed text
 */
export function getStatusText(updateState: UpdateState): string {
  return getStatusTextThemed(updateState);
}

export function isRefreshEnabled(phase: UpdatePhase): boolean {
  return phase === 'idle' || phase === 'available' || phase === 'ready' || phase === 'failed';
}
