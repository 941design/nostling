/**
 * Initial migration: Create app_state table
 *
 * Creates key-value store for application state persistence.
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('app_state', (table: Knex.TableBuilder) => {
    table.string('key').primary();
    table.text('value').notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('app_state');
}
