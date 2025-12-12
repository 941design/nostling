/**
 * Type definitions for ostrich-themed status messages.
 *
 * These types ensure type-safe configuration of themed message alternatives
 * for both update status and Nostling queue status messages.
 */

import type { UpdatePhase, NostlingMessageStatus } from '../shared/types';

/**
 * Configuration structure for themed messages.
 * Maps status types to arrays of themed message alternatives.
 */
export interface ThemedMessagesConfig {
  /** Themed alternatives for app update phases */
  updatePhases: Record<UpdatePhase, string[]>;

  /** Themed alternatives for Nostling message statuses */
  nostlingStatuses: {
    queued: string[];
    sending: string[];
    sent: string[];
    error: string[];
  };

  /** Themed alternatives for Nostling queue summary states */
  nostlingQueueStates: {
    synced: string[];
    idle: string[];
    offline: string[];
  };
}

/**
 * Valid status type for themed message lookup.
 */
export type ThemedStatusType = UpdatePhase | NostlingMessageStatus | 'synced' | 'idle' | 'offline';
