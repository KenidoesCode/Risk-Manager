import Link from "next/link";
import { notFound } from "next/navigation";

import { clusterSubgraph, clusterTimeline } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { VERDICT_DESCRIPTIONS, type ClusterVerdict } from "@/domain/vocabulary";
import { ClusterDetail } from "@/ui/cluster-detail";
import { ExportButton } from "@/ui/export-button";
import { RiskBar, StateChip } from "@/ui/primitives";

export const dynamic = "force-dynamic";

export default async function ClusterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureBootstrapped();
  const db = await getDb();
  const env = getEnv();

  const subgraph = await clusterSubgraph(db, id);
  if (!subgraph) notFound();

  const timeline = await clusterTimeline(db, id);
  const c = subgraph.cluster;

  let explanation = null;
  try {
    explanation = c.explanation ? JSON.parse(c.explanation) : null;
  } catch {
    // A stored explanation that will not parse is shown as absent rather than
    // crashing the page; the signal breakdown below is the authoritative view.
    explanation = null;
  }

  return (
    <>
      {/*
        The graph is the page.

        The console used to open with a heading and four metric tiles, which
        pushed the only surface that shows a RING below the fold. A ring is a
        shape; a reader recognises it in one look and cannot recognise it at all
        from a risk number. So the figures compress into a single command bar and
        the web gets the rest of the screen.
      */}
      <div className="panel mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
        <Link
          href="/clusters"
          className="strand text-[0.6875rem] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
        >
          &larr; rings
        </Link>

        <div className="min-w-0">
          <p className="label">{c.method}</p>
          <p className="strand truncate text-sm text-[var(--color-ink)]">{c.id}</p>
        </div>

        <StateChip state={c.verdict} />

        <div className="flex items-baseline gap-1.5">
          <span className="title text-xl text-[var(--color-ink)]">{c.riskScore.toFixed(1)}</span>
          <span className="label">/ 100 risk</span>
        </div>

        <div className="min-w-[9rem] flex-1">
          <RiskBar risk={c.riskScore} threshold={env.RISK_THRESHOLD} />
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="title text-xl text-[var(--color-ink)]">{(c.confidence * 100).toFixed(0)}%</span>
          <span className="label">confidence</span>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="title text-xl text-[var(--color-ink)]">{c.accountCount}</span>
          <span className="label">accounts · {subgraph.nodes.length} nodes · {subgraph.edges.length} links</span>
        </div>

        <div className="ml-auto">
          <ExportButton clusterId={c.id} />
        </div>
      </div>

      {c.requiresReview && (
        <div className="panel panel-possible mb-5 px-5 py-3">
          <span className="caption caption-amber">ROUTED TO REVIEW</span>
          <p className="mt-2 text-xs leading-relaxed text-[var(--color-ink-soft)]">
            {c.reviewReason} — {VERDICT_DESCRIPTIONS[c.verdict as ClusterVerdict]}
          </p>
        </div>
      )}

      <ClusterDetail
        cluster={{
          id: c.id,
          accountCount: c.accountCount,
          riskScore: c.riskScore,
          confidence: c.confidence,
          verdict: c.verdict,
          requiresReview: c.requiresReview,
          reviewReason: c.reviewReason,
          method: c.method,
          stability: c.stability,
          explanationSource: c.explanationSource,
          signals: c.signals as never,
          counterSignals: c.counterSignals as never,
          explanation,
        }}
        nodes={subgraph.nodes}
        edges={subgraph.edges}
        riskThreshold={env.RISK_THRESHOLD}
        timeline={timeline}
      />
    </>
  );
}
