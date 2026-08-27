import { z } from "zod";

import { bodyRoute } from "@/api/handler";
import { checkEvasionRequest } from "@/safety/boundary";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";

const ExplainRequest = z.object({ question: z.string().min(1).max(2000) });

/**
 * Free-text question surface, guarded by the detection-only boundary.
 *
 * The product core question - "why was this cluster flagged?" - is answered by
 * the signal breakdown, which is deterministic and already attached to every
 * cluster. This endpoint exists so the evasion refusal is reachable and
 * testable rather than a comment in a file nothing calls.
 */
export const POST = bodyRoute(ExplainRequest, async (_ctx, body) => {
  const check = checkEvasionRequest(body.question);
  if (check.refused) {
    throw new AppError("EVASION_REQUEST_REFUSED", check.message, { details: { rule: check.rule } });
  }

  return {
    accepted: true,
    message:
      "Within scope. Every cluster carries a full signal breakdown with the observation behind each point, " +
      "plus the counter-signals - the legitimate explanations that fit the same evidence. See the cluster detail page.",
  };
});
