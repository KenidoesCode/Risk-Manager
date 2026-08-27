import Link from "next/link";

import { AUDIT_ACTIONS, queryAudit } from "@/audit/service";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { Empty, Heading, Panel, Relative } from "@/ui/primitives";

export const dynamic = "force-dynamic";

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
    limit: 120,
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

      <p className="mb-5 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-dim)]">
        Append-only. Nothing here is updated or deleted. Filter by correlation id to reconstruct one
        request end to end, or by cluster id to reconstruct everything that happened to a cluster.
      </p>

      <div className="mb-5 flex flex-wrap gap-1.5">
        <Link
          href="/audit"
          className={`web-stamp ${!params.action ? "border-[var(--color-strand)] text-[var(--color-strand)]" : "border-[var(--color-web-line)] text-[var(--color-chalk-dim)]"}`}
        >
          ALL
        </Link>
        {AUDIT_ACTIONS.map((a) => (
          <Link
            key={a}
            href={linkFor({ action: params.action === a ? undefined : a })}
            className={`web-strand px-2 py-1 text-[0.625rem] tracking-wide transition ${
              params.action === a
                ? "bg-[var(--color-strand)] text-white"
                : "bg-[var(--color-web-panel)] text-[var(--color-chalk-faint)] hover:text-[var(--color-chalk-dim)]"
            }`}
          >
            {a}
          </Link>
        ))}
      </div>

      <Panel title="Events" subtitle={`${result.events.length} shown of ${result.total} total`}>
        {result.events.length === 0 ? (
          <Empty title="No audit events match this filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="web-table">
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
              <tbody>
                {result.events.map((e) => (
                  <tr key={e.id}>
                    <td className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">{e.sequence}</td>
                    <td className="web-strand text-xs text-[var(--color-chalk)]">{e.action}</td>
                    <td className="text-[0.6875rem] text-[var(--color-chalk-dim)]">
                      {e.actorType.toLowerCase()}
                      <br />
                      <span className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">
                        {e.actorId}
                      </span>
                    </td>
                    <td className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">{e.objectType}</td>
                    <td>
                      {e.clusterId ? (
                        <Link
                          href={`/clusters/${e.clusterId}`}
                          className="web-strand text-[0.625rem] text-[var(--color-chalk-dim)] hover:text-[var(--color-strand)]"
                        >
                          {e.clusterId.slice(-10)}
                        </Link>
                      ) : (
                        <span className="text-[var(--color-chalk-faint)]">&mdash;</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`web-stamp ${
                          e.result === "SUCCESS"
                            ? "text-[var(--color-state-clear)]"
                            : e.result === "BLOCKED"
                              ? "text-[var(--color-strand)]"
                              : e.result === "FAILURE"
                                ? "text-[var(--color-state-possible)]"
                                : "text-[var(--color-chalk-faint)]"
                        }`}
                      >
                        {e.result}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={linkFor({ correlationId: e.correlationId })}
                        className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)] hover:text-[var(--color-strand)]"
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
      </Panel>
    </>
  );
}
