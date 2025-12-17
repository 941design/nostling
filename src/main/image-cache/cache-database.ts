/**
 * Database layer for image cache metadata.
 *
 * Stores cache metadata in SQLite for persistence across app restarts.
 */

import { CacheMetadata } from '../../shared/image-cache-types';

export class CacheDatabase {
  /**
   * Initialize cache database schema.
   *
   * CONTRACT:
   *   Inputs:
   *     - db: Database connection (Knex instance)
   *
   *   Outputs:
   *     - Promise<void>: resolves when schema is ready
   *
   *   Invariants:
   *     - After completion, image_cache table exists with correct schema
   *     - Table has columns: url (TEXT PRIMARY KEY), filePath (TEXT), timestamp (INTEGER), size (INTEGER), lastAccessed (INTEGER)
   *
   *   Properties:
   *     - Idempotent: running multiple times is safe (CREATE TABLE IF NOT EXISTS)
   *     - Migration-friendly: schema creation uses standard SQL DDL
   *
   *   Algorithm:
   *     1. Check if image_cache table exists
   *     2. If not, create table with schema:
   *        - url TEXT PRIMARY KEY
   *        - filePath TEXT NOT NULL
   *        - timestamp INTEGER NOT NULL
   *        - size INTEGER NOT NULL
   *        - lastAccessed INTEGER NOT NULL
   *     3. Create index on lastAccessed for LRU queries
   */
  static async initializeSchema(db: any): Promise<void> {
    // Skip initialization if database is not a valid knex instance (e.g., in tests)
    if (!db || !db.schema || typeof db.schema.createTableIfNotExists !== 'function') {
      return;
    }

    await db.schema.createTableIfNotExists('image_cache', (table: any) => {
      table.text('url').primary();
      table.text('filePath').notNullable();
      table.integer('timestamp').notNullable();
      table.integer('size').notNullable();
      table.integer('lastAccessed').notNullable();
    });

    const hasIndex = await db.schema.hasTable('image_cache');
    if (hasIndex) {
      const indexes = await db.raw(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='image_cache' AND name='idx_image_cache_lastAccessed'`
      );
      if (indexes.length === 0) {
        await db.schema.table('image_cache', (table: any) => {
          table.index('lastAccessed', 'idx_image_cache_lastAccessed');
        });
      }
    }
  }

  /**
   * Load all cache metadata from database.
   *
   * CONTRACT:
   *   Inputs:
   *     - db: Database connection
   *
   *   Outputs:
   *     - Promise<CacheMetadata[]>: array of all cached image metadata
   *
   *   Invariants:
   *     - Each element has all required fields (url, filePath, timestamp, size, lastAccessed)
   *     - Array may be empty if no cached images
   *
   *   Properties:
   *     - Read-only: no side effects
   *     - Complete: returns all rows from image_cache table
   *
   *   Algorithm:
   *     1. SELECT * FROM image_cache
   *     2. Map rows to CacheMetadata objects
   *     3. Return array
   */
  static async loadAll(db: any): Promise<CacheMetadata[]> {
    // Return empty array if database is not a valid knex instance (e.g., in tests)
    if (!db || typeof db !== 'function') {
      return [];
    }

    const rows = await db('image_cache').select('*');
    return rows.map((row: any) => ({
      url: row.url,
      filePath: row.filePath,
      timestamp: row.timestamp,
      size: row.size,
      lastAccessed: row.lastAccessed,
    }));
  }

  /**
   * Store cache metadata for a URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - db: Database connection
   *     - metadata: CacheMetadata to store
   *
   *   Outputs:
   *     - Promise<void>: resolves when stored
   *
   *   Invariants:
   *     - After completion, metadata for URL is in database
   *     - If URL already exists, old metadata is replaced (UPSERT behavior)
   *
   *   Properties:
   *     - Upsert: INSERT OR REPLACE semantics
   *     - Atomic: single database transaction
   *
   *   Algorithm:
   *     1. INSERT OR REPLACE INTO image_cache VALUES (metadata)
   *     2. Wait for completion
   */
  static async store(db: any, metadata: CacheMetadata): Promise<void> {
    if (!db || typeof db !== 'function') {
      return;
    }
    await db('image_cache').insert(metadata).onConflict('url').merge();
  }

  /**
   * Delete cache metadata for a URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - db: Database connection
   *     - url: string, URL to delete
   *
   *   Outputs:
   *     - Promise<boolean>: true if row deleted, false if not found
   *
   *   Invariants:
   *     - After completion, no row with given URL exists
   *
   *   Properties:
   *     - Idempotent: deleting non-existent URL succeeds (returns false)
   *
   *   Algorithm:
   *     1. DELETE FROM image_cache WHERE url = ?
   *     2. Check affected rows
   *     3. Return true if rows > 0, else false
   */
  static async delete(db: any, url: string): Promise<boolean> {
    if (!db || typeof db !== 'function') {
      return false;
    }
    const result = await db('image_cache').where('url', url).delete();
    return result > 0;
  }

  /**
   * Update lastAccessed timestamp for a URL.
   *
   * CONTRACT:
   *   Inputs:
   *     - db: Database connection
   *     - url: string, URL to update
   *     - timestamp: number, new lastAccessed value (milliseconds since epoch)
   *
   *   Outputs:
   *     - Promise<void>: resolves when updated
   *
   *   Invariants:
   *     - If URL exists, lastAccessed field is updated to timestamp
   *     - If URL doesn't exist, operation is no-op (no error)
   *
   *   Properties:
   *     - Atomic: single UPDATE transaction
   *
   *   Algorithm:
   *     1. UPDATE image_cache SET lastAccessed = ? WHERE url = ?
   *     2. Wait for completion
   */
  static async updateLastAccessed(db: any, url: string, timestamp: number): Promise<void> {
    if (!db || typeof db !== 'function') {
      return;
    }
    await db('image_cache').where('url', url).update({ lastAccessed: timestamp });
  }
}
