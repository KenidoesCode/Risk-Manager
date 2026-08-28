import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { dismissalReasons, listReviews, reviewerAgreement } from "@/reviews/service";
import { Heading, Metric, Sheet } from "@/ui/primitives";
import { ReviewQueue, type ReviewRow } from "@/ui/review-queue";

export const dynamic = "force-dynamic";

/**
 * Review cards rendered into the page. The queue is ordered newest first and
 * the number not shown is printed above the list, because a work queue that
 * silently drops items is worse than a long one.
 */
const CARDS = 25;

export default async function ReviewsPage() {
  await ensureBootstrapped();
  const db = await getDb();
  const env = getEnv();

  const reviews = await listReviews(db, { limit: 60 });
  const agreement = await reviewerAgreement(db);
  const dismissals = await dismissalReasons(db);

  const pending = reviews.filter((r) => r.status === "PENDING");
  const decided = reviews.filter((r) => r.status !== "PENDING");

  /*
   * `listReviews` carries the whole joined cluster row, including its full
   * signal breakdown, counter-signals and stored explanation — several
   * kilobytes each. The queue renders none of that; it links to the cluster
   * page for it. Since ReviewQueue is a client component, anything handed to it
   * is serialised into the payload, so the row is narrowed to exactly the
   * fields that appear on screen. The API route still returns the full shape.
   */
  const rows: ReviewRow[] = reviews.slice(0, CARDS).map((r) => ({
    id: r.id,
    clusterId: r.clusterId,
    reasonCode: r.reasonCode,
    reasonDetail: r.reasonDetail,
    machineVerdict: r.machineVerdict,
    machineRisk: r.machineRisk,
    machineConfidence: r.machineConfidence,
    status: r.status,
    reviewedBy: r.reviewedBy,
    reviewerNote: r.reviewerNote,
    reviewerVerdict: r.reviewerVerdict,
    benignExplanation: r.benignExplanation,
    createdAt: r.createdAt,
    cluster: {
      accountCount: r.cluster.accountCount,
      riskScore: r.cluster.riskScore,
      confidence: r.cluster.confidence,
      verdict: r.cluster.verdict,
    },
  }));

  return (
    <>
      <Heading kicker="The board">Human review</Heading>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Metric label="Awaiting a person" value={pending.length} tone="unknown" />
        <Metric label="Decided" value={decided.length} />
        <Metric
          label="Reviewer / detector agreement"
          value={agreement.rate === null ? null : `${Math.round(agreement.rate * 100)}%`}
          denominator={`n=${agreement.decided}`}
          hint={
            agreement.decided === 0
              ? "No reviewer has recorded their own verdict yet, so agreement cannot be measured."
              : "Measured only over reviews where the reviewer recorded a verdict."
          }
        />
      </div>

      {dismissals.length > 0 && (
        <Sheet
          title="Accepted benign explanations"
          subtitle="The legitimate readings reviewers actually accepted — the best available evidence about where this detector is wrong."
          className="mb-5"
        >
          <ul className="space-y-2">
            {dismissals.slice(0, 10).map((d) => (
              <li key={d.explanation} className="flex gap-3">
                <span className="num w-8 shrink-0 text-xs t-3">{d.count}&times;</span>
                <span className="note">{d.explanation}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      <Sheet
        title="Queue"
        subtitle={
          reviews.length > rows.length
            ? `No action is pre-selected. The reviewer decides; the detector does not decide and collect a signature. Showing the ${rows.length} most recent of ${reviews.length} loaded.`
            : "No action is pre-selected. The reviewer decides; the detector does not decide and collect a signature."
        }
      >
        <ReviewQueue reviews={rows} riskThreshold={env.RISK_THRESHOLD} />
      </Sheet>

      <p className="note mt-4 max-w-3xl">
        Confirming a cluster here means &ldquo;this is worth investigating&rdquo;, not &ldquo;these
        people committed fraud&rdquo;. Nothing downstream of this queue acts against an account:
        there is no enforcement path in this system, and the endpoint that looks like one exists in
        order to refuse.
      </p>
    </>
  );
}
