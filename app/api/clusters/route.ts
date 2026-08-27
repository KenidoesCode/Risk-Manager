import { intParam, route } from "@/api/handler";
import { clusterList } from "@/api/queries";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) =>
  clusterList(db, {
    verdict: url.searchParams.get("verdict") ?? undefined,
    method: url.searchParams.get("method") ?? undefined,
    reviewOnly: url.searchParams.get("reviewOnly") === "true",
    minRisk: url.searchParams.has("minRisk") ? Number(url.searchParams.get("minRisk")) : undefined,
    limit: intParam(url, "limit", 50, 200),
    offset: intParam(url, "offset", 0, 100000),
  }),
);
