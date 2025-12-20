/**
 * Add was_gift_wrapped column to nostr_messages table
 *
 * Tracks whether a message was received via NIP-59 gift wrap.
 * - true: Message was gift wrapped (NIP-17/NIP-59)
 * - false: Message was not gift wrapped (legacy NIP-04 kind:4)
 * - NULL: Legacy messages before this column was added
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw('ALTER TABLE nostr_messages ADD COLUMN was_gift_wrapped BOOLEAN DEFAULT NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('ALTER TABLE nostr_messages DROP COLUMN was_gift_wrapped');
}
