import { intParam, route } from "@/api/handler";
import { evaluationList } from "@/api/queries";

export const dynamic = "force-dynamic";

export const GET = route(async ({ db, url }) => {
  const runs = await evaluationList(db, intParam(url, "limit", 20, 50));
  return { runs, count: runs.length };
});
