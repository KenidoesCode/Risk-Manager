import { closeDb, getDb } from "../src/db/client";
import { getEnv } from "../src/shared/env";
import { DEFAULT_SIZE, seedCorpus, truncateCorpus } from "../src/evaluation/seed-corpus";
import { buildGraph } from "../src/graph/builder";

function arg(name: string, fallback: number): number {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = Number(process.argv[idx + 1]);
  return Number.isFinite(value) ? value : fallback;
}

async function main(): Promise<void> {
  const env = getEnv();
  const db = await getDb();

  const seed = arg("seed", env.SEED);
  const suspiciousGroups = arg("rings", DEFAULT_SIZE.suspiciousGroups);
  const benignGroups = arg("benign", DEFAULT_SIZE.benignGroups);
  const backgroundAccounts = arg("background", DEFAULT_SIZE.backgroundAccounts);

  process.stdout.write("Clearing existing corpus…\n");
  await truncateCorpus(db);

  process.stdout.write(
    `Generating ${suspiciousGroups} suspicious rings, ${benignGroups} benign groups and ${backgroundAccounts} background accounts with seed ${seed}…\n`,
  );
  const summary = await seedCorpus(db, { seed, suspiciousGroups, benignGroups, backgroundAccounts });

  process.stdout.write("Building the graph (entity resolution + derived edges)…\n");
  const build = await buildGraph(db, { correlationId: "seed" });

  const q = build.dataQuality;
  process.stdout.write(
    [
      "",
      "Corpus seeded.",
      `  entities      ${summary.entities}`,
      `  accounts      ${summary.accounts}`,
      `  orders        ${summary.orders}`,
      `  returns       ${summary.returns}`,
      `  refunds       ${summary.refunds}`,
      `  raw edges     ${summary.rawEdges}`,
      `  derived edges ${build.derivedEdges}`,
      `  rings         ${summary.rings}`,
      `  seed          ${summary.seed}`,
      `  splits        ${Object.entries(summary.splits).map(([k, v]) => `${k}=${v}`).join("  ")}`,
      "",
      "Graph coverage:",
      `  accounts with a device   ${q.accountsWithDevice}/${q.accountsTotal}`,
      `  accounts with an address ${q.accountsWithAddress}/${q.accountsTotal}`,
      `  accounts with a payment  ${q.accountsWithPayment}/${q.accountsTotal}`,
      `  unclusterable accounts   ${q.orphanAccounts} (no derived edge at all)`,
      "",
    ].join("\n"),
  );

  await closeDb();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${String(error)}\n`);
  process.exitCode = 1;
});
