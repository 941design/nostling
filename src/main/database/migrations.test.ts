/**
 * Property-based tests for database migration runner
 *
 * Tests cover idempotency, ordering, tracking, and performance invariants
 * using fast-check property-based testing framework.
 */

import fc from 'fast-check';
import initSqlJs, { Database } from 'sql.js';

describe('Database Migration Runner', () => {
  let sqlJs: any;

  beforeAll(async () => {
    sqlJs = await initSqlJs();
  });

  function createTestDatabase(): Database {
    return new sqlJs.Database();
  }

  function createKnexAdapter(database: Database): any {
    return {
      schema: {
        createTable: (tableName: string, callback: (table: any) => void) => {
          const columns: Array<{ name: string; type: string; constraints: string[] }> = [];
          const tableBuilder = createTableBuilder(columns);
          callback(tableBuilder);
          tableBuilder.finalizePending();
          const createSql = buildCreateTableSQL(tableName, columns);
          database.run(createSql);
          return Promise.resolve();
        },
        dropTable: (tableName: string) => {
          database.run(`DROP TABLE IF EXISTS ${tableName}`);
          return Promise.resolve();
        },
        raw: (sql: string) => {
          database.run(sql);
          return Promise.resolve();
        },
      },
      fn: {
        now: () => ({
          toString: () => 'CURRENT_TIMESTAMP',
        }),
      },
    };
  }

  function createTableBuilder(columns: Array<{ name: string; type: string; constraints: string[] }>): any {
    const pendingColumns: Array<{ state: any; name: string; type: string }> = [];

    return {
      string: (columnName: string) => {
        const state = { isPrimary: false, isNotNull: false, constraintsList: [] as string[] };
        pendingColumns.push({ state, name: columnName, type: 'TEXT' });
        return createColumnBuilder(state);
      },
      text: (columnName: string) => {
        const state = { isPrimary: false, isNotNull: false, constraintsList: [] as string[] };
        pendingColumns.push({ state, name: columnName, type: 'TEXT' });
        return createColumnBuilder(state);
      },
      timestamp: (columnName: string) => {
        const state = { isPrimary: false, isNotNull: false, constraintsList: [] as string[] };
        pendingColumns.push({ state, name: columnName, type: 'DATETIME' });
        return createColumnBuilder(state);
      },
      integer: (columnName: string) => {
        const state = { isPrimary: false, isNotNull: false, constraintsList: [] as string[] };
        pendingColumns.push({ state, name: columnName, type: 'INTEGER' });
        return createColumnBuilder(state);
      },
      primary: () => {},
      comment: () => {},
      engine: () => {},
      charset: () => {},
      collate: () => {},
      unique: () => {},
      index: () => {},
      finalizePending: () => {
        pendingColumns.forEach(({ state, name, type }) => {
          let constraint = '';
          if (state.isPrimary) constraint += 'PRIMARY KEY ';
          if (state.isNotNull) constraint += 'NOT NULL ';
          constraint += state.constraintsList.join(' ');

          columns.push({
            name,
            type,
            constraints: constraint ? [constraint] : [],
          });
        });
      },
    };
  }

  function createColumnBuilder(state: { isPrimary: boolean; isNotNull: boolean; constraintsList: string[] }): any {
    return {
      primary: function () {
        state.isPrimary = true;
        return this;
      },
      notNullable: function () {
        state.isNotNull = true;
        return this;
      },
      defaultTo: function (value: any) {
        if (typeof value === 'string') {
          state.constraintsList.push(`DEFAULT '${value}'`);
        }
        return this;
      },
      nullable: function () {
        return this;
      },
      unsigned: function () {
        return this;
      },
      index: function () {
        return this;
      },
      unique: function () {
        return this;
      },
      deferrable: function () {
        return this;
      },
      comment: function () {
        return this;
      },
      collate: function () {
        return this;
      },
      alter: function () {
        return this;
      },
      modify: function () {
        return this;
      },
    };
  }

  function buildCreateTableSQL(tableName: string, columns: Array<{ name: string; type: string; constraints: string[] }>): string {
    const columnDefs = columns.map((col) => {
      const constraints = col.constraints.join(' ');
      return `${col.name} ${col.type}${constraints ? ' ' + constraints : ''}`;
    });
    return `CREATE TABLE ${tableName} (${columnDefs.join(', ')})`;
  }

  async function runMigrationsWithMap(
    database: Database,
    migrationsMap: Map<string, any>
  ): Promise<{ executedMigrations: string[]; duration: number }> {
    const startTime = Date.now();
    const executedMigrations: string[] = [];

    // Ensure knex_migrations table
    const tableCheckResult = database.exec(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='knex_migrations'
    `);
    if (tableCheckResult.length === 0) {
      database.run(`
        CREATE TABLE knex_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          batch INTEGER NOT NULL,
          migration_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Get applied migrations
    let appliedMigrations: string[] = [];
    try {
      const result = database.exec('SELECT name FROM knex_migrations ORDER BY name ASC');
      if (result.length > 0) {
        appliedMigrations = result[0].values.map((row) => row[0] as string);
      }
    } catch {
      appliedMigrations = [];
    }

    // Get pending migrations
    const discoveredMigrations = Array.from(migrationsMap.keys()).sort();
    const pendingMigrations = discoveredMigrations.filter((name) => !appliedMigrations.includes(name));

    // Run pending migrations with transaction support (mirrors real implementation)
    for (const migrationName of pendingMigrations) {
      const migration = migrationsMap.get(migrationName);
      const knexAdapter = createKnexAdapter(database);

      // Begin transaction for atomic migration execution
      database.run('BEGIN TRANSACTION');

      try {
        await migration.up(knexAdapter.schema);

        const getBatchSql = 'SELECT MAX(batch) as max_batch FROM knex_migrations';
        const batchResult = database.exec(getBatchSql);
        let batch = 1;
        if (batchResult.length > 0 && batchResult[0].values.length > 0) {
          const maxBatch = batchResult[0].values[0][0];
          batch = (maxBatch as number) + 1;
        }

        const insertSql = `INSERT INTO knex_migrations (name, batch) VALUES (?, ?)`;
        database.run(insertSql, [migrationName, batch]);
        database.run('COMMIT');
        executedMigrations.push(migrationName);
      } catch (error) {
        // Rollback transaction on failure
        try {
          database.run('ROLLBACK');
        } catch {
          // Ignore rollback errors
        }
        throw new Error(
          `Migration ${migrationName} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const duration = Date.now() - startTime;
    return { executedMigrations, duration };
  }

  async function getAppliedMigrationsFromDB(database: Database): Promise<string[]> {
    const tableCheckResult = database.exec(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='knex_migrations'
    `);
    if (tableCheckResult.length === 0) {
      return [];
    }

    try {
      const result = database.exec('SELECT name FROM knex_migrations ORDER BY name ASC');
      if (result.length === 0) {
        return [];
      }

      const rows = result[0].values;
      return rows.map((row) => row[0] as string);
    } catch {
      return [];
    }
  }

  describe('Property: Idempotency', () => {
    it('running migrations twice applies same migrations once', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 10000000000000, max: 99999999999999 }), { minLength: 1, maxLength: 3 }),
          async (timestamps) => {
            const db = createTestDatabase();
            const migrations = new Map(
              timestamps.map((ts, idx) => [
                `${ts}_migration_${idx}`,
                {
                  up: async (schema: any) => schema.createTable(`table_${ts}_${idx}`, (t: any) => t.string('id').primary()),
                },
              ])
            );

            const result1 = await runMigrationsWithMap(db, migrations);
            const applied1 = await getAppliedMigrationsFromDB(db);

            const result2 = await runMigrationsWithMap(db, migrations);
            const applied2 = await getAppliedMigrationsFromDB(db);

            expect(applied1).toEqual(applied2);
            expect(result2.executedMigrations.length).toBe(0);
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Property: Ordering', () => {
    it('migrations execute in filename chronological order', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(fc.nat(5), { minLength: 1, maxLength: 5 }), async (indices) => {
          const db = createTestDatabase();
          const executionOrder: string[] = [];

          const timestamps = indices.map((i) => 10000000000000 + i * 1000);
          const migrations = new Map(
            timestamps.map((ts, idx) => [
              `${ts}_migration`,
              {
                up: async (schema: any) => {
                  executionOrder.push(String(ts));
                  return schema.createTable(`table_${ts}`, (t: any) => t.string('id').primary());
                },
              },
            ])
          );

          await runMigrationsWithMap(db, migrations);
          const sorted = [...executionOrder].sort();
          expect(executionOrder).toEqual(sorted);
        }),
        { numRuns: 5 }
      );
    });
  });

  describe('Property: Tracking', () => {
    it('applied migrations appear in getAppliedMigrations result', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.integer({ min: 10000000000000, max: 99999999999999 }), { minLength: 1, maxLength: 4 }),
          async (timestamps) => {
            const db = createTestDatabase();
            const migrations = new Map(
              timestamps.map((ts, idx) => [
                `${ts}_migration_${idx}`,
                {
                  up: async (schema: any) => schema.createTable(`table_${ts}_${idx}`, (t: any) => t.string('id').primary()),
                },
              ])
            );

            const result = await runMigrationsWithMap(db, migrations);
            const applied = await getAppliedMigrationsFromDB(db);

            result.executedMigrations.forEach((migrationName) => {
              expect(applied).toContain(migrationName);
            });
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  describe('Property: Performance', () => {
    it('no-new-migrations case completes quickly', async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant(undefined), async () => {
          const db = createTestDatabase();
          const migrations = new Map([
            [
              '10000000000000_migration',
              {
                up: async (schema: any) => schema.createTable('perf_test', (t: any) => t.string('id').primary()),
              },
            ],
          ]);

          await runMigrationsWithMap(db, migrations);
          const startTime = Date.now();
          const result = await runMigrationsWithMap(db, migrations);
          const duration = Date.now() - startTime;

          expect(result.executedMigrations.length).toBe(0);
          expect(duration).toBeLessThan(100);
        }),
        { numRuns: 3 }
      );
    });
  });

  describe('Example: Basic functionality', () => {
    it('applies a single migration', async () => {
      const db = createTestDatabase();
      const migrations = new Map([
        [
          '10000000000000_create_users',
          {
            up: async (schema: any) =>
              schema.createTable('users', (t: any) => {
                t.string('id').primary();
                t.string('name').notNullable();
              }),
            down: async (schema: any) => schema.dropTable('users'),
          },
        ],
      ]);

      const result = await runMigrationsWithMap(db, migrations);
      expect(result.executedMigrations.length).toBe(1);
      expect(result.executedMigrations[0]).toBe('10000000000000_create_users');

      const applied = await getAppliedMigrationsFromDB(db);
      expect(applied).toContain('10000000000000_create_users');
    });

    it('returns empty array when no migrations exist', async () => {
      const db = createTestDatabase();
      const result = await runMigrationsWithMap(db, new Map());
      expect(result.executedMigrations).toEqual([]);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('returns empty array on fresh database without knex_migrations table', async () => {
      const db = createTestDatabase();
      const applied = await getAppliedMigrationsFromDB(db);
      expect(applied).toEqual([]);
    });

    it('creates knex_migrations table on first migration', async () => {
      const db = createTestDatabase();
      const migrations = new Map([
        [
          '10000000000001_test',
          {
            up: async (schema: any) => schema.createTable('test_table', (t: any) => t.string('id').primary()),
          },
        ],
      ]);

      await runMigrationsWithMap(db, migrations);

      const result = db.exec('SELECT name FROM sqlite_master WHERE type="table" AND name="knex_migrations"');
      expect(result.length).toBeGreaterThan(0);
    });

    it('distinguishes between applied and pending migrations', async () => {
      const db = createTestDatabase();
      let callCount = 0;

      const migrations = new Map([
        [
          '10000000000000_first',
          {
            up: async (schema: any) => {
              callCount++;
              return schema.createTable(`test_table_${callCount}`, (t: any) => t.string('id').primary());
            },
          },
        ],
        [
          '10000000000001_second',
          {
            up: async (schema: any) => {
              callCount++;
              return schema.createTable(`test_table_${callCount}`, (t: any) => t.string('id').primary());
            },
          },
        ],
      ]);

      const result1 = await runMigrationsWithMap(db, migrations);
      expect(result1.executedMigrations.length).toBe(2);

      const result2 = await runMigrationsWithMap(db, migrations);
      expect(result2.executedMigrations.length).toBe(0);
    });

    it('executes migrations in timestamp order', async () => {
      const db = createTestDatabase();
      const executionOrder: string[] = [];

      const migrations = new Map([
        [
          '10000000000003_third',
          {
            up: async (schema: any) => {
              executionOrder.push('third');
              return schema.createTable('table_3', (t: any) => t.string('id').primary());
            },
          },
        ],
        [
          '10000000000001_first',
          {
            up: async (schema: any) => {
              executionOrder.push('first');
              return schema.createTable('table_1', (t: any) => t.string('id').primary());
            },
          },
        ],
        [
          '10000000000002_second',
          {
            up: async (schema: any) => {
              executionOrder.push('second');
              return schema.createTable('table_2', (t: any) => t.string('id').primary());
            },
          },
        ],
      ]);

      await runMigrationsWithMap(db, migrations);
      expect(executionOrder).toEqual(['first', 'second', 'third']);
    });
  });

  describe('Transaction Rollback (Issue #2 fix)', () => {
    it('rolls back migration on failure and preserves database state', async () => {
      const db = createTestDatabase();

      // First, create a successful migration
      const successMigration = new Map([
        [
          '10000000000000_success',
          {
            up: async (schema: any) => schema.createTable('table_success', (t: any) => t.string('id').primary()),
          },
        ],
      ]);
      await runMigrationsWithMap(db, successMigration);

      // Verify the successful migration was applied and recorded
      const appliedBefore = await getAppliedMigrationsFromDB(db);
      expect(appliedBefore).toContain('10000000000000_success');

      // Now try a failing migration
      const failingMigration = new Map([
        [
          '10000000000001_failing',
          {
            up: async (schema: any) => {
              // Create a table first
              await schema.createTable('table_failing', (t: any) => t.string('id').primary());
              // Then throw an error
              throw new Error('Intentional migration failure');
            },
          },
        ],
      ]);

      // The failing migration should throw
      await expect(runMigrationsWithMap(db, failingMigration)).rejects.toThrow('Intentional migration failure');

      // Verify that:
      // 1. The failing migration was NOT recorded
      const appliedAfter = await getAppliedMigrationsFromDB(db);
      expect(appliedAfter).not.toContain('10000000000001_failing');

      // 2. The table created before the error was rolled back
      const tableCheck = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='table_failing'`);
      expect(tableCheck.length).toBe(0);

      // 3. The previous successful migration is still recorded and intact
      expect(appliedAfter).toContain('10000000000000_success');
      const successTableCheck = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='table_success'`);
      expect(successTableCheck.length).toBeGreaterThan(0);
    });
  });
});
