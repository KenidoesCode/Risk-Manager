import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type {
  BenignTemplate,
  ClusterVerdict,
  Difficulty,
  EdgeType,
  NodeType,
  RingTemplate,
  Split,
} from "../domain/vocabulary";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* -------------------------------------------------------------------------- */
/* entities — every node in the graph                                         */
/* -------------------------------------------------------------------------- */

export const entities = pgTable(
  "entities",
  {
    id: text("id").primaryKey(),
    type: text("type").$type<NodeType>().notNull(),
    /**
     * The only identifier ever shown or sent to a model.
     *
     * Devices, addresses and payment fingerprints are personal data. What the
     * detection needs from them is whether two accounts touched the SAME one —
     * a question a stable hash answers completely without retaining the
     * identifier itself. There is no column here holding a raw address.
     */
    anonymizedKey: text("anonymized_key").notNull(),
    /** Non-identifying attributes only: region bucket, account age band, etc. */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    eventCount: integer("event_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index("entities_type_idx").on(t.type),
    uniqueIndex("entities_key_idx").on(t.type, t.anonymizedKey),
    index("entities_last_seen_idx").on(t.lastSeen),
  ],
);

/* -------------------------------------------------------------------------- */
/* graph_edges — raw and derived, distinguished by a column                    */
/* -------------------------------------------------------------------------- */

export const graphEdges = pgTable(
  "graph_edges",
  {
    id: text("id").primaryKey(),
    sourceEntityId: text("source_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    targetEntityId: text("target_entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    type: text("type").$type<EdgeType>().notNull(),
    /**
     * False for an observation, true for something this system inferred.
     *
     * Kept as a column rather than implied by the edge type so a query cannot
     * accidentally treat the two the same, and so the UI can render them
     * differently without re-deriving the distinction.
     */
    derived: boolean("derived").notNull().default(false),
    weight: real("weight").notNull().default(1),
    /** The event this edge came from, or the rule that derived it. */
    provenance: text("provenance").notNull(),
    /** For derived edges: which entity the two endpoints have in common. */
    viaEntityId: text("via_entity_id"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    observationCount: integer("observation_count").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index("edges_source_idx").on(t.sourceEntityId),
    index("edges_target_idx").on(t.targetEntityId),
    index("edges_type_idx").on(t.type),
    index("edges_derived_idx").on(t.derived),
    uniqueIndex("edges_unique_idx").on(t.sourceEntityId, t.targetEntityId, t.type),
  ],
);

/* -------------------------------------------------------------------------- */
/* accounts — behavioural rollup, kept relational for the baseline             */
/* -------------------------------------------------------------------------- */

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    customerKey: text("customer_key").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    orderCount: integer("order_count").notNull().default(0),
    returnCount: integer("return_count").notNull().default(0),
    refundCount: integer("refund_count").notNull().default(0),
    /** Integer minor units throughout. Floats never touch a monetary value. */
    orderValueMinor: integer("order_value_minor").notNull().default(0),
    refundValueMinor: integer("refund_value_minor").notNull().default(0),
    distinctCategories: integer("distinct_categories").notNull().default(0),
    tenureDays: integer("tenure_days").notNull().default(0),

    /**
     * Ground truth. Present only on synthetic records and read ONLY by the
     * evaluation harness — no detection code path selects these columns.
     */
    groundTruthRingId: text("ground_truth_ring_id"),
    groundTruthLabel: text("ground_truth_label").$type<"SUSPICIOUS" | "BENIGN">(),
    split: text("split").$type<Split>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("accounts_entity_idx").on(t.entityId),
    index("accounts_split_idx").on(t.split),
    index("accounts_ring_idx").on(t.groundTruthRingId),
  ],
);

/* -------------------------------------------------------------------------- */
/* orders / returns / refunds — the event record                              */
/* -------------------------------------------------------------------------- */

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    productCategory: text("product_category").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull(),
    deviceKey: text("device_key"),
    addressKey: text("address_key"),
    paymentKey: text("payment_key"),
    createdAt: createdAt(),
  },
  (t) => [
    index("orders_account_idx").on(t.accountId),
    index("orders_placed_idx").on(t.placedAt),
    index("orders_category_idx").on(t.productCategory),
  ],
);

export const returnEvents = pgTable(
  "return_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    reason: text("reason").notNull(),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull(),
    /** Days between delivery and return initiation. */
    daysAfterDelivery: integer("days_after_delivery").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("returns_order_idx").on(t.orderId),
    index("returns_account_idx").on(t.accountId),
    index("returns_initiated_idx").on(t.initiatedAt),
  ],
);

export const refundEvents = pgTable(
  "refund_events",
  {
    id: text("id").primaryKey(),
    returnId: text("return_id")
      .notNull()
      .references(() => returnEvents.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("refunds_return_idx").on(t.returnId),
    index("refunds_account_idx").on(t.accountId),
  ],
);

/* -------------------------------------------------------------------------- */
/* clusters + members + signals                                               */
/* -------------------------------------------------------------------------- */

export const detectionRuns = pgTable(
  "detection_runs",
  {
    id: text("id").primaryKey(),
    detectorVersion: text("detector_version").notNull(),
    method: text("method").$type<"shared-entity" | "louvain" | "baseline-account">().notNull(),
    split: text("split").$type<Split | "all">().notNull(),
    entityCount: integer("entity_count").notNull().default(0),
    edgeCount: integer("edge_count").notNull().default(0),
    derivedEdgeCount: integer("derived_edge_count").notNull().default(0),
    clusterCount: integer("cluster_count").notNull().default(0),
    /** Coverage figures so a reader can judge how thin the graph was. */
    dataQuality: jsonb("data_quality").$type<Record<string, unknown>>().notNull().default({}),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
    durationMs: integer("duration_ms").notNull().default(0),
    correlationId: text("correlation_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("runs_method_idx").on(t.method), index("runs_created_idx").on(t.createdAt)],
);

export const clusters = pgTable(
  "clusters",
  {
    id: text("id").primaryKey(),
    detectionRunId: text("detection_run_id")
      .notNull()
      .references(() => detectionRuns.id, { onDelete: "cascade" }),
    method: text("method").$type<"shared-entity" | "louvain" | "baseline-account">().notNull(),

    accountCount: integer("account_count").notNull(),
    entityCount: integer("entity_count").notNull(),
    /** 0..100, from the published weight table. Never a bare model output. */
    riskScore: real("risk_score").notNull(),
    /** 0..1 and deliberately independent of the risk score. */
    confidence: real("confidence").notNull(),
    verdict: text("verdict").$type<ClusterVerdict>().notNull(),
    requiresReview: boolean("requires_review").notNull().default(false),
    reviewReason: text("review_reason"),

    /** Full signal breakdown, so no score is ever displayed unexplained. */
    signals: jsonb("signals").$type<unknown[]>().notNull().default([]),
    counterSignals: jsonb("counter_signals").$type<unknown[]>().notNull().default([]),
    features: jsonb("features").$type<Record<string, number>>().notNull().default({}),

    /** Model-written prose. Null when no provider is configured. */
    explanation: text("explanation"),
    explanationSource: text("explanation_source")
      .$type<"model" | "deterministic" | "none">()
      .notNull()
      .default("deterministic"),

    /** Stability across perturbed re-clustering runs, 0..1. Null if not run. */
    stability: real("stability"),
    correlationId: text("correlation_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("clusters_run_idx").on(t.detectionRunId),
    index("clusters_risk_idx").on(t.riskScore),
    index("clusters_verdict_idx").on(t.verdict),
    index("clusters_review_idx").on(t.requiresReview),
  ],
);

export const clusterMembers = pgTable(
  "cluster_members",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => clusters.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type").$type<NodeType>().notNull(),
    /** How much this member contributed to the cluster's risk. */
    contribution: real("contribution").notNull().default(0),
    /** Why this entity is in the cluster — the linking path. */
    joinedVia: text("joined_via").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("members_cluster_idx").on(t.clusterId),
    index("members_entity_idx").on(t.entityId),
    uniqueIndex("members_unique_idx").on(t.clusterId, t.entityId),
  ],
);

/* -------------------------------------------------------------------------- */
/* rings — synthetic ground truth                                             */
/* -------------------------------------------------------------------------- */

export const rings = pgTable(
  "rings",
  {
    id: text("id").primaryKey(),
    label: text("label").$type<"SUSPICIOUS" | "BENIGN">().notNull(),
    template: text("template").$type<RingTemplate | BenignTemplate>().notNull(),
    difficulty: text("difficulty").$type<Difficulty>().notNull(),
    split: text("split").$type<Split>().notNull(),
    memberAccountIds: jsonb("member_account_ids").$type<string[]>().notNull().default([]),
    /** The infrastructure the generator deliberately shared. */
    sharedInfrastructure: jsonb("shared_infrastructure").$type<Record<string, string[]>>().notNull().default({}),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("rings_label_idx").on(t.label),
    index("rings_split_idx").on(t.split),
    index("rings_template_idx").on(t.template),
  ],
);

/* -------------------------------------------------------------------------- */
/* human_reviews                                                              */
/* -------------------------------------------------------------------------- */

export const humanReviews = pgTable(
  "human_reviews",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => clusters.id, { onDelete: "cascade" }),
    reasonCode: text("reason_code").notNull(),
    reasonDetail: text("reason_detail").notNull(),
    /** Preserved verbatim and never overwritten by the reviewer's decision. */
    machineVerdict: text("machine_verdict").$type<ClusterVerdict>().notNull(),
    machineRisk: real("machine_risk").notNull(),
    machineConfidence: real("machine_confidence").notNull(),

    status: text("status")
      .$type<"PENDING" | "CONFIRMED" | "DISMISSED" | "ESCALATED" | "NEEDS_MORE_DATA">()
      .notNull()
      .default("PENDING"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNote: text("reviewer_note"),
    reviewerVerdict: text("reviewer_verdict").$type<ClusterVerdict>(),
    /** The legitimate explanation a reviewer accepted, when they dismissed. */
    benignExplanation: text("benign_explanation"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reviews_status_idx").on(t.status),
    index("reviews_cluster_idx").on(t.clusterId),
  ],
);

/* -------------------------------------------------------------------------- */
/* audit_events                                                               */
/* -------------------------------------------------------------------------- */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    sequence: bigserial("sequence", { mode: "bigint" }).notNull(),
    actorType: text("actor_type")
      .$type<"USER" | "SYSTEM" | "DETECTOR" | "EXPLAINER" | "REVIEWER">()
      .notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    clusterId: text("cluster_id"),
    correlationId: text("correlation_id").notNull(),
    previousState: jsonb("previous_state").$type<unknown>(),
    newState: jsonb("new_state").$type<unknown>(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    result: text("result").$type<"SUCCESS" | "FAILURE" | "BLOCKED" | "INFO">().notNull(),
    severity: text("severity").$type<"info" | "notice" | "warning" | "critical">().notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_correlation_idx").on(t.correlationId),
    index("audit_cluster_idx").on(t.clusterId),
    index("audit_action_idx").on(t.action),
    index("audit_sequence_idx").on(t.sequence),
  ],
);

/* -------------------------------------------------------------------------- */
/* evaluation                                                                 */
/* -------------------------------------------------------------------------- */

export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    split: text("split").$type<Split>().notNull(),
    detector: text("detector").$type<"graph" | "baseline-account">().notNull(),
    detectorVersion: text("detector_version").notNull(),
    riskThreshold: real("risk_threshold").notNull(),
    ringCount: integer("ring_count").notNull().default(0),
    accountCount: integer("account_count").notNull().default(0),
    metrics: jsonb("metrics").$type<unknown>().notNull(),
    /** Per hard-negative template, so one aggregate FPR cannot hide a family. */
    hardNegativeMetrics: jsonb("hard_negative_metrics").$type<unknown>(),
    thresholdSweep: jsonb("threshold_sweep").$type<unknown>(),
    /** Rings the graph found that the account baseline missed. */
    coordinationRecovery: jsonb("coordination_recovery").$type<unknown>(),
    notes: text("notes").notNull().default(""),
    durationMs: integer("duration_ms").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("eval_split_idx").on(t.split), index("eval_started_idx").on(t.startedAt)],
);

export const evaluationCases = pgTable(
  "evaluation_cases",
  {
    id: text("id").primaryKey(),
    evaluationRunId: text("evaluation_run_id")
      .notNull()
      .references(() => evaluationRuns.id, { onDelete: "cascade" }),
    ringId: text("ring_id"),
    clusterId: text("cluster_id"),
    template: text("template").notNull(),
    difficulty: text("difficulty").$type<Difficulty>().notNull(),
    actualLabel: text("actual_label").$type<"SUSPICIOUS" | "BENIGN">().notNull(),
    predictedRisk: real("predicted_risk"),
    predictedFlagged: boolean("predicted_flagged"),
    abstained: boolean("abstained").notNull().default(false),
    classification: text("classification").notNull(),
    /** Jaccard overlap between the detected cluster and the true ring. */
    memberOverlap: real("member_overlap"),
    createdAt: createdAt(),
  },
  (t) => [
    index("eval_cases_run_idx").on(t.evaluationRunId),
    index("eval_cases_class_idx").on(t.classification),
    index("eval_cases_template_idx").on(t.template),
  ],
);

export const exceptions = pgTable(
  "exceptions",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id"),
    kind: text("kind").notNull(),
    detail: text("detail").notNull(),
    correlationId: text("correlation_id").notNull(),
    resolved: boolean("resolved").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("exceptions_kind_idx").on(t.kind)],
);

export type Entity = typeof entities.$inferSelect;
export type GraphEdgeRow = typeof graphEdges.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type ClusterRow = typeof clusters.$inferSelect;
export type RingRow = typeof rings.$inferSelect;
export type HumanReviewRow = typeof humanReviews.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type EvaluationRunRow = typeof evaluationRuns.$inferSelect;
