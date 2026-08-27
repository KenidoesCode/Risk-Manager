import Link from "next/link";

import { overviewMetrics } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { Empty, Heading, Metric, Panel, StateChip } from "@/ui/primitives";
import { DetectButton } from "@/ui/detect-button";

export const dynamic = "force-dynamic";

/**
 * The board.
 *
 * Every tile shows a measured value or an explicit dash. There is no "fraud
 * prevented" tile and no currency figure attributed to detection, because
 * nothing here has been confirmed by anyone and the corpus is synthetic.
 */
export default async function OverviewPage() {
  await ensureBootstrapped();
  const db = await getDb();
  const m = await overviewMetrics(db);
  const env = getEnv();

  if (!m.seeded) {
    return (
      <>
        <Heading kicker="Board">Overview</Heading>
        <Empty
          title="No graph data available."
          detail="Run `npm run db:seed` to generate the synthetic corpus. Nothing is displayed until there is something to measure."
        />
      </>
    );
  }

  const pct = (v: number | null) => (v === null ? null : `${(v * 100).toFixed(1)}%`);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <Heading kicker="Board">Overview</Heading>
        <DetectButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Entities" value={m.graph.entities} hint={`${m.graph.accounts} accounts`} />
        <Metric
          label="Observed links"
          value={m.graph.rawEdges}
          hint="Asserted by an event. Never inferred."
        />
        <Metric
          label="Inferred links"
          value={m.graph.derivedEdges}
          tone="strand"
          hint="Account-to-account, derived from a shared node. Always marked as derived."
        />
        <Metric
          label="Unclusterable accounts"
          value={m.graph.orphanAccounts}
          denominator={pct(m.graph.unclusterableRate) ?? undefined}
          hint="No shared infrastructure with anyone. The graph can say nothing about these."
        />

        <Metric
          label="Clusters found"
          value={m.detection.clusters}
          hint={m.detection.runs === 0 ? "No detection run yet." : `across ${m.detection.runs} run(s)`}
        />
        <Metric
          label="Coordination likely"
          value={m.detection.byVerdict.COORDINATION_LIKELY ?? 0}
          tone="strand"
          hint="Recommended for investigation. Not a finding of fraud."
        />
        <Metric
          label="Capped by guardrail"
          value={m.detection.cappedByGuardrail}
          tone="clear"
          hint="Clusters where structure alone would have triggered a detection and behaviour did not support it."
        />
        <Metric
          label="Awaiting a person"
          value={m.review.pending}
          tone={m.review.pending > 0 ? "unknown" : "neutral"}
          hint={`${m.review.decided} decided`}
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Panel title="Verdict distribution" subtitle="Deterministic. The model contributes no part of this.">
          {Object.keys(m.detection.byVerdict).length === 0 ? (
            <Empty title="No detection has been run." detail="Press Run detection above." />
          ) : (
            <ul className="space-y-2.5">
              {["COORDINATION_LIKELY", "COORDINATION_POSSIBLE", "NO_COORDINATION_INDICATED", "INSUFFICIENT_DATA"]
                .filter((v) => m.detection.byVerdict[v])
                .map((verdict) => {
                  const n = m.detection.byVerdict[verdict] ?? 0;
                  const share = n / Math.max(1, m.detection.clusters);
                  return (
                    <li key={verdict} className="flex items-center gap-3">
                      <span className="w-52 shrink-0">
                        <StateChip state={verdict} />
                      </span>
                      <div className="web-bar flex-1">
                        <span
                          style={{
                            width: `${share * 100}%`,
                            background:
                              verdict === "COORDINATION_LIKELY"
                                ? "var(--color-strand)"
                                : verdict === "COORDINATION_POSSIBLE"
                                  ? "var(--color-state-possible)"
                                  : verdict === "INSUFFICIENT_DATA"
                                    ? "var(--color-state-unknown)"
                                    : "var(--color-state-clear)",
                          }}
                        />
                      </div>
                      <span className="web-strand w-12 text-right text-xs text-[var(--color-chalk-dim)]">{n}</span>
                    </li>
                  );
                })}
            </ul>
          )}
        </Panel>

        <Panel title="Graph composition">
          <ul className="space-y-2.5">
            {Object.entries(m.graph.byType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, n]) => (
                <li key={type} className="flex items-center gap-3">
                  <span className="web-strand w-28 shrink-0 text-xs text-[var(--color-chalk-dim)]">{type}</span>
                  <div className="web-bar flex-1">
                    <span
                      style={{
                        width: `${(n / Math.max(1, m.graph.entities)) * 100}%`,
                        background: "var(--color-node)",
                      }}
                    />
                  </div>
                  <span className="web-strand w-14 text-right text-xs text-[var(--color-chalk-dim)]">{n}</span>
                </li>
              ))}
          </ul>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            Device, address and payment nodes hold anonymised hashes, never raw identifiers. The only
            question the detection asks of them is whether two accounts touched the SAME one, and an
            exact match on a stable hash answers that completely.
          </p>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Activity" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="web-label">Orders</p>
              <p className="web-strand mt-1 text-lg">{m.activity.orders}</p>
            </div>
            <div>
              <p className="web-label">Returns</p>
              <p className="web-strand mt-1 text-lg">{m.activity.returns}</p>
            </div>
            <div>
              <p className="web-label">Refunds</p>
              <p className="web-strand mt-1 text-lg">{m.activity.refunds}</p>
            </div>
            <div>
              <p className="web-label">Return rate</p>
              <p className="web-strand mt-1 text-lg">{pct(m.activity.returnRate) ?? "—"}</p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-[var(--color-chalk-faint)]">
            This population-wide return rate is what &quot;unusually high&quot; is measured against. It
            describes the synthetic corpus and would need re-deriving from real data before
            production use — a threshold calibrated to the wrong population is how a detector starts
            flagging ordinary customers.
          </p>
          <Link href="/clusters" className="web-strand mt-4 inline-block text-xs text-[var(--color-strand)] hover:underline">
            Open the cluster list &rarr;
          </Link>
        </Panel>

        <Panel title="Detector">
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="web-label">Risk threshold</dt>
              <dd className="web-strand mt-1 text-[var(--color-chalk)]">{env.RISK_THRESHOLD} / 100</dd>
            </div>
            <div>
              <dt className="web-label">Confidence threshold</dt>
              <dd className="web-strand mt-1 text-[var(--color-chalk)]">{env.CONFIDENCE_THRESHOLD}</dd>
            </div>
            <div>
              <dt className="web-label">Explanation model</dt>
              <dd className="web-strand mt-1 text-[var(--color-chalk)]">
                {env.llmEnabled ? `${env.LLM_PROVIDER} · ${env.LLM_MODEL}` : "none configured"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            The model writes prose only. It never scores, never clusters, never decides, and an
            explanation naming a signal the detector did not compute is discarded entirely. With no
            provider configured every figure in this console is deterministic.
          </p>
        </Panel>
      </div>
    </>
  );
}
