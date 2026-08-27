import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";

import type { Database } from "../db/client";
import {
  accounts,
  auditEvents,
  clusterMembers,
  clusters,
  detectionRuns,
  entities,
  evaluationRuns,
  graphEdges,
  humanReviews,
  orders,
  refundEvents,
  returnEvents,
} from "../db/schema";

/**
 * Read models for the console.
 *
 * Every figure carries its denominator or is null. Nothing here substitutes
 * zero for "not measured": an average risk over zero clusters is `null` and the
 * page renders an empty state, because "0" would read as a measurement.
 */

export interface OverviewMetrics {
  graph: {
    entities: number;
    byType: Record<string, number>;
    rawEdges: number;
    derivedEdges: number;
    accounts: number;
    orphanAccounts: number;
    /** Share of accounts with no derived edge at all. */
    unclusterableRate: number | null;
  };
  activity: { orders: number; returns: number; refunds: number; returnRate: number | null };
  detection: {
    runs: number;
    clusters: number;
    byVerdict: Record<string, number>;
    flagged: number;
    averageRisk: number | null;
    cappedByGuardrail: number;
    latestRunAt: string | null;
  };
  review: { pending: number; decided: number; total: number };
  evaluation: { runs: number; latest: { id: string; label: string; finishedAt: string | null } | null };
  seeded: boolean;
}

export async function overviewMetrics(db: Database): Promise<OverviewMetrics> {
  const entityTypeRows = await db
    .select({ type: entities.type, n: sql<number>`count(*)::int` })
    .from(entities)
    .groupBy(entities.type);

  const [edgeAgg] = await db
    .select({
      raw: sql<number>`count(*) filter (where ${graphEdges.derived} = false)::int`,
      derived: sql<number>`count(*) filter (where ${graphEdges.derived} = true)::int`,
    })
    .from(graphEdges);

  const [accountAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(accounts);

  const [orphans] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(accounts)
    .where(
      sql`not exists (
        select 1 from graph_edges e
        where e.derived = true
          and (e.source_entity_id = ${accounts.entityId} or e.target_entity_id = ${accounts.entityId})
      )`,
    );

  const [orderAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);
  const [returnAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(returnEvents);
  const [refundAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(refundEvents);

  const [runAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(detectionRuns);
  const [latestRun] = await db
    .select()
    .from(detectionRuns)
    .orderBy(desc(detectionRuns.createdAt))
    .limit(1);

  const verdictRows = await db
    .select({ verdict: clusters.verdict, n: sql<number>`count(*)::int` })
    .from(clusters)
    .groupBy(clusters.verdict);

  const [clusterAgg] = await db
    .select({
      n: sql<number>`count(*)::int`,
      avg: sql<number | null>`avg(${clusters.riskScore})`,
      flagged: sql<number>`count(*) filter (where ${clusters.requiresReview})::int`,
    })
    .from(clusters);

  const [cappedAgg] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(eq(auditEvents.action, "GUARDRAIL_APPLIED"));

  const reviewRows = await db
    .select({ status: humanReviews.status, n: sql<number>`count(*)::int` })
    .from(humanReviews)
    .groupBy(humanReviews.status);

  const [evalAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(evaluationRuns);
  const [latestEval] = await db
    .select()
    .from(evaluationRuns)
    .orderBy(desc(evaluationRuns.startedAt))
    .limit(1);

  const byType = Object.fromEntries(entityTypeRows.map((r) => [r.type, r.n]));
  const byVerdict = Object.fromEntries(verdictRows.map((r) => [r.verdict, r.n]));
  const reviewByStatus = Object.fromEntries(reviewRows.map((r) => [r.status, r.n]));

  const totalEntities = Object.values(byType).reduce((a, n) => a + n, 0);
  const accountCount = accountAgg?.n ?? 0;
  const totalReviews = Object.values(reviewByStatus).reduce((a, n) => a + n, 0);
  const pending = reviewByStatus.PENDING ?? 0;

  return {
    graph: {
      entities: totalEntities,
      byType,
      rawEdges: edgeAgg?.raw ?? 0,
      derivedEdges: edgeAgg?.derived ?? 0,
      accounts: accountCount,
      orphanAccounts: orphans?.n ?? 0,
      unclusterableRate:
        accountCount === 0 ? null : Number(((orphans?.n ?? 0) / accountCount).toFixed(4)),
    },
    activity: {
      orders: orderAgg?.n ?? 0,
      returns: returnAgg?.n ?? 0,
      refunds: refundAgg?.n ?? 0,
      returnRate:
        (orderAgg?.n ?? 0) === 0
          ? null
          : Number(((returnAgg?.n ?? 0) / (orderAgg?.n ?? 1)).toFixed(4)),
    },
    detection: {
      runs: runAgg?.n ?? 0,
      clusters: clusterAgg?.n ?? 0,
      byVerdict,
      flagged: clusterAgg?.flagged ?? 0,
      averageRisk:
        clusterAgg?.avg === null || clusterAgg?.avg === undefined
          ? null
          : Number(Number(clusterAgg.avg).toFixed(2)),
      cappedByGuardrail: cappedAgg?.n ?? 0,
      latestRunAt: latestRun?.createdAt.toISOString() ?? null,
    },
    review: { pending, decided: totalReviews - pending, total: totalReviews },
    evaluation: {
      runs: evalAgg?.n ?? 0,
      latest: latestEval
        ? {
            id: latestEval.id,
            label: latestEval.label,
            finishedAt: latestEval.finishedAt?.toISOString() ?? null,
          }
        : null,
    },
    seeded: totalEntities > 0,
  };
}

export interface ClusterFilters {
  verdict?: string;
  minRisk?: number;
  reviewOnly?: boolean;
  method?: string;
  limit?: number;
  offset?: number;
}

export async function clusterList(db: Database, filters: ClusterFilters) {
  const clauses: SQL[] = [];
  if (filters.verdict) clauses.push(eq(clusters.verdict, filters.verdict as "COORDINATION_LIKELY"));
  if (filters.method) clauses.push(eq(clusters.method, filters.method as "shared-entity"));
  if (filters.reviewOnly) clauses.push(eq(clusters.requiresReview, true));
  if (filters.minRisk !== undefined) clauses.push(sql`${clusters.riskScore} >= ${filters.minRisk}`);

  const where = clauses.length > 0 ? and(...clauses) : undefined;
  const limit = Math.min(filters.limit ?? 50, 200);

  const rows = await db
    .select()
    .from(clusters)
    .where(where)
    .orderBy(desc(clusters.riskScore))
    .limit(limit)
    .offset(filters.offset ?? 0);

  const [countRow] = await db.select({ n: sql<number>`count(*)::int` }).from(clusters).where(where);

  return {
    items: rows.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      signals: c.signals as unknown[],
      counterSignals: c.counterSignals as unknown[],
    })),
    total: countRow?.n ?? 0,
    limit,
    offset: filters.offset ?? 0,
  };
}

export interface GraphNodeView {
  id: string;
  type: string;
  anonymizedKey: string;
  label: string;
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
  /** How many accounts attach to this node. Only meaningful for infrastructure. */
  fanout: number;
}

export interface GraphEdgeView {
  id: string;
  source: string;
  target: string;
  type: string;
  derived: boolean;
  weight: number;
  provenance: string;
  viaEntityId: string | null;
  firstSeen: string;
  lastSeen: string;
  observationCount: number;
}

/**
 * The subgraph behind one cluster.
 *
 * Returns BOTH the derived account↔account edges the detector used and the raw
 * account→infrastructure observations underneath them. A reviewer looking at
 * "these two accounts share a device" must be able to see the device node and
 * the orders that touched it, or the inference is unauditable.
 */
export async function clusterSubgraph(db: Database, clusterId: string) {
  const [cluster] = await db.select().from(clusters).where(eq(clusters.id, clusterId)).limit(1);
  if (!cluster) return null;

  const members = await db.select().from(clusterMembers).where(eq(clusterMembers.clusterId, clusterId));
  const memberIds = members.map((m) => m.entityId);
  if (memberIds.length === 0) {
    return { cluster, nodes: [], edges: [], accounts: [], members };
  }

  // Derived edges between members.
  const derived = await db
    .select()
    .from(graphEdges)
    .where(
      and(
        eq(graphEdges.derived, true),
        inArray(graphEdges.sourceEntityId, memberIds),
        inArray(graphEdges.targetEntityId, memberIds),
      ),
    );

  // Raw edges from members to their infrastructure.
  const raw = await db
    .select()
    .from(graphEdges)
    .where(and(eq(graphEdges.derived, false), inArray(graphEdges.sourceEntityId, memberIds)));

  const infrastructureIds = [...new Set(raw.map((e) => e.targetEntityId))];
  const allNodeIds = [...new Set([...memberIds, ...infrastructureIds])];

  const nodeRows = await db.select().from(entities).where(inArray(entities.id, allNodeIds));

  // Fanout per infrastructure node, so the UI can show that a device touched by
  // three accounts is different from one touched by thirty.
  const fanoutRows =
    infrastructureIds.length === 0
      ? []
      : await db
          .select({ via: graphEdges.viaEntityId, n: sql<number>`count(*)::int` })
          .from(graphEdges)
          .where(and(eq(graphEdges.derived, true), inArray(graphEdges.viaEntityId, infrastructureIds)))
          .groupBy(graphEdges.viaEntityId);

  const fanout = new Map(fanoutRows.map((r) => [r.via, r.n]));

  const accountRows = await db.select().from(accounts).where(inArray(accounts.entityId, memberIds));

  const nodes: GraphNodeView[] = nodeRows.map((n) => ({
    id: n.id,
    type: n.type,
    anonymizedKey: n.anonymizedKey,
    // Short readable label. Never a raw identifier — these are anonymised keys
    // and the last eight characters are enough to tell two nodes apart.
    label: `${n.type.slice(0, 3)}·${n.anonymizedKey.slice(-8)}`,
    firstSeen: n.firstSeen.toISOString(),
    lastSeen: n.lastSeen.toISOString(),
    eventCount: n.eventCount,
    fanout: fanout.get(n.id) ?? 0,
  }));

  const edges: GraphEdgeView[] = [...derived, ...raw].map((e) => ({
    id: e.id,
    source: e.sourceEntityId,
    target: e.targetEntityId,
    type: e.type,
    derived: e.derived,
    weight: e.weight,
    provenance: e.provenance,
    viaEntityId: e.viaEntityId,
    firstSeen: e.firstSeen.toISOString(),
    lastSeen: e.lastSeen.toISOString(),
    observationCount: e.observationCount,
  }));

  return {
    cluster: { ...cluster, createdAt: cluster.createdAt.toISOString() },
    nodes,
    edges,
    accounts: accountRows.map((a) => ({
      ...a,
      openedAt: a.openedAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
    })),
    members,
  };
}

/** Timeline of orders, returns and refunds for a cluster's accounts. */
export async function clusterTimeline(db: Database, clusterId: string) {
  const members = await db.select().from(clusterMembers).where(eq(clusterMembers.clusterId, clusterId));
  const memberIds = members.map((m) => m.entityId);
  if (memberIds.length === 0) return [];

  const accountRows = await db.select().from(accounts).where(inArray(accounts.entityId, memberIds));
  const accountIds = accountRows.map((a) => a.id);
  if (accountIds.length === 0) return [];

  const orderRows = await db.select().from(orders).where(inArray(orders.accountId, accountIds));
  const returnRows = await db.select().from(returnEvents).where(inArray(returnEvents.accountId, accountIds));
  const refundRows = await db.select().from(refundEvents).where(inArray(refundEvents.accountId, accountIds));

  const events = [
    ...orderRows.map((o) => ({
      at: o.placedAt.toISOString(),
      kind: "ORDER" as const,
      accountId: o.accountId,
      detail: `${o.productCategory} · ${(o.amountMinor / 100).toLocaleString("en-IN")}`,
      amountMinor: o.amountMinor,
    })),
    ...returnRows.map((r) => ({
      at: r.initiatedAt.toISOString(),
      kind: "RETURN" as const,
      accountId: r.accountId,
      detail: `${r.reason} · ${r.daysAfterDelivery}d after delivery`,
      amountMinor: 0,
    })),
    ...refundRows.map((f) => ({
      at: f.processedAt.toISOString(),
      kind: "REFUND" as const,
      accountId: f.accountId,
      detail: `${(f.amountMinor / 100).toLocaleString("en-IN")} refunded`,
      amountMinor: f.amountMinor,
    })),
  ];

  return events.sort((a, b) => a.at.localeCompare(b.at));
}

export async function evaluationList(db: Database, limit = 20) {
  const rows = await db
    .select()
    .from(evaluationRuns)
    .orderBy(desc(evaluationRuns.startedAt))
    .limit(Math.min(limit, 50));
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}

/** Failure taxonomy, derived from audit events rather than a separate table. */
export async function failureSummary(db: Database) {
  const rows = await db
    .select({ action: auditEvents.action, result: auditEvents.result, n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .groupBy(auditEvents.action, auditEvents.result);

  const recent = await db
    .select()
    .from(auditEvents)
    .where(sql`${auditEvents.result} in ('FAILURE','BLOCKED')`)
    .orderBy(desc(auditEvents.sequence))
    .limit(50);

  const categories: Record<
    string,
    { count: number; severity: string; description: string; handledBy: string }
  > = {
    GUARDRAIL_APPLIED: {
      count: 0,
      severity: "notice",
      description:
        "A cluster's score came almost entirely from shared infrastructure with little behavioural evidence.",
      handledBy:
        "Capped below the detection threshold. Structure alone cannot produce a detection — this is the control that stops the system flagging households.",
    },
    INJECTION_DETECTED: {
      count: 0,
      severity: "warning",
      description: "Metadata contained instructions addressed to the analysis system.",
      handledBy: "Quarantined, reported, and the cluster routed to human review. The score was not changed.",
    },
    EXPLANATION_REJECTED: {
      count: 0,
      severity: "warning",
      description:
        "A model explanation named a signal the detector never computed, or contained verdict language.",
      handledBy:
        "Entire explanation discarded and the deterministic one used. No score or verdict was affected — the model cannot reach them.",
    },
    ENFORCEMENT_REFUSED: {
      count: 0,
      severity: "notice",
      description: "A caller attempted an action against a customer account.",
      handledBy: "Refused with an explicit reason. There is no enforcement code path in this system.",
    },
    INSUFFICIENT_DATA: {
      count: 0,
      severity: "info",
      description: "A cluster had too little activity to distinguish coordination from ordinary sharing.",
      handledBy: "Reported as INSUFFICIENT_DATA and routed to review rather than scored as low risk.",
    },
  };

  for (const row of rows) {
    const entry = categories[row.action];
    if (entry && (row.result === "FAILURE" || row.result === "BLOCKED" || row.action === "INSUFFICIENT_DATA")) {
      entry.count += row.n;
    }
  }

  return {
    categories,
    recent: recent.map((e) => ({
      ...e,
      sequence: Number(e.sequence),
      timestamp: e.timestamp.toISOString(),
    })),
    totalFailures: recent.length,
  };
}
