import { NextResponse } from "next/server";

import { jsonError } from "@/api/handler";
import { clusterSubgraph } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { DOSSIER_VERSION, toCsv, toJson, type DossierInput } from "@/export/dossier";
import { AppError } from "@/shared/errors";
import { newCorrelationId } from "@/shared/ids";

export const dynamic = "force-dynamic";

/**
 * Downloads a ring dossier.
 *
 * `?format=json` for the complete subgraph, `?format=csv` for the account list.
 * Both come from `clusterSubgraph`, the same query the console renders, so the
 * file and the screen cannot disagree.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = newCorrelationId();
  try {
    const { id } = await context.params;
    const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "json";

    await ensureBootstrapped();
    const db = await getDb();
    const subgraph = await clusterSubgraph(db, id);
    if (!subgraph) throw new AppError("CLUSTER_NOT_FOUND", `No cluster with id ${id}.`);

    const raw = subgraph as unknown as Record<string, unknown>;
    const input: DossierInput = {
      cluster: { ...(raw.cluster as Record<string, unknown>), id },
      nodes: (raw.nodes ?? []) as DossierInput["nodes"],
      edges: (raw.edges ?? []) as DossierInput["edges"],
      members: (raw.members ?? []) as DossierInput["members"],
      generatedAt: new Date().toISOString(),
    };

    const body = format === "csv" ? toCsv(input) : toJson(input);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="ring-${id}.${format}"`,
        "cache-control": "no-store",
        "x-dossier-version": DOSSIER_VERSION,
        "x-correlation-id": correlationId,
      },
    });
  } catch (error) {
    return jsonError(error, correlationId);
  }
}
