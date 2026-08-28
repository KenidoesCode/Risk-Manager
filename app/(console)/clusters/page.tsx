import Link from "next/link";

import { clusterList } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { CLUSTER_VERDICTS } from "@/domain/vocabulary";
import { Empty, Heading, RiskBar, Sheet, StateChip } from "@/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * How many rows are rendered into the HTML. The list is ordered by risk
 * descending, so this is the top of the board rather than an arbitrary slice,
 * and the count that was NOT rendered is printed on the page. A console that
 * silently truncates its own evidence has no business asking anyone to trust
 * its numbers.
 */
const ROWS = 40;

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
    limit: ROWS,
  });

  const linkFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) next.set(k, v);
    const qs = next.toString();
    return `/clusters${qs ? `?${qs}` : ""}`;
  };

  const filtered = Boolean(params.verdict || params.reviewOnly || params.minRisk);

  return (
    <>
      <Heading kicker="The board">Clusters</Heading>

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        <Link
          href={linkFor({ verdict: undefined, reviewOnly: undefined })}
          className={`tag ${!params.verdict && !params.reviewOnly ? "tag-m" : "tag-n"}`}
        >
          All
        </Link>
        {CLUSTER_VERDICTS.map((v) => (
          <Link
            key={v}
            href={linkFor({ verdict: params.verdict === v ? undefined : v })}
            className={`tag ${params.verdict === v ? "tag-m" : "tag-n"}`}
          >
            {v.replace(/_/g, " ")}
          </Link>
        ))}
        <Link
          href={linkFor({ reviewOnly: params.reviewOnly === "true" ? undefined : "true", verdict: undefined })}
          className={`tag ${params.reviewOnly === "true" ? "tag-b" : "tag-n"}`}
        >
          Needs review
        </Link>
      </div>

      <Sheet
        title="Detected clusters"
        subtitle={
          result.total > result.items.length
            ? `Showing the ${result.items.length} highest-risk of ${result.total}${filtered ? " matching this filter" : ""}. Ordered by risk score.`
            : `${result.items.length} of ${result.total}${filtered ? " matching this filter" : ""}. Ordered by risk score.`
        }
      >
        {result.items.length === 0 ? (
          <Empty
            title="No clusters match this filter."
            detail="Clear the filters, or run a detection from the Overview page."
          />
        ) : (
          <div className="scroll-x">
            <table className="tbl">
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
                  const signals = (c.signals as StoredSignal[]).filter((s) => s.points > 0.05).slice(0, 3);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/clusters/${c.id}`} className="id t-ink hover:text-[var(--ink-m)]">
                          {c.id}
                        </Link>
                        <div className="cap mt-0.5">{c.method}</div>
                      </td>
                      <td className="num text-xs">{c.accountCount}</td>
                      <td>
                        <RiskBar risk={c.riskScore} threshold={env.RISK_THRESHOLD} />
                      </td>
                      <td className="num text-xs">{(c.confidence * 100).toFixed(0)}%</td>
                      <td>
                        <StateChip state={c.verdict} />
                      </td>
                      <td className="note-s">
                        {signals.length === 0
                          ? "—"
                          : signals.map((s) => `${s.label} (${s.points.toFixed(0)})`).join(", ")}
                      </td>
                      <td>
                        {c.requiresReview ? (
                          <span className="mono text-[0.625rem] t-b">{c.reviewReason}</span>
                        ) : (
                          <span className="note-s">no</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>

      <p className="note mt-4 max-w-3xl">
        Risk and confidence are separate columns on purpose. Risk 91 with confidence 63% means the
        pattern looks strongly coordinated and the detector is not sure the interpretation is right.
        Collapsing those into one number destroys the only information an analyst needs to decide
        whether to look harder or look elsewhere.
      </p>
    </>
  );
}
