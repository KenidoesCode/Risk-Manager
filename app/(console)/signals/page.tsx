import { MAX_POINTS, SIGNAL_WEIGHTS } from "@/scoring/risk";
import {
  COUNTER_SIGNAL_LABELS,
  LINK_RATIONALE,
  LINK_STRENGTH,
  LINKING_TYPES,
  VERDICT_DESCRIPTIONS,
  CLUSTER_VERDICTS,
} from "@/domain/vocabulary";
import { Heading, Panel } from "@/ui/primitives";

export const dynamic = "force-static";

/**
 * The scoring rulebook, published in full.
 *
 * The risk score is a weighted sum over ten bounded features, so the entire
 * table can be shown. Someone told a cluster scored 87 deserves to see exactly
 * which signals that number is made of and what each one is worth - otherwise
 * the score is an assertion rather than an explanation, and this system's output
 * is a decision to investigate real people.
 */
export default function SignalsPage() {
  const structural = new Set(["SHARED_PAYMENT", "SHARED_DEVICE", "SHARED_ADDRESS", "CLUSTER_DENSITY"]);

  return (
    <>
      <Heading kicker="Work">Signal reference</Heading>

      <p className="mb-6 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-dim)]">
        Every point of every risk score comes from this table. There is no model output in it, no
        learned weight, and nothing that cannot be recomputed by hand from the observations on a
        cluster detail page.
      </p>

      <Panel title="Signal weights" subtitle={`Total available: ${MAX_POINTS} points`}>
        <div className="overflow-x-auto">
          <table className="web-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Kind</th>
                <th>Max points</th>
                <th>Share</th>
                <th>Why it is weighted this way</th>
              </tr>
            </thead>
            <tbody>
              {SIGNAL_WEIGHTS.map((w) => (
                <tr key={w.signal}>
                  <td className="text-xs font-medium text-[var(--color-chalk)]">
                    {w.signal.replace(/_/g, " ")}
                  </td>
                  <td>
                    <span
                      className={`web-stamp ${
                        structural.has(w.signal)
                          ? "text-[var(--color-node)]"
                          : "text-[var(--color-strand)]"
                      }`}
                    >
                      {structural.has(w.signal) ? "structural" : "behavioural"}
                    </span>
                  </td>
                  <td className="web-strand text-xs">{w.maxPoints}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="web-bar w-20">
                        <span
                          style={{
                            width: `${(w.maxPoints / MAX_POINTS) * 100}%`,
                            background: structural.has(w.signal)
                              ? "var(--color-node)"
                              : "var(--color-strand)",
                          }}
                        />
                      </div>
                      <span className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">
                        {Math.round((w.maxPoints / MAX_POINTS) * 100)}%
                      </span>
                    </div>
                  </td>
                  <td className="max-w-md text-[0.6875rem] leading-relaxed text-[var(--color-chalk-dim)]">
                    {w.rationale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="The structural-only guardrail" className="mt-5">
        <p className="text-xs leading-relaxed text-[var(--color-chalk-dim)]">
          Structural signals are worth 34 of the 100 available points. Even saturated, they cannot
          reach the detection threshold on their own — and when behavioural evidence contributes
          fewer than 8 points, the score is explicitly capped below the threshold regardless.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-chalk-dim)]">
          This is the control that stops the system being an expensive graph visualisation of an
          ordinary household. A family shares an address, a tablet and a card; without unusual
          behaviour alongside that, no combination of structure produces a detection. Every time the
          cap fires it is written to the audit trail as GUARDRAIL_APPLIED, so the reader can see how
          often the system protected a household rather than flagging one.
        </p>
      </Panel>

      <Panel title="Link strength by shared node type" className="mt-5">
        <div className="space-y-4">
          {LINKING_TYPES.map((type) => (
            <div key={type}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-[var(--color-chalk)]">{type}</span>
                <span className="web-strand text-xs text-[var(--color-chalk-dim)]">
                  {LINK_STRENGTH[type].toFixed(2)}
                </span>
              </div>
              <div className="web-bar mt-1.5">
                <span style={{ width: `${LINK_STRENGTH[type] * 100}%`, background: "var(--color-node)" }} />
              </div>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-dim)]">
                {LINK_RATIONALE[type]}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 border-t border-[var(--color-web-line)] pt-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
          These weights are further multiplied by a temporal factor. A device used by two accounts a
          year apart is much more likely a resold handset than two people acting together, and the
          link weight decays to a floor of 0.25 as the gap approaches a year.
        </p>
      </Panel>

      <Panel title="Counter-signals" className="mt-5" subtitle="Legitimate readings the detector looks for on every cluster.">
        <ul className="space-y-2 text-xs">
          {Object.entries(COUNTER_SIGNAL_LABELS).map(([key, label]) => (
            <li key={key} className="flex gap-3">
              <span className="web-strand w-56 shrink-0 text-[0.625rem] text-[var(--color-chalk-faint)]">
                {key}
              </span>
              <span className="text-[var(--color-chalk-dim)]">{label}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Verdicts" className="mt-5">
        <dl className="space-y-3 text-xs">
          {CLUSTER_VERDICTS.map((v) => (
            <div key={v}>
              <dt className="web-strand text-[0.6875rem] font-semibold text-[var(--color-chalk)]">{v}</dt>
              <dd className="mt-0.5 leading-relaxed text-[var(--color-chalk-dim)]">
                {VERDICT_DESCRIPTIONS[v]}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 border-t border-[var(--color-web-line)] pt-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
          Note what is absent from this list: there is no verdict meaning fraud, guilt, or a decision
          about a person. The strongest thing this system says is that coordination is likely and a
          human should look.
        </p>
      </Panel>
    </>
  );
}
