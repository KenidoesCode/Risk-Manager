import { eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { accounts, evaluationCases, evaluationRuns, rings } from "../db/schema";
import { runDetection, type DetectedCluster } from "../detection/engine";
import { runBaseline } from "../detection/baseline";
import { jaccard } from "../detection/clustering";
import { recordAudit } from "../audit/service";
import { TEMPLATE_DESCRIPTIONS, type Split } from "../domain/vocabulary";
import { getEnv } from "../shared/env";
import { newId } from "../shared/ids";
import { logger } from "../shared/logger";
import { DATASET_VERSION, GENERATOR_VERSION } from "./generator";
import {
  accountMetrics,
  coordinationRecovery,
  DEFAULT_COSTS,
  hardNegativeMetrics,
  performance as computePerformance,
  sliceBy,
  thresholdSweep,
  type AccountPrediction,
  type GroupPrediction,
  type RecoveryInput,
} from "./metrics";

export const HARNESS_VERSION = "eval-harness-1.0.0";

/**
 * Evaluation harness.
 *
 * ---------------------------------------------------------------------------
 * MATCHING DETECTED CLUSTERS TO LABELLED RINGS
 * ---------------------------------------------------------------------------
 * A detected cluster rarely equals a labelled ring exactly — it may pick up a
 * neighbouring flatmate, or split a ring in two. Scoring only exact matches
 * would report near-zero recall on a detector that is working; scoring any
 * overlap at all would credit a detector that swept the whole graph into one
 * cluster.
 *
 * So a ring is matched to the detected cluster with the highest Jaccard overlap
 * of member accounts, and that overlap is stored per case. A match below
 * MIN_OVERLAP is treated as no match, and the overlap distribution is reported
 * so a reader can see how clean the matches were rather than taking the
 * headline number on trust.
 *
 * The ground-truth columns are read HERE and nowhere else. Detection, feature
 * extraction and scoring have no code path to them.
 */

export const MIN_OVERLAP = 0.3;

export interface EvaluationResult {
  runId: string;
  label: string;
  split: Split;
  detector: "graph" | "baseline-account";
  detectorVersion: string;
  riskThreshold: number;
  datasetVersion: string;
  generatorVersion: string;
  seed: number;

  ringCount: number;
  accountCount: number;

  ringMetrics: ReturnType<typeof computePerformance>;
  accountLevelMetrics: ReturnType<typeof accountMetrics>;
  hardNegatives: ReturnType<typeof hardNegativeMetrics>;
  thresholds: ReturnType<typeof thresholdSweep>;
  recovery: ReturnType<typeof coordinationRecovery>;
  byTemplate: ReturnType<typeof sliceBy>;
  byDifficulty: ReturnType<typeof sliceBy>;

  /** Distribution of match overlaps, so match quality is visible. */
  overlapDistribution: { mean: number | null; min: number | null; below: number };
  baselineRingMetrics: ReturnType<typeof computePerformance> | null;

  explainerConfigured: boolean;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
}

/** Maps each labelled ring to its best-overlapping detected cluster. */
function matchRings(
  ringRows: Array<{ id: string; template: string; difficulty: string; label: "SUSPICIOUS" | "BENIGN"; memberAccountIds: string[] }>,
  clusters: DetectedCluster[],
  threshold: number,
): GroupPrediction[] {
  return ringRows.map((ring) => {
    let best: DetectedCluster | null = null;
    let bestOverlap = 0;

    for (const cluster of clusters) {
      const overlap = jaccard(ring.memberAccountIds, cluster.accountIds);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = cluster;
      }
    }

    const matched = bestOverlap >= MIN_OVERLAP ? best : null;

    return {
      ringId: ring.id,
      template: ring.template,
      difficulty: ring.difficulty,
      actualLabel: ring.label,
      predictedRisk: matched ? matched.assessment.riskScore : null,
      flagged: matched ? matched.assessment.riskScore >= threshold : false,
      // A ring that matched a cluster the detector declined to interpret is an
      // abstention, not a miss. Counting it as a miss would penalise the
      // detector for correctly saying "not enough data".
      abstained: matched ? matched.assessment.verdict === "INSUFFICIENT_DATA" : false,
      memberOverlap: Number(bestOverlap.toFixed(4)),
      clusterId: matched?.id ?? null,
    };
  });
}

export interface EvaluateOptions {
  split: Split;
  correlationId: string;
  riskThreshold?: number;
  method?: "shared-entity" | "louvain";
  label?: string;
  persist?: boolean;
}

export interface ThresholdSelection {
  threshold: number;
  selectedOn: Split;
  costAtSelection: number;
  candidatesEvaluated: number;
  rationale: string;
}

/**
 * Chooses the operating threshold on the DEV split.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT JUST TAKE THE BEST THRESHOLD FROM HELD-OUT
 * ---------------------------------------------------------------------------
 * Because that is a leak wearing a lab coat. Sweeping nine thresholds against
 * held-out and reporting the best one is fitting a parameter to the test set:
 * the resulting precision and recall describe how well the threshold was chosen
 * for those exact 24 rings, not how the detector will behave on the next 24.
 *
 * The sweep is therefore run on dev, the cost-minimising threshold is taken
 * from there, and held-out is scored once at that value. The held-out sweep is
 * still displayed — it is genuinely informative about the shape of the
 * trade-off — but it is labelled as diagnostic and is never the source of the
 * operating point.
 */
export async function selectThreshold(
  db: Database,
  correlationId: string,
  method: "shared-entity" | "louvain" = "shared-entity",
): Promise<ThresholdSelection> {
  const dev = await runEvaluation(db, {
    split: "dev",
    correlationId,
    method,
    persist: false,
    label: "threshold selection on dev",
  });

  const recommended = dev.thresholds.recommended;
  if (!recommended) {
    return {
      threshold: getEnv().RISK_THRESHOLD,
      selectedOn: "dev",
      costAtSelection: 0,
      candidatesEvaluated: 0,
      rationale: "No dev rings were available; the configured default was used unchanged.",
    };
  }

  return {
    threshold: recommended.threshold,
    selectedOn: "dev",
    costAtSelection: recommended.totalCost,
    candidatesEvaluated: dev.thresholds.options.length,
    rationale: `Minimises FP:FN cost (${dev.thresholds.costs.falsePositive}:${dev.thresholds.costs.falseNegative}) over ${dev.ringCount} dev rings, at a total cost of ${recommended.totalCost}. Held-out is scored once at this value.`,
  };
}

export async function runEvaluation(
  db: Database,
  options: EvaluateOptions,
): Promise<EvaluationResult> {
  const env = getEnv();
  const threshold = options.riskThreshold ?? env.RISK_THRESHOLD;
  const startedAt = new Date();
  const started = Date.now();
  const runId = newId("evr");

  if (options.persist !== false) {
    await recordAudit(db, {
      actorType: "SYSTEM",
      actorId: HARNESS_VERSION,
      action: "EVALUATION_STARTED",
      objectType: "evaluation_run",
      objectId: runId,
      correlationId: options.correlationId,
      metadata: { split: options.split, threshold },
      result: "INFO",
      severity: "info",
    });
  }

  // Detection runs over the WHOLE graph, not the split. Restricting the graph
  // to one split would sever links to accounts in other splits and change the
  // structure being measured — the split governs which rings are SCORED, not
  // which entities exist.
  const detection = await runDetection(db, {
    correlationId: options.correlationId,
    method: options.method ?? "shared-entity",
    rebuild: true,
    persist: false,
    // The explainer writes prose and cannot change a number; running it here
    // would add minutes and a provider dependency to an evaluation.
    skipExplainer: true,
  });

  const ringRows = await db.select().from(rings).where(eq(rings.split, options.split));
  const accountRows = await db.select().from(accounts).where(eq(accounts.split, options.split));

  const predictions = matchRings(
    ringRows.map((r) => ({
      id: r.id,
      template: r.template,
      difficulty: r.difficulty,
      label: r.label,
      memberAccountIds: r.memberAccountIds,
    })),
    detection.clusters,
    threshold,
  );

  // --- account-level ------------------------------------------------------

  const flaggedAccounts = new Set<string>();
  for (const cluster of detection.clusters) {
    if (cluster.assessment.riskScore < threshold) continue;
    if (cluster.assessment.verdict === "INSUFFICIENT_DATA") continue;
    for (const id of cluster.accountIds) flaggedAccounts.add(id);
  }

  const accountPredictions: AccountPrediction[] = accountRows.map((a) => ({
    accountId: a.id,
    actualLabel: (a.groundTruthLabel ?? "BENIGN") as "SUSPICIOUS" | "BENIGN",
    flagged: flaggedAccounts.has(a.id),
  }));

  // --- baseline comparison -------------------------------------------------

  const baselineFlags = await runBaseline(db);
  const baselineFlagged = new Set(baselineFlags.filter((f) => f.flagged).map((f) => f.accountId));

  const recoveryInputs: RecoveryInput[] = ringRows.map((ring) => {
    const graphMatch = predictions.find((p) => p.ringId === ring.id);
    return {
      ringId: ring.id,
      template: ring.template,
      label: ring.label,
      baselineFlagged: ring.memberAccountIds.some((id) => baselineFlagged.has(id)),
      graphFlagged: graphMatch?.flagged ?? false,
    };
  });

  // The baseline scored at ring level on the same terms: a ring counts as
  // detected when the baseline flags any member. Same rings, same denominators.
  const baselinePredictions: GroupPrediction[] = ringRows.map((ring) => ({
    ringId: ring.id,
    template: ring.template,
    difficulty: ring.difficulty,
    actualLabel: ring.label,
    predictedRisk: ring.memberAccountIds.some((id) => baselineFlagged.has(id)) ? 100 : 0,
    flagged: ring.memberAccountIds.some((id) => baselineFlagged.has(id)),
    abstained: false,
    memberOverlap: 1,
    clusterId: null,
  }));

  const overlaps = predictions.map((p) => p.memberOverlap).filter((o) => o > 0);

  const result: EvaluationResult = {
    runId,
    label: options.label ?? `graph detection on ${options.split}`,
    split: options.split,
    detector: "graph",
    detectorVersion: detection.method,
    riskThreshold: threshold,
    datasetVersion: DATASET_VERSION,
    generatorVersion: GENERATOR_VERSION,
    seed: env.SEED,
    ringCount: ringRows.length,
    accountCount: accountRows.length,
    ringMetrics: computePerformance(predictions, threshold),
    accountLevelMetrics: accountMetrics(accountPredictions),
    hardNegatives: hardNegativeMetrics(predictions, TEMPLATE_DESCRIPTIONS),
    thresholds: thresholdSweep(predictions, DEFAULT_COSTS),
    recovery: coordinationRecovery(recoveryInputs),
    byTemplate: sliceBy(predictions, threshold, (p) => p.template),
    byDifficulty: sliceBy(predictions, threshold, (p) => p.difficulty),
    overlapDistribution: {
      mean:
        overlaps.length === 0
          ? null
          : Number((overlaps.reduce((a, o) => a + o, 0) / overlaps.length).toFixed(4)),
      min: overlaps.length === 0 ? null : Number(Math.min(...overlaps).toFixed(4)),
      below: predictions.filter((p) => p.memberOverlap < MIN_OVERLAP).length,
    },
    baselineRingMetrics: computePerformance(baselinePredictions, threshold),
    explainerConfigured: env.llmEnabled,
    durationMs: Date.now() - started,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };

  if (options.persist !== false) {
    await db.insert(evaluationRuns).values({
      id: runId,
      label: result.label,
      split: options.split,
      detector: "graph",
      detectorVersion: `${HARNESS_VERSION}+${detection.method}`,
      riskThreshold: threshold,
      ringCount: ringRows.length,
      accountCount: accountRows.length,
      metrics: {
        ring: result.ringMetrics,
        account: result.accountLevelMetrics,
        baselineRing: result.baselineRingMetrics,
        byTemplate: result.byTemplate,
        byDifficulty: result.byDifficulty,
        overlapDistribution: result.overlapDistribution,
        datasetVersion: DATASET_VERSION,
        generatorVersion: GENERATOR_VERSION,
        seed: env.SEED,
        explainerConfigured: env.llmEnabled,
        clustersFound: detection.clusters.length,
        dataQuality: detection.dataQuality,
      },
      hardNegativeMetrics: result.hardNegatives,
      thresholdSweep: result.thresholds,
      coordinationRecovery: result.recovery,
      durationMs: result.durationMs,
      startedAt,
      finishedAt: new Date(),
    });

    const caseRows = predictions.map((p) => ({
      id: newId("evc"),
      evaluationRunId: runId,
      ringId: p.ringId,
      clusterId: p.clusterId,
      template: p.template,
      difficulty: p.difficulty as "EASY",
      actualLabel: p.actualLabel,
      predictedRisk: p.predictedRisk,
      predictedFlagged: p.flagged,
      abstained: p.abstained,
      classification: (() => {
        if (p.abstained) return "ABSTAINED";
        const actual = p.actualLabel === "SUSPICIOUS";
        if (p.flagged && actual) return "TP";
        if (p.flagged && !actual) return "FP";
        if (!p.flagged && !actual) return "TN";
        return "FN";
      })(),
      memberOverlap: p.memberOverlap,
    }));

    for (let i = 0; i < caseRows.length; i += 100) {
      const chunk = caseRows.slice(i, i + 100);
      if (chunk.length > 0) await db.insert(evaluationCases).values(chunk);
    }

    await recordAudit(db, {
      actorType: "SYSTEM",
      actorId: HARNESS_VERSION,
      action: "EVALUATION_COMPLETED",
      objectType: "evaluation_run",
      objectId: runId,
      correlationId: options.correlationId,
      metadata: {
        rings: ringRows.length,
        precision: result.ringMetrics.precision.value,
        recall: result.ringMetrics.recall.value,
        recoveryRate: result.recovery.recoveryRate.value,
      },
      result: "SUCCESS",
      severity: "info",
    });
  }

  logger.info("evaluation_complete", {
    runId,
    split: options.split,
    rings: ringRows.length,
    precision: result.ringMetrics.precision.value,
    recall: result.ringMetrics.recall.value,
  });

  return result;
}
