import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createTestDatabase, type Database } from "../../src/db/client";
import { accounts, clusters, graphEdges, rings } from "../../src/db/schema";
import { seedCorpus } from "../../src/evaluation/seed-corpus";
import { buildGraph, loadGraph } from "../../src/graph/builder";
import { runDetection } from "../../src/detection/engine";
import { runBaseline } from "../../src/detection/baseline";
import { runEvaluation, selectThreshold } from "../../src/evaluation/harness";
import { runScenario, DEMO_SCENARIOS } from "../../src/demo/scenarios";
import { decideReview, listReviews, openReviewsForRun } from "../../src/reviews/service";
import { disputeHistory } from "../../src/audit/service";
import { generateCorpus } from "../../src/evaluation/generator";

/**
 * End-to-end tests against a real in-process PostgreSQL instance.
 *
 * Nothing is mocked. A repository double would let these pass while the SQL was
 * wrong, and the SQL is where the derived-edge construction and the fanout
 * guards actually live.
 */

let db: Database;
let close: () => Promise<void>;

beforeAll(async () => {
  const handle = await createTestDatabase();
  db = handle.db;
  close = handle.close;
  // Small corpus: enough structure to exercise every path, fast enough to keep
  // the suite usable.
  await seedCorpus(db, { seed: 4242, suspiciousGroups: 12, benignGroups: 12, backgroundAccounts: 60 });
  await buildGraph(db, { correlationId: "test-setup" });
}, 300_000);

afterAll(async () => {
  await close?.();
});

describe("graph construction", () => {
  it("creates derived edges only between accounts sharing infrastructure", async () => {
    const derived = await db.select().from(graphEdges).where(eq(graphEdges.derived, true));
    expect(derived.length).toBeGreaterThan(0);

    for (const edge of derived.slice(0, 50)) {
      // Every derived edge names the node the inference came from.
      expect(edge.viaEntityId).toBeTruthy();
      expect(edge.provenance).toContain("derived");
      expect(["SHARES_DEVICE", "SHARES_ADDRESS", "SHARES_PAYMENT"]).toContain(edge.type);
    }
  });

  it("marks raw edges as observations, not inferences", async () => {
    const raw = await db.select().from(graphEdges).where(eq(graphEdges.derived, false));
    expect(raw.length).toBeGreaterThan(0);
    for (const edge of raw.slice(0, 50)) {
      expect(edge.derived).toBe(false);
      expect(edge.viaEntityId).toBeNull();
      expect(["USES", "SHIPS_TO", "PAID_WITH", "OWNS"]).toContain(edge.type);
    }
  });

  it("rebuilding replaces derived edges without duplicating them", async () => {
    const before = await db.select().from(graphEdges).where(eq(graphEdges.derived, true));
    await buildGraph(db, { correlationId: "test-rebuild" });
    const after = await db.select().from(graphEdges).where(eq(graphEdges.derived, true));
    expect(after.length).toBe(before.length);
  });

  it("background accounts stay unclusterable", async () => {
    const graph = await loadGraph(db);
    const backgroundEntities = (await db.select().from(accounts))
      .filter((a) => a.id.startsWith("acct_bg_"))
      .map((a) => a.entityId);

    // Each has its own device, address and card, so no derived edge exists.
    for (const entityId of backgroundEntities.slice(0, 20)) {
      expect(graph.adjacency.get(entityId) ?? []).toHaveLength(0);
    }
  });

  it("skips oversized infrastructure nodes rather than building a mega-cluster", async () => {
    const handle = await createTestDatabase();
    try {
      await seedCorpus(handle.db, { seed: 7, suspiciousGroups: 2, benignGroups: 2, backgroundAccounts: 10 });
      // A cap of 2 means every shared node with 3+ accounts is skipped.
      const build = await buildGraph(handle.db, {
        correlationId: "test-cap",
        maxAccountsPerNode: 2,
      });
      const uncapped = await buildGraph(handle.db, { correlationId: "test-uncap" });
      expect(build.derivedEdges).toBeLessThan(uncapped.derivedEdges);
    } finally {
      await handle.close();
    }
  }, 180_000);
});

describe("detection", () => {
  it("finds clusters and attaches a full signal breakdown to each", async () => {
    const result = await runDetection(db, { correlationId: "test-detect", rebuild: false });
    expect(result.clusters.length).toBeGreaterThan(0);

    for (const cluster of result.clusters.slice(0, 10)) {
      // Every point of the score is attributable.
      const summed = cluster.assessment.signals.reduce((a, s) => a + s.points, 0);
      expect(Number(summed.toFixed(2))).toBe(cluster.assessment.riskScore);
      // And the explanation is always present, model or not.
      expect(cluster.explanation.summary.length).toBeGreaterThan(0);
      expect(cluster.explanationSource).toBe("deterministic");
    }
  }, 180_000);

  it("persists clusters, members and their join paths", async () => {
    const result = await runDetection(db, { correlationId: "test-persist", rebuild: false });
    const stored = await db.select().from(clusters).where(eq(clusters.detectionRunId, result.runId));
    expect(stored.length).toBe(result.clusters.length);

    const first = stored[0];
    expect(first?.signals).toBeTruthy();
    expect(first?.counterSignals).toBeTruthy();
  }, 180_000);

  it("never flags a cluster on structure alone", async () => {
    const result = await runDetection(db, { correlationId: "test-guardrail", rebuild: false });
    for (const cluster of result.clusters) {
      if (cluster.assessment.verdict !== "COORDINATION_LIKELY") continue;
      // Any cluster that reached a detection did so with behavioural evidence.
      expect(cluster.assessment.behaviouralPoints).toBeGreaterThanOrEqual(8);
    }
  }, 180_000);

  it("louvain produces clusters and a stability figure", async () => {
    const result = await runDetection(db, {
      correlationId: "test-louvain",
      method: "louvain",
      rebuild: false,
      stabilityRuns: 2,
    });
    expect(result.method).toBe("louvain");
    expect(result.clusters.length).toBeGreaterThan(0);
    for (const c of result.clusters.slice(0, 5)) {
      expect(c.stability).not.toBeNull();
      expect(c.stability).toBeGreaterThanOrEqual(0);
      expect(c.stability).toBeLessThanOrEqual(1);
    }
  }, 240_000);
});

describe("the account baseline answers a different question", () => {
  it("flags isolated high-returners the graph does not cluster", async () => {
    const flags = await runBaseline(db);
    const flagged = flags.filter((f) => f.flagged);
    expect(flagged.length).toBeGreaterThan(0);

    // Some flagged accounts are background accounts with no linkage at all.
    const isolated = flagged.filter((f) => f.accountId.startsWith("acct_bg_"));
    expect(isolated.length).toBeGreaterThan(0);

    for (const f of flagged.slice(0, 5)) {
      expect(f.reasons.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it("declines to score accounts with too little history", async () => {
    const flags = await runBaseline(db);
    const thin = flags.filter((f) => f.orderCount < 3);
    for (const f of thin) {
      expect(f.flagged).toBe(false);
      expect(f.reasons.join(" ")).toMatch(/below the .* minimum/i);
    }
  }, 120_000);
});

describe("review queue", () => {
  it("opens reviews for routed clusters and records a decision without overwriting the machine", async () => {
    const result = await runDetection(db, { correlationId: "test-review", rebuild: false });
    const opened = await openReviewsForRun(db, result.clusters, "test-review");
    expect(opened).toBeGreaterThan(0);

    const pending = await listReviews(db, { status: "PENDING" });
    expect(pending.length).toBeGreaterThan(0);

    const target = pending[0];
    const decided = await decideReview(db, {
      reviewId: target!.id,
      decision: "DISMISSED",
      reviewerId: "analyst_1",
      reviewerVerdict: "NO_COORDINATION_INDICATED",
      benignExplanation: "Confirmed as a shared student house; every account has its own card.",
      correlationId: "test-review",
    });
    expect(decided.status).toBe("DISMISSED");

    const all = await listReviews(db, {});
    const row = all.find((r) => r.id === target!.id);
    // The machine's verdict survives the reviewer's disagreement.
    expect(row?.machineVerdict).toBe(target!.machineVerdict);
    expect(row?.reviewerVerdict).toBe("NO_COORDINATION_INDICATED");
    expect(row?.benignExplanation).toContain("student house");
  }, 240_000);

  it("refuses a dismissal with no benign explanation", async () => {
    const pending = await listReviews(db, { status: "PENDING" });
    const target = pending[0];
    if (!target) return;

    await expect(
      decideReview(db, {
        reviewId: target.id,
        decision: "DISMISSED",
        reviewerId: "analyst_2",
        correlationId: "test-review-2",
      }),
    ).rejects.toThrow(/benign explanation/i);
  }, 120_000);

  it("refuses a second decision on the same review", async () => {
    const all = await listReviews(db, {});
    const decided = all.find((r) => r.status === "DISMISSED");
    if (!decided) return;

    await expect(
      decideReview(db, {
        reviewId: decided.id,
        decision: "CONFIRMED",
        reviewerId: "analyst_3",
        correlationId: "test-review-3",
      }),
    ).rejects.toThrow(/already/i);
  }, 120_000);
});

describe("demo scenarios behave as specified", () => {
  it("runs every scenario through the real pipeline", async () => {
    const handle = await createTestDatabase();
    try {
      await seedCorpus(handle.db, {
        seed: 99,
        suspiciousGroups: 2,
        benignGroups: 2,
        backgroundAccounts: 10,
      });
      for (const scenario of DEMO_SCENARIOS) {
        const run = await runScenario(handle.db, scenario, `test-${scenario}`);
        expect(run.deviations, `${scenario}: ${run.deviations.join("; ")}`).toHaveLength(0);
      }
    } finally {
      await handle.close();
    }
  }, 600_000);

  it("does not flag a legitimate household despite maximum structural sharing", async () => {
    const handle = await createTestDatabase();
    try {
      await seedCorpus(handle.db, { seed: 5, suspiciousGroups: 1, benignGroups: 1, backgroundAccounts: 5 });
      const run = await runScenario(handle.db, "legitimate-household", "test-household");

      // Shared devices AND a shared card — everything a ring has structurally.
      expect(run.observed.structuralPoints).toBeGreaterThan(20);
      expect(run.observed.verdict).not.toBe("COORDINATION_LIKELY");
      expect(run.assessment?.counterSignals.length).toBeGreaterThan(0);
    } finally {
      await handle.close();
    }
  }, 300_000);

  it("quarantines an injection without changing the score", async () => {
    const handle = await createTestDatabase();
    try {
      await seedCorpus(handle.db, { seed: 6, suspiciousGroups: 1, benignGroups: 1, backgroundAccounts: 5 });
      const clean = await runScenario(handle.db, "clear-ring", "test-clean");
      const injected = await runScenario(handle.db, "prompt-injection", "test-injected");

      expect(injected.observed.injectionFindings).toBeGreaterThan(0);
      // Same structure and behaviour, so the same score. The injection asked
      // for a lower one and for no review; it got neither.
      expect(injected.observed.riskScore).toBe(clean.observed.riskScore);
      expect(injected.observed.requiresReview).toBe(true);
      expect(injected.observed.reviewReason).toBe("UNTRUSTED_CONTENT_FLAGGED");
    } finally {
      await handle.close();
    }
  }, 300_000);
});

describe("evaluation", () => {
  it("produces ring and account metrics with denominators", async () => {
    const result = await runEvaluation(db, { split: "held-out", correlationId: "test-eval" });

    expect(result.ringCount).toBeGreaterThan(0);
    expect(result.ringMetrics.precision.denominator).toBe(
      result.ringMetrics.confusion.tp + result.ringMetrics.confusion.fp,
    );
    expect(result.ringMetrics.recall.denominator).toBe(
      result.ringMetrics.confusion.tp + result.ringMetrics.confusion.fn,
    );
    expect(result.accountLevelMetrics.confusion.total).toBe(result.accountCount);
    expect(result.baselineRingMetrics).not.toBeNull();
    expect(result.hardNegatives.length).toBeGreaterThan(0);
    expect(result.explainerConfigured).toBe(false);
  }, 300_000);

  it("selects the threshold on dev, not on held-out", async () => {
    const selection = await selectThreshold(db, "test-threshold");
    expect(selection.selectedOn).toBe("dev");
    expect(selection.candidatesEvaluated).toBeGreaterThan(0);
    expect(selection.rationale).toMatch(/dev/i);
  }, 300_000);

  it("keeps rings whole within a split", async () => {
    const ringRows = await db.select().from(rings);
    const accountRows = await db.select().from(accounts);
    const splitOf = new Map(accountRows.map((a) => [a.id, a.split]));

    for (const ring of ringRows) {
      const memberSplits = new Set(ring.memberAccountIds.map((id) => splitOf.get(id)));
      // Every member of a ring is in the same split, or a detector that
      // memorised one member's device would score on the other.
      expect(memberSplits.size, `${ring.id} spans ${[...memberSplits].join(",")}`).toBe(1);
      expect([...memberSplits][0]).toBe(ring.split);
    }
  }, 120_000);
});

describe("corpus generator", () => {
  it("is deterministic for a given seed", () => {
    const a = generateCorpus({ seed: 11, suspiciousGroups: 4, benignGroups: 4, backgroundAccounts: 10 });
    const b = generateCorpus({ seed: 11, suspiciousGroups: 4, benignGroups: 4, backgroundAccounts: 10 });
    expect(a.accounts.map((x) => x.id)).toEqual(b.accounts.map((x) => x.id));
    expect(a.groups.map((g) => `${g.ringId}:${g.difficulty}:${g.split}`)).toEqual(
      b.groups.map((g) => `${g.ringId}:${g.difficulty}:${g.split}`),
    );
  });

  it("keeps difficulty independent of split", () => {
    const corpus = generateCorpus({
      seed: 20260301,
      suspiciousGroups: 60,
      benignGroups: 60,
      backgroundAccounts: 20,
    });

    // Every difficulty must appear in every split, or a per-difficulty metric
    // is computed over an empty cell while still being reported.
    for (const split of ["train", "dev", "held-out"] as const) {
      const difficulties = new Set(
        corpus.groups.filter((g) => g.split === split).map((g) => g.difficulty),
      );
      expect(difficulties.size, `${split} has only ${[...difficulties].join(",")}`).toBeGreaterThan(2);
    }
  });

  it("produces benign groups with the same structural sharing as rings", () => {
    const corpus = generateCorpus({
      seed: 3,
      suspiciousGroups: 20,
      benignGroups: 20,
      backgroundAccounts: 0,
    });

    const family = corpus.groups.find((g) => g.template === "FAMILY_HOUSEHOLD");
    expect(family).toBeTruthy();
    // A family shares one card across four accounts — exactly what makes
    // payment sharing unusable as a standalone signal.
    expect(family?.sharedInfrastructure.payments).toHaveLength(1);
    expect(family?.sharedInfrastructure.addresses).toHaveLength(1);
  });

  it("both labels are represented", () => {
    const corpus = generateCorpus({
      seed: 4,
      suspiciousGroups: 10,
      benignGroups: 10,
      backgroundAccounts: 20,
    });
    const suspicious = corpus.groups.filter((g) => g.label === "SUSPICIOUS").length;
    const benign = corpus.groups.filter((g) => g.label === "BENIGN").length;
    expect(suspicious).toBe(10);
    expect(benign).toBe(10);
  });

  it("never emits a raw card number", () => {
    const corpus = generateCorpus({
      seed: 8,
      suspiciousGroups: 10,
      benignGroups: 10,
      backgroundAccounts: 20,
    });
    const serialised = JSON.stringify(corpus.accounts);
    expect(serialised).not.toMatch(/\b(?:\d[ -]?){13,19}\b/);
  });
});

describe("audit trail", () => {
  it("is append-only and ordered", async () => {
    const result = await runDetection(db, { correlationId: "test-audit", rebuild: false });
    const history = await disputeHistory(db, result.clusters[0]?.id ?? "none");
    const sequences = history.map((h) => h.sequence);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  }, 180_000);
});
