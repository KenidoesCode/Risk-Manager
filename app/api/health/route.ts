import { NextResponse } from "next/server";

import { currentDriver } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { environmentStatus } from "@/shared/env";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await ensureBootstrapped();
    const driver = await currentDriver();
    return NextResponse.json({
      status: "ok",
      database: { driver, reachable: true },
      environment: environmentStatus(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        database: { reachable: false },
        detail: error instanceof Error ? error.message : "unknown",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
