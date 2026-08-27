import { closeDb, currentDriver, getRawDb, runMigrations } from "../src/db/client";
import { logger } from "../src/shared/logger";

async function main(): Promise<void> {
  await getRawDb();
  const driver = await currentDriver();
  await runMigrations();
  logger.info("migrations_applied", { driver });
  process.stdout.write(`Migrations applied (${driver}).\n`);
  await closeDb();
}

main().catch((error: unknown) => {
  process.stderr.write(`Migration failed: ${String(error)}\n`);
  process.exitCode = 1;
});
