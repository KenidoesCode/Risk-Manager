import { closeDb, getDb } from "../src/db/client";
import { ensureBootstrapped } from "../src/db/bootstrap";
import { DEMO_SCENARIOS, runScenario } from "../src/demo/scenarios";
import { explainScore } from "../src/scoring/risk";
import { newCorrelationId } from "../src/shared/ids";

async function main(): Promise<void> {
  await ensureBootstrapped();
  const db = await getDb();
  const correlationId = newCorrelationId();

  let failures = 0;
  const lines: string[] = ["", "=".repeat(76), "DEMO SCENARIOS", "=".repeat(76)];

  for (const scenario of DEMO_SCENARIOS) {
    const run = await runScenario(db, scenario, correlationId);
    if (!run.behavedAsSpecified) failures += 1;
    const o = run.observed;

    lines.push(
      "",
      `${run.behavedAsSpecified ? "PASS" : "FAIL"}  ${run.title}  (${scenario})`,
      `      ${run.description}`,
      "",
      `      accounts       ${o.accountCount}`,
      `      verdict        ${o.verdict}`,
      `      risk           ${o.riskScore.toFixed(1)}  (structural ${o.structuralPoints.toFixed(1)}, behavioural ${o.behaviouralPoints.toFixed(1)})`,
      `      confidence     ${(o.confidence * 100).toFixed(0)}%`,
      `      human review   ${o.requiresReview ? `YES (${o.reviewReason})` : "no"}`,
      `      baseline flags ${o.baselineFlaggedAccounts} of ${o.accountCount} account(s)`,
    );

    if (o.cappedByGuardrail) {
      lines.push(`      GUARDRAIL      score capped: structure alone cannot reach the threshold`);
    }
    if (o.injectionFindings > 0) {
      lines.push(`      injection      ${o.injectionFindings} span(s) quarantined`);
    }

    if (run.assessment) {
      lines.push("", ...explainScore(run.assessment).map((l) => `      ${l}`));
    }

    lines.push("", `      claim          ${run.expectation.claim}`);
    for (const d of run.deviations) lines.push(`      DEVIATION      ${d}`);
  }

  lines.push(
    "",
    "=".repeat(76),
    `${DEMO_SCENARIOS.length - failures}/${DEMO_SCENARIOS.length} scenarios behaved as specified.`,
    "=".repeat(76),
    "",
  );

  process.stdout.write(lines.join("\n"));
  await closeDb();
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`Demo failed: ${String(error)}\n`);
  process.exitCode = 1;
});
