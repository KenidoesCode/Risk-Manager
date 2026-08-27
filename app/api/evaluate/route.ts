import { z } from "zod";

import { bodyRoute } from "@/api/handler";
import { runEvaluation, selectThreshold } from "@/evaluation/harness";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EvaluateRequest = z.object({
  split: z.enum(["train", "dev", "held-out"]).default("held-out"),
  method: z.enum(["shared-entity", "louvain"]).default("shared-entity"),
  /** Explicit threshold. Omit to select one on the dev split. */
  riskThreshold: z.number().min(0).max(100).optional(),
});

export const POST = bodyRoute(EvaluateRequest, async ({ db, correlationId }, body) => {
  // Without an explicit threshold one is chosen on dev, never on the split
  // being reported - selecting it there would be fitting to the test set.
  const selection =
    body.riskThreshold === undefined ? await selectThreshold(db, correlationId, body.method) : null;

  const result = await runEvaluation(db, {
    split: body.split,
    correlationId,
    method: body.method,
    riskThreshold: body.riskThreshold ?? selection?.threshold,
  });

  return { ...result, thresholdSelection: selection };
});
