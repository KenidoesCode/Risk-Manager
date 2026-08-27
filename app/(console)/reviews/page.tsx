import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import { dismissalReasons, listReviews, reviewerAgreement } from "@/reviews/service";
import { Empty, Heading, Metric, Panel } from "@/ui/primitives";
import { ReviewQueue, type ReviewRow } from "@/ui/review-queue";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  await ensureBootstrapped();
  const db = await getDb();
  const env = getEnv();

  const reviews = await listReviews(db, { limit: 60 });
  const agreement = await reviewerAgreement(db);
  const dismissals = await dismissalReasons(db);

  const pending = reviews.filter((r) => r.status === "PENDING");
  const decided = reviews.filter((r) => r.status !== "PENDING");

  return (
    <>
      <Heading kicker="Board">Human review</Heading>

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
        <Panel
          title="Accepted benign explanations"
          subtitle="The legitimate readings reviewers actually accepted — the best available evidence about where this detector is wrong."
          className="mb-5"
        >
          <ul className="space-y-2">
            {dismissals.slice(0, 10).map((d) => (
              <li key={d.explanation} className="flex gap-3 text-xs">
                <span className="web-strand w-8 shrink-0 text-[var(--color-chalk-faint)]">{d.count}&times;</span>
                <span className="leading-relaxed text-[var(--color-chalk-dim)]">{d.explanation}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Queue"
        subtitle="No action is pre-selected. The reviewer decides; the detector does not decide and collect a signature."
      >
        <ReviewQueue reviews={reviews as unknown as ReviewRow[]} riskThreshold={env.RISK_THRESHOLD} />
      </Panel>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-faint)]">
        Confirming a cluster here means &ldquo;this is worth investigating&rdquo;, not &ldquo;these
        people committed fraud&rdquo;. Nothing downstream of this queue acts against an account:
        there is no enforcement path in this system, and the endpoint that looks like one exists in
        order to refuse.
      </p>
    </>
  );
}
