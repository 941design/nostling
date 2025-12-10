/**
 * Database Migration Runner
 *
 * Runs database migrations using Knex.js at application startup.
 * Ensures database schema is always up-to-date with idempotent execution.
 */

import { Database } from 'sql.js';
import { MIGRATIONS_MAP, MIGRATION_NAMES } from './migrations.generated';

export interface MigrationResult {
  executedMigrations: string[];
  duration: number; // milliseconds
}

/**
 * Run pending database migrations
 *
 * CONTRACT:
 *   Inputs:
 *     - database: Database instance from sql.js (already initialized)
 *
 *   Outputs:
 *     - result: object containing:
 *       - executedMigrations: array of migration file names that were applied
 *       - duration: total execution time in milliseconds
 *
 *   Invariants:
 *     - Migrations executed in chronological order (by timestamp in filename)
 *     - Each migration runs at most once (tracked in knex_migrations table)
 *     - Already-applied migrations are skipped
 *     - Migration execution is transactional (all or nothing per migration)
 *     - knex_migrations table created if doesn't exist
 *
 *   Properties:
 *     - Idempotent: running twice applies no new migrations the second time
 *     - Monotonic: once applied, migration never re-runs unless manually reset
 *     - Ordered: migrations execute in filename sort order
 *     - Fast when no new migrations: < 100ms if all migrations already applied
 *
 *   Algorithm:
 *     1. Create Knex instance configured for sql.js:
 *        a. Use custom sql.js client adapter
 *        b. Point migration directory to src/main/database/migrations/
 *        c. Configure migration table name: knex_migrations
 *     2. Discover migration files from migrations/ directory
 *     3. Read knex_migrations table to determine applied migrations
 *     4. Calculate pending migrations: discovered - applied
 *     5. For each pending migration in chronological order:
 *        a. Begin transaction
 *        b. Execute migration's up() function
 *        c. Record migration name in knex_migrations table
 *        d. Commit transaction
 *        e. On error: rollback transaction, abort process
 *     6. Return list of executed migrations and duration
 *
 *   Migration File Format:
 *     - Filename: YYYYMMDDHHMMSS_description.js
 *     - Example: 20251210120000_create_app_state_table.js
 *     - Must export: up(knex) and down(knex) functions
 *     - up(): apply schema changes
 *     - down(): revert schema changes (not used in production, for dev only)
 *
 *   ASAR Compatibility:
 *     - Migration files bundled in ASAR archive
 *     - Use require() or dynamic import to load migration modules
 *     - Migration discovery uses fs APIs that work in ASAR (or prebundle list)
 */
export async function runMigrations(database: Database): Promise<MigrationResult> {
  const startTime = Date.now();
  const executedMigrations: string[] = [];

  await ensureMigrationsTable(database);
  const appliedMigrations = await getAppliedMigrations(database);
  const discoveredMigrations = await discoverMigrations();

  const appliedSet = new Set(appliedMigrations);
  const pendingMigrations = discoveredMigrations.filter((name) => !appliedSet.has(name));

  for (const migrationName of pendingMigrations) {
    const migration = await loadMigration(migrationName);
    const knexAdapter = createKnexAdapter(database);

    // Begin transaction for atomic migration execution
    database.run('BEGIN TRANSACTION');

    try {
      await migration.up(knexAdapter);
      recordMigration(database, migrationName);
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

/**
 * Get list of applied migrations
 *
 * CONTRACT:
 *   Inputs:
 *     - database: Database instance from sql.js
 *
 *   Outputs:
 *     - migrations: array of migration names that have been applied
 *
 *   Invariants:
 *     - Returns empty array if knex_migrations table doesn't exist
 *     - Migration names sorted chronologically
 *
 *   Properties:
 *     - Read-only: does not modify database
 */
export async function getAppliedMigrations(database: Database): Promise<string[]> {
  const tableExists = tableExistsSync(database, 'knex_migrations');
  if (!tableExists) {
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

// Helper functions

async function ensureMigrationsTable(database: Database): Promise<void> {
  const tableExists = tableExistsSync(database, 'knex_migrations');
  if (!tableExists) {
    const createTableSql = `
      CREATE TABLE knex_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        batch INTEGER NOT NULL,
        migration_time DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    database.run(createTableSql);
  }
}

function tableExistsSync(database: Database, tableName: string): boolean {
  try {
    const result = database.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [tableName]
    );
    return result.length > 0 && result[0].values.length > 0;
  } catch {
    return false;
  }
}

async function discoverMigrations(): Promise<string[]> {
  // Use compile-time embedded migration list for ASAR compatibility
  return MIGRATION_NAMES;
}

async function loadMigration(migrationName: string): Promise<any> {
  // Use compile-time embedded migration map for ASAR compatibility
  const migration = MIGRATIONS_MAP[migrationName];
  if (!migration) {
    throw new Error(`Migration ${migrationName} not found in migration map`);
  }

  if (typeof migration.up !== 'function') {
    throw new Error(`Migration ${migrationName} does not export up() function`);
  }

  return migration;
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
        try {
          database.run(createSql);
        } catch (error) {
          throw new Error(`Failed to create table ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return Promise.resolve();
      },
      dropTable: (tableName: string) => {
        try {
          database.run(`DROP TABLE IF EXISTS ${tableName}`);
        } catch (error) {
          throw new Error(`Failed to drop table ${tableName}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return Promise.resolve();
      },
      raw: (sql: string) => {
        try {
          database.run(sql);
        } catch (error) {
          throw new Error(`Raw SQL failed: ${error instanceof Error ? error.message : String(error)}`);
        }
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

function buildCreateTableSQL(
  tableName: string,
  columns: Array<{ name: string; type: string; constraints: string[] }>
): string {
  const columnDefs = columns.map((col) => {
    const constraints = col.constraints.join(' ');
    return `${col.name} ${col.type}${constraints ? ' ' + constraints : ''}`;
  });
  return `CREATE TABLE ${tableName} (${columnDefs.join(', ')})`;
}

function recordMigration(database: Database, migrationName: string): void {
  const getBatchSql = 'SELECT MAX(batch) as max_batch FROM knex_migrations';
  const batchResult = database.exec(getBatchSql);
  let batch = 1;
  if (batchResult.length > 0 && batchResult[0].values.length > 0) {
    const maxBatch = batchResult[0].values[0][0];
    batch = (maxBatch as number) + 1;
  }

  const insertSql = `INSERT INTO knex_migrations (name, batch) VALUES (?, ?)`;
  database.run(insertSql, [migrationName, batch]);
}
