import type { ColumnType, Generated } from 'kysely';

/**
 * `lastIncidentAt` and friends come back as strings from SQLite and as `Date`
 * objects from Postgres, so the select type covers both and the repository
 * normalises to ISO-8601 on the way out.
 */
type Timestamp = ColumnType<Date | string, string, string>;

export interface CountersTable {
  id: Generated<number>;
  name: string;
  description: string;
  last_incident_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MigrationsTable {
  name: string;
  applied_at: Timestamp;
}

export interface Database {
  counters: CountersTable;
  migrations: MigrationsTable;
}
