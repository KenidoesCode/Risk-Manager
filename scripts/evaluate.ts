import { closeDb, getDb } from "../src/db/client";
import { ensureBootstrapped } from "../src/db/bootstrap";
import { runEvaluation, selectThreshold } from "../src/evaluation/harness";
import { getEnv } from "../src/shared/env";
import { newCorrelationId } from "../src/shared/ids";
import type { PerformanceMetrics, RateWithDenominator } from "../src/evaluation/metrics";

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "     —" : `${(v * 100).toFixed(1)}%`.padStart(6);
}

function ratio(r: RateWithDenominator): string {
  return `${pct(r.value)}  (${r.numerator}/${r.denominator})`;
}

function block(title: string, m: PerformanceMetrics): string[] {
  return [
    "",
    `── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`,
    `  precision            ${ratio(m.precision)}`,
    `  recall               ${ratio(m.recall)}`,
    `  F1                   ${m.f1 === null ? "     —" : m.f1.toFixed(4)}`,
    `  false-positive rate  ${ratio(m.falsePositiveRate)}`,
    `  false-negative rate  ${ratio(m.falseNegativeRate)}`,
    `  abstention rate      ${ratio(m.abstentionRate)}`,
    `  confusion            TP=${m.confusion.tp} FP=${m.confusion.fp} TN=${m.confusion.tn} FN=${m.confusion.fn} ABSTAINED=${m.confusion.abstained}`,
  ];
}

async function main(): Promise<void> {
  const env = getEnv();
  await ensureBootstrapped();
  const db = await getDb();
  const correlationId = newCorrelationId();

  process.stdout.write("Selecting the operating threshold on the dev split…\n");
  const selection = await selectThreshold(db, correlationId);
  process.stdout.write(`  chose risk >= ${selection.threshold} — ${selection.rationale}\n`);

  process.stdout.write("Running held-out evaluation at that threshold…\n");
  const result = await runEvaluation(db, {
    split: "held-out",
    correlationId,
    riskThreshold: selection.threshold,
  });

  const lines: string[] = [
    "",
    "=".repeat(72),
    "HELD-OUT EVALUATION",
    "=".repeat(72),
    `  dataset version   ${result.datasetVersion}`,
    `  generator version ${result.generatorVersion}`,
    `  seed              ${result.seed}`,
    `  detector          ${result.detectorVersion}`,
    `  risk threshold    ${result.riskThreshold}  (chosen on ${selection.selectedOn}, not on held-out)`,
    `  rings scored      ${result.ringCount}`,
    `  accounts scored   ${result.accountCount}`,
    `  run at            ${result.finishedAt}`,
    ...block("RING-LEVEL — GRAPH DETECTOR", result.ringMetrics),
    ...(result.baselineRingMetrics
      ? block("RING-LEVEL — ACCOUNT BASELINE (no graph features)", result.baselineRingMetrics)
      : []),
    ...block("ACCOUNT-LEVEL — GRAPH DETECTOR", result.accountLevelMetrics),
  ];

  const r = result.recovery;
  lines.push(
    "",
    "── COORDINATION RECOVERY — the product thesis, measured ────",
    `  suspicious rings in split          ${r.suspiciousRings}`,
    `  detected by the account baseline   ${r.baselineDetected}`,
    `  MISSED by the account baseline     ${r.baselineMissed}`,
    `  of those, recovered by the graph   ${r.graphRecovered}`,
    `  recovery rate                      ${ratio(r.recoveryRate)}`,
    `  rings the graph missed that the baseline caught  ${r.graphMissedBaselineCaught}`,
  );

  if (r.byTemplate.length > 0) {
    lines.push("", "  by template:");
    for (const t of r.byTemplate) {
      lines.push(`    ${t.template.padEnd(38)} ${t.recovered}/${t.missed} recovered`);
    }
  }

  lines.push(
    "",
    "── HARD NEGATIVES — per template, never averaged away ──────",
    "  template                                n   FP   rate    mean risk",
  );
  for (const h of result.hardNegatives) {
    lines.push(
      `  ${h.template.padEnd(36)} ${String(h.groups).padStart(3)}  ${String(h.falsePositives).padStart(3)}  ${pct(h.falsePositiveRate.value)}   ${h.meanRisk ?? "—"}`,
    );
  }

  const sweep = result.thresholds;
  lines.push(
    "",
    "── THRESHOLD SWEEP ON HELD-OUT — diagnostic only ───────────",
    "  The operating threshold came from dev. This sweep shows the shape of the",
    "  trade-off; taking the best row here would be fitting to the test set.",
    `  FP cost ${sweep.costs.falsePositive}  FN cost ${sweep.costs.falseNegative}  abstention ${sweep.costs.abstention}`,
    "  risk   precision  recall    FP   FN   household FP   cost",
  );
  for (const o of sweep.options) {
    lines.push(
      `  ${String(o.threshold).padStart(3)}    ${pct(o.metrics.precision.value)}     ${pct(o.metrics.recall.value)}  ${String(o.metrics.confusion.fp).padStart(3)}  ${String(o.metrics.confusion.fn).padStart(3)}   ${String(o.householdFalsePositives).padStart(11)}   ${o.totalCost}${
        sweep.recommended?.threshold === o.threshold ? "  <- lowest cost" : ""
      }`,
    );
  }

  lines.push(
    "",
    "── BY DIFFICULTY ───────────────────────────────────────────",
    "  difficulty       n   precision  recall",
  );
  for (const s of result.byDifficulty) {
    lines.push(
      `  ${s.key.padEnd(14)} ${String(s.count).padStart(3)}   ${pct(s.metrics.precision.value)}     ${pct(s.metrics.recall.value)}`,
    );
  }

  lines.push(
    "",
    "── MATCH QUALITY ───────────────────────────────────────────",
    `  mean member overlap between ring and matched cluster  ${result.overlapDistribution.mean ?? "—"}`,
    `  minimum overlap among matched                         ${result.overlapDistribution.min ?? "—"}`,
    `  rings with no cluster above the 0.3 overlap floor     ${result.overlapDistribution.below}`,
  );

  if (!result.explainerConfigured) {
    lines.push(
      "",
      "── EXPLAINER ───────────────────────────────────────────────",
      "  No model provider configured (LLM_PROVIDER=none).",
      "  Every number above is deterministic. The explainer writes prose only",
      "  and cannot affect a score, so its absence changes no metric here.",
    );
  }

  lines.push("", "=".repeat(72), "");
  process.stdout.write(lines.join("\n"));

  void env;
  await closeDb();
}

main().catch((error: unknown) => {
  process.stderr.write(`Evaluation failed: ${String(error)}\n`);
  process.exitCode = 1;
});
