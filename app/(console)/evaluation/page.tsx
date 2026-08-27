import { evaluationList } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { getEnv } from "@/shared/env";
import type {
  CoordinationRecovery,
  HardNegativeMetric,
  PerformanceMetrics,
  RateWithDenominator,
  Slice,
  ThresholdOption,
} from "@/evaluation/metrics";
import { Empty, Heading, Metric, Panel, StateChip } from "@/ui/primitives";

export const dynamic = "force-dynamic";

interface StoredMetrics {
  ring: PerformanceMetrics;
  account: PerformanceMetrics;
  baselineRing: PerformanceMetrics | null;
  byTemplate: Slice[];
  byDifficulty: Slice[];
  overlapDistribution: { mean: number | null; min: number | null; below: number };
  datasetVersion: string;
  generatorVersion: string;
  seed: number;
  explainerConfigured: boolean;
  clustersFound: number;
}

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(1)}%`;

const ratio = (r: RateWithDenominator | undefined) =>
  r ? `${pct(r.value)} (${r.numerator}/${r.denominator})` : "—";

export default async function EvaluationPage() {
  await ensureBootstrapped();
  const db = await getDb();
  const runs = await evaluationList(db, 20);
  const env = getEnv();

  if (runs.length === 0) {
    return (
      <>
        <Heading kicker="Check the detector">Evaluation</Heading>
        <Empty
          title="No evaluation has been run."
          detail="Run `npm run evaluate` (or POST /api/evaluate) to select a threshold on the dev split and measure on held-out. Nothing is displayed here until a harness has actually produced numbers — there are no placeholder metrics."
        />
      </>
    );
  }

  const latest = runs[0];
  const metrics = latest?.metrics as unknown as StoredMetrics;
  const hardNegatives = (latest?.hardNegativeMetrics ?? []) as unknown as HardNegativeMetric[];
  const sweep = latest?.thresholdSweep as unknown as {
    options: ThresholdOption[];
    recommended: ThresholdOption | null;
    costs: Record<string, number>;
  } | null;
  const recovery = latest?.coordinationRecovery as unknown as CoordinationRecovery | null;

  return (
    <>
      <Heading kicker="Check the detector">Evaluation</Heading>

      <div className="mb-6 flex flex-wrap gap-2 text-[0.6875rem]">
        {[
          ["dataset", metrics?.datasetVersion],
          ["generator", metrics?.generatorVersion],
          ["seed", String(metrics?.seed ?? "—")],
          ["split", latest?.split],
          ["risk threshold", String(latest?.riskThreshold ?? "—")],
          ["rings", String(latest?.ringCount ?? 0)],
          ["accounts", String(latest?.accountCount ?? 0)],
          ["run at", latest?.finishedAt ?? "—"],
        ].map(([k, v]) => (
          <span key={k as string} className="border border-[var(--color-web-line)] px-2.5 py-1">
            <span className="web-label">{k}</span>{" "}
            <span className="web-strand text-[var(--color-chalk-dim)]">{v as string}</span>
          </span>
        ))}
      </div>

      {metrics?.ring && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Ring precision"
            value={pct(metrics.ring.precision.value)}
            denominator={`${metrics.ring.precision.numerator}/${metrics.ring.precision.denominator}`}
            hint="Of the groups flagged, how many were labelled suspicious."
          />
          <Metric
            label="Ring recall"
            value={pct(metrics.ring.recall.value)}
            denominator={`${metrics.ring.recall.numerator}/${metrics.ring.recall.denominator}`}
            hint="Of the suspicious rings, how many were found."
          />
          <Metric
            label="Household false positives"
            value={metrics.ring.confusion.fp}
            tone={metrics.ring.confusion.fp === 0 ? "clear" : "strand"}
            hint="Benign groups flagged. Every one of these is a household investigated for living together."
          />
          <Metric
            label="Abstention rate"
            value={pct(metrics.ring.abstentionRate.value)}
            denominator={`${metrics.ring.abstentionRate.numerator}/${metrics.ring.abstentionRate.denominator}`}
            tone="unknown"
            hint="Clusters reported as INSUFFICIENT_DATA rather than scored."
          />
        </div>
      )}

      {/* --------------------------------------------- COMPARISON --- */}
      <Panel
        title="Graph detector vs account baseline"
        subtitle="Both scored at ring level on the same rings, with the same denominators."
        className="mt-6"
      >
        <div className="overflow-x-auto">
          <table className="web-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Graph detector</th>
                <th>Account baseline (no graph features)</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Precision", (m: PerformanceMetrics) => ratio(m.precision)],
                  ["Recall", (m: PerformanceMetrics) => ratio(m.recall)],
                  ["F1", (m: PerformanceMetrics) => (m.f1 === null ? "—" : m.f1.toFixed(4))],
                  ["False-positive rate", (m: PerformanceMetrics) => ratio(m.falsePositiveRate)],
                  ["False-negative rate", (m: PerformanceMetrics) => ratio(m.falseNegativeRate)],
                  ["False positives (count)", (m: PerformanceMetrics) => String(m.confusion.fp)],
                ] as Array<[string, (m: PerformanceMetrics) => string]>
              ).map(([label, fn]) => (
                <tr key={label}>
                  <td className="text-xs text-[var(--color-chalk-dim)]">{label}</td>
                  <td className="web-strand text-xs text-[var(--color-chalk)]">
                    {metrics?.ring ? fn(metrics.ring) : "—"}
                  </td>
                  <td className="web-strand text-xs text-[var(--color-chalk-dim)]">
                    {metrics?.baselineRing ? fn(metrics.baselineRing) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-faint)]">
          The baseline is tuned on the same split with the same cost ratio, so this compares two
          tuned detectors rather than a tuned one against a straw man. Where the baseline wins, this
          table says so.
        </p>
      </Panel>

      {/* ------------------------------------------------ RECOVERY -- */}
      {recovery && (
        <Panel
          title="Coordination recovery"
          subtitle="The product's central claim, measured — and able to falsify it."
          className="mt-5"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="web-label">Suspicious rings</p>
              <p className="web-strand mt-1 text-lg">{recovery.suspiciousRings}</p>
            </div>
            <div>
              <p className="web-label">Missed by the baseline</p>
              <p className="web-strand mt-1 text-lg">{recovery.baselineMissed}</p>
            </div>
            <div>
              <p className="web-label">Recovered by the graph</p>
              <p className="web-strand mt-1 text-lg text-[var(--color-strand)]">{recovery.graphRecovered}</p>
            </div>
            <div>
              <p className="web-label">Recovery rate</p>
              <p className="web-strand mt-1 text-lg">{ratio(recovery.recoveryRate)}</p>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-[var(--color-chalk-dim)]">
            {recovery.baselineMissed === 0
              ? "The account baseline caught every suspicious ring in this split, so there was nothing for the graph to recover. That is an honest negative result for the recall half of the thesis — and the comparison table above shows where the graph earns its place instead: on precision, and specifically on not flagging households."
              : `Of the ${recovery.baselineMissed} ring(s) the account baseline missed, the graph found ${recovery.graphRecovered}.`}
          </p>

          <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            Reported alongside, because a recovery rate quoted without the cases going the other way
            is a half-truth: the graph missed{" "}
            <span className="web-strand">{recovery.graphMissedBaselineCaught}</span> ring(s) that the
            baseline caught.
          </p>

          {recovery.byTemplate.length > 0 && (
            <table className="web-table mt-4">
              <thead>
                <tr>
                  <th>Template the baseline missed</th>
                  <th>Missed</th>
                  <th>Recovered</th>
                </tr>
              </thead>
              <tbody>
                {recovery.byTemplate.map((t) => (
                  <tr key={t.template}>
                    <td className="text-xs text-[var(--color-chalk-dim)]">{t.template.replace(/_/g, " ")}</td>
                    <td className="web-strand text-xs">{t.missed}</td>
                    <td className="web-strand text-xs text-[var(--color-strand)]">{t.recovered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {/* ------------------------------------------ HARD NEGATIVES -- */}
      <Panel
        title="Hard negatives, per template"
        subtitle="Never averaged into one figure — an aggregate 4% can hide 30% on families."
        className="mt-5"
      >
        {hardNegatives.length === 0 ? (
          <Empty title="No benign groups in this split." />
        ) : (
          <div className="overflow-x-auto">
            <table className="web-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Groups</th>
                  <th>False positives</th>
                  <th>Rate</th>
                  <th>Mean risk</th>
                  <th>What this is</th>
                </tr>
              </thead>
              <tbody>
                {hardNegatives.map((h) => (
                  <tr key={h.template}>
                    <td className="text-xs font-medium text-[var(--color-chalk)]">
                      {h.template.replace(/_/g, " ")}
                    </td>
                    <td className="web-strand text-xs">{h.groups}</td>
                    <td
                      className={`web-strand text-xs ${h.falsePositives > 0 ? "text-[var(--color-strand)]" : "text-[var(--color-state-clear)]"}`}
                    >
                      {h.falsePositives}
                    </td>
                    <td className="web-strand text-xs">{ratio(h.falsePositiveRate)}</td>
                    <td className="web-strand text-xs text-[var(--color-chalk-dim)]">{h.meanRisk ?? "—"}</td>
                    <td className="max-w-sm text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
                      {h.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ----------------------------------------------- THRESHOLD -- */}
      {sweep && (
        <Panel
          title="Threshold sweep on held-out — diagnostic only"
          subtitle="The operating threshold came from the dev split. Taking the best row here would be fitting to the test set."
          className="mt-5"
        >
          <p className="mb-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            A false positive costs analyst time plus something this system cannot price: a household
            investigated for living together. The default ratio is{" "}
            <span className="web-strand">
              FP {sweep.costs.falsePositive} : FN {sweep.costs.falseNegative}
            </span>
            , weighted toward avoiding the false positive for that reason, and configurable because a
            business&rsquo;s real trade-off is not this system&rsquo;s to assume.
          </p>
          <div className="overflow-x-auto">
            <table className="web-table">
              <thead>
                <tr>
                  <th>Risk</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>FP</th>
                  <th>FN</th>
                  <th>Household FP</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {sweep.options.map((o) => {
                  const chosen = latest?.riskThreshold === o.threshold;
                  return (
                    <tr
                      key={o.threshold}
                      className={chosen ? "bg-[color-mix(in_oklab,var(--color-strand)_10%,transparent)]" : ""}
                    >
                      <td className="web-strand text-xs">
                        {o.threshold}
                        {chosen && <span className="ml-1.5 text-[var(--color-strand)]">◆ operating</span>}
                      </td>
                      <td className="web-strand text-xs">{pct(o.metrics.precision.value)}</td>
                      <td className="web-strand text-xs">{pct(o.metrics.recall.value)}</td>
                      <td className="web-strand text-xs">{o.metrics.confusion.fp}</td>
                      <td className="web-strand text-xs">{o.metrics.confusion.fn}</td>
                      <td
                        className={`web-strand text-xs ${o.householdFalsePositives > 0 ? "text-[var(--color-strand)]" : "text-[var(--color-chalk-dim)]"}`}
                      >
                        {o.householdFalsePositives}
                      </td>
                      <td className="web-strand text-xs">{o.totalCost}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* -------------------------------------------------- SLICES -- */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="By difficulty">
          <table className="web-table">
            <thead>
              <tr>
                <th>Difficulty</th>
                <th>n</th>
                <th>Precision</th>
                <th>Recall</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.byDifficulty ?? []).map((s) => (
                <tr key={s.key}>
                  <td>
                    <StateChip state={s.key} />
                  </td>
                  <td className="web-strand text-xs">{s.count}</td>
                  <td className="web-strand text-xs">{pct(s.metrics.precision.value)}</td>
                  <td className="web-strand text-xs">{pct(s.metrics.recall.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            Difficulty is class convergence: at ADVERSARIAL a ring&rsquo;s behaviour is pulled 88% of
            the way toward an ordinary household&rsquo;s and a household&rsquo;s 60% toward a
            ring&rsquo;s, so the classes genuinely overlap.
          </p>
        </Panel>

        <Panel title="Match quality" subtitle="How cleanly detected clusters mapped onto labelled rings.">
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="web-label">Mean member overlap</dt>
              <dd className="web-strand mt-0.5 text-lg text-[var(--color-chalk)]">
                {metrics?.overlapDistribution?.mean ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="web-label">Minimum overlap among matched</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">
                {metrics?.overlapDistribution?.min ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="web-label">Rings with no cluster above the 0.3 floor</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">
                {metrics?.overlapDistribution?.below ?? "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            A ring is matched to the detected cluster with the highest Jaccard overlap of member
            accounts. Scoring only exact matches would report near-zero recall on a working detector;
            crediting any overlap at all would reward one that swept the whole graph into a single
            cluster. The distribution is published so the reader can judge the matching rather than
            take the headline number on trust.
          </p>
        </Panel>
      </div>

      {!metrics?.explainerConfigured && (
        <Panel title="Explainer" className="mt-5">
          <p className="text-xs leading-relaxed text-[var(--color-chalk-dim)]">
            No model provider is configured ({env.LLM_PROVIDER}). Every number on this page is
            deterministic. The explainer writes prose only and cannot affect a score, a cluster or a
            verdict, so its absence changes no metric here — which is the point of confining it to
            that role.
          </p>
        </Panel>
      )}

      <Panel title="All runs" className="mt-5">
        <table className="web-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Label</th>
              <th>Split</th>
              <th>Rings</th>
              <th>Threshold</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">{r.id}</td>
                <td className="text-xs text-[var(--color-chalk-dim)]">{r.label}</td>
                <td className="web-strand text-xs">{r.split}</td>
                <td className="web-strand text-xs">{r.ringCount}</td>
                <td className="web-strand text-xs">{r.riskThreshold}</td>
                <td className="web-strand text-[0.6875rem] text-[var(--color-chalk-faint)]">
                  {r.finishedAt ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
