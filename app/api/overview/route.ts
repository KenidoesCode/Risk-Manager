import { route } from "@/api/handler";
import { overviewMetrics } from "@/api/queries";

export const dynamic = "force-dynamic";
export const GET = route(async ({ db }) => overviewMetrics(db));
