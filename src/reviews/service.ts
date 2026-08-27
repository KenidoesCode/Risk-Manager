import { and, desc, eq } from "drizzle-orm";

import type { Database } from "../db/client";
import { clusters, humanReviews } from "../db/schema";
import type { ClusterVerdict } from "../domain/vocabulary";
import { AppError } from "../shared/errors";
import { newId } from "../shared/ids";
import { recordAudit } from "../audit/service";

/**
 * Human review queue.
 *
 * ---------------------------------------------------------------------------
 * WHAT A DECISION MEANS HERE
 * ---------------------------------------------------------------------------
 * A reviewer confirming a cluster is saying "this is worth investigating", not
 * "these people committed fraud". Nothing downstream of this queue acts against
 * an account — there is no enforcement path in this repository — so a decision
 * routes work to an investigator and does nothing else.
 *
 * DISMISSED requires a benign explanation. That field is not bookkeeping: the
 * legitimate readings reviewers actually accept are the best available evidence
 * about where the detector is wrong, and a dismissal with no reason teaches
 * nobody anything.
 *
 * The machine's verdict, risk and confidence are written at escalation and
 * never overwritten. When a reviewer disagrees both records survive, which is
 * the only way anyone can later measure how often the detector was overruled.
 */

export const REVIEW_DECISIONS = ["CONFIRMED", "DISMISSED", "ESCALATED", "NEEDS_MORE_DATA"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export async function openReview(
  db: Database,
  input: {
    clusterId: string;
    reasonCode: string;
    reasonDetail: string;
    machineVerdict: ClusterVerdict;
    machineRisk: number;
    machineConfidence: number;
    correlationId: string;
  },
): Promise<string> {
  // One open review per cluster. A second would put the same accounts in front
  // of two reviewers with no defined precedence between their decisions.
  const [existing] = await db
    .select()
    .from(humanReviews)
    .where(and(eq(humanReviews.clusterId, input.clusterId), eq(humanReviews.status, "PENDING")))
    .limit(1);
  if (existing) return existing.id;

  const id = newId("rev");
  await db.insert(humanReviews).values({
    id,
    clusterId: input.clusterId,
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail,
    machineVerdict: input.machineVerdict,
    machineRisk: input.machineRisk,
    machineConfidence: input.machineConfidence,
    status: "PENDING",
  });

  await recordAudit(db, {
    actorType: "SYSTEM",
    actorId: "routing",
    action: "HUMAN_REVIEW_REQUESTED",
    objectType: "human_review",
    objectId: id,
    clusterId: input.clusterId,
    correlationId: input.correlationId,
    newState: { reasonCode: input.reasonCode, machineVerdict: input.machineVerdict },
    metadata: { detail: input.reasonDetail },
    result: "SUCCESS",
    severity: "notice",
  });

  return id;
}

export async function decideReview(
  db: Database,
  input: {
    reviewId: string;
    decision: ReviewDecision;
    reviewerId: string;
    note?: string;
    reviewerVerdict?: ClusterVerdict;
    benignExplanation?: string;
    correlationId: string;
  },
): Promise<{ reviewId: string; clusterId: string; status: string; agreedWithMachine: boolean | null }> {
  const [review] = await db.select().from(humanReviews).where(eq(humanReviews.id, input.reviewId)).limit(1);

  if (!review) throw new AppError("REVIEW_NOT_FOUND", `No review with id ${input.reviewId}.`);
  if (review.status !== "PENDING") {
    throw new AppError("REVIEW_ALREADY_DECIDED", `Review ${input.reviewId} was already ${review.status}.`, {
      details: { decidedAt: review.reviewedAt?.toISOString() ?? null, reviewedBy: review.reviewedBy },
    });
  }

  // A dismissal without a stated benign explanation is refused. The reasons
  // reviewers accept are the most useful signal available about where the
  // detector is wrong, and discarding them wastes the only feedback loop here.
  if (input.decision === "DISMISSED" && !input.benignExplanation?.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Dismissing a cluster requires a benign explanation — the legitimate reading of the evidence you accepted.",
      { details: { field: "benignExplanation" } },
    );
  }

  const status =
    input.decision === "NEEDS_MORE_DATA"
      ? "PENDING"
      : (input.decision as "CONFIRMED" | "DISMISSED" | "ESCALATED");

  await db
    .update(humanReviews)
    .set({
      status,
      reviewedBy: input.reviewerId,
      reviewedAt: new Date(),
      reviewerNote: input.note ?? null,
      reviewerVerdict: input.reviewerVerdict ?? null,
      benignExplanation: input.benignExplanation ?? null,
    })
    .where(eq(humanReviews.id, input.reviewId));

  const agreedWithMachine =
    input.reviewerVerdict === undefined ? null : input.reviewerVerdict === review.machineVerdict;

  await recordAudit(db, {
    actorType: "REVIEWER",
    actorId: input.reviewerId,
    action: "HUMAN_REVIEW_COMPLETED",
    objectType: "human_review",
    objectId: input.reviewId,
    clusterId: review.clusterId,
    correlationId: input.correlationId,
    previousState: {
      status: "PENDING",
      machineVerdict: review.machineVerdict,
      machineRisk: review.machineRisk,
    },
    newState: { status, reviewerVerdict: input.reviewerVerdict ?? null, decision: input.decision },
    metadata: { agreedWithMachine, benignExplanation: input.benignExplanation ?? null },
    result: "SUCCESS",
    severity: agreedWithMachine === false ? "notice" : "info",
  });

  return { reviewId: input.reviewId, clusterId: review.clusterId, status, agreedWithMachine };
}

export async function listReviews(db: Database, options: { status?: string; limit?: number } = {}) {
  const where = options.status ? eq(humanReviews.status, options.status as "PENDING") : undefined;

  const rows = await db
    .select({ review: humanReviews, cluster: clusters })
    .from(humanReviews)
    .innerJoin(clusters, eq(humanReviews.clusterId, clusters.id))
    .where(where)
    .orderBy(desc(humanReviews.createdAt))
    .limit(Math.min(options.limit ?? 50, 200));

  return rows.map((r) => ({
    id: r.review.id,
    clusterId: r.review.clusterId,
    reasonCode: r.review.reasonCode,
    reasonDetail: r.review.reasonDetail,
    machineVerdict: r.review.machineVerdict,
    machineRisk: r.review.machineRisk,
    machineConfidence: r.review.machineConfidence,
    status: r.review.status,
    reviewedBy: r.review.reviewedBy,
    reviewedAt: r.review.reviewedAt?.toISOString() ?? null,
    reviewerNote: r.review.reviewerNote,
    reviewerVerdict: r.review.reviewerVerdict,
    benignExplanation: r.review.benignExplanation,
    createdAt: r.review.createdAt.toISOString(),
    cluster: {
      id: r.cluster.id,
      accountCount: r.cluster.accountCount,
      riskScore: r.cluster.riskScore,
      confidence: r.cluster.confidence,
      verdict: r.cluster.verdict,
      signals: r.cluster.signals,
      counterSignals: r.cluster.counterSignals,
      explanation: r.cluster.explanation,
      explanationSource: r.cluster.explanationSource,
    },
  }));
}

/** Agreement rate between reviewers and the detector, over decided reviews. */
export async function reviewerAgreement(db: Database) {
  const rows = await db.select().from(humanReviews);
  const decided = rows.filter((r) => r.status !== "PENDING" && r.reviewerVerdict !== null);
  if (decided.length === 0) return { decided: 0, agreed: 0, rate: null as number | null };
  const agreed = decided.filter((r) => r.reviewerVerdict === r.machineVerdict).length;
  return { decided: decided.length, agreed, rate: Number((agreed / decided.length).toFixed(4)) };
}

/** The benign explanations reviewers actually accepted, grouped. */
export async function dismissalReasons(db: Database) {
  const rows = await db.select().from(humanReviews).where(eq(humanReviews.status, "DISMISSED"));

  const grouped = new Map<string, number>();
  for (const r of rows) {
    const key = r.benignExplanation?.trim() || "(none recorded)";
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [...grouped.entries()]
    .map(([explanation, count]) => ({ explanation, count }))
    .sort((a, b) => b.count - a.count);
}

/** Opens reviews for every cluster a detection run routed to a human. */
export async function openReviewsForRun(
  db: Database,
  runClusters: Array<{
    id: string;
    assessment: {
      requiresReview: boolean;
      reviewReason: string | null;
      reviewDetail: string | null;
      verdict: ClusterVerdict;
      riskScore: number;
      confidence: number;
    };
  }>,
  correlationId: string,
): Promise<number> {
  let opened = 0;
  for (const cluster of runClusters) {
    if (!cluster.assessment.requiresReview) continue;
    await openReview(db, {
      clusterId: cluster.id,
      reasonCode: cluster.assessment.reviewReason ?? "HIGH_RISK_HIGH_CONFIDENCE",
      reasonDetail: cluster.assessment.reviewDetail ?? "Routed for human review.",
      machineVerdict: cluster.assessment.verdict,
      machineRisk: cluster.assessment.riskScore,
      machineConfidence: cluster.assessment.confidence,
      correlationId,
    });
    opened += 1;
  }
  return opened;
}
