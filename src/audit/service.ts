import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import type { Database } from "../db/client";
import { auditEvents } from "../db/schema";
import { newId } from "../shared/ids";

/**
 * Append-only audit trail.
 *
 * Nothing in this module updates or deletes a row. A correction is a NEW event
 * carrying `correctsEventId`, so the original record and the correction both
 * remain visible. An audit log whose entries can be edited answers a different,
 * much weaker question than the one a risk reviewer needs answered.
 */

export const AUDIT_ACTIONS = [
  "GRAPH_INGESTED",
  "GRAPH_REBUILT",
  "ENTITY_RESOLVED",
  "DETECTION_STARTED",
  "DETECTION_COMPLETED",
  "CLUSTER_SCORED",
  "GUARDRAIL_APPLIED",
  "INSUFFICIENT_DATA",
  "EXPLANATION_GENERATED",
  "EXPLANATION_REJECTED",
  "INJECTION_DETECTED",
  "ENFORCEMENT_REFUSED",
  "HUMAN_REVIEW_REQUESTED",
  "HUMAN_REVIEW_COMPLETED",
  "EVALUATION_STARTED",
  "EVALUATION_COMPLETED",
  "DEMO_EXECUTED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditInput {
  actorType: "USER" | "SYSTEM" | "DETECTOR" | "EXPLAINER" | "REVIEWER";
  actorId: string;
  action: AuditAction;
  objectType: string;
  objectId: string;
  clusterId?: string | null;
  correlationId: string;
  previousState?: unknown;
  newState?: unknown;
  metadata?: Record<string, unknown>;
  result: "SUCCESS" | "FAILURE" | "BLOCKED" | "INFO";
  severity: "info" | "notice" | "warning" | "critical";
}

export async function recordAudit(db: Database, input: AuditInput): Promise<string> {
  const id = newId("aud");
  await db.insert(auditEvents).values({
    id,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    clusterId: input.clusterId ?? null,
    correlationId: input.correlationId,
    previousState: input.previousState ?? null,
    newState: input.newState ?? null,
    metadata: input.metadata ?? {},
    result: input.result,
    severity: input.severity,
  });
  return id;
}

/** Records many events in one round trip, preserving array order. */
export async function recordAuditBatch(db: Database, inputs: AuditInput[]): Promise<string[]> {
  if (inputs.length === 0) return [];
  const rows = inputs.map((input) => ({
    id: newId("aud"),
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    objectType: input.objectType,
    objectId: input.objectId,
    clusterId: input.clusterId ?? null,
    correlationId: input.correlationId,
    previousState: input.previousState ?? null,
    newState: input.newState ?? null,
    metadata: input.metadata ?? {},
    result: input.result,
    severity: input.severity,
  }));
  await db.insert(auditEvents).values(rows);
  return rows.map((r) => r.id);
}

export interface AuditQuery {
  clusterId?: string;
  correlationId?: string;
  action?: string;
  actorId?: string;
  severity?: string;
  result?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export async function queryAudit(db: Database, query: AuditQuery) {
  const clauses: SQL[] = [];
  if (query.clusterId) clauses.push(eq(auditEvents.clusterId, query.clusterId));
  if (query.correlationId) clauses.push(eq(auditEvents.correlationId, query.correlationId));
  if (query.action) clauses.push(eq(auditEvents.action, query.action));
  if (query.actorId) clauses.push(eq(auditEvents.actorId, query.actorId));
  if (query.severity) {
    clauses.push(eq(auditEvents.severity, query.severity as AuditInput["severity"]));
  }
  if (query.result) {
    clauses.push(eq(auditEvents.result, query.result as AuditInput["result"]));
  }
  if (query.from) clauses.push(gte(auditEvents.timestamp, query.from));
  if (query.to) clauses.push(lte(auditEvents.timestamp, query.to));

  const where = clauses.length > 0 ? and(...clauses) : undefined;
  const limit = Math.min(query.limit ?? 100, 500);

  const rows = await db
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.sequence))
    .limit(limit)
    .offset(query.offset ?? 0);

  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(where);

  return {
    events: rows.map((r) => ({
      ...r,
      sequence: Number(r.sequence),
      timestamp: r.timestamp.toISOString(),
    })),
    total: countRow?.n ?? 0,
    limit,
    offset: query.offset ?? 0,
  };
}

/** Full history for one cluster, oldest first — the reconstruction view. */
export async function disputeHistory(db: Database, clusterId: string) {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.clusterId, clusterId))
    .orderBy(auditEvents.sequence);
  return rows.map((r) => ({
    ...r,
    sequence: Number(r.sequence),
    timestamp: r.timestamp.toISOString(),
  }));
}
