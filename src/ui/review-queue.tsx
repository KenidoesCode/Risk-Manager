"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Empty, RiskBar, StateChip } from "./primitives";

/**
 * Review queue.
 *
 * ---------------------------------------------------------------------------
 * NO DEFAULT ACTION, ON PURPOSE
 * ---------------------------------------------------------------------------
 * Nothing is pre-selected and no button is autofocused. A queue where "Confirm"
 * is the focused control and Enter is nearby produces confirmations rather than
 * reviews, and the whole justification for a human here is that the human
 * actually looked at the graph.
 *
 * Dismissing requires a benign explanation. That is not bureaucracy: the
 * legitimate readings reviewers accept are the best evidence available about
 * where the detector is wrong, and a dismissal with no reason teaches nobody
 * anything.
 */

export interface ReviewRow {
  id: string;
  clusterId: string;
  reasonCode: string;
  reasonDetail: string;
  machineVerdict: string;
  machineRisk: number;
  machineConfidence: number;
  status: string;
  reviewedBy: string | null;
  reviewerNote: string | null;
  reviewerVerdict: string | null;
  benignExplanation: string | null;
  createdAt: string;
  cluster: { accountCount: number; riskScore: number; confidence: number; verdict: string };
}

const DECISIONS = [
  { key: "CONFIRMED", label: "Worth investigating", hint: "Routes to an investigator. Not a finding of fraud." },
  { key: "DISMISSED", label: "Dismiss", hint: "Requires a benign explanation." },
  { key: "ESCALATED", label: "Escalate", hint: "Needs a decision above this desk." },
  { key: "NEEDS_MORE_DATA", label: "Need more data", hint: "Stays pending; the gap is recorded." },
] as const;

export function ReviewQueue({ reviews, riskThreshold }: { reviews: ReviewRow[]; riskThreshold: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [verdicts, setVerdicts] = useState<Record<string, string>>({});
  const [benign, setBenign] = useState<Record<string, string>>({});

  const decide = async (reviewId: string, decision: string) => {
    setBusy(reviewId);
    setErrors((e) => ({ ...e, [reviewId]: "" }));
    try {
      const response = await fetch(`/api/reviews/${reviewId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reviewerId: "console-reviewer",
          note: notes[reviewId] || undefined,
          reviewerVerdict: verdicts[reviewId] || undefined,
          benignExplanation: benign[reviewId] || undefined,
        }),
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setErrors((e) => ({ ...e, [reviewId]: json.error?.message ?? `Failed with ${response.status}.` }));
        return;
      }
      startTransition(() => router.refresh());
    } catch (cause) {
      setErrors((e) => ({ ...e, [reviewId]: cause instanceof Error ? cause.message : "Request failed." }));
    } finally {
      setBusy(null);
    }
  };

  if (reviews.length === 0) {
    return (
      <Empty
        title="Nothing is waiting for a person."
        detail="Clusters arrive here when risk and confidence are both high, when risk is high and confidence is not, when the graph is too sparse to interpret, when a legitimate explanation fits as well as coordination does, when clustering is unstable, or when metadata contained instructions addressed to the analysis system."
      />
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map((r) => {
        const decided = r.status !== "PENDING";
        const working = busy === r.id || pending;
        return (
          <article key={r.id} className="web-panel web-clip p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clusters/${r.clusterId}`}
                    className="web-strand text-sm text-[var(--color-chalk)] hover:text-[var(--color-strand)]"
                  >
                    {r.clusterId}
                  </Link>
                  <StateChip state={r.status} />
                  <span className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">
                    {r.reasonCode}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[var(--color-chalk-dim)]">
                  {r.reasonDetail}
                </p>
                <Link
                  href={`/clusters/${r.clusterId}`}
                  className="web-strand mt-2 inline-block text-[0.6875rem] text-[var(--color-node)] hover:underline"
                >
                  Open the graph and the full signal breakdown &rarr;
                </Link>
              </div>

              <div className="text-right">
                <p className="web-label">Detector assessment</p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <StateChip state={r.machineVerdict} />
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <RiskBar risk={r.machineRisk} threshold={riskThreshold} />
                </div>
                <p className="web-strand mt-1 text-[0.6875rem] text-[var(--color-chalk-faint)]">
                  confidence {(r.machineConfidence * 100).toFixed(0)}% &middot; {r.cluster.accountCount} accounts
                </p>
              </div>
            </div>

            {decided ? (
              <div className="mt-4 border-t border-[var(--color-web-line)] pt-3">
                <p className="text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
                  Decided by <span className="web-strand">{r.reviewedBy}</span>. Detector said{" "}
                  <span className="web-strand">{r.machineVerdict}</span>; reviewer said{" "}
                  <span className="web-strand">{r.reviewerVerdict ?? "not recorded"}</span>. Both are
                  kept &mdash; the reviewer&rsquo;s decision never overwrites the detector&rsquo;s.
                </p>
                {r.benignExplanation && (
                  <p className="mt-2 border-l-2 border-l-[var(--color-state-clear)] pl-3 text-xs leading-relaxed text-[var(--color-chalk-dim)]">
                    Accepted explanation: {r.benignExplanation}
                  </p>
                )}
                {r.reviewerNote && (
                  <p className="mt-2 border-l-2 border-l-[var(--color-web-line-bright)] pl-3 text-xs italic text-[var(--color-chalk-dim)]">
                    {r.reviewerNote}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 border-t border-[var(--color-web-line)] pt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="web-label">Reviewer note (optional)</span>
                    <textarea
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      rows={2}
                      className="web-strand mt-1.5 w-full resize-y border border-[var(--color-web-line)] bg-[var(--color-web-void)] px-2.5 py-2 text-xs text-[var(--color-chalk)] outline-none focus:border-[var(--color-strand)]"
                      placeholder="What you saw in the graph."
                    />
                  </label>
                  <label className="block">
                    <span className="web-label">Benign explanation (required to dismiss)</span>
                    <textarea
                      value={benign[r.id] ?? ""}
                      onChange={(e) => setBenign((b) => ({ ...b, [r.id]: e.target.value }))}
                      rows={2}
                      className="web-strand mt-1.5 w-full resize-y border border-[var(--color-web-line)] bg-[var(--color-web-void)] px-2.5 py-2 text-xs text-[var(--color-chalk)] outline-none focus:border-[var(--color-state-clear)]"
                      placeholder="e.g. student house, one address, separate cards."
                    />
                  </label>
                  <label className="block">
                    <span className="web-label">Your own verdict (optional)</span>
                    <select
                      value={verdicts[r.id] ?? ""}
                      onChange={(e) => setVerdicts((v) => ({ ...v, [r.id]: e.target.value }))}
                      className="web-strand mt-1.5 w-full border border-[var(--color-web-line)] bg-[var(--color-web-void)] px-2.5 py-2 text-xs text-[var(--color-chalk)] outline-none focus:border-[var(--color-strand)]"
                    >
                      <option value="">&mdash; not recorded &mdash;</option>
                      {["COORDINATION_LIKELY", "COORDINATION_POSSIBLE", "NO_COORDINATION_INDICATED", "INSUFFICIENT_DATA"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {v.replace(/_/g, " ")}
                          </option>
                        ),
                      )}
                    </select>
                    <span className="mt-1 block text-[0.625rem] leading-snug text-[var(--color-chalk-faint)]">
                      Recording it lets the console report how often reviewers and the detector
                      disagree.
                    </span>
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {DECISIONS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      title={d.hint}
                      disabled={working}
                      onClick={() => decide(r.id, d.key)}
                      className="web-clip border border-[var(--color-web-line-bright)] px-3.5 py-2 text-xs text-[var(--color-chalk-dim)] transition hover:border-[var(--color-strand)] hover:text-[var(--color-chalk)] disabled:opacity-40"
                    >
                      {working ? <Loader2 size={12} className="inline animate-spin" aria-hidden /> : null} {d.label}
                    </button>
                  ))}
                </div>

                {errors[r.id] && (
                  <p className="mt-2 text-[0.6875rem] text-[var(--color-strand)]">{errors[r.id]}</p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
