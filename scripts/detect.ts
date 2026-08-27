import { closeDb, getDb } from "../src/db/client";
import { ensureBootstrapped } from "../src/db/bootstrap";
import { runDetection } from "../src/detection/engine";
import { explainScore } from "../src/scoring/risk";
import { newCorrelationId } from "../src/shared/ids";

/**
 * Runs detection and prints the top clusters with their full signal breakdown.
 *
 * The breakdown is not optional decoration — the output of this system is
 * "these accounts are worth investigating together", and a number printed
 * without its arithmetic is not something an analyst can act on or defend.
 */

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function main(): Promise<void> {
  await ensureBootstrapped();
  const db = await getDb();
  const correlationId = newCorrelationId();

  const method = arg("method", "shared-entity") as "shared-entity" | "louvain";
  const top = Number(arg("top", "8"));

  process.stdout.write(`Running ${method} detection…\n`);
  const result = await runDetection(db, { correlationId, method, rebuild: true });

  const flagged = result.clusters.filter((c) => c.assessment.verdict === "COORDINATION_LIKELY");
  const capped = result.clusters.filter((c) => c.assessment.cappedByGuardrail);
  const sparse = result.clusters.filter((c) => c.assessment.verdict === "INSUFFICIENT_DATA");

  const lines: string[] = [
    "",
    "=".repeat(76),
    `DETECTION RUN ${result.runId}`,
    "=".repeat(76),
    `  method            ${result.method}`,
    `  entities          ${result.entityCount}`,
    `  derived edges     ${result.derivedEdgeCount}`,
    `  clusters found    ${result.clusters.length}`,
    `  coordination likely  ${flagged.length}`,
    `  insufficient data    ${sparse.length}`,
    `  capped by guardrail  ${capped.length}`,
    `  duration          ${result.durationMs}ms`,
    "",
  ];

  for (const cluster of result.clusters.slice(0, top)) {
    const a = cluster.assessment;
    lines.push(
      "─".repeat(76),
      `${cluster.id}   ${a.verdict}   risk ${a.riskScore.toFixed(1)}   confidence ${(a.confidence * 100).toFixed(0)}%`,
      `  ${cluster.aggregate.accountCount} accounts · ${cluster.aggregate.orderCount} orders · ${cluster.aggregate.returnCount} returns`,
      "",
      ...explainScore(a).map((l) => `  ${l}`),
      "",
    );

    if (a.counterSignals.length > 0) {
      lines.push("  Counter-signals — legitimate explanations that fit the same evidence:");
      for (const c of a.counterSignals) lines.push(`    − ${c.label}: ${c.detail}`);
      lines.push("");
    }

    if (a.requiresReview) {
      lines.push(`  ROUTED TO REVIEW (${a.reviewReason}): ${a.reviewDetail}`, "");
    }
  }

  lines.push("=".repeat(76), "");
  process.stdout.write(lines.join("\n"));

  await closeDb();
}

main().catch((error: unknown) => {
  process.stderr.write(`Detection failed: ${String(error)}\n`);
  process.exitCode = 1;
});
