import BetterSqlite3 from 'better-sqlite3';
import { Kysely, PostgresDialect, SqliteDialect, type Dialect } from 'kysely';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pg from 'pg';

import type { Config } from '../config.js';
import type { Database } from './types.js';

export type Db = Kysely<Database>;
export type DbClient = Config['DB_CLIENT'];

/**
 * Postgres returns `numeric` and `int8` as strings by default, which would
 * turn our ids into strings. Parse them as numbers instead.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

function createSqliteDialect(config: Config): Dialect {
  const path = resolve(config.SQLITE_PATH);
  mkdirSync(dirname(path), { recursive: true });

  const database = new BetterSqlite3(path);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  // Wait rather than immediately failing when another connection holds a lock.
  database.pragma('busy_timeout = 5000');

  return new SqliteDialect({ database });
}

function createPostgresDialect(config: Config): Dialect {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PostgresDialect({ pool });
}

export function createDb(config: Config): Db {
  const dialect =
    config.DB_CLIENT === 'postgres' ? createPostgresDialect(config) : createSqliteDialect(config);

  return new Kysely<Database>({ dialect });
}

/** Human-readable description of where data is going, for the startup log. */
export function describeDb(config: Config): string {
  if (config.DB_CLIENT === 'postgres') {
    try {
      const url = new URL(config.DATABASE_URL ?? '');
      return `postgres ${url.host}${url.pathname}`;
    } catch {
      return 'postgres';
    }
  }

  return `sqlite ${resolve(config.SQLITE_PATH)}`;
}
