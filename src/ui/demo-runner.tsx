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
          className="btn inline-flex items-center gap-2"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <PlayCircle size={13} aria-hidden />}
          Run every scenario
        </button>
        {completed > 0 && (
          <span className="num text-xs t-2">{passing}/{completed} behaved as specified</span>
        )}
      </div>

      <div className="space-y-4">
        {scenarios.map((s) => {
          const result = results[s.key];
          const running = busy === s.key;
          return (
            <article key={s.key} className="sheet p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold t-ink">{s.title}</h3>
                    {result &&
                      (result.behavedAsSpecified ? (
                        <span className="inline-flex items-center gap-1 text-[0.6875rem] t-g">
                          <CheckCircle2 size={12} aria-hidden /> AS SPECIFIED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[0.6875rem] t-m">
                          <XCircle size={12} aria-hidden /> DEVIATED
                        </span>
                      ))}
                  </div>
                  <p className="note mt-1.5 max-w-2xl">{s.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => run(s.key)}
                  disabled={busy !== null}
                  className="btn btn-ghost shrink-0"
                >
                  {running ? <Loader2 size={12} className="inline animate-spin" aria-hidden /> : null} Run
                </button>
              </div>

              <p className="note-s mt-3 border-l-2 border-l-[var(--rule)] pl-3">{s.claim}</p>

              {errors[s.key] && (
                <p className="note-s mt-3 t-m">{errors[s.key]}</p>
              )}

              {result && (
                <div className="rule-x mt-4 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="cap">Verdict</p>
                      <div className="mt-1">
                        <StateChip state={result.observed.verdict} />
                      </div>
                    </div>
                    <div>
                      <p className="cap">Risk</p>
                      <p className="num mt-1.5 text-sm">
                        {result.observed.riskScore.toFixed(1)}
                        <span className="text-[0.625rem] t-3">
                          {" "}
                          (struct {result.observed.structuralPoints.toFixed(0)} / behav{" "}
                          {result.observed.behaviouralPoints.toFixed(0)})
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="cap">Confidence</p>
                      <p className="num mt-1.5 text-sm">{(result.observed.confidence * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="cap">Account baseline says</p>
                      <p className="num mt-1.5 text-[0.6875rem]">
                        flags {result.observed.baselineFlaggedAccounts} of {result.observed.accountCount}
                      </p>
                    </div>
                  </div>

                  {result.observed.requiresReview && (
                    <p className="note-s mt-3 t-b">Routed to a person: {result.observed.reviewReason}</p>
                  )}
                  {result.observed.cappedByGuardrail && (
                    <p className="note-s mt-2 t-g">
                      Score capped by the structural-only guardrail. Shared infrastructure alone
                      cannot reach the detection threshold.
                    </p>
                  )}
                  {result.observed.injectionFindings > 0 && (
                    <p className="note-s mt-2 t-y">
                      {result.observed.injectionFindings} injected instruction span(s) quarantined. The
                      injection asked for a zero score and no review; it got neither.
                    </p>
                  )}

                  {result.assessment && result.assessment.signals.filter((x) => x.points > 0.05).length > 0 && (
                    <details className="mt-3">
                      <summary className="cap cursor-pointer select-none">Signal breakdown</summary>
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
                        <li key={i} className="note-s t-m">DEVIATION &mdash; {d}</li>
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
