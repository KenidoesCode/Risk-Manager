"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, PlayCircle, XCircle } from "lucide-react";

import { SignalRow, StateChip } from "./primitives";

/**
 * Scenario runner.
 *
 * Each button calls POST /api/demo/:scenario, which builds the scenario's
 * subgraph, runs the real clustering, feature and scoring code, and checks the
 * outcome against the scenario's stated expectation server-side. What is
 * rendered below is the server's verdict, not a claim made here.
 */

export interface ScenarioSpec {
  key: string;
  title: string;
  description: string;
  claim: string;
}

interface ScoredSignal {
  signal: string;
  label: string;
  points: number;
  maxPoints: number;
  observation: string;
}

interface RunResult {
  behavedAsSpecified: boolean;
  deviations: string[];
  observed: {
    accountCount: number;
    riskScore: number;
    confidence: number;
    verdict: string;
    requiresReview: boolean;
    reviewReason: string | null;
    structuralPoints: number;
    behaviouralPoints: number;
    cappedByGuardrail: boolean;
    injectionFindings: number;
    baselineFlaggedAccounts: number;
  };
  assessment: { signals: ScoredSignal[] } | null;
}

export function DemoRunner({ scenarios }: { scenarios: ScenarioSpec[] }) {
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = async (key: string) => {
    setBusy(key);
    setErrors((e) => ({ ...e, [key]: "" }));
    try {
      const response = await fetch(`/api/demo/${key}`, { method: "POST" });
      const json = (await response.json()) as RunResult & { error?: { message?: string } };
      if (!response.ok) {
        setErrors((e) => ({ ...e, [key]: json.error?.message ?? `Failed with ${response.status}.` }));
        return;
      }
      setResults((r) => ({ ...r, [key]: json }));
    } catch (cause) {
      setErrors((e) => ({ ...e, [key]: cause instanceof Error ? cause.message : "Request failed." }));
    } finally {
      setBusy(null);
    }
  };

  const runAll = async () => {
    for (const s of scenarios) await run(s.key);
  };

  const completed = Object.keys(results).length;
  const passing = Object.values(results).filter((r) => r.behavedAsSpecified).length;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runAll}
          disabled={busy !== null}
          className="web-clip inline-flex items-center gap-2 bg-[var(--color-strand)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-strand-glow)] disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <PlayCircle size={13} aria-hidden />}
          Run every scenario
        </button>
        {completed > 0 && (
          <span className="web-strand text-xs text-[var(--color-chalk-dim)]">
            {passing}/{completed} behaved as specified
          </span>
        )}
      </div>

      <div className="space-y-4">
        {scenarios.map((s) => {
          const result = results[s.key];
          const running = busy === s.key;
          return (
            <article key={s.key} className="web-panel web-clip p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--color-chalk)]">{s.title}</h3>
                    {result &&
                      (result.behavedAsSpecified ? (
                        <span className="inline-flex items-center gap-1 text-[0.6875rem] text-[var(--color-state-clear)]">
                          <CheckCircle2 size={12} aria-hidden /> AS SPECIFIED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[0.6875rem] text-[var(--color-strand)]">
                          <XCircle size={12} aria-hidden /> DEVIATED
                        </span>
                      ))}
                  </div>
                  <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-[var(--color-chalk-dim)]">
                    {s.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => run(s.key)}
                  disabled={busy !== null}
                  className="web-clip shrink-0 border border-[var(--color-web-line-bright)] px-3.5 py-2 text-xs text-[var(--color-chalk-dim)] transition hover:border-[var(--color-strand)] hover:text-[var(--color-chalk)] disabled:opacity-40"
                >
                  {running ? <Loader2 size={12} className="inline animate-spin" aria-hidden /> : null} Run
                </button>
              </div>

              <p className="mt-3 border-l-2 border-l-[var(--color-web-line-bright)] pl-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
                {s.claim}
              </p>

              {errors[s.key] && (
                <p className="mt-3 text-[0.6875rem] text-[var(--color-strand)]">{errors[s.key]}</p>
              )}

              {result && (
                <div className="mt-4 border-t border-[var(--color-web-line)] pt-4">
                  <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="web-label">Verdict</p>
                      <div className="mt-1">
                        <StateChip state={result.observed.verdict} />
                      </div>
                    </div>
                    <div>
                      <p className="web-label">Risk</p>
                      <p className="web-strand mt-1.5">
                        {result.observed.riskScore.toFixed(1)}
                        <span className="text-[0.625rem] text-[var(--color-chalk-faint)]">
                          {" "}
                          (struct {result.observed.structuralPoints.toFixed(0)} / behav{" "}
                          {result.observed.behaviouralPoints.toFixed(0)})
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="web-label">Confidence</p>
                      <p className="web-strand mt-1.5">{(result.observed.confidence * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="web-label">Account baseline says</p>
                      <p className="web-strand mt-1.5 text-[0.6875rem]">
                        flags {result.observed.baselineFlaggedAccounts} of {result.observed.accountCount}
                      </p>
                    </div>
                  </div>

                  {result.observed.requiresReview && (
                    <p className="mt-3 text-[0.6875rem] text-[var(--color-state-unknown)]">
                      Routed to a person: {result.observed.reviewReason}
                    </p>
                  )}
                  {result.observed.cappedByGuardrail && (
                    <p className="mt-2 text-[0.6875rem] text-[var(--color-state-clear)]">
                      Score capped by the structural-only guardrail. Shared infrastructure alone
                      cannot reach the detection threshold.
                    </p>
                  )}
                  {result.observed.injectionFindings > 0 && (
                    <p className="mt-2 text-[0.6875rem] text-[var(--color-state-possible)]">
                      {result.observed.injectionFindings} injected instruction span(s) quarantined. The
                      injection asked for a zero score and no review; it got neither.
                    </p>
                  )}

                  {result.assessment && result.assessment.signals.filter((x) => x.points > 0.05).length > 0 && (
                    <details className="mt-3">
                      <summary className="web-label cursor-pointer select-none">
                        Signal breakdown
                      </summary>
                      <ul className="mt-2">
                        {result.assessment.signals
                          .filter((x) => x.points > 0.05)
                          .map((x) => (
                            <SignalRow
                              key={x.signal}
                              label={x.label}
                              points={x.points}
                              maxPoints={x.maxPoints}
                              observation={x.observation}
                            />
                          ))}
                      </ul>
                    </details>
                  )}

                  {result.deviations.length > 0 && (
                    <ul className="mt-3 space-y-1">
                      {result.deviations.map((d, i) => (
                        <li key={i} className="text-[0.6875rem] text-[var(--color-strand)]">
                          DEVIATION &mdash; {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
