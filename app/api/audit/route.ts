import { intParam, route } from "@/api/handler";
import { queryAudit } from "@/audit/service";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) =>
  queryAudit(db, {
    clusterId: url.searchParams.get("clusterId") ?? undefined,
    correlationId: url.searchParams.get("correlationId") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    severity: url.searchParams.get("severity") ?? undefined,
    result: url.searchParams.get("result") ?? undefined,
    limit: intParam(url, "limit", 100, 500),
    offset: intParam(url, "offset", 0, 100000),
  }),
);
