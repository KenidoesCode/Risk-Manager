import { MAX_POINTS, SIGNAL_WEIGHTS } from "@/scoring/risk";
import {
  COUNTER_SIGNAL_LABELS,
  LINK_RATIONALE,
  LINK_STRENGTH,
  LINKING_TYPES,
  VERDICT_DESCRIPTIONS,
  CLUSTER_VERDICTS,
} from "@/domain/vocabulary";
import { Heading, Sheet } from "@/ui/primitives";

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
  const concentration = new Set(["CATEGORY_CONCENTRATION", "VALUE_CONCENTRATION"]);

  const plate = (signal: string) =>
    structural.has(signal)
      ? { tag: "tag-c", name: "structural", fill: "var(--ink-c)" }
      : concentration.has(signal)
        ? { tag: "tag-y", name: "concentration", fill: "var(--ink-y)" }
        : { tag: "tag-m", name: "behavioural", fill: "var(--ink-m)" };

  return (
    <>
      <Heading kicker="Check the detector">Signal reference</Heading>

      <p className="capbox mb-7 max-w-3xl">
        Every point of every risk score comes from this table. There is no model output in it, no
        learned weight, and nothing that cannot be recomputed by hand from the observations on a
        cluster detail page. The plate column is the film a signal prints on in the overlay stack:
        cyan for structure, magenta for behaviour, yellow for concentration.
      </p>

      <Sheet title="Signal weights" subtitle={`Total available: ${MAX_POINTS} points`}>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Plate</th>
                <th>Max points</th>
                <th>Share</th>
                <th>Why it is weighted this way</th>
              </tr>
            </thead>
            <tbody className="stagger">
              {SIGNAL_WEIGHTS.map((w) => {
                const p = plate(w.signal);
                return (
                  <tr key={w.signal}>
                    <td className="text-xs font-semibold t-ink">{w.signal.replace(/_/g, " ")}</td>
                    <td>
                      <span className={`tag ${p.tag}`}>{p.name}</span>
                    </td>
                    <td className="num text-xs">{w.maxPoints}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="meter w-20 shrink-0">
                          <span
                            style={{ width: `${(w.maxPoints / MAX_POINTS) * 100}%`, background: p.fill }}
                          />
                        </div>
                        <span className="num text-[0.625rem] t-3">
                          {Math.round((w.maxPoints / MAX_POINTS) * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="note-s max-w-md">{w.rationale}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Sheet>

      <Sheet title="The structural-only guardrail" className="mt-5">
        <p className="note max-w-3xl">
          Structural signals are worth 34 of the 100 available points. Even saturated, they cannot
          reach the detection threshold on their own — and when behavioural evidence contributes
          fewer than 8 points, the score is explicitly capped below the threshold regardless.
        </p>
        <p className="note mt-3 max-w-3xl">
          This is the control that stops the system being an expensive graph visualisation of an
          ordinary household. A family shares an address, a tablet and a card; without unusual
          behaviour alongside that, no combination of structure produces a detection. Every time the
          cap fires it is written to the audit trail as GUARDRAIL_APPLIED, so the reader can see how
          often the system protected a household rather than flagging one.
        </p>
        <p className="note mt-3 max-w-3xl">
          In the language of the overlay stack: a cyan-only stack, however dense the cyan, is still
          one plate. It cannot make black.
        </p>
      </Sheet>

      <Sheet title="Link strength by shared node type" className="mt-5">
        <div className="space-y-4">
          {LINKING_TYPES.map((type) => (
            <div key={type}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold t-ink">{type}</span>
                <span className="num shrink-0 text-xs t-2">{LINK_STRENGTH[type].toFixed(2)}</span>
              </div>
              <div className="meter mt-1.5">
                <span style={{ width: `${LINK_STRENGTH[type] * 100}%`, background: "var(--ink-c)" }} />
              </div>
              <p className="note-s mt-1.5">{LINK_RATIONALE[type]}</p>
            </div>
          ))}
        </div>
        <p className="note-s rule-x mt-4 max-w-3xl pt-3">
          These weights are further multiplied by a temporal factor. A device used by two accounts a
          year apart is much more likely a resold handset than two people acting together, and the
          link weight decays to a floor of 0.25 as the gap approaches a year.
        </p>
      </Sheet>

      <Sheet
        title="Counter-signals"
        className="mt-5"
        subtitle="Legitimate readings the detector looks for on every cluster. Each one it finds subtracts an equal 0.06 from confidence."
      >
        <ul className="space-y-2">
          {Object.entries(COUNTER_SIGNAL_LABELS).map(([key, label]) => (
            <li key={key} className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="mono w-56 shrink-0 text-[0.625rem] t-3">{key}</span>
              <span className="note">{label}</span>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet title="Verdicts" className="mt-5">
        <dl className="space-y-3">
          {CLUSTER_VERDICTS.map((v) => (
            <div key={v}>
              <dt className="mono text-[0.6875rem] font-medium t-ink">{v}</dt>
              <dd className="note mt-0.5 max-w-3xl">{VERDICT_DESCRIPTIONS[v]}</dd>
            </div>
          ))}
        </dl>
        <p className="note-s rule-x mt-4 max-w-3xl pt-3">
          Note what is absent from this list: there is no verdict meaning fraud, guilt, or a decision
          about a person. The strongest thing this system says is that coordination is likely and a
          human should look.
        </p>
      </Sheet>
    </>
  );
}
