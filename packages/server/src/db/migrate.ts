import { sql, type Kysely } from 'kysely';

import type { DbClient } from './index.js';
import type { Database } from './types.js';

interface Migration {
  name: string;
  up: (db: Kysely<Database>, client: DbClient) => Promise<void>;
}

/**
 * Column type for an auto-incrementing integer primary key. SQLite and
 * Postgres spell this differently; everything else in our schema is portable.
 */
function idColumnType(client: DbClient): 'integer' | 'serial' {
  return client === 'postgres' ? 'serial' : 'integer';
}

/** Portable timestamp column: real timestamps on Postgres, ISO text on SQLite. */
function timestampColumnType(client: DbClient): 'timestamptz' | 'text' {
  return client === 'postgres' ? 'timestamptz' : 'text';
}

const migrations: Migration[] = [
  {
    name: '001_create_counters',
    up: async (db, client) => {
      const timestamp = timestampColumnType(client);

      await db.schema
        .createTable('counters')
        .ifNotExists()
        .addColumn('id', idColumnType(client), (col) =>
          client === 'postgres' ? col.primaryKey() : col.primaryKey().autoIncrement(),
        )
        .addColumn('name', 'varchar(80)', (col) => col.notNull().unique())
        .addColumn('description', 'varchar(200)', (col) => col.notNull().defaultTo(''))
        .addColumn('last_incident_at', timestamp, (col) => col.notNull())
        .addColumn('created_at', timestamp, (col) => col.notNull())
        .addColumn('updated_at', timestamp, (col) => col.notNull())
        .execute();

      await db.schema
        .createIndex('counters_last_incident_at_idx')
        .ifNotExists()
        .on('counters')
        .column('last_incident_at')
        .execute();
    },
  },
];

async function ensureMigrationsTable(db: Kysely<Database>, client: DbClient): Promise<void> {
  await db.schema
    .createTable('migrations')
    .ifNotExists()
    .addColumn('name', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('applied_at', timestampColumnType(client), (col) => col.notNull())
    .execute();
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies any migrations this database has not seen yet, so it is safe to run
 * on every boot: each migration commits together with its ledger row, and one
 * already recorded is skipped. Two instances migrating the very same empty
 * database at the same moment can still collide — one will fail to insert the
 * ledger row and exit, and come back up cleanly on restart.
 */
export async function runMigrations(
  db: Kysely<Database>,
  client: DbClient,
): Promise<MigrationResult> {
  await ensureMigrationsTable(db, client);

  const alreadyApplied = new Set(
    (await db.selectFrom('migrations').select('name').execute()).map((row) => row.name),
  );

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const migration of migrations) {
    if (alreadyApplied.has(migration.name)) {
      result.skipped.push(migration.name);
      continue;
    }

    await db.transaction().execute(async (trx) => {
      await migration.up(trx, client);
      await trx
        .insertInto('migrations')
        .values({ name: migration.name, applied_at: new Date().toISOString() })
        .execute();
    });

    result.applied.push(migration.name);
  }

  return result;
}

const demoCounters = [
  {
    name: 'prod-outage',
    description: 'Someone took production down',
    daysAgo: 12,
  },
  {
    name: 'reply-all',
    description: 'Someone replied all to the whole company',
    daysAgo: 3,
  },
  {
    name: 'expired-cert',
    description: 'A TLS certificate expired in production',
    daysAgo: 47,
  },
  {
    name: 'coffee-vs-laptop',
    description: 'A laptop met a cup of coffee and lost',
    daysAgo: 1,
  },
];

/** Inserts example counters, but only into a database that has none. */
export async function seedDemoData(db: Kysely<Database>): Promise<number> {
  const existing = await db
    .selectFrom('counters')
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirst();

  if (Number(existing?.count ?? 0) > 0) {
    return 0;
  }

  const now = Date.now();
  const rows = demoCounters.map((counter) => {
    const timestamp = new Date(now - counter.daysAgo * 86_400_000).toISOString();
    return {
      name: counter.name,
      description: counter.description,
      last_incident_at: timestamp,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
  });

  await db.insertInto('counters').values(rows).execute();

  return rows.length;
}

/** Exposed for tests and the `db:reset` script. */
export async function dropAll(db: Kysely<Database>): Promise<void> {
  await sql`drop table if exists counters`.execute(db);
  await sql`drop table if exists migrations`.execute(db);
}
