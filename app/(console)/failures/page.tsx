import { failureSummary } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { Empty, Heading, Relative, Sheet } from "@/ui/primitives";

export const dynamic = "force-dynamic";

export default async function FailuresPage() {
  await ensureBootstrapped();
  const db = await getDb();
  const summary = await failureSummary(db);
  const categories = Object.entries(summary.categories);

  const edge = (count: number, severity: string) =>
    count === 0
      ? "var(--rule)"
      : severity === "warning"
        ? "var(--ink-y)"
        : severity === "notice"
          ? "var(--ink-b)"
          : "var(--ink-c)";

  return (
    <>
      <Heading kicker="Check the detector">Failure modes</Heading>

      <p className="note mb-6 max-w-3xl">
        Every failure path here reduces what the system claims or routes the decision to a person.
        None of them defaults to a detection. The counts are actual audit events from this instance -
        a category showing zero has genuinely not occurred, not been hidden.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {categories.map(([key, c]) => (
          <article
            key={key}
            className="sheet p-5"
            style={{ borderLeft: `3px solid ${edge(c.count, c.severity)}` }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="mono text-xs font-medium t-ink">{key.replace(/_/g, " ")}</h3>
              <span className={`num shrink-0 text-lg ${c.count === 0 ? "t-3" : "t-ink"}`}>{c.count}</span>
            </div>
            <p className="note mt-2">{c.description}</p>
            <div className="rule-x mt-3 pt-2">
              <p className="cap">What the system did</p>
              <p className="note-s mt-0.5">{c.handledBy}</p>
            </div>
          </article>
        ))}
      </div>

      <Sheet title="Recent failure and block events" className="mt-6">
        {summary.recent.length === 0 ? (
          <Empty
            title="No failure or block events recorded on this instance."
            detail="Run the demo scenarios to exercise the guardrail and injection paths, or POST to /api/enforce to see the enforcement refusal audited."
          />
        ) : (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Action</th>
                  <th>Object</th>
                  <th>Result</th>
                  <th>Severity</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {summary.recent.map((e) => (
                  <tr key={e.id}>
                    <td className="num text-[0.625rem] t-3">{e.sequence}</td>
                    <td className="mono text-xs t-ink">{e.action}</td>
                    <td className="id t-3">{e.objectId}</td>
                    <td>
                      <span className={`tag ${e.result === "BLOCKED" ? "tag-m" : "tag-y"}`}>{e.result}</span>
                    </td>
                    <td className="note-s">{e.severity}</td>
                    <td>
                      <Relative iso={e.timestamp} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Sheet>
    </>
  );
}
