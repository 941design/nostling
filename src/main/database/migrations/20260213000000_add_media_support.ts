/**
 * Media Support Migration
 *
 * Adds database schema for content-addressed media blob storage and
 * message-media associations. Supports the Blossom media uploads feature.
 *
 * Schema additions:
 * - media_blobs: Content-addressed blob storage with metadata
 * - message_media: Junction table for message-blob associations
 * - nostr_messages.media_json: Attachment metadata column
 */

import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create media_blobs table
  await knex.schema.createTable('media_blobs', (table: Knex.TableBuilder) => {
    table.string('hash').primary(); // Content-addressed storage: hash is PK
    table.text('mime_type').notNullable();
    table.integer('size_bytes').notNullable();
    table.text('dimensions_json'); // JSON: {width, height} for images/video
    table.text('blurhash'); // Optional blurhash for image placeholders
    table.text('local_path'); // Path to local file cache
    table.integer('uploaded_at'); // Unix timestamp when uploaded to Blossom server
    table.integer('created_at').notNullable(); // Unix timestamp when blob added to DB
  });

  // Create message_media junction table
  await knex.schema.createTable('message_media', (table: Knex.TableBuilder) => {
    table.string('message_id').notNullable();
    table.string('blob_hash').notNullable();
    table.text('remote_url'); // URL on Blossom server after upload
    table.text('placeholder_key'); // Key for placeholder content while uploading
    table.text('upload_status').notNullable(); // pending | uploading | uploaded | failed

    // Composite primary key
    table.primary(['message_id', 'blob_hash']);
  });

  // Create index on upload_status for efficient queries
  await knex.schema.raw(
    'CREATE INDEX IF NOT EXISTS idx_message_media_upload_status ON message_media(upload_status)'
  );

  // Add media_json column to nostr_messages
  await knex.schema.raw('ALTER TABLE nostr_messages ADD COLUMN media_json TEXT');
}

export async function down(knex: Knex): Promise<void> {
  // Drop index first
  await knex.schema.raw('DROP INDEX IF EXISTS idx_message_media_upload_status');

  // Drop tables in reverse dependency order
  await knex.schema.dropTable('message_media');
  await knex.schema.dropTable('media_blobs');

  // Drop media_json column
  // Note: SQLite doesn't support DROP COLUMN directly in older versions,
  // but this is provided for completeness
  await knex.schema.raw('ALTER TABLE nostr_messages DROP COLUMN media_json');
}
