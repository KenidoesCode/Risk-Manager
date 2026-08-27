import { z } from "zod";

import { bodyRoute } from "@/api/handler";
import { recordAudit } from "@/audit/service";
import { AppError } from "@/shared/errors";

export const dynamic = "force-dynamic";

const EnforceRequest = z.object({
  clusterId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  action: z.string().min(1),
});

/**
 * This endpoint exists in order to refuse.
 *
 * Returning 404 for an enforcement attempt would read as "not built yet". A
 * caller integrating against this system needs to learn that acting against a
 * customer is refused BY DESIGN, with a reason, and that the refusal is
 * audited.
 */
export const POST = bodyRoute(EnforceRequest, async ({ db, correlationId }, body) => {
  const reason =
    "This system detects and explains coordinated return patterns for a human to investigate. " +
    "It does not block accounts, deny refunds, suspend customers, or take any other action against a person. " +
    "A cluster score is a recommendation to look, not a finding of fraud, and the false-positive case here is a " +
    "real household penalised for living together. Any enforcement integration would require separate " +
    "authorisation, its own audit path, and a human decision per account.";

  await recordAudit(db, {
    actorType: "USER",
    actorId: "api",
    action: "ENFORCEMENT_REFUSED",
    objectType: body.clusterId ? "cluster" : "account",
    objectId: body.clusterId ?? body.accountId ?? "unknown",
    clusterId: body.clusterId ?? null,
    correlationId,
    metadata: { requestedAction: body.action, reason },
    result: "BLOCKED",
    severity: "notice",
  });

  throw new AppError("ENFORCEMENT_REFUSED", reason, {
    details: { requestedAction: body.action, capability: "enforcement", available: false },
    correlationId,
  });
});
