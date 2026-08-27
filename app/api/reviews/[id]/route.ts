import { NextResponse } from "next/server";
import { z } from "zod";

import { jsonError } from "@/api/handler";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { decideReview, REVIEW_DECISIONS } from "@/reviews/service";
import { CLUSTER_VERDICTS } from "@/domain/vocabulary";
import { AppError } from "@/shared/errors";
import { newCorrelationId } from "@/shared/ids";

export const dynamic = "force-dynamic";

const DecisionBody = z.object({
  // No default. A reviewer must state a decision; a queue with a pre-selected
  // action produces confirmations rather than reviews.
  decision: z.enum(REVIEW_DECISIONS),
  reviewerId: z.string().min(1).max(120),
  note: z.string().max(2000).optional(),
  reviewerVerdict: z.enum(CLUSTER_VERDICTS).optional(),
  /** Required when dismissing. See the note in reviews/service.ts. */
  benignExplanation: z.string().max(1000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = request.headers.get("x-correlation-id") ?? newCorrelationId();
  try {
    const { id } = await context.params;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON.");
    }
    const parsed = DecisionBody.safeParse(raw);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Request body failed validation.", {
        details: { issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      });
    }

    await ensureBootstrapped();
    const db = await getDb();
    const result = await decideReview(db, {
      reviewId: id,
      decision: parsed.data.decision,
      reviewerId: parsed.data.reviewerId,
      note: parsed.data.note,
      reviewerVerdict: parsed.data.reviewerVerdict,
      benignExplanation: parsed.data.benignExplanation,
      correlationId,
    });
    return NextResponse.json(result, { headers: { "x-correlation-id": correlationId } });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
