import type { Counter, CreateCounterInput, UpdateCounterInput } from '@sincewhen/shared';

import type { Db } from './index.js';
import type { CountersTable } from './types.js';
import type { Selectable } from 'kysely';

/** SQLite hands back ISO text, Postgres hands back a Date. Normalise to ISO. */
function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toCounter(row: Selectable<CountersTable>): Counter {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    lastIncidentAt: toIso(row.last_incident_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class DuplicateCounterNameError extends Error {
  constructor(public readonly counterName: string) {
    super(`A counter named "${counterName}" already exists`);
    this.name = 'DuplicateCounterNameError';
  }
}

/** Both drivers signal a unique violation differently; detect either. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  // Postgres unique_violation, SQLite constraint failure.
  return code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT';
}

export async function listCounters(db: Db): Promise<Counter[]> {
  const rows = await db
    .selectFrom('counters')
    .selectAll()
    .orderBy('last_incident_at', 'desc')
    .execute();

  return rows.map(toCounter);
}

export async function getCounterByName(db: Db, name: string): Promise<Counter | undefined> {
  const row = await db
    .selectFrom('counters')
    .selectAll()
    .where('name', '=', name)
    .executeTakeFirst();

  return row ? toCounter(row) : undefined;
}

export async function getCounter(db: Db, id: number): Promise<Counter | undefined> {
  const row = await db
    .selectFrom('counters')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  return row ? toCounter(row) : undefined;
}

export async function createCounter(
  db: Db,
  input: Required<Pick<CreateCounterInput, 'name' | 'description'>> & { lastIncidentAt?: string },
): Promise<Counter> {
  const now = new Date().toISOString();

  try {
    const row = await db
      .insertInto('counters')
      .values({
        name: input.name,
        description: input.description,
        last_incident_at: input.lastIncidentAt ?? now,
        created_at: now,
        updated_at: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return toCounter(row);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DuplicateCounterNameError(input.name);
    }
    throw error;
  }
}

export async function updateCounter(
  db: Db,
  id: number,
  input: UpdateCounterInput,
): Promise<Counter | undefined> {
  const values: Partial<{
    name: string;
    description: string;
    last_incident_at: string;
    updated_at: string;
  }> = { updated_at: new Date().toISOString() };

  if (input.name !== undefined) values.name = input.name;
  if (input.description !== undefined) values.description = input.description;
  if (input.lastIncidentAt !== undefined) values.last_incident_at = input.lastIncidentAt;

  try {
    const row = await db
      .updateTable('counters')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    return row ? toCounter(row) : undefined;
  } catch (error) {
    if (isUniqueViolation(error) && input.name) {
      throw new DuplicateCounterNameError(input.name);
    }
    throw error;
  }
}

/**
 * Moves a counter's incident time forward to `occurredAt`, and reports whether
 * it actually moved. An event older than what is already recorded is ignored:
 * a board showing "days since" must reflect the most recent incident, and
 * machine callers retry and replay, so a late-arriving alert must not rewind
 * the clock.
 */
export async function recordIncident(
  db: Db,
  id: number,
  occurredAt: string,
): Promise<{ counter: Counter; updated: boolean } | undefined> {
  const existing = await getCounter(db, id);
  if (!existing) return undefined;

  if (Date.parse(occurredAt) <= Date.parse(existing.lastIncidentAt)) {
    return { counter: existing, updated: false };
  }

  const row = await db
    .updateTable('counters')
    .set({ last_incident_at: occurredAt, updated_at: new Date().toISOString() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  return row ? { counter: toCounter(row), updated: true } : undefined;
}

/** Sets the incident time to now — the "it happened again" button. */
export async function resetCounter(db: Db, id: number): Promise<Counter | undefined> {
  const now = new Date().toISOString();

  const row = await db
    .updateTable('counters')
    .set({ last_incident_at: now, updated_at: now })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  return row ? toCounter(row) : undefined;
}

export async function deleteCounter(db: Db, id: number): Promise<boolean> {
  const result = await db.deleteFrom('counters').where('id', '=', id).executeTakeFirst();

  return Number(result.numDeletedRows ?? 0) > 0;
}
