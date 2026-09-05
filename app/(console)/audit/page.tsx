import Link from "next/link";

import { AUDIT_ACTIONS, queryAudit } from "@/audit/service";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { Empty, Heading, Relative, Sheet } from "@/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * Rows rendered into the HTML. The trail is append-only and ordered newest
 * first, so this is the most recent window onto it; the number NOT shown is
 * printed under the table and every event remains available through
 * GET /api/audit.
 */
const ROWS = 60;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  await ensureBootstrapped();
  const db = await getDb();

  const result = await queryAudit(db, {
    clusterId: params.clusterId,
    correlationId: params.correlationId,
    action: params.action,
    severity: params.severity,
    result: params.result,
    limit: ROWS,
  });

  const linkFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, v);
    const qs = next.toString();
    return `/audit${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <Heading kicker="Check the detector">Audit trail</Heading>

      <p className="capbox mb-6 max-w-3xl">
        Append-only. Nothing here is updated or deleted. Filter by correlation id to reconstruct one
        request end to end, or by cluster id to reconstruct everything that happened to a cluster.
      </p>

      <div className="mb-5 flex flex-wrap gap-1">
        <Link href="/audit" className={`tag ${!params.action ? "tag-m" : "tag-n"}`}>
          ALL
        </Link>
        {AUDIT_ACTIONS.map((a) => (
          <Link
            key={a}
            href={linkFor({ action: params.action === a ? undefined : a })}
            className={`tag ${params.action === a ? "tag-c" : "tag-n"}`}
          >
            {a}
          </Link>
        ))}
      </div>

      <Sheet
        title="Events"
        subtitle={
          result.total > result.events.length
            ? `Showing the ${result.events.length} most recent of ${result.total} matching. The rest are available through GET /api/audit.`
            : `${result.events.length} of ${result.total} matching.`
        }
      >
        {result.events.length === 0 ? (
          <Empty title="No audit events match this filter." />
        ) : (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Object</th>
                  <th>Cluster</th>
                  <th>Result</th>
                  <th>Correlation</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody className="stagger">
                {result.events.map((e) => (
                  <tr key={e.id}>
                    <td className="num text-[0.625rem] t-3">{e.sequence}</td>
                    <td className="mono text-xs t-ink">{e.action}</td>
                    <td className="note-s">
                      {e.actorType.toLowerCase()}
                      <br />
                      <span className="id t-3">{e.actorId}</span>
                    </td>
                    <td className="id t-3">{e.objectType}</td>
                    <td>
                      {e.clusterId ? (
                        <Link href={`/clusters/${e.clusterId}`} className="id t-2 hover:text-[var(--ink-m)]">
                          {e.clusterId.slice(-10)}
                        </Link>
                      ) : (
                        <span className="t-3">&mdash;</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`tag ${
                          e.result === "SUCCESS"
                            ? "tag-g"
                            : e.result === "BLOCKED"
                              ? "tag-m"
                              : e.result === "FAILURE"
                                ? "tag-y"
                                : "tag-n"
                        }`}
                      >
                        {e.result}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={linkFor({ correlationId: e.correlationId })}
                        className="id t-3 hover:text-[var(--ink-m)]"
                      >
                        {e.correlationId.slice(0, 14)}&hellip;
                      </Link>
                    </td>
                    <td>
                      <Relative iso={e.timestamp} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </>
  );
}
