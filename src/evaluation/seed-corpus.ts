import { sql } from "drizzle-orm";

import type { Database } from "../db/client";
import { accounts, entities, graphEdges, orders, refundEvents, returnEvents, rings } from "../db/schema";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import { generateCorpus, type GeneratedCorpus } from "./generator";

/**
 * Loads the synthetic commerce graph.
 *
 * Entities are created for accounts and for every infrastructure node the
 * accounts touch, and raw edges are written for each observation. Derived
 * account↔account edges are NOT written here — those are inferences and belong
 * to the graph builder, which is run separately and can be re-run without
 * touching the observed record.
 */

export interface SeedSummary {
  entities: number;
  accounts: number;
  orders: number;
  returns: number;
  refunds: number;
  rawEdges: number;
  rings: number;
  seed: number;
  generatorVersion: string;
  splits: Record<string, number>;
}

async function insertChunked<T>(
  db: Database,
  table: Parameters<Database["insert"]>[0],
  rows: T[],
  chunkSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table).values(chunk as any).onConflictDoNothing();
  }
}

/**
 * Corpus size.
 *
 * 60 suspicious rings and 60 benign hard-negative groups, so the held-out slice
 * (20% at ring level) holds roughly 24 groups rather than 12. With four ring
 * templates and four difficulty levels there are sixteen cells; a 12-group
 * held-out set leaves most of them empty and every per-cell rate computed over
 * one or two cases.
 */
export const DEFAULT_SIZE = { suspiciousGroups: 60, benignGroups: 60, backgroundAccounts: 400 };

export async function seedCorpus(
  db: Database,
  options: {
    seed?: number;
    suspiciousGroups?: number;
    benignGroups?: number;
    backgroundAccounts?: number;
  } = {},
): Promise<SeedSummary> {
  const env = getEnv();
  const seed = options.seed ?? env.SEED;

  const corpus: GeneratedCorpus = generateCorpus({
    seed,
    suspiciousGroups: options.suspiciousGroups ?? DEFAULT_SIZE.suspiciousGroups,
    benignGroups: options.benignGroups ?? DEFAULT_SIZE.benignGroups,
    backgroundAccounts: options.backgroundAccounts ?? DEFAULT_SIZE.backgroundAccounts,
  });

  // --- entities ----------------------------------------------------------
  //
  // One row per distinct (type, anonymizedKey). Infrastructure nodes are shared
  // across accounts by construction, which is the entire point: an exact match
  // on the hash is what links two accounts, and nothing fuzzier is used.

  interface EntityAccumulator {
    type: "ACCOUNT" | "DEVICE" | "ADDRESS" | "PAYMENT" | "CUSTOMER";
    key: string;
    firstSeen: Date;
    lastSeen: Date;
    eventCount: number;
    metadata: Record<string, unknown>;
  }

  const entityMap = new Map<string, EntityAccumulator>();

  const touch = (
    type: EntityAccumulator["type"],
    key: string,
    at: Date,
    metadata: Record<string, unknown> = {},
  ) => {
    const mapKey = `${type}:${key}`;
    const existing = entityMap.get(mapKey);
    if (existing) {
      existing.eventCount += 1;
      if (at < existing.firstSeen) existing.firstSeen = at;
      if (at > existing.lastSeen) existing.lastSeen = at;
      return;
    }
    entityMap.set(mapKey, { type, key, firstSeen: at, lastSeen: at, eventCount: 1, metadata });
  };

  for (const account of corpus.accounts) {
    const opened = new Date(account.openedAtIso);
    touch("ACCOUNT", account.id, opened, {
      tenureDays: account.tenureDays,
      // Deliberately NOT the customer key — the account entity carries no
      // pointer to a person beyond what is needed to cluster.
      orderCount: account.orders.length,
    });
    touch("CUSTOMER", account.customerKey, opened, {});

    for (const order of account.orders) {
      const placed = new Date(order.placedAtIso);
      if (order.deviceKey) touch("DEVICE", order.deviceKey, placed);
      if (order.addressKey) touch("ADDRESS", order.addressKey, placed, { region: "REDACTED" });
      if (order.paymentKey) touch("PAYMENT", order.paymentKey, placed);
    }
  }

  const entityRows = [...entityMap.values()].map((e) => ({
    id: `ent_${e.type.slice(0, 3).toLowerCase()}_${e.key.slice(-20)}`,
    type: e.type,
    anonymizedKey: e.key,
    metadata: e.metadata,
    firstSeen: e.firstSeen,
    lastSeen: e.lastSeen,
    eventCount: e.eventCount,
  }));

  await insertChunked(db, entities, entityRows);

  const entityIdFor = (type: string, key: string) =>
    `ent_${type.slice(0, 3).toLowerCase()}_${key.slice(-20)}`;

  // --- accounts ----------------------------------------------------------

  const accountRows = corpus.accounts.map((a) => {
    const returns = a.orders.filter((o) => o.returned);
    const refunds = a.orders.filter((o) => o.refunded);
    return {
      id: a.id,
      entityId: entityIdFor("ACCOUNT", a.id),
      customerKey: a.customerKey,
      openedAt: new Date(a.openedAtIso),
      orderCount: a.orders.length,
      returnCount: returns.length,
      refundCount: refunds.length,
      orderValueMinor: a.orders.reduce((s, o) => s + o.amountMinor, 0),
      refundValueMinor: refunds.reduce((s, o) => s + o.refundAmountMinor, 0),
      distinctCategories: new Set(a.orders.map((o) => o.productCategory)).size,
      tenureDays: a.tenureDays,
      groundTruthRingId: a.groundTruthRingId,
      groundTruthLabel: a.groundTruthLabel,
      split: a.split,
    };
  });

  await insertChunked(db, accounts, accountRows);

  // --- orders / returns / refunds ----------------------------------------

  const orderRows = corpus.accounts.flatMap((a) =>
    a.orders.map((o) => ({
      id: o.id,
      accountId: a.id,
      productCategory: o.productCategory,
      amountMinor: o.amountMinor,
      placedAt: new Date(o.placedAtIso),
      deviceKey: o.deviceKey,
      addressKey: o.addressKey,
      paymentKey: o.paymentKey,
    })),
  );
  await insertChunked(db, orders, orderRows);

  const returnRows = corpus.accounts.flatMap((a) =>
    a.orders
      .filter((o) => o.returned && o.returnInitiatedAtIso)
      .map((o) => ({
        id: `ret_${o.id.replace("ord_", "")}`,
        orderId: o.id,
        accountId: a.id,
        reason: o.returnReason,
        initiatedAt: new Date(o.returnInitiatedAtIso as string),
        daysAfterDelivery: o.daysAfterDelivery,
      })),
  );
  await insertChunked(db, returnEvents, returnRows);

  const refundRows = corpus.accounts.flatMap((a) =>
    a.orders
      .filter((o) => o.refunded && o.refundProcessedAtIso)
      .map((o) => ({
        id: `rfd_${o.id.replace("ord_", "")}`,
        returnId: `ret_${o.id.replace("ord_", "")}`,
        accountId: a.id,
        amountMinor: o.refundAmountMinor,
        processedAt: new Date(o.refundProcessedAtIso as string),
      })),
  );
  await insertChunked(db, refundEvents, refundRows);

  // --- raw edges ----------------------------------------------------------
  //
  // Observations only. Every one of these came from an event and carries the
  // event id as provenance, so a reviewer can walk from any inference back to
  // the record that produced it.

  interface EdgeAcc {
    source: string;
    target: string;
    type: "USES" | "SHIPS_TO" | "PAID_WITH" | "OWNS";
    firstSeen: Date;
    lastSeen: Date;
    count: number;
    provenance: string;
  }

  const edgeMap = new Map<string, EdgeAcc>();
  const addEdge = (
    source: string,
    target: string,
    type: EdgeAcc["type"],
    at: Date,
    provenance: string,
  ) => {
    const mapKey = `${source}|${target}|${type}`;
    const existing = edgeMap.get(mapKey);
    if (existing) {
      existing.count += 1;
      if (at < existing.firstSeen) existing.firstSeen = at;
      if (at > existing.lastSeen) existing.lastSeen = at;
      return;
    }
    edgeMap.set(mapKey, { source, target, type, firstSeen: at, lastSeen: at, count: 1, provenance });
  };

  for (const account of corpus.accounts) {
    const accountEntity = entityIdFor("ACCOUNT", account.id);
    addEdge(
      entityIdFor("CUSTOMER", account.customerKey),
      accountEntity,
      "OWNS",
      new Date(account.openedAtIso),
      `account ${account.id} opened`,
    );

    for (const order of account.orders) {
      const placed = new Date(order.placedAtIso);
      if (order.deviceKey) {
        addEdge(accountEntity, entityIdFor("DEVICE", order.deviceKey), "USES", placed, `order ${order.id}`);
      }
      if (order.addressKey) {
        addEdge(accountEntity, entityIdFor("ADDRESS", order.addressKey), "SHIPS_TO", placed, `order ${order.id}`);
      }
      if (order.paymentKey) {
        addEdge(accountEntity, entityIdFor("PAYMENT", order.paymentKey), "PAID_WITH", placed, `order ${order.id}`);
      }
    }
  }

  const edgeRows = [...edgeMap.values()].map((e, i) => ({
    id: `edg_raw_${String(i).padStart(6, "0")}`,
    sourceEntityId: e.source,
    targetEntityId: e.target,
    type: e.type,
    derived: false,
    weight: 1,
    provenance: e.provenance,
    viaEntityId: null,
    firstSeen: e.firstSeen,
    lastSeen: e.lastSeen,
    observationCount: e.count,
  }));

  await insertChunked(db, graphEdges, edgeRows);

  // --- rings (ground truth) ----------------------------------------------

  await insertChunked(
    db,
    rings,
    corpus.groups.map((g) => ({
      id: g.ringId,
      label: g.label,
      template: g.template,
      difficulty: g.difficulty,
      split: g.split,
      memberAccountIds: g.memberAccountIds,
      sharedInfrastructure: g.sharedInfrastructure,
      notes: g.notes,
    })),
  );

  const splits: Record<string, number> = {};
  for (const a of corpus.accounts) splits[a.split] = (splits[a.split] ?? 0) + 1;

  logger.info("corpus_seeded", {
    entities: entityRows.length,
    accounts: accountRows.length,
    orders: orderRows.length,
    rawEdges: edgeRows.length,
    rings: corpus.groups.length,
    seed,
  });

  return {
    entities: entityRows.length,
    accounts: accountRows.length,
    orders: orderRows.length,
    returns: returnRows.length,
    refunds: refundRows.length,
    rawEdges: edgeRows.length,
    rings: corpus.groups.length,
    seed,
    generatorVersion: corpus.generatorVersion,
    splits,
  };
}

export async function truncateCorpus(db: Database): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE evaluation_cases, evaluation_runs, exceptions, audit_events, human_reviews, cluster_members, clusters, detection_runs, rings, refund_events, return_events, orders, accounts, graph_edges, entities RESTART IDENTITY CASCADE`,
  );
}
