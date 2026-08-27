import { NextResponse } from "next/server";

import { jsonError } from "@/api/handler";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { DEMO_SCENARIOS, runScenario, type DemoScenario } from "@/demo/scenarios";
import { AppError } from "@/shared/errors";
import { newCorrelationId } from "@/shared/ids";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: Request,
  context: { params: Promise<{ scenario: string }> },
): Promise<NextResponse> {
  const correlationId = request.headers.get("x-correlation-id") ?? newCorrelationId();
  try {
    const { scenario } = await context.params;
    if (!(DEMO_SCENARIOS as readonly string[]).includes(scenario)) {
      throw new AppError("VALIDATION_ERROR", `Unknown demo scenario '${scenario}'.`, {
        details: { available: DEMO_SCENARIOS },
      });
    }
    await ensureBootstrapped();
    const db = await getDb();
    const run = await runScenario(db, scenario as DemoScenario, correlationId);
    return NextResponse.json(run, { headers: { "x-correlation-id": correlationId } });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
