import { NextResponse } from "next/server";

import { jsonError } from "@/api/handler";
import { clusterSubgraph } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { AppError } from "@/shared/errors";
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
    const subgraph = await clusterSubgraph(db, id);
    if (!subgraph) throw new AppError("CLUSTER_NOT_FOUND", `No cluster with id ${id}.`);
    return NextResponse.json(subgraph, { headers: { "x-correlation-id": correlationId } });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
