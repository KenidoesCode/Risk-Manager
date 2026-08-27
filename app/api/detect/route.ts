import { z } from "zod";

import { bodyRoute } from "@/api/handler";
import { runDetection } from "@/detection/engine";
import { openReviewsForRun } from "@/reviews/service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DetectRequest = z.object({
  method: z.enum(["shared-entity", "louvain"]).default("shared-entity"),
  rebuild: z.boolean().default(true),
  /** Perturbed re-clustering runs used to measure stability. */
  stabilityRuns: z.number().int().min(0).max(5).optional(),
});

export const POST = bodyRoute(DetectRequest, async ({ db, correlationId }, body) => {
  const result = await runDetection(db, {
    correlationId,
    method: body.method,
    rebuild: body.rebuild,
    stabilityRuns: body.stabilityRuns,
  });

  const reviewsOpened = await openReviewsForRun(db, result.clusters, correlationId);

  return {
    runId: result.runId,
    method: result.method,
    entityCount: result.entityCount,
    derivedEdgeCount: result.derivedEdgeCount,
    clusterCount: result.clusters.length,
    flagged: result.clusters.filter((c) => c.assessment.verdict === "COORDINATION_LIKELY").length,
    insufficientData: result.clusters.filter((c) => c.assessment.verdict === "INSUFFICIENT_DATA").length,
    cappedByGuardrail: result.clusters.filter((c) => c.assessment.cappedByGuardrail).length,
    reviewsOpened,
    dataQuality: result.dataQuality,
    durationMs: result.durationMs,
    // Restated on every response so a client cannot mistake a detection for a
    // decision about a person.
    boundary:
      "These are clusters recommended for investigation. This system takes no action against any account.",
  };
});
