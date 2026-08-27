import Link from "next/link";

import { clusterList } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { CLUSTER_VERDICTS } from "@/domain/vocabulary";
import { Empty, Heading, Panel, RiskBar, StateChip } from "@/ui/primitives";

export const dynamic = "force-dynamic";

interface StoredSignal {
  signal: string;
  label: string;
  points: number;
}

export default async function ClustersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  await ensureBootstrapped();
  const db = await getDb();
  const env = getEnv();

  const result = await clusterList(db, {
    verdict: params.verdict,
    reviewOnly: params.reviewOnly === "true",
    minRisk: params.minRisk ? Number(params.minRisk) : undefined,
    limit: 60,
  });

  const linkFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, v);
    const qs = next.toString();
    return `/clusters${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <Heading kicker="Board">Clusters</Heading>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={linkFor({ verdict: undefined, reviewOnly: undefined })}
          className={`web-stamp ${
            !params.verdict && !params.reviewOnly
              ? "border-[var(--color-strand)] text-[var(--color-strand)]"
              : "border-[var(--color-web-line)] text-[var(--color-chalk-dim)]"
          }`}
        >
          All
        </Link>
        {CLUSTER_VERDICTS.map((v) => (
          <Link
            key={v}
            href={linkFor({ verdict: params.verdict === v ? undefined : v })}
            className={`web-stamp ${
              params.verdict === v
                ? "border-[var(--color-strand)] text-[var(--color-strand)]"
                : "border-[var(--color-web-line)] text-[var(--color-chalk-dim)]"
            }`}
          >
            {v.replace(/_/g, " ")}
          </Link>
        ))}
        <Link
          href={linkFor({ reviewOnly: params.reviewOnly === "true" ? undefined : "true", verdict: undefined })}
          className={`web-stamp ${
            params.reviewOnly === "true"
              ? "border-[var(--color-state-unknown)] text-[var(--color-state-unknown)]"
              : "border-[var(--color-web-line)] text-[var(--color-chalk-dim)]"
          }`}
        >
          Needs review
        </Link>
      </div>

      <Panel title="Detected clusters" subtitle={`${result.items.length} shown of ${result.total} total`}>
        {result.items.length === 0 ? (
          <Empty
            title="No clusters match this filter."
            detail="Clear the filters, or run a detection from the Overview page."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="web-table">
              <thead>
                <tr>
                  <th>Cluster</th>
                  <th>Accounts</th>
                  <th>Risk</th>
                  <th>Confidence</th>
                  <th>Verdict</th>
                  <th>Top signals</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((c) => {
                  const signals = (c.signals as StoredSignal[])
                    .filter((s) => s.points > 0.05)
                    .slice(0, 3);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/clusters/${c.id}`}
                          className="web-strand text-xs text-[var(--color-chalk)] hover:text-[var(--color-strand)]"
                        >
                          {c.id}
                        </Link>
                        <div className="mt-0.5 text-[0.625rem] text-[var(--color-chalk-faint)]">{c.method}</div>
                      </td>
                      <td className="web-strand text-xs">{c.accountCount}</td>
                      <td>
                        <RiskBar risk={c.riskScore} threshold={env.RISK_THRESHOLD} />
                      </td>
                      <td className="web-strand text-xs text-[var(--color-chalk-dim)]">
                        {(c.confidence * 100).toFixed(0)}%
                      </td>
                      <td>
                        <StateChip state={c.verdict} />
                      </td>
                      <td className="text-[0.6875rem] leading-relaxed text-[var(--color-chalk-dim)]">
                        {signals.length === 0
                          ? "—"
                          : signals.map((s) => `${s.label} (${s.points.toFixed(0)})`).join(", ")}
                      </td>
                      <td>
                        {c.requiresReview ? (
                          <span className="web-strand text-[0.625rem] text-[var(--color-state-unknown)]">
                            {c.reviewReason}
                          </span>
                        ) : (
                          <span className="text-[0.6875rem] text-[var(--color-chalk-faint)]">no</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-faint)]">
        Risk and confidence are separate columns on purpose. Risk 91 with confidence 63% means the
        pattern looks strongly coordinated and the detector is not sure the interpretation is right.
        Collapsing those into one number destroys the only information an analyst needs to decide
        whether to look harder or look elsewhere.
      </p>
    </>
  );
}
