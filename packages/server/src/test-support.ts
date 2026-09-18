import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { loadConfig, type Config } from './config.js';
import { createDb, type Db } from './db/index.js';
import { dropAll, runMigrations } from './db/migrate.js';

export const TEST_ADMIN_PASSWORD = 'correct-horse-battery-staple';
export const TEST_SESSION_SECRET = 'a'.repeat(48);

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  config: Config;
  /** Logs in and returns a cookie header for authenticated requests. */
  adminCookie: () => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Builds an app against a real database — SQLite in a temp file by default, or
 * Postgres when TEST_DATABASE_URL is set, so CI can run the same suite against
 * both backends. Tables are dropped and re-migrated so each file starts clean;
 * run with --test-concurrency=1 when sharing one Postgres database.
 */
export async function createTestContext(
  env: Record<string, string> = {},
): Promise<TestContext> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  let tempDir: string | undefined;

  const backend = databaseUrl
    ? { DB_CLIENT: 'postgres', DATABASE_URL: databaseUrl }
    : (() => {
        tempDir = mkdtempSync(join(tmpdir(), 'sincewhen-test-'));
        return { DB_CLIENT: 'sqlite', SQLITE_PATH: join(tempDir, 'test.db') };
      })();

  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
    SESSION_SECRET: TEST_SESSION_SECRET,
    SEED_DEMO_DATA: 'false',
    ...backend,
    ...env,
  } as NodeJS.ProcessEnv);

  const db = createDb(config);
  await dropAll(db);
  await runMigrations(db, config.DB_CLIENT);

  const app = await buildApp({ config, db });
  await app.ready();

  return {
    app,
    db,
    config,
    adminCookie: async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { password: TEST_ADMIN_PASSWORD },
      });

      if (response.statusCode !== 200) {
        throw new Error(`login failed with ${response.statusCode}`);
      }

      const setCookie = response.headers['set-cookie'];
      const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;

      if (!raw) throw new Error('login did not set a session cookie');

      return raw.split(';')[0] as string;
    },
    close: async () => {
      await app.close();
      await db.destroy();
      if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
