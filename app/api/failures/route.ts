import { route } from "@/api/handler";
import { failureSummary } from "@/api/queries";

export const dynamic = "force-dynamic";
export const GET = route(async ({ db }) => failureSummary(db));
