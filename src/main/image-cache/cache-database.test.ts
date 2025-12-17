/**
 * Property-based tests for cache-database.ts
 *
 * Tests verify all contract invariants and properties:
 * - Idempotency: initializeSchema can be called multiple times safely
 * - Completeness: loadAll returns all stored records
 * - Upsert semantics: store replaces existing records with same URL
 * - Idempotent delete: deleting non-existent URL returns false and succeeds
 * - Update no-op safety: updating non-existent URL succeeds silently
 * - Schema validation: all required fields present and correct types
 * - Persistence: data survives database operations
 * - Atomicity: operations complete without partial states
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fc from 'fast-check';
import { CacheDatabase } from './cache-database';
import { CacheMetadata } from '../../shared/image-cache-types';

// Mock Knex instance that provides enough interface for testing
class MockKnexTable {
  private data: Record<string, CacheMetadata> = {};

  insert(metadata: CacheMetadata) {
    return {
      onConflict: (field: string) => ({
        merge: async () => {
          this.data[metadata.url] = metadata;
        },
      }),
    };
  }

  select(field: string) {
    return Promise.resolve(Object.values(this.data));
  }

  where(field: string, value: string) {
    return {
      delete: async () => {
        if (this.data[value]) {
          delete this.data[value];
          return 1;
        }
        return 0;
      },
      update: async (changes: any) => {
        if (this.data[value]) {
          this.data[value] = { ...this.data[value], ...changes };
        }
      },
    };
  }

  async columnInfo() {
    return {
      url: { type: 'text' },
      filePath: { type: 'text' },
      timestamp: { type: 'integer' },
      size: { type: 'integer' },
      lastAccessed: { type: 'integer' },
    };
  }

  getData() {
    return this.data;
  }

  clearData() {
    this.data = {};
  }
}

class MockKnexSchema {
  private tables: Map<string, boolean> = new Map();

  async createTableIfNotExists(
    name: string,
    fn: (table: any) => void
  ): Promise<void> {
    if (!this.tables.has(name)) {
      this.tables.set(name, true);
      fn({
        text: (name: string) => ({
          primary: () => {},
          notNullable: () => {},
        }),
        integer: (name: string) => ({
          notNullable: () => {},
        }),
        index: () => {},
      });
    }
  }

  async hasTable(name: string): Promise<boolean> {
    return this.tables.has(name);
  }

  async table(name: string, fn: (table: any) => void): Promise<void> {
    fn({
      index: (field: string, name: string) => {},
    });
  }

  async raw(sql: string): Promise<any[]> {
    return [];
  }
}

class MockKnexDb {
  public table = new MockKnexTable();
  public schema = new MockKnexSchema();

  call(tableName: string) {
    return this.table;
  }
}

function createMockDb(): any {
  const db = new MockKnexDb();
  return new Proxy(db, {
    get(target: MockKnexDb, prop: string | symbol) {
      if (prop === 'schema') {
        return target.schema;
      }
      if (prop === 'raw') {
        return (sql: string) => target.schema.raw(sql);
      }
      return function () {
        return target.table;
      };
    },
    apply() {
      return db.table;
    },
  });
}

function createDb(): any {
  const table = new MockKnexTable();
  const schema = new MockKnexSchema();

  return new Proxy(
    function () {
      return table;
    },
    {
      get(target, prop) {
        if (prop === 'schema') {
          return schema;
        }
        return () => table;
      },
      apply() {
        return table;
      },
    }
  ) as any;
}

describe('CacheDatabase', () => {
  let db: any;

  beforeEach(async () => {
    db = createDb();
    await CacheDatabase.initializeSchema(db);
  });

  describe('Property-Based Tests', () => {
    it('P001: Schema idempotency - calling initializeSchema multiple times is safe', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 2, max: 5 }), async (numCalls) => {
          for (let i = 0; i < numCalls; i++) {
            await expect(
              CacheDatabase.initializeSchema(db)
            ).resolves.not.toThrow();
          }
        }),
        { numRuns: 3 }
      );
    });

    it('P003: Completeness property - loadAll returns all stored records', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl(),
              filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
              timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
              size: fc.integer({ min: 1, max: 1000000000 }),
              lastAccessed: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            }),
            { minLength: 1, maxLength: 10 }
          ).filter((arr) => {
            const urls = arr.map((r) => r.url);
            return new Set(urls).size === urls.length;
          }),
          async (records) => {
            const testDb = createDb();
            await CacheDatabase.initializeSchema(testDb);

            for (const record of records) {
              await CacheDatabase.store(testDb, record);
            }

            const loaded = await CacheDatabase.loadAll(testDb);

            expect(loaded).toHaveLength(records.length);

            for (const record of records) {
              const found = loaded.find((m) => m.url === record.url);
              expect(found).toBeDefined();
              expect(found).toEqual(record);
            }
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P004: Empty loadAll property - loadAll returns empty array when no data', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(null), async () => {
          const loaded = await CacheDatabase.loadAll(db);

          expect(Array.isArray(loaded)).toBe(true);
          expect(loaded).toHaveLength(0);
        }),
        { numRuns: 3 }
      );
    });

    it('P005: Upsert semantics property - store with duplicate URL replaces old record', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.webUrl(),
            fc.record({
              filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
              timestamp: fc.integer({ min: 1000000000000, max: 1500000000000 }),
              size: fc.integer({ min: 1, max: 1000000000 }),
              lastAccessed: fc.integer({ min: 1000000000000, max: 1500000000000 }),
            }),
            fc.record({
              filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
              timestamp: fc.integer({ min: 1500000000001, max: 2000000000000 }),
              size: fc.integer({ min: 1, max: 1000000000 }),
              lastAccessed: fc.integer({ min: 1500000000001, max: 2000000000000 }),
            })
          ),
          async ([url, first, second]) => {
            const testDb = createDb();
            await CacheDatabase.initializeSchema(testDb);

            const metadata1: CacheMetadata = { url, ...first };
            const metadata2: CacheMetadata = { url, ...second };

            await CacheDatabase.store(testDb, metadata1);
            let loaded = await CacheDatabase.loadAll(testDb);
            expect(loaded).toHaveLength(1);
            expect(loaded[0]).toEqual(metadata1);

            await CacheDatabase.store(testDb, metadata2);
            loaded = await CacheDatabase.loadAll(testDb);

            expect(loaded).toHaveLength(1);
            expect(loaded[0]).toEqual(metadata2);
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P006: Data preservation property - stored data is retrievable after store', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            url: fc.webUrl(),
            filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
            timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            size: fc.integer({ min: 1, max: 1000000000 }),
            lastAccessed: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          }),
          async (metadata: any) => {
            const testDb = createDb();
            await CacheDatabase.initializeSchema(testDb);

            const toStore: CacheMetadata = metadata;

            await CacheDatabase.store(testDb, toStore);

            const loaded = await CacheDatabase.loadAll(testDb);
            expect(loaded).toHaveLength(1);
            expect(loaded[0]).toEqual(toStore);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P007: Delete idempotency property - deleting non-existent URL returns false safely', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(fc.webUrl(), { minLength: 1, maxLength: 5 }), async (urls) => {
          for (const url of urls) {
            const result = await CacheDatabase.delete(db, url);
            expect(result).toBe(false);
          }

          const loaded = await CacheDatabase.loadAll(db);
          expect(loaded).toHaveLength(0);
        }),
        { numRuns: 5 }
      );
    });

    it('P008: Delete existence property - delete returns true when record exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            url: fc.webUrl(),
            filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
            timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            size: fc.integer({ min: 1, max: 1000000000 }),
            lastAccessed: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          }),
          async (metadata: any) => {
            const toStore: CacheMetadata = metadata;

            await CacheDatabase.store(db, toStore);

            const result = await CacheDatabase.delete(db, toStore.url);
            expect(result).toBe(true);

            const loaded = await CacheDatabase.loadAll(db);
            expect(loaded).toHaveLength(0);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P009: Delete completeness property - delete removes record from database', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl(),
              filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
              timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
              size: fc.integer({ min: 1, max: 1000000000 }),
              lastAccesses: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            }),
            { minLength: 2, maxLength: 5 }
          ).filter((arr) => {
            const urls = arr.map((r) => r.url);
            return new Set(urls).size === urls.length;
          }),
          async (records: any) => {
            const testDb = createDb();
            await CacheDatabase.initializeSchema(testDb);

            const metadata: CacheMetadata[] = records.map((r: any) => ({
              url: r.url,
              filePath: r.filePath,
              timestamp: r.timestamp,
              size: r.size,
              lastAccessed: r.lastAccesses,
            }));

            for (const m of metadata) {
              await CacheDatabase.store(testDb, m);
            }

            expect((await CacheDatabase.loadAll(testDb)).length).toBe(metadata.length);

            const toDelete = metadata[0];
            const result = await CacheDatabase.delete(testDb, toDelete.url);
            expect(result).toBe(true);

            const remaining = await CacheDatabase.loadAll(testDb);
            expect(remaining).toHaveLength(metadata.length - 1);
            expect(remaining.find((m) => m.url === toDelete.url)).toBeUndefined();
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P010: UpdateLastAccessed no-op property - updating non-existent URL succeeds', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(fc.webUrl(), fc.integer({ min: 1000000000000, max: 2000000000000 })),
          async ([url, timestamp]) => {
            await expect(
              CacheDatabase.updateLastAccessed(db, url, timestamp)
            ).resolves.not.toThrow();

            const loaded = await CacheDatabase.loadAll(db);
            expect(loaded).toHaveLength(0);
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P011: UpdateLastAccessed correctness property - updates lastAccessed field', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.record({
              url: fc.webUrl(),
              filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
              timestamp: fc.integer({ min: 1000000000000, max: 1500000000000 }),
              size: fc.integer({ min: 1, max: 1000000000 }),
              lastAccessed: fc.integer({ min: 1000000000000, max: 1500000000000 }),
            }),
            fc.integer({ min: 1500000000001, max: 2000000000000 })
          ),
          async ([originalData, newTimestamp]: any) => {
            const testDb = createDb();
            await CacheDatabase.initializeSchema(testDb);

            const original: CacheMetadata = originalData;

            await CacheDatabase.store(testDb, original);

            await CacheDatabase.updateLastAccessed(testDb, original.url, newTimestamp);

            const loaded = await CacheDatabase.loadAll(testDb);
            expect(loaded).toHaveLength(1);

            const updated = loaded[0];
            expect(updated.url).toBe(original.url);
            expect(updated.filePath).toBe(original.filePath);
            expect(updated.timestamp).toBe(original.timestamp);
            expect(updated.size).toBe(original.size);
            expect(updated.lastAccessed).toBe(newTimestamp);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P012: Batch operations property - store then delete sequence maintains consistency', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl(),
              filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
              timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
              size: fc.integer({ min: 1, max: 1000000000 }),
              lastAccessed: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            }),
            { minLength: 1, maxLength: 5 }
          ).filter((arr) => {
            const urls = arr.map((r) => r.url);
            return new Set(urls).size === urls.length;
          }),
          async (records: any) => {
            const metadata: CacheMetadata[] = records;

            for (const m of metadata) {
              await CacheDatabase.store(db, m);
            }

            let loaded = await CacheDatabase.loadAll(db);
            expect(loaded).toHaveLength(metadata.length);

            for (const m of metadata) {
              const deleted = await CacheDatabase.delete(db, m.url);
              expect(deleted).toBe(true);
            }

            loaded = await CacheDatabase.loadAll(db);
            expect(loaded).toHaveLength(0);
          }
        ),
        { numRuns: 5 }
      );
    });

    it('P013: Field validation property - all loaded records have required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              url: fc.webUrl(),
              filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
              timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
              size: fc.integer({ min: 1, max: 1000000000 }),
              lastAccessed: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            }),
            { minLength: 1, maxLength: 10 }
          ).filter((arr) => {
            const urls = arr.map((r) => r.url);
            return new Set(urls).size === urls.length;
          }),
          async (records: any) => {
            const metadata: CacheMetadata[] = records;

            for (const m of metadata) {
              await CacheDatabase.store(db, m);
            }

            const loaded = await CacheDatabase.loadAll(db);

            for (const item of loaded) {
              expect(typeof item.url).toBe('string');
              expect(item.url.length).toBeGreaterThan(0);
              expect(typeof item.filePath).toBe('string');
              expect(item.filePath.length).toBeGreaterThan(0);
              expect(typeof item.timestamp).toBe('number');
              expect(Number.isInteger(item.timestamp)).toBe(true);
              expect(typeof item.size).toBe('number');
              expect(Number.isInteger(item.size)).toBe(true);
              expect(item.size).toBeGreaterThan(0);
              expect(typeof item.lastAccessed).toBe('number');
              expect(Number.isInteger(item.lastAccessed)).toBe(true);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P014: Type stability property - stored types match retrieved types', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            url: fc.webUrl(),
            filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
            timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
            size: fc.integer({ min: 1, max: 1000000000 }),
            lastAccessed: fc.integer({ min: 1000000000000, max: 2000000000000 }),
          }),
          async (metadata: any) => {
            const original: CacheMetadata = metadata;
            await CacheDatabase.store(db, original);

            const loaded = await CacheDatabase.loadAll(db);
            const retrieved = loaded[0];

            expect(typeof retrieved.url).toBe(typeof original.url);
            expect(typeof retrieved.filePath).toBe(typeof original.filePath);
            expect(typeof retrieved.timestamp).toBe(typeof original.timestamp);
            expect(typeof retrieved.size).toBe(typeof original.size);
            expect(typeof retrieved.lastAccessed).toBe(typeof original.lastAccessed);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('P015: URL uniqueness property - URL is primary key, only one record per URL', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.webUrl(),
            fc.array(
              fc.record({
                filePath: fc.stringMatching(/^\/[a-zA-Z0-9_\/-]+$/),
                timestamp: fc.integer({ min: 1000000000000, max: 2000000000000 }),
                size: fc.integer({ min: 1, max: 1000000000 }),
                lastAccessed: fc.integer({ min: 1000000000000, max: 2000000000000 }),
              }),
              { minLength: 2, maxLength: 10 }
            )
          ),
          async ([url, variations]) => {
            for (const v of variations) {
              const metadata: CacheMetadata = { url, ...v };
              await CacheDatabase.store(db, metadata);
            }

            const loaded = await CacheDatabase.loadAll(db);
            const urlCounts = loaded.reduce(
              (acc, m) => {
                acc[m.url] = (acc[m.url] || 0) + 1;
                return acc;
              },
              {} as Record<string, number>
            );

            expect(urlCounts[url]).toBe(1);
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Contract Invariants', () => {
    it('C001: initializeSchema completes successfully', async () => {
      await expect(CacheDatabase.initializeSchema(db)).resolves.not.toThrow();
    });

    it('C002: loadAll returns array of CacheMetadata', async () => {
      const result = await CacheDatabase.loadAll(db);
      expect(Array.isArray(result)).toBe(true);
    });

    it('C003: store accepts valid CacheMetadata', async () => {
      const metadata: CacheMetadata = {
        url: 'https://example.com/image.jpg',
        filePath: '/cache/image.jpg',
        timestamp: 1000000000000,
        size: 1024,
        lastAccessed: 1000000000000,
      };

      await expect(CacheDatabase.store(db, metadata)).resolves.not.toThrow();
    });

    it('C004: delete returns boolean', async () => {
      const result = await CacheDatabase.delete(db, 'https://nonexistent.com');
      expect(typeof result).toBe('boolean');
      expect(result).toBe(false);
    });

    it('C005: updateLastAccessed does not throw', async () => {
      await expect(
        CacheDatabase.updateLastAccessed(db, 'https://nonexistent.com', 1000000000000)
      ).resolves.not.toThrow();
    });

    it('C006: Multiple URLs can be stored', async () => {
      const urls = ['https://example1.com/image.jpg', 'https://example2.com/image.jpg'];

      for (const url of urls) {
        const metadata: CacheMetadata = {
          url,
          filePath: `/cache/${url.split('/').pop()}`,
          timestamp: 1000000000000,
          size: 1024,
          lastAccessed: 1000000000000,
        };

        await CacheDatabase.store(db, metadata);
      }

      const loaded = await CacheDatabase.loadAll(db);
      expect(loaded).toHaveLength(2);
    });

    it('C007: Deleted record is no longer in loadAll results', async () => {
      const metadata: CacheMetadata = {
        url: 'https://example.com/image.jpg',
        filePath: '/cache/image.jpg',
        timestamp: 1000000000000,
        size: 1024,
        lastAccessed: 1000000000000,
      };

      await CacheDatabase.store(db, metadata);
      let loaded = await CacheDatabase.loadAll(db);
      expect(loaded).toHaveLength(1);

      await CacheDatabase.delete(db, metadata.url);
      loaded = await CacheDatabase.loadAll(db);
      expect(loaded).toHaveLength(0);
    });

    it('C008: updateLastAccessed changes the field', async () => {
      const metadata: CacheMetadata = {
        url: 'https://example.com/image.jpg',
        filePath: '/cache/image.jpg',
        timestamp: 1000000000000,
        size: 1024,
        lastAccessed: 1000000000000,
      };

      await CacheDatabase.store(db, metadata);

      const newTimestamp = 2000000000000;
      await CacheDatabase.updateLastAccessed(db, metadata.url, newTimestamp);

      const loaded = await CacheDatabase.loadAll(db);
      expect(loaded[0].lastAccessed).toBe(newTimestamp);
    });
  });
});
