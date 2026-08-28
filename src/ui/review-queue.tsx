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
          <article key={r.id} className="sheet p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clusters/${r.clusterId}`}
                    className="id text-sm t-ink hover:text-[var(--ink-m)]"
                  >
                    {r.clusterId}
                  </Link>
                  <StateChip state={r.status} />
                  <span className="mono text-[0.625rem] t-3">{r.reasonCode}</span>
                </div>
                <p className="note mt-2 max-w-2xl">{r.reasonDetail}</p>
                <Link
                  href={`/clusters/${r.clusterId}`}
                  className="mono mt-2 inline-block text-[0.6875rem] t-c hover:underline"
                >
                  Open the graph and the full signal breakdown &rarr;
                </Link>
              </div>

              <div className="text-right">
                <p className="cap">Detector assessment</p>
                <div className="mt-1 flex items-center justify-end gap-2">
                  <StateChip state={r.machineVerdict} />
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <RiskBar risk={r.machineRisk} threshold={riskThreshold} />
                </div>
                <p className="num mt-1 text-[0.6875rem] t-3">
                  confidence {(r.machineConfidence * 100).toFixed(0)}% &middot; {r.cluster.accountCount} accounts
                </p>
              </div>
            </div>

            {decided ? (
              <div className="rule-x mt-4 pt-3">
                <p className="note-s">
                  Decided by <span className="mono">{r.reviewedBy}</span>. Detector said{" "}
                  <span className="mono">{r.machineVerdict}</span>; reviewer said{" "}
                  <span className="mono">{r.reviewerVerdict ?? "not recorded"}</span>. Both are
                  kept &mdash; the reviewer&rsquo;s decision never overwrites the detector&rsquo;s.
                </p>
                {r.benignExplanation && (
                  <p className="note mt-2 border-l-2 border-l-[var(--ink-g)] pl-3">
                    Accepted explanation: {r.benignExplanation}
                  </p>
                )}
                {r.reviewerNote && (
                  <p className="note mt-2 border-l-2 border-l-[var(--rule)] pl-3 italic">{r.reviewerNote}</p>
                )}
              </div>
            ) : (
              <div className="rule-x mt-4 pt-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="cap">Reviewer note (optional)</span>
                    <textarea
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      rows={2}
                      className="field mt-1.5 resize-y"
                      placeholder="What you saw in the graph."
                    />
                  </label>
                  <label className="block">
                    <span className="cap">Benign explanation (required to dismiss)</span>
                    <textarea
                      value={benign[r.id] ?? ""}
                      onChange={(e) => setBenign((b) => ({ ...b, [r.id]: e.target.value }))}
                      rows={2}
                      className="field mt-1.5 resize-y"
                      placeholder="e.g. student house, one address, separate cards."
                    />
                  </label>
                  <label className="block">
                    <span className="cap">Your own verdict (optional)</span>
                    <select
                      value={verdicts[r.id] ?? ""}
                      onChange={(e) => setVerdicts((v) => ({ ...v, [r.id]: e.target.value }))}
                      className="field mt-1.5"
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
                    <span className="note-s mt-1 block">
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
                      className="btn btn-ghost"
                    >
                      {working ? <Loader2 size={12} className="inline animate-spin" aria-hidden /> : null} {d.label}
                    </button>
                  ))}
                </div>

                {errors[r.id] && (
                  <p className="note-s mt-2 t-m">{errors[r.id]}</p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
