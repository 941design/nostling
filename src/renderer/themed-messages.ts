/**
 * Themed Message Manager
 *
 * Provides utilities for loading, validating, and randomly selecting
 * ostrich-themed status messages.
 *
 * This module is fully implemented (trivial functionality) and serves as
 * the single source of truth for themed message configuration.
 */

import type { ThemedMessagesConfig, ThemedStatusType } from './themed-messages.types';
import type { UpdatePhase, NostlingMessageStatus } from '../shared/types';
import themedMessagesData from './themed-messages.json';

// Default fallback configuration (standard messages)
const DEFAULT_THEMED_MESSAGES: ThemedMessagesConfig = {
  updatePhases: {
    idle: ['Up to date'],
    checking: ['Checking for updates...'],
    available: ['Update available'],
    downloading: ['Downloading update'],
    downloaded: ['Update downloaded'],
    verifying: ['Verifying update...'],
    ready: ['Update ready'],
    mounting: ['Mounting update...'],
    mounted: ['Drag Nostling to Applications folder'],
    failed: ['Update failed'],
  },
  nostlingStatuses: {
    queued: ['queued'],
    sending: ['sending'],
    sent: ['sent'],
    error: ['error'],
  },
  nostlingQueueStates: {
    synced: ['Nostling synced'],
    idle: ['Nostling idle'],
    offline: ['offline'],
  },
};

/**
 * Validates and normalizes themed messages configuration.
 * Returns validated config or defaults on invalid structure.
 */
function validateThemedMessagesConfig(raw: any): ThemedMessagesConfig {
  // Validate structure exists
  if (!raw || typeof raw !== 'object') {
    console.warn('Invalid themed messages config: not an object, using defaults');
    return DEFAULT_THEMED_MESSAGES;
  }

  // Validate each section
  const updatePhases = validateSection(raw.updatePhases, DEFAULT_THEMED_MESSAGES.updatePhases);
  const nostlingStatuses = validateSection(raw.nostlingStatuses, DEFAULT_THEMED_MESSAGES.nostlingStatuses);
  const nostlingQueueStates = validateSection(raw.nostlingQueueStates, DEFAULT_THEMED_MESSAGES.nostlingQueueStates);

  return {
    updatePhases,
    nostlingStatuses,
    nostlingQueueStates,
  };
}

/**
 * Validates a config section (updatePhases, nostlingStatuses, nostlingQueueStates).
 * Returns validated section or defaults.
 */
function validateSection<T extends Record<string, string[]>>(
  section: any,
  defaultSection: T,
): T {
  if (!section || typeof section !== 'object') {
    return defaultSection;
  }

  const result: any = {};

  // Validate each key in the section
  for (const key of Object.keys(defaultSection)) {
    const alternatives = section[key];

    // Check if alternatives is a non-empty array of strings
    if (
      Array.isArray(alternatives) &&
      alternatives.length > 0 &&
      alternatives.every((alt) => typeof alt === 'string' && alt.length > 0)
    ) {
      result[key] = alternatives;
    } else {
      console.warn(`Invalid themed messages for "${key}", using default`);
      result[key] = defaultSection[key];
    }
  }

  return result as T;
}

// Load and validate configuration at module load time
const themedMessages: ThemedMessagesConfig = validateThemedMessagesConfig(themedMessagesData);

/**
 * Selects a random themed message for the given status type.
 *
 * CONTRACT:
 *   Inputs:
 *     - statusType: status identifier (UpdatePhase | NostlingMessageStatus | 'synced' | 'idle' | 'offline')
 *
 *   Outputs:
 *     - string: randomly selected themed message from the alternatives pool for this status
 *
 *   Invariants:
 *     - Returns one of the configured alternatives for the given status type
 *     - Each invocation may return a different alternative (true randomness)
 *     - If status type has only one alternative, always returns that alternative
 *
 *   Properties:
 *     - Non-empty: result is never empty string (assuming configuration is non-empty)
 *     - Membership: result is always an element of the configured alternatives array
 *     - Uniform distribution: Over many calls, each alternative appears with approximately equal probability
 *
 *   Algorithm:
 *     1. Look up alternatives array for given status type in configuration
 *     2. Generate random index in range [0, array.length)
 *     3. Return element at random index
 */
export function getThemedMessage(statusType: ThemedStatusType): string {
  const alternatives = getAlternativesForStatus(statusType);

  if (alternatives.length === 0) {
    // Fallback: should not happen with valid configuration
    return `[${statusType}]`;
  }

  const randomIndex = Math.floor(Math.random() * alternatives.length);
  return alternatives[randomIndex];
}

/**
 * Retrieves the array of themed message alternatives for a given status type.
 *
 * This is an internal helper used by getThemedMessage.
 */
function getAlternativesForStatus(statusType: ThemedStatusType): string[] {
  // Check update phases
  if (isUpdatePhase(statusType)) {
    return themedMessages.updatePhases[statusType] || [];
  }

  // Check Nostling message statuses
  if (isNostlingMessageStatus(statusType)) {
    return themedMessages.nostlingStatuses[statusType] || [];
  }

  // At this point, statusType must be 'synced' | 'idle' | 'offline' (Nostling queue states)
  // Use direct property access to avoid type narrowing issues
  const queueStateKey = statusType as 'synced' | 'idle' | 'offline';
  return themedMessages.nostlingQueueStates[queueStateKey] || [];
}

/**
 * Type guard: checks if value is a valid UpdatePhase.
 */
function isUpdatePhase(value: ThemedStatusType): value is UpdatePhase {
  const updatePhases: UpdatePhase[] = [
    'idle',
    'checking',
    'available',
    'downloading',
    'downloaded',
    'verifying',
    'ready',
    'mounting',
    'mounted',
    'failed',
  ];
  return updatePhases.includes(value as UpdatePhase);
}

/**
 * Type guard: checks if value is a valid NostlingMessageStatus.
 */
function isNostlingMessageStatus(value: ThemedStatusType): value is NostlingMessageStatus {
  const nostlingStatuses: NostlingMessageStatus[] = ['queued', 'sending', 'sent', 'error'];
  return nostlingStatuses.includes(value as NostlingMessageStatus);
}

/**
 * Exports the raw configuration for testing purposes.
 */
export function getThemedMessagesConfig(): ThemedMessagesConfig {
  return themedMessages;
}
