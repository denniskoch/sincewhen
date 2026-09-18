import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb, describeDb } from './db/index.js';
import { runMigrations, seedDemoData } from './db/migrate.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config);

  const migration = await runMigrations(db, config.DB_CLIENT);

  const app = await buildApp({ config, db });

  app.log.info(
    { database: describeDb(config), applied: migration.applied },
    migration.applied.length > 0 ? 'migrations applied' : 'database up to date',
  );

  if (config.SEED_DEMO_DATA) {
    const seeded = await seedDemoData(db);
    if (seeded > 0) {
      app.log.info({ counters: seeded }, 'seeded demo counters');
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await db.destroy();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
