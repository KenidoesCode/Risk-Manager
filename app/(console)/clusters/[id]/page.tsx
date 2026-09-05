import Link from "next/link";
import { notFound } from "next/navigation";

import { clusterSubgraph, clusterTimeline } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { VERDICT_DESCRIPTIONS, type ClusterVerdict } from "@/domain/vocabulary";
import { ClusterGraph } from "@/ui/cluster-graph";
import { ExportButton } from "@/ui/export-button";
import { OverlayStack, type StackCounterSignal, type StackSignal } from "@/ui/overlay-stack";
import { Empty, RiskBar, Sheet, StateChip } from "@/ui/primitives";

export const dynamic = "force-dynamic";

/**
 * The timeline is capped at what a person will actually read, and the cap is
 * printed rather than applied silently. Rendering a thousand-row table into the
 * HTML of every request costs every reader hundreds of kilobytes to show
 * something nobody scrolls to.
 */
const TIMELINE_ROWS = 60;

const STRUCTURAL = new Set(["SHARED_PAYMENT", "SHARED_DEVICE", "SHARED_ADDRESS", "CLUSTER_DENSITY"]);

export default async function ClusterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureBootstrapped();
  const db = await getDb();
  const env = getEnv();

  const subgraph = await clusterSubgraph(db, id);
  if (!subgraph) notFound();

  const timeline = await clusterTimeline(db, id);
  const c = subgraph.cluster;

  let explanation: { summary: string; caveats: string[] } | null = null;
  try {
    explanation = c.explanation ? JSON.parse(c.explanation) : null;
  } catch {
    // A stored explanation that will not parse is shown as absent rather than
    // crashing the page; the signal breakdown above is the authoritative view.
    explanation = null;
  }

  const signals = c.signals as unknown as StackSignal[];
  const counterSignals = c.counterSignals as unknown as StackCounterSignal[];
  const contributing = signals.filter((s) => s.points > 0.05);
  const structuralPoints = contributing
    .filter((s) => STRUCTURAL.has(s.signal))
    .reduce((a, s) => a + s.points, 0);
  const behaviouralPoints = contributing
    .filter((s) => !STRUCTURAL.has(s.signal))
    .reduce((a, s) => a + s.points, 0);

  const accounts = subgraph.nodes
    .filter((n) => n.type === "ACCOUNT")
    .map((n) => ({ id: n.id, eventCount: n.eventCount }));

  return (
    <>
      {/*
        The command bar. The figures compress into one strip so the two
        surfaces that carry the argument — the graph and the overlay stack —
        get the screen.
      */}
      <div className="sheet mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
        <Link href="/clusters" className="cap hover:text-[var(--ink)]">
          &larr; All clusters
        </Link>

        <div>
          <p className="cap">{c.method}</p>
          <p className="id t-ink">{c.id}</p>
        </div>

        <StateChip state={c.verdict} />

        <div className="flex items-baseline gap-1.5">
          <span className="num text-xl t-ink">{c.riskScore.toFixed(1)}</span>
          <span className="cap">/ 100 risk</span>
        </div>

        <div className="min-w-[9rem] flex-1">
          <RiskBar risk={c.riskScore} threshold={env.RISK_THRESHOLD} />
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="num text-xl t-ink">{(c.confidence * 100).toFixed(0)}%</span>
          <span className="cap">confidence</span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="num text-xl t-ink">{c.accountCount}</span>
          <span className="cap">
            accounts · {subgraph.nodes.length} nodes · {subgraph.edges.length} links
          </span>
        </div>

        <div className="ml-auto">
          <ExportButton clusterId={c.id} />
        </div>
      </div>

      {c.requiresReview && (
        <div className="sheet mb-5 border-l-[3px] border-l-[var(--ink-y)] px-5 py-3">
          <span className="tag tag-y">ROUTED TO REVIEW</span>
          <p className="note mt-2">
            {c.reviewReason} — {VERDICT_DESCRIPTIONS[c.verdict as ClusterVerdict]}
          </p>
        </div>
      )}

      <div className="space-y-5">
        <Sheet
          title="Entity graph"
          subtitle="Solid cyan is observed. Dashed magenta is inferred by this system from a shared node."
        >
          <ClusterGraph nodes={subgraph.nodes} edges={subgraph.edges} />
        </Sheet>

        {/*
          The signature surface, and the counter-signals it carries are on
          screen BEFORE any verdict language. That ordering is the product, not
          a layout preference.
        */}
        <OverlayStack
          signals={signals}
          counterSignals={counterSignals}
          accounts={accounts}
          riskScore={c.riskScore}
          riskThreshold={env.RISK_THRESHOLD}
          structuralPoints={structuralPoints}
          behaviouralPoints={behaviouralPoints}
          confidence={c.confidence}
        />

        {explanation && (
          <Sheet
            title={
              c.explanationSource === "model" ? "Explanation — model-written" : "Explanation — deterministic"
            }
            subtitle={
              c.explanationSource === "model"
                ? "Validated: it may only name signals the detector computed, and may not state a verdict."
                : "No model provider configured. Generated from the computed signals."
            }
          >
            <p className="lede max-w-3xl">{explanation.summary}</p>

            {explanation.caveats.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {explanation.caveats.map((caveat, i) => (
                  <li key={i} className="note-s flex gap-2">
                    <span className="t-y shrink-0" aria-hidden>
                      ▲
                    </span>
                    {caveat}
                  </li>
                ))}
              </ul>
            )}
          </Sheet>
        )}

        <Sheet title="Timeline" subtitle="Orders, returns and refunds across the cluster, in order.">
          {timeline.length === 0 ? (
            <Empty title="No events recorded for this cluster." />
          ) : (
            <>
              <div className="scroll-x max-h-96 overflow-y-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>Account</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody className="stagger">
                    {timeline.slice(0, TIMELINE_ROWS).map((e, i) => (
                      <tr key={i}>
                        <td className="num text-[0.6875rem] t-3">
                          {e.at.slice(0, 16).replace("T", " ")}
                        </td>
                        <td>
                          <span
                            className={`tag ${
                              e.kind === "RETURN" ? "tag-y" : e.kind === "REFUND" ? "tag-m" : "tag-n"
                            }`}
                          >
                            {e.kind}
                          </span>
                        </td>
                        <td className="id t-3">{e.accountId.slice(-10)}</td>
                        <td className="note-s">{e.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {timeline.length > TIMELINE_ROWS && (
                <p className="note-s mt-2">
                  Showing the first {TIMELINE_ROWS} of {timeline.length} events, oldest first. The
                  full sequence is in the subgraph export.
                </p>
              )}
            </>
          )}
        </Sheet>

        {c.stability !== null && (
          <Sheet title="Cluster stability">
            <div className="flex flex-wrap items-center gap-3">
              <div className="meter w-40">
                <span
                  style={{
                    width: `${c.stability * 100}%`,
                    background: c.stability < 0.5 ? "var(--ink-y)" : "var(--ink-g)",
                  }}
                />
              </div>
              <span className="num text-sm t-ink">{(c.stability * 100).toFixed(0)}%</span>
              <StateChip state={c.stability < 0.5 ? "ADVERSARIAL" : "EASY"} />
            </div>
            <p className="note mt-3 max-w-3xl">
              How much of this membership survives re-clustering under a different node ordering.
              Modularity has many near-optimal partitions, so a cluster that dissolves under
              reordering is an artefact of iteration order rather than a structure in the data — and
              presenting it as &ldquo;these accounts are connected&rdquo; would be presenting an
              accident. Low stability lowers confidence and routes the cluster to a person; it never
              raises the score.
            </p>
          </Sheet>
        )}
      </div>
    </>
  );
}
