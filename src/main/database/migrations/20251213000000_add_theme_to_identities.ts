/**
 * Add theme column to nostr_identities table
 *
 * Adds theme preference storage for per-identity theme selection.
 * Default theme is 'dark' (current hardcoded theme).
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Use raw SQL since knex adapter doesn't support alterTable
  await knex.schema.raw(
    `ALTER TABLE nostr_identities ADD COLUMN theme TEXT DEFAULT 'dark'`
  );
}

export async function down(knex: Knex): Promise<void> {
  // SQLite doesn't support DROP COLUMN directly, would require table recreation
  // Since this is a dev-only operation, we'll leave it as no-op
  // In production, migrations only go forward (up)
}
