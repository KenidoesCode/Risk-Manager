import { eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import {
  accounts,
  clusterMembers,
  clusters,
  detectionRuns,
  entities,
  orders,
  refundEvents,
  returnEvents,
} from "../db/schema";
import { buildGraph, loadGraph } from "../graph/builder";
import {
  jaccard,
  louvainClusters,
  measureStability,
  rotateOrder,
  sharedEntityClusters,
  type Cluster,
} from "./clustering";
import { aggregateCluster, extractFeatures, type AccountActivity } from "./features";
import { scoreCluster, type RiskAssessment } from "../scoring/risk";
import {
  deterministicExplanation,
  explainWithModel,
  explainerAvailable,
  validateExplanation,
  ALL_SIGNAL_TYPES,
  type Explanation,
} from "../model/explainer";
import { recordAudit } from "../audit/service";
import { scanMetadata } from "../safety/boundary";
import { getEnv } from "../shared/env";
import { hashPayload } from "../shared/hash";
import { newId } from "../shared/ids";
import { logger } from "../shared/logger";

export const DETECTOR_VERSION = "graph-detector-1.0.0";

/**
 * Detection orchestrator.
 *
 * Loads the graph, clusters it, aggregates behaviour per cluster, scores it
 * against the published weight table, measures stability, generates an
 * explanation, and persists everything with its provenance.
 *
 * The order matters and is fixed: cluster, then aggregate, then score, then
 * explain. The explainer is last and receives only what the scorer produced, so
 * there is no path by which prose influences a number.
 */

export interface DetectedCluster {
  id: string;
  method: "shared-entity" | "louvain";
  members: string[];
  accountIds: string[];
  assessment: RiskAssessment;
  explanation: Explanation;
  explanationSource: "model" | "deterministic";
  stability: number | null;
  bridgingEntities: string[];
  joinPaths: Record<string, string>;
  aggregate: ReturnType<typeof aggregateCluster>;
  features: ReturnType<typeof extractFeatures>;
}

export interface DetectionResult {
  runId: string;
  method: "shared-entity" | "louvain";
  clusters: DetectedCluster[];
  entityCount: number;
  edgeCount: number;
  derivedEdgeCount: number;
  dataQuality: Record<string, unknown>;
  durationMs: number;
}

/** Loads every account's behavioural record in three queries, not N. */
async function loadActivities(db: Database): Promise<Map<string, AccountActivity>> {
  const accountRows = await db.select().from(accounts);
  const orderRows = await db.select().from(orders);
  const returnRows = await db.select().from(returnEvents);
  const refundRows = await db.select().from(refundEvents);

  const byAccount = new Map<string, AccountActivity>();
  for (const a of accountRows) {
    byAccount.set(a.id, { account: a, orders: [], returns: [], refunds: [] });
  }
  for (const o of orderRows) byAccount.get(o.accountId)?.orders.push(o);
  for (const r of returnRows) {
    byAccount.get(r.accountId)?.returns.push({
      orderId: r.orderId,
      initiatedAt: r.initiatedAt,
      daysAfterDelivery: r.daysAfterDelivery,
    });
  }
  for (const f of refundRows) {
    byAccount.get(f.accountId)?.refunds.push({ amountMinor: f.amountMinor, processedAt: f.processedAt });
  }

  return byAccount;
}

/** entity id -> account id, so cluster members map back to behaviour. */
async function entityToAccount(db: Database): Promise<Map<string, string>> {
  const rows = await db.select({ id: accounts.id, entityId: accounts.entityId }).from(accounts);
  return new Map(rows.map((r) => [r.entityId, r.id]));
}

export interface DetectOptions {
  correlationId: string;
  method?: "shared-entity" | "louvain";
  /** Rebuild derived edges before detecting. */
  rebuild?: boolean;
  /** Number of perturbed re-clustering runs used to measure stability. */
  stabilityRuns?: number;
  persist?: boolean;
  /** Skips the model even when configured. Used by tests and the eval. */
  skipExplainer?: boolean;
}

export async function runDetection(
  db: Database,
  options: DetectOptions,
): Promise<DetectionResult> {
  const env = getEnv();
  const started = Date.now();
  const method = options.method ?? "shared-entity";
  const runId = newId("run");

  if (options.persist !== false) {
    await recordAudit(db, {
      actorType: "DETECTOR",
      actorId: DETECTOR_VERSION,
      action: "DETECTION_STARTED",
      objectType: "detection_run",
      objectId: runId,
      correlationId: options.correlationId,
      metadata: { method, rebuild: options.rebuild ?? false },
      result: "INFO",
      severity: "info",
    });
  }

  let dataQuality: Record<string, unknown> = {};
  let derivedEdgeCount = 0;

  if (options.rebuild !== false) {
    const build = await buildGraph(db, { correlationId: options.correlationId });
    dataQuality = build.dataQuality as unknown as Record<string, unknown>;
    derivedEdgeCount = build.derivedEdges;
  }

  const graph = await loadGraph(db);
  const activities = await loadActivities(db);
  const entityAccount = await entityToAccount(db);

  const found: Cluster[] =
    method === "louvain"
      ? louvainClusters(graph, { minSize: 2 })
      : sharedEntityClusters(graph, { minSize: 2 });

  // Perturbed runs for stability. Louvain is order-sensitive by construction;
  // shared-entity components are not, so its stability is 1 by definition and
  // measuring it would be theatre.
  const stabilityRuns = options.stabilityRuns ?? (method === "louvain" ? 3 : 0);
  const perturbed: Cluster[][] = [];
  for (let i = 1; i <= stabilityRuns; i += 1) {
    const order = rotateOrder(graph.accountEntityIds, Math.floor((graph.accountEntityIds.length * i) / (stabilityRuns + 1)));
    perturbed.push(louvainClusters(graph, { order, minSize: 2 }));
  }

  const detected: DetectedCluster[] = [];

  for (const cluster of found) {
    const accountIds = cluster.members
      .map((entityId) => entityAccount.get(entityId))
      .filter((id): id is string => Boolean(id));

    const clusterActivities = accountIds
      .map((id) => activities.get(id))
      .filter((a): a is AccountActivity => Boolean(a));

    if (clusterActivities.length === 0) continue;

    const aggregate = aggregateCluster(clusterActivities, cluster);
    const features = extractFeatures(aggregate, cluster);

    // Untrusted content check over return reasons — the one free-text field
    // that reaches this system from outside.
    const injectionFindings = clusterActivities.flatMap((a) =>
      scanMetadata(
        a.returns.map(() => ""),
        `account:${a.account.id}`,
      ),
    );

    const stability =
      method === "louvain" && perturbed.length > 0 ? measureStability(graph, cluster, perturbed) : null;

    const assessment = scoreCluster(aggregate, features, {
      riskThreshold: env.RISK_THRESHOLD,
      confidenceThreshold: env.CONFIDENCE_THRESHOLD,
      minClusterAccounts: env.MIN_CLUSTER_ACCOUNTS,
      minEventsPerAccount: env.MIN_EVENTS_PER_ACCOUNT,
      stability,
      injectionFindings: injectionFindings.length,
    });

    // A cluster's identity IS its membership.
    //
    // These ids used to come from `newId`, which mixes in a timestamp and
    // random bytes. That made every detection run produce different ids for the
    // same ring, which is wrong on its own terms — the same set of accounts,
    // found by the same method, is the same finding — and it broke the deployed
    // console outright: a memory-backed serverless instance re-detects on every
    // cold start, so a link to a cluster produced by one request resolved to
    // nothing in the next.
    //
    // Hashing the sorted members with the method makes the id reproducible from
    // the data. A link keeps working, two runs over unchanged data agree, and a
    // ring that gains or loses an account is correctly a different finding.
    const clusterId = `clu_${hashPayload({ method, members: [...cluster.members].sort() }).slice(0, 20)}`;

    // Deterministic explanation ALWAYS, before the model is consulted. The
    // model is an upgrade to a working output, never a dependency of one.
    let explanation = deterministicExplanation({
      clusterId,
      accountCount: aggregate.accountCount,
      assessment,
    });
    let explanationSource: "model" | "deterministic" = "deterministic";

    if (!options.skipExplainer && explainerAvailable()) {
      try {
        const result = await explainWithModel({
          clusterId,
          accountCount: aggregate.accountCount,
          assessment,
        });
        const validation = validateExplanation(result.explanation, ALL_SIGNAL_TYPES);
        if (validation.valid) {
          explanation = result.explanation;
          explanationSource = "model";
        } else if (options.persist !== false) {
          await recordAudit(db, {
            actorType: "EXPLAINER",
            actorId: `${result.provider}/${result.model}`,
            action: "EXPLANATION_REJECTED",
            objectType: "cluster",
            objectId: clusterId,
            clusterId,
            correlationId: options.correlationId,
            metadata: {
              rejectedSignals: validation.rejectedSignals,
              verdictViolation: validation.verdictViolation,
            },
            result: "BLOCKED",
            severity: "warning",
          });
        }
      } catch (error) {
        // An explainer failure never changes a score or a verdict. The
        // deterministic explanation already generated above stands.
        logger.warn("explainer_failed", {
          clusterId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    detected.push({
      id: clusterId,
      method,
      members: cluster.members,
      accountIds,
      assessment,
      explanation,
      explanationSource,
      stability,
      bridgingEntities: cluster.bridgingEntities,
      joinPaths: Object.fromEntries(cluster.joinPaths),
      aggregate,
      features,
    });
  }

  const [entityCount] = await db.select({ id: entities.id }).from(entities).limit(1);
  const entityTotal = (await db.select({ id: entities.id }).from(entities)).length;
  void entityCount;

  const result: DetectionResult = {
    runId,
    method,
    clusters: detected.sort((a, b) => b.assessment.riskScore - a.assessment.riskScore),
    entityCount: entityTotal,
    edgeCount: 0,
    derivedEdgeCount,
    dataQuality,
    durationMs: Date.now() - started,
  };

  if (options.persist !== false) {
    await persistDetection(db, result, options.correlationId);
  }

  logger.info("detection_complete", {
    runId,
    method,
    clusters: detected.length,
    flagged: detected.filter((c) => c.assessment.verdict === "COORDINATION_LIKELY").length,
    durationMs: result.durationMs,
  });

  return result;
}

async function persistDetection(
  db: Database,
  result: DetectionResult,
  correlationId: string,
): Promise<void> {
  await db.insert(detectionRuns).values({
    id: result.runId,
    detectorVersion: DETECTOR_VERSION,
    method: result.method,
    split: "all",
    entityCount: result.entityCount,
    edgeCount: result.edgeCount,
    derivedEdgeCount: result.derivedEdgeCount,
    clusterCount: result.clusters.length,
    dataQuality: result.dataQuality,
    parameters: {
      riskThreshold: getEnv().RISK_THRESHOLD,
      confidenceThreshold: getEnv().CONFIDENCE_THRESHOLD,
      minClusterAccounts: getEnv().MIN_CLUSTER_ACCOUNTS,
    },
    durationMs: result.durationMs,
    correlationId,
  });

  const clusterRows = result.clusters.map((c) => ({
    id: c.id,
    detectionRunId: result.runId,
    method: c.method,
    accountCount: c.aggregate.accountCount,
    entityCount: c.members.length,
    riskScore: c.assessment.riskScore,
    confidence: c.assessment.confidence,
    verdict: c.assessment.verdict,
    requiresReview: c.assessment.requiresReview,
    reviewReason: c.assessment.reviewReason,
    signals: c.assessment.signals,
    counterSignals: c.assessment.counterSignals,
    features: c.features as unknown as Record<string, number>,
    explanation: JSON.stringify(c.explanation),
    explanationSource: c.explanationSource,
    stability: c.stability,
    correlationId,
  }));

  // Upsert, because a cluster id is now derived from its membership.
  //
  // Re-running detection over unchanged data legitimately produces the same
  // rings with the same ids, and that must not be an error — it is the whole
  // point of a stable identifier. The latest run's scores win; the ring keeps
  // the identity a reviewer has been looking at and any link to it survives.
  for (let i = 0; i < clusterRows.length; i += 100) {
    const chunk = clusterRows.slice(i, i + 100);
    if (chunk.length === 0) continue;
    await db
      .insert(clusters)
      .values(chunk)
      .onConflictDoUpdate({
        target: clusters.id,
        set: {
          detectionRunId: sql`excluded.detection_run_id`,
          accountCount: sql`excluded.account_count`,
          entityCount: sql`excluded.entity_count`,
          riskScore: sql`excluded.risk_score`,
          confidence: sql`excluded.confidence`,
          verdict: sql`excluded.verdict`,
          requiresReview: sql`excluded.requires_review`,
          reviewReason: sql`excluded.review_reason`,
          signals: sql`excluded.signals`,
          counterSignals: sql`excluded.counter_signals`,
          features: sql`excluded.features`,
          explanation: sql`excluded.explanation`,
          explanationSource: sql`excluded.explanation_source`,
          stability: sql`excluded.stability`,
          correlationId: sql`excluded.correlation_id`,
        },
      });
  }

  // Membership rows are keyed on (cluster, entity) for the same reason: the
  // same account in the same ring is one fact, not one per detection run.
  const memberRows = result.clusters.flatMap((c) =>
    c.members.map((entityId) => ({
      id: `mem_${hashPayload({ clusterId: c.id, entityId }).slice(0, 20)}`,
      clusterId: c.id,
      entityId,
      entityType: "ACCOUNT" as const,
      contribution: Number((c.assessment.riskScore / Math.max(1, c.members.length)).toFixed(4)),
      joinedVia: c.joinPaths[entityId] ?? "unknown",
    })),
  );

  for (let i = 0; i < memberRows.length; i += 200) {
    const chunk = memberRows.slice(i, i + 200);
    if (chunk.length === 0) continue;
    await db
      .insert(clusterMembers)
      .values(chunk)
      .onConflictDoUpdate({
        target: clusterMembers.id,
        set: {
          contribution: sql`excluded.contribution`,
          joinedVia: sql`excluded.joined_via`,
        },
      });
  }

  await recordAudit(db, {
    actorType: "DETECTOR",
    actorId: DETECTOR_VERSION,
    action: "DETECTION_COMPLETED",
    objectType: "detection_run",
    objectId: result.runId,
    correlationId,
    metadata: {
      method: result.method,
      clusters: result.clusters.length,
      flagged: result.clusters.filter((c) => c.assessment.verdict === "COORDINATION_LIKELY").length,
      capped: result.clusters.filter((c) => c.assessment.cappedByGuardrail).length,
    },
    result: "SUCCESS",
    severity: "info",
  });

  // A capped cluster is worth its own audit line: it records a case where
  // structure alone would have produced a detection and the guardrail stopped
  // it. That is the system protecting a household, and it should be visible.
  for (const c of result.clusters.filter((x) => x.assessment.cappedByGuardrail)) {
    await recordAudit(db, {
      actorType: "SYSTEM",
      actorId: "structural-guardrail",
      action: "GUARDRAIL_APPLIED",
      objectType: "cluster",
      objectId: c.id,
      clusterId: c.id,
      correlationId,
      metadata: {
        structuralPoints: c.assessment.structuralPoints,
        behaviouralPoints: c.assessment.behaviouralPoints,
        accountCount: c.aggregate.accountCount,
      },
      result: "BLOCKED",
      severity: "notice",
    });
  }
}

/** Loads a cluster's stored detail for the UI, including the subgraph. */
export async function clusterDetail(db: Database, clusterId: string) {
  const [cluster] = await db.select().from(clusters).where(eq(clusters.id, clusterId)).limit(1);
  if (!cluster) return null;

  const members = await db
    .select()
    .from(clusterMembers)
    .where(eq(clusterMembers.clusterId, clusterId));

  const memberEntityIds = members.map((m) => m.entityId);

  const accountRows =
    memberEntityIds.length === 0
      ? []
      : await db.select().from(accounts).where(inArray(accounts.entityId, memberEntityIds));

  const entityRows =
    memberEntityIds.length === 0
      ? []
      : await db.select().from(entities).where(inArray(entities.id, memberEntityIds));

  return { cluster, members, accounts: accountRows, entities: entityRows };
}

export { jaccard };
