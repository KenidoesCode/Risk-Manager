import Link from "next/link";
import { notFound } from "next/navigation";

import { clusterSubgraph, clusterTimeline } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { VERDICT_DESCRIPTIONS, type ClusterVerdict } from "@/domain/vocabulary";
import { ClusterDetail } from "@/ui/cluster-detail";
import { Heading, Metric, RiskBar, StateChip } from "@/ui/primitives";

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
      <Link href="/clusters" className="web-strand text-xs text-[var(--color-chalk-faint)] hover:text-[var(--color-chalk-dim)]">
        &larr; clusters
      </Link>
      <Heading kicker={c.method}>{c.id}</Heading>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Accounts" value={c.accountCount} />
        <Metric
          label="Risk"
          value={c.riskScore.toFixed(1)}
          denominator="/ 100"
          tone={c.riskScore >= env.RISK_THRESHOLD ? "strand" : "neutral"}
          hint={`Detection threshold ${env.RISK_THRESHOLD}`}
        />
        <Metric
          label="Confidence"
          value={`${(c.confidence * 100).toFixed(0)}%`}
          tone={c.confidence < env.CONFIDENCE_THRESHOLD ? "possible" : "neutral"}
          hint="How well the evidence supports any interpretation. Independent of the risk score."
        />
        <Metric label="Nodes in subgraph" value={subgraph.nodes.length} hint={`${subgraph.edges.length} links`} />
      </div>

      <div className="web-panel web-clip mb-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <StateChip state={c.verdict} />
          <RiskBar risk={c.riskScore} threshold={env.RISK_THRESHOLD} />
          {c.requiresReview && (
            <span className="web-strand text-[0.6875rem] text-[var(--color-state-unknown)]">
              routed to review: {c.reviewReason}
            </span>
          )}
        </div>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-dim)]">
          {VERDICT_DESCRIPTIONS[c.verdict as ClusterVerdict]}
        </p>
      </div>

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
