/**
 * Identity Theme Update
 *
 * Updates the theme preference for an identity in the database.
 * Minimal implementation focused on theme field only.
 */

import { Database } from 'sql.js';

/**
 * Update identity theme
 *
 * CONTRACT:
 *   Inputs:
 *     - database: sql.js Database instance
 *     - identityId: UUID string identifying the identity
 *     - themeId: theme identifier string to set, nullable allowed
 *
 *   Outputs:
 *     - void (success) or throws error
 *
 *   Invariants:
 *     - Updates exactly one row in nostr_identities table
 *     - Only modifies the 'theme' column, no other fields changed
 *     - If identityId not found, throws error
 *     - Null/undefined themeId sets theme to NULL in database
 *
 *   Properties:
 *     - Atomic: single SQL UPDATE statement
 *     - Idempotent: calling multiple times with same themeId has same effect
 *     - Isolated: does not affect other identities
 *     - Validated: throws if identityId doesn't exist
 *
 *   Algorithm:
 *     1. Execute UPDATE statement: SET theme = ? WHERE id = ?
 *     2. Check changes count from sql.js
 *     3. If changes = 0 → identity not found, throw error
 *     4. If changes = 1 → success, return
 */
export async function updateIdentityTheme(
  database: Database,
  identityId: string,
  themeId: string | null | undefined
): Promise<void> {
  const result = database.run(
    'UPDATE nostr_identities SET theme = ? WHERE id = ?',
    [themeId ?? null, identityId]
  );

  // sql.js doesn't provide a direct changes count, but we can verify by querying
  const checkStmt = database.prepare('SELECT COUNT(*) as count FROM nostr_identities WHERE id = ?');
  checkStmt.bind([identityId]);
  checkStmt.step();
  const row = checkStmt.getAsObject() as { count: number };
  checkStmt.free();

  if (row.count === 0) {
    throw new Error(`Identity not found: ${identityId}`);
  }
}
