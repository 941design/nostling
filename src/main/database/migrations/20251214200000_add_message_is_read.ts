/**
 * Add is_read column to nostr_messages table
 *
 * Tracks whether incoming messages have been read by the user.
 * - Incoming messages default to false (unread)
 * - Outgoing messages are always considered read (true)
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add is_read column with default true (existing messages are considered read)
  await knex.schema.raw('ALTER TABLE nostr_messages ADD COLUMN is_read INTEGER NOT NULL DEFAULT 1');

  // Create index for efficient unread message queries
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_nostr_messages_is_read ON nostr_messages(contact_id, is_read)'
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_nostr_messages_is_read');
  // Note: SQLite doesn't support DROP COLUMN directly, but this is for completeness
  await knex.schema.raw('ALTER TABLE nostr_messages DROP COLUMN is_read');
}
