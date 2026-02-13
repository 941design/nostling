/**
 * Blossom Server Configuration Migration
 *
 * Adds database schema for per-identity Blossom server lists.
 * Each identity can have multiple servers with custom labels and ordering.
 *
 * Schema additions:
 * - blossom_servers: Per-identity server list with position ordering
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create blossom_servers table
  await knex.schema.createTable('blossom_servers', (table: Knex.TableBuilder) => {
    table.string('identity_pubkey').notNullable(); // References identities.pubkey
    table.text('url').notNullable(); // Server base URL (HTTPS only)
    table.text('label'); // Optional user-defined label
    table.integer('position').notNullable(); // Ordering for UI (0-based)

    // Composite primary key: identity + URL
    table.primary(['identity_pubkey', 'url']);
  });

  // Create index on identity_pubkey for efficient per-identity queries
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_blossom_servers_identity ON blossom_servers(identity_pubkey)'
  );
}

export async function down(knex: Knex): Promise<void> {
  // Drop index first
  await knex.schema.raw('DROP INDEX IF EXISTS idx_blossom_servers_identity');

  // Drop table
  await knex.schema.dropTable('blossom_servers');
}
