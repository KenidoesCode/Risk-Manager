import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { accounts, entities, graphEdges, orders } from "../db/schema";
import { LINK_STRENGTH, type LinkingType, type NodeType } from "../domain/vocabulary";
import { logger } from "../shared/logger";

export const BUILDER_VERSION = "graph-builder-1.0.0";

/**
 * Entity resolution and derived-edge construction.
 *
 * ---------------------------------------------------------------------------
 * WHAT "ENTITY RESOLUTION" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------
 * Two accounts are linked when they touch the SAME infrastructure node — the
 * same anonymised device key, address key or payment key. That is an exact
 * match on a stable hash, not a similarity judgement.
 *
 * There is no fuzzy matching. No Levenshtein distance on addresses, no
 * near-duplicate email detection, no "these two names look alike". Every one of
 * those would silently merge unrelated people, and the cost of that error here
 * is a real person investigated for fraud because their street name resembles
 * someone else's. Where the data does not support an exact link, this system
 * records no link.
 *
 * ---------------------------------------------------------------------------
 * DERIVED EDGES ARE MARKED AS DERIVED
 * ---------------------------------------------------------------------------
 * `ACCOUNT_A <-SHARES_DEVICE-> ACCOUNT_B` never existed in any event. It is an
 * inference this module drew, it carries `derived: true` and a `viaEntityId`
 * pointing at the device both accounts touched, and the UI renders it
 * differently. A reviewer can always walk from the inference back to the
 * observations that produced it.
 */

export interface BuildResult {
  entitiesCreated: number;
  rawEdges: number;
  derivedEdges: number;
  /** Coverage, so a reader can judge how thin the graph is. */
  dataQuality: {
    accountsTotal: number;
    accountsWithDevice: number;
    accountsWithAddress: number;
    accountsWithPayment: number;
    missingDevicePct: number;
    missingAddressPct: number;
    missingPaymentPct: number;
    ordersTotal: number;
    orphanAccounts: number;
  };
  durationMs: number;
}

interface LinkRow {
  accountEntityId: string;
  infraEntityId: string;
  infraType: LinkingType;
  firstSeen: Date;
  lastSeen: Date;
  observations: number;
}

/** Reads the account↔infrastructure incidences straight from the order table. */
async function collectLinks(db: Database): Promise<LinkRow[]> {
  const rows = await db
    .select({
      accountId: orders.accountId,
      deviceKey: orders.deviceKey,
      addressKey: orders.addressKey,
      paymentKey: orders.paymentKey,
      placedAt: orders.placedAt,
    })
    .from(orders);

  const accountEntity = new Map<string, string>();
  const accountRows = await db.select({ id: accounts.id, entityId: accounts.entityId }).from(accounts);
  for (const a of accountRows) accountEntity.set(a.id, a.entityId);

  const entityRows = await db
    .select({ id: entities.id, type: entities.type, anonymizedKey: entities.anonymizedKey })
    .from(entities);
  const infraEntity = new Map<string, string>();
  for (const e of entityRows) infraEntity.set(`${e.type}:${e.anonymizedKey}`, e.id);

  const acc = new Map<string, LinkRow>();

  const add = (accountId: string, infraKey: string | null, infraType: LinkingType, at: Date) => {
    if (!infraKey) return;
    const accountEntityId = accountEntity.get(accountId);
    const infraEntityId = infraEntity.get(`${infraType}:${infraKey}`);
    if (!accountEntityId || !infraEntityId) return;

    const mapKey = `${accountEntityId}|${infraEntityId}`;
    const existing = acc.get(mapKey);
    if (existing) {
      existing.observations += 1;
      if (at < existing.firstSeen) existing.firstSeen = at;
      if (at > existing.lastSeen) existing.lastSeen = at;
      return;
    }
    acc.set(mapKey, {
      accountEntityId,
      infraEntityId,
      infraType,
      firstSeen: at,
      lastSeen: at,
      observations: 1,
    });
  };

  for (const r of rows) {
    add(r.accountId, r.deviceKey, "DEVICE", r.placedAt);
    add(r.accountId, r.addressKey, "ADDRESS", r.placedAt);
    add(r.accountId, r.paymentKey, "PAYMENT", r.placedAt);
  }

  return [...acc.values()];
}

/**
 * Temporal decay on a shared link.
 *
 * A device used by account A in January 2025 and by account B in August 2026 is
 * a much weaker link than one both used last week — quite possibly a resold
 * handset or a refurbished tablet rather than two people acting together.
 * Overlap in time is therefore part of the weight rather than an afterthought.
 *
 * Full weight when the usage windows overlap; decaying to a floor of 0.25 as
 * the gap approaches a year.
 */
export function temporalOverlapFactor(
  aFirst: Date,
  aLast: Date,
  bFirst: Date,
  bLast: Date,
): number {
  const gapMs = Math.max(0, Math.max(aFirst.getTime(), bFirst.getTime()) - Math.min(aLast.getTime(), bLast.getTime()));
  if (gapMs === 0) return 1;
  const gapDays = gapMs / 86_400_000;
  const decayed = 1 - Math.min(1, gapDays / 365) * 0.75;
  return Number(Math.max(0.25, decayed).toFixed(4));
}

/**
 * Builds derived account↔account edges from shared infrastructure.
 *
 * An infrastructure node touched by an implausible number of accounts is
 * skipped entirely. A "device" seen by 400 accounts is not a shared family
 * tablet — it is a default value, a shared NAT egress, or a generator artefact,
 * and connecting all 400 accounts pairwise would produce 79,800 edges and one
 * meaningless mega-cluster. This is the single most important guard in the
 * builder, because without it the graph collapses.
 */
export const MAX_ACCOUNTS_PER_INFRA_NODE = 40;

export async function buildGraph(
  db: Database,
  options: { correlationId: string; maxAccountsPerNode?: number } = { correlationId: "graph-build" },
): Promise<BuildResult> {
  const started = Date.now();
  const maxPerNode = options.maxAccountsPerNode ?? MAX_ACCOUNTS_PER_INFRA_NODE;

  const links = await collectLinks(db);

  // Group by infrastructure node.
  const byInfra = new Map<string, LinkRow[]>();
  for (const link of links) {
    const list = byInfra.get(link.infraEntityId) ?? [];
    list.push(link);
    byInfra.set(link.infraEntityId, list);
  }

  const derivedRows: Array<typeof graphEdges.$inferInsert> = [];
  const seen = new Set<string>();
  let skippedNodes = 0;

  for (const [infraEntityId, group] of byInfra) {
    if (group.length < 2) continue;
    if (group.length > maxPerNode) {
      skippedNodes += 1;
      continue;
    }

    const infraType = group[0]?.infraType;
    if (!infraType) continue;

    const edgeType =
      infraType === "DEVICE" ? "SHARES_DEVICE" : infraType === "ADDRESS" ? "SHARES_ADDRESS" : "SHARES_PAYMENT";

    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i] as LinkRow;
        const b = group[j] as LinkRow;

        // Canonical ordering, so A→B and B→A are one edge rather than two.
        const [sourceId, targetId] =
          a.accountEntityId < b.accountEntityId
            ? [a.accountEntityId, b.accountEntityId]
            : [b.accountEntityId, a.accountEntityId];

        const dedupeKey = `${sourceId}|${targetId}|${edgeType}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const overlap = temporalOverlapFactor(a.firstSeen, a.lastSeen, b.firstSeen, b.lastSeen);
        const weight = Number((LINK_STRENGTH[infraType] * overlap).toFixed(4));

        derivedRows.push({
          id: `edg_${sourceId.slice(-10)}_${targetId.slice(-10)}_${edgeType.slice(7, 11)}`,
          sourceEntityId: sourceId,
          targetEntityId: targetId,
          type: edgeType,
          derived: true,
          weight,
          provenance: `derived: both accounts touched ${infraType.toLowerCase()} ${infraEntityId}`,
          viaEntityId: infraEntityId,
          firstSeen: a.firstSeen < b.firstSeen ? a.firstSeen : b.firstSeen,
          lastSeen: a.lastSeen > b.lastSeen ? a.lastSeen : b.lastSeen,
          observationCount: a.observations + b.observations,
        });
      }
    }
  }

  // Replace derived edges wholesale rather than upserting: a rebuild must not
  // leave stale inferences behind when the underlying events changed.
  await db.delete(graphEdges).where(eq(graphEdges.derived, true));

  for (let i = 0; i < derivedRows.length; i += 200) {
    const chunk = derivedRows.slice(i, i + 200);
    if (chunk.length > 0) await db.insert(graphEdges).values(chunk).onConflictDoNothing();
  }

  const [entityCount] = await db.select({ n: sql<number>`count(*)::int` }).from(entities);
  const [rawCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(graphEdges)
    .where(eq(graphEdges.derived, false));

  const dataQuality = await computeDataQuality(db);

  logger.info("graph_built", {
    correlationId: options.correlationId,
    entities: entityCount?.n ?? 0,
    rawEdges: rawCount?.n ?? 0,
    derivedEdges: derivedRows.length,
    skippedOversizedNodes: skippedNodes,
  });

  return {
    entitiesCreated: entityCount?.n ?? 0,
    rawEdges: rawCount?.n ?? 0,
    derivedEdges: derivedRows.length,
    dataQuality: { ...dataQuality, orphanAccounts: dataQuality.orphanAccounts },
    durationMs: Date.now() - started,
  };
}

async function computeDataQuality(db: Database): Promise<BuildResult["dataQuality"]> {
  const [accountAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(accounts);
  const [orderAgg] = await db.select({ n: sql<number>`count(*)::int` }).from(orders);

  const [coverage] = await db
    .select({
      withDevice: sql<number>`count(distinct ${orders.accountId}) filter (where ${orders.deviceKey} is not null)::int`,
      withAddress: sql<number>`count(distinct ${orders.accountId}) filter (where ${orders.addressKey} is not null)::int`,
      withPayment: sql<number>`count(distinct ${orders.accountId}) filter (where ${orders.paymentKey} is not null)::int`,
    })
    .from(orders);

  const total = accountAgg?.n ?? 0;
  const withDevice = coverage?.withDevice ?? 0;
  const withAddress = coverage?.withAddress ?? 0;
  const withPayment = coverage?.withPayment ?? 0;

  // An account with no derived edge at all is unclusterable by this method.
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

  const pct = (n: number) => (total === 0 ? 0 : Number((1 - n / total).toFixed(4)));

  return {
    accountsTotal: total,
    accountsWithDevice: withDevice,
    accountsWithAddress: withAddress,
    accountsWithPayment: withPayment,
    missingDevicePct: pct(withDevice),
    missingAddressPct: pct(withAddress),
    missingPaymentPct: pct(withPayment),
    ordersTotal: orderAgg?.n ?? 0,
    orphanAccounts: orphans?.n ?? 0,
  };
}

/** In-memory adjacency for the detector. PostgreSQL persists; this computes. */
export interface InMemoryGraph {
  /** account entity id -> neighbouring account entity ids with edge details. */
  adjacency: Map<string, Array<{ to: string; type: string; weight: number; via: string | null }>>;
  accountEntityIds: string[];
  entityById: Map<string, { id: string; type: NodeType; anonymizedKey: string }>;
}

export async function loadGraph(db: Database): Promise<InMemoryGraph> {
  const entityRows = await db
    .select({ id: entities.id, type: entities.type, anonymizedKey: entities.anonymizedKey })
    .from(entities);

  const entityById = new Map(entityRows.map((e) => [e.id, e]));

  const edges = await db
    .select({
      source: graphEdges.sourceEntityId,
      target: graphEdges.targetEntityId,
      type: graphEdges.type,
      weight: graphEdges.weight,
      via: graphEdges.viaEntityId,
    })
    .from(graphEdges)
    .where(eq(graphEdges.derived, true));

  const adjacency = new Map<string, Array<{ to: string; type: string; weight: number; via: string | null }>>();
  const push = (from: string, to: string, type: string, weight: number, via: string | null) => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, type, weight, via });
    adjacency.set(from, list);
  };

  for (const e of edges) {
    push(e.source, e.target, e.type, e.weight, e.via);
    push(e.target, e.source, e.type, e.weight, e.via);
  }

  const accountEntityIds = entityRows.filter((e) => e.type === "ACCOUNT").map((e) => e.id);

  return { adjacency, accountEntityIds, entityById };
}

/** Counts accounts attached to one infrastructure node. Used by the UI. */
export async function infrastructureFanout(db: Database, entityId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(graphEdges)
    .where(and(eq(graphEdges.viaEntityId, entityId), eq(graphEdges.derived, true)));
  return row?.n ?? 0;
}
