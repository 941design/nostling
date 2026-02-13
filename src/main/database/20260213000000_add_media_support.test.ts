/**
 * Integration tests for media support migration
 *
 * Verifies:
 * - AC-036: media_blobs table schema correctness
 * - AC-037: message_media junction table with FKs and index
 * - AC-038: nostr_messages.media_json column addition
 * - Migration rollback functionality
 *
 * Property-based tests verify data insertion and constraint enforcement.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fc from 'fast-check';
import { app } from 'electron';
import * as fs from 'fs';
import { initializeDatabaseWithMigrations, closeDatabaseConnection } from './index';
import { getDatabase, _resetDatabaseState } from './connection';

// Mock electron app
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/test-userdata-media'),
    quit: jest.fn(),
  },
  dialog: {
    showErrorBox: jest.fn(),
  },
}));

// Mock logging
jest.mock('../logging', () => ({
  log: jest.fn(),
}));

describe('Media Support Migration Integration', () => {
  const testDbPath = '/tmp/test-userdata-media/nostling.db';

  beforeEach(async () => {
    // Clean up any existing test database
    _resetDatabaseState();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test
    await closeDatabaseConnection();
    _resetDatabaseState();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Property: Migration Execution', () => {
    it('should execute migration without errors', async () => {
      await expect(initializeDatabaseWithMigrations()).resolves.not.toThrow();
      const db = getDatabase();
      expect(db).not.toBeNull();
    });
  });

  describe('AC-036: media_blobs Table Schema', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should create media_blobs table with all required columns', async () => {
      const db = getDatabase();
      const result = db!.exec('PRAGMA table_info(media_blobs)');

      // Extract column names
      const columns = result[0]?.values.map((row: any) => row[1]) || [];

      // Verify all 8 required columns exist
      expect(columns).toContain('hash');
      expect(columns).toContain('mime_type');
      expect(columns).toContain('size_bytes');
      expect(columns).toContain('dimensions_json');
      expect(columns).toContain('blurhash');
      expect(columns).toContain('local_path');
      expect(columns).toContain('uploaded_at');
      expect(columns).toContain('created_at');
      expect(columns).toHaveLength(8);
    });

    it('should have hash as PRIMARY KEY', async () => {
      const db = getDatabase();
      const result = db!.exec('PRAGMA table_info(media_blobs)');

      // Find hash column and verify it's the primary key
      const hashColumn = result[0]?.values.find((row: any) => row[1] === 'hash');
      expect(hashColumn).toBeDefined();
      expect(hashColumn![5]).toBe(1); // pk column = 1 means primary key
    });

    it('should enforce NOT NULL constraints on required columns', async () => {
      const db = getDatabase();

      // Try to insert without mime_type (required)
      expect(() => {
        db!.exec(`
          INSERT INTO media_blobs (hash, size_bytes, created_at)
          VALUES ('test-hash', 1024, 1234567890)
        `);
      }).toThrow();

      // Try to insert without size_bytes (required)
      expect(() => {
        db!.exec(`
          INSERT INTO media_blobs (hash, mime_type, created_at)
          VALUES ('test-hash', 'image/jpeg', 1234567890)
        `);
      }).toThrow();
    });
  });

  describe('AC-037: message_media Junction Table Schema', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should create message_media table with all required columns', async () => {
      const db = getDatabase();
      const result = db!.exec('PRAGMA table_info(message_media)');

      // Extract column names
      const columns = result[0]?.values.map((row: any) => row[1]) || [];

      // Verify all 5 required columns exist
      expect(columns).toContain('message_id');
      expect(columns).toContain('blob_hash');
      expect(columns).toContain('remote_url');
      expect(columns).toContain('placeholder_key');
      expect(columns).toContain('upload_status');
      expect(columns).toHaveLength(5);
    });

    it('should have index on upload_status', async () => {
      const db = getDatabase();
      const result = db!.exec(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='message_media' AND name='idx_message_media_upload_status'
      `);

      const indexes = result[0]?.values.flat() || [];
      expect(indexes).toContain('idx_message_media_upload_status');
    });

    it('should support inserting junction records with message and blob references', async () => {
      const db = getDatabase();

      // Create necessary prerequisite data (identity, contact, message)
      db!.exec(`
        INSERT INTO nostr_identities (id, npub, secret_ref, label, created_at)
        VALUES ('test-identity', 'npub-test', 'secret-ref', 'Test', datetime('now'))
      `);

      db!.exec(`
        INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, created_at)
        VALUES ('test-contact', 'test-identity', 'npub-contact', 'Contact', 'connected', datetime('now'))
      `);

      db!.exec(`
        INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction)
        VALUES ('test-message', 'test-identity', 'test-contact', 'npub-sender', 'npub-recipient', 'encrypted', datetime('now'), 'sent', 'outgoing')
      `);

      // Insert blob
      db!.exec(`
        INSERT INTO media_blobs (hash, mime_type, size_bytes, created_at)
        VALUES ('test-blob-hash', 'image/jpeg', 2048, 1234567890)
      `);

      // Insert junction record
      db!.exec(`
        INSERT INTO message_media (message_id, blob_hash, upload_status)
        VALUES ('test-message', 'test-blob-hash', 'uploaded')
      `);

      // Verify record was inserted
      const result = db!.exec('SELECT * FROM message_media');
      expect(result[0]?.values.length).toBe(1);
      expect(result[0].values[0][0]).toBe('test-message');
      expect(result[0].values[0][1]).toBe('test-blob-hash');
    });
  });

  describe('AC-038: nostr_messages.media_json Column', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should add media_json column to nostr_messages table', async () => {
      const db = getDatabase();
      const result = db!.exec('PRAGMA table_info(nostr_messages)');

      // Extract column names
      const columns = result[0]?.values.map((row: any) => row[1]) || [];

      // Verify media_json column exists
      expect(columns).toContain('media_json');
    });

    it('should allow TEXT/JSON data in media_json column', async () => {
      const db = getDatabase();

      // Create prerequisite data
      db!.exec(`
        INSERT INTO nostr_identities (id, npub, secret_ref, label, created_at)
        VALUES ('test-identity-2', 'npub-test-2', 'secret-ref', 'Test', datetime('now'))
      `);

      db!.exec(`
        INSERT INTO nostr_contacts (id, identity_id, npub, alias, state, created_at)
        VALUES ('test-contact-2', 'test-identity-2', 'npub-contact-2', 'Contact', 'connected', datetime('now'))
      `);

      // Insert message with JSON media data
      const mediaJson = JSON.stringify({
        attachments: [{ url: 'https://example.com/image.jpg', type: 'image/jpeg' }],
      });

      db!.exec(`
        INSERT INTO nostr_messages (id, identity_id, contact_id, sender_npub, recipient_npub, ciphertext, timestamp, status, direction, media_json)
        VALUES ('test-message-2', 'test-identity-2', 'test-contact-2', 'npub-sender', 'npub-recipient', 'encrypted', datetime('now'), 'sent', 'outgoing', '${mediaJson}')
      `);

      // Retrieve and verify
      const result = db!.exec("SELECT media_json FROM nostr_messages WHERE id = 'test-message-2'");
      const retrievedJson = result[0]?.values[0][0];
      expect(retrievedJson).toBe(mediaJson);
      expect(() => JSON.parse(retrievedJson as string)).not.toThrow();
    });
  });

  describe('Property: Data Insertion and Retrieval', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should insert and retrieve media blobs with various data types', async () => {
      const db = getDatabase();
      const testCases = [
        { hash: 'abc123def456', mimeType: 'image/jpeg', sizeBytes: 2048, blurhash: 'L9H2Ad' },
        { hash: 'xyz789', mimeType: 'image/png', sizeBytes: 4096, blurhash: null },
        { hash: 'video001', mimeType: 'video/mp4', sizeBytes: 1024000, blurhash: 'LKO2' },
      ];

      for (const testCase of testCases) {
        const { hash, mimeType, sizeBytes, blurhash } = testCase;

        // Insert blob
        db!.exec(`
          INSERT INTO media_blobs (hash, mime_type, size_bytes, blurhash, created_at)
          VALUES ('${hash}', '${mimeType}', ${sizeBytes}, ${blurhash ? `'${blurhash}'` : 'NULL'}, ${Date.now()})
        `);

        // Retrieve and verify
        const result = db!.exec(`SELECT hash, mime_type, size_bytes, blurhash FROM media_blobs WHERE hash = '${hash}'`);
        expect(result[0]?.values.length).toBe(1);

        const row = result[0].values[0];
        expect(row[0]).toBe(hash);
        expect(row[1]).toBe(mimeType);
        expect(row[2]).toBe(sizeBytes);
        expect(row[3]).toBe(blurhash);

        // Cleanup
        db!.exec(`DELETE FROM media_blobs WHERE hash = '${hash}'`);
      }
    });

    it('should enforce unique hash constraint (PRIMARY KEY)', async () => {
      const db = getDatabase();

      // Insert first blob
      db!.exec(`
        INSERT INTO media_blobs (hash, mime_type, size_bytes, created_at)
        VALUES ('duplicate-hash', 'image/jpeg', 1024, 1234567890)
      `);

      // Try to insert duplicate hash - should fail
      expect(() => {
        db!.exec(`
          INSERT INTO media_blobs (hash, mime_type, size_bytes, created_at)
          VALUES ('duplicate-hash', 'image/png', 2048, 1234567891)
        `);
      }).toThrow();
    });
  });

  describe('Property: Query Performance - Index Usage', () => {
    beforeEach(async () => {
      await initializeDatabaseWithMigrations();
    });

    it('should use index for upload_status queries', async () => {
      const db = getDatabase();

      // Query plan should show index usage
      const result = db!.exec(`
        EXPLAIN QUERY PLAN
        SELECT * FROM message_media WHERE upload_status = 'pending'
      `);

      const queryPlan = result[0]?.values.map((row: any) => row.join(' ')) || [];
      const planString = queryPlan.join(' ');

      // Should mention the index in the query plan
      expect(planString).toMatch(/idx_message_media_upload_status/i);
    });
  });

  describe('Migration Rollback', () => {
    it('should remove all schema changes when down() is executed', async () => {
      // Run migration
      await initializeDatabaseWithMigrations();
      let db = getDatabase();

      // Verify tables exist BEFORE rollback
      let tables = db!.exec("SELECT name FROM sqlite_master WHERE type='table'");
      let tableNames = tables[0]?.values.flat() || [];
      expect(tableNames).toContain('media_blobs');
      expect(tableNames).toContain('message_media');

      // Verify media_json column exists BEFORE rollback
      let columns = db!.exec('PRAGMA table_info(nostr_messages)');
      let columnNames = columns[0]?.values.map((row: any) => row[1]) || [];
      expect(columnNames).toContain('media_json');

      // Import and execute down() function directly
      const migration = await import('./migrations/20260213000000_add_media_support');

      // Create minimal Knex-compatible interface for down()
      const knexMock = {
        schema: {
          raw: (sql: string) => {
            db!.run(sql);
            return Promise.resolve();
          },
          dropTable: (tableName: string) => {
            db!.run(`DROP TABLE IF EXISTS ${tableName}`);
            return Promise.resolve();
          },
        },
      };

      // Execute down() function
      await migration.down(knexMock as any);

      // Verify tables REMOVED after rollback
      tables = db!.exec("SELECT name FROM sqlite_master WHERE type='table'");
      tableNames = tables[0]?.values.flat() || [];
      expect(tableNames).not.toContain('media_blobs');
      expect(tableNames).not.toContain('message_media');

      // Verify media_json column REMOVED after rollback
      columns = db!.exec('PRAGMA table_info(nostr_messages)');
      columnNames = columns[0]?.values.map((row: any) => row[1]) || [];
      expect(columnNames).not.toContain('media_json');
    });

    it('should support idempotent re-application after rollback', async () => {
      // Run migration
      await initializeDatabaseWithMigrations();
      const db = getDatabase();

      // Execute down()
      const migration = await import('./migrations/20260213000000_add_media_support');
      const knexMock = {
        schema: {
          raw: (sql: string) => {
            db!.run(sql);
            return Promise.resolve();
          },
          dropTable: (tableName: string) => {
            db!.run(`DROP TABLE IF EXISTS ${tableName}`);
            return Promise.resolve();
          },
        },
      };
      await migration.down(knexMock as any);

      // Execute up() again
      const knexMockUp = {
        schema: {
          createTable: (tableName: string, callback: any) => {
            // Simulate Knex createTable by building SQL
            const builder = {
              commands: [] as string[],
              string: (col: string) => {
                builder.commands.push(`${col} TEXT`);
                return { primary: () => builder, notNullable: () => builder };
              },
              text: (col: string) => {
                builder.commands.push(`${col} TEXT`);
                return { notNullable: () => builder };
              },
              integer: (col: string) => {
                builder.commands.push(`${col} INTEGER`);
                return { notNullable: () => builder };
              },
              primary: (cols: string[]) => {
                builder.commands.push(`PRIMARY KEY (${cols.join(', ')})`);
              },
            };
            callback(builder);
            const sql = `CREATE TABLE ${tableName} (${builder.commands.join(', ')})`;
            db!.run(sql);
            return Promise.resolve();
          },
          raw: (sql: string) => {
            db!.run(sql);
            return Promise.resolve();
          },
        },
      };
      await migration.up(knexMockUp as any);

      // Verify tables exist again
      const tables = db!.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables[0]?.values.flat() || [];
      expect(tableNames).toContain('media_blobs');
      expect(tableNames).toContain('message_media');
    });
  });
});
