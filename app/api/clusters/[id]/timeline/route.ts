import { NextResponse } from "next/server";

import { jsonError } from "@/api/handler";
import { clusterTimeline } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { newCorrelationId } from "@/shared/ids";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { id } = await context.params;
    await ensureBootstrapped();
    const db = await getDb();
    const events = await clusterTimeline(db, id);
    return NextResponse.json(
      { clusterId: id, count: events.length, events },
      { headers: { "x-correlation-id": correlationId } },
    );
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
