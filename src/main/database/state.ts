/**
 * State Repository
 *
 * Provides type-safe operations for application state persistence.
 * Key-value store backed by SQLite app_state table.
 */

import { Database } from 'sql.js';

export class DatabaseError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class StateNotFoundError extends DatabaseError {
  constructor(key: string) {
    super(`State key not found: ${key}`);
    this.name = 'StateNotFoundError';
  }
}

/**
 * Get state value by key
 *
 * CONTRACT:
 *   Inputs:
 *     - database: Database instance from sql.js (initialized and migrated)
 *     - key: string, non-empty, state identifier
 *
 *   Outputs:
 *     - value: string if key exists, null if key doesn't exist
 *
 *   Invariants:
 *     - Returns null (not error) if key doesn't exist
 *     - Returns most recently set value for key
 *     - Key comparison is case-sensitive
 *
 *   Properties:
 *     - Read-only: does not modify database
 *     - Deterministic: same key returns same value (until modified)
 *
 *   Algorithm:
 *     1. Validate inputs: key is non-empty string
 *     2. Execute SQL: SELECT value FROM app_state WHERE key = ?
 *     3. If row found: return value column
 *     4. If no row: return null
 *     5. On SQL error: throw DatabaseError with cause
 */
export function getState(database: Database, key: string): string | null {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new DatabaseError('Key must be a non-empty string');
  }

  try {
    const stmt = database.prepare('SELECT value FROM app_state WHERE key = ?');
    stmt.bind([key]);
    const result = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return result ? (result.value as string) : null;
  } catch (error) {
    throw new DatabaseError(
      `Failed to get state for key "${key}"`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Set state value for key
 *
 * CONTRACT:
 *   Inputs:
 *     - database: Database instance from sql.js
 *     - key: string, non-empty, state identifier
 *     - value: string, state value to persist
 *
 *   Outputs:
 *     - void (side effect: inserts or updates app_state row)
 *
 *   Invariants:
 *     - Creates new row if key doesn't exist
 *     - Updates existing row if key exists
 *     - updated_at timestamp set to current time
 *     - Previous value overwritten if key exists
 *
 *   Properties:
 *     - Upsert semantics: INSERT OR REPLACE
 *     - Idempotent: setting same value twice is safe
 *     - Last-write-wins: no conflict resolution
 *
 *   Algorithm:
 *     1. Validate inputs: key and value are non-empty strings
 *     2. Execute SQL: INSERT OR REPLACE INTO app_state (key, value, updated_at)
 *                     VALUES (?, ?, datetime('now'))
 *     3. On SQL error: throw DatabaseError with cause
 */
export function setState(database: Database, key: string, value: string): void {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new DatabaseError('Key must be a non-empty string');
  }

  if (value === undefined || value === null || typeof value !== 'string') {
    throw new DatabaseError('Value must be a string');
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    database.run(
      'INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?, ?, ?)',
      [key, value, timestamp]
    );
  } catch (error) {
    throw new DatabaseError(
      `Failed to set state for key "${key}"`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Delete state value by key
 *
 * CONTRACT:
 *   Inputs:
 *     - database: Database instance from sql.js
 *     - key: string, non-empty, state identifier
 *
 *   Outputs:
 *     - void (side effect: deletes app_state row if exists)
 *
 *   Invariants:
 *     - Row removed if key exists
 *     - No-op (not error) if key doesn't exist
 *
 *   Properties:
 *     - Idempotent: deleting non-existent key is safe
 *
 *   Algorithm:
 *     1. Validate inputs: key is non-empty string
 *     2. Execute SQL: DELETE FROM app_state WHERE key = ?
 *     3. On SQL error: throw DatabaseError with cause
 */
export function deleteState(database: Database, key: string): void {
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new DatabaseError('Key must be a non-empty string');
  }

  try {
    database.run('DELETE FROM app_state WHERE key = ?', [key]);
  } catch (error) {
    throw new DatabaseError(
      `Failed to delete state for key "${key}"`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get all state entries
 *
 * CONTRACT:
 *   Inputs:
 *     - database: Database instance from sql.js
 *
 *   Outputs:
 *     - entries: object mapping keys to values
 *       Example: { theme: 'dark', language: 'en' }
 *
 *   Invariants:
 *     - Returns empty object if no state entries exist
 *     - All keys and values are strings
 *
 *   Properties:
 *     - Read-only: does not modify database
 *     - Snapshot: returns state at moment of call
 *
 *   Algorithm:
 *     1. Execute SQL: SELECT key, value FROM app_state
 *     2. Transform rows into object: { [key]: value, ... }
 *     3. Return object (empty object if no rows)
 *     4. On SQL error: throw DatabaseError with cause
 */
export function getAllState(database: Database): Record<string, string> {
  try {
    const result: Record<string, string> = {};
    const stmt = database.prepare('SELECT key, value FROM app_state');

    while (stmt.step()) {
      const row = stmt.getAsObject();
      result[row.key as string] = row.value as string;
    }

    stmt.free();
    return result;
  } catch (error) {
    throw new DatabaseError(
      'Failed to get all state entries',
      error instanceof Error ? error : undefined
    );
  }
}
