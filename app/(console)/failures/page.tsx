import { failureSummary } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { Empty, Heading, Panel, Relative } from "@/ui/primitives";

export const dynamic = "force-dynamic";

export default async function FailuresPage() {
  await ensureBootstrapped();
  const db = await getDb();
  const summary = await failureSummary(db);
  const categories = Object.entries(summary.categories);

  return (
    <>
      <Heading kicker="Check the detector">Failure modes</Heading>

      <p className="mb-6 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-dim)]">
        Every failure path here reduces what the system claims or routes the decision to a person.
        None of them defaults to a detection. The counts are actual audit events from this instance -
        a category showing zero has genuinely not occurred, not been hidden.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {categories.map(([key, c]) => (
          <article
            key={key}
            className="web-panel web-clip p-5"
            style={{
              borderLeft: `2px solid ${
                c.count === 0
                  ? "var(--color-web-line)"
                  : c.severity === "warning"
                    ? "var(--color-state-possible)"
                    : c.severity === "notice"
                      ? "var(--color-state-unknown)"
                      : "var(--color-node)"
              }`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="web-strand text-xs font-semibold text-[var(--color-chalk)]">
                {key.replace(/_/g, " ")}
              </h3>
              <span
                className={`web-strand text-lg ${c.count === 0 ? "text-[var(--color-chalk-faint)]" : "text-[var(--color-chalk)]"}`}
              >
                {c.count}
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--color-chalk-dim)]">{c.description}</p>
            <p className="mt-2 border-t border-[var(--color-web-line)] pt-2 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
              <span className="web-label">What the system did</span>
              <br />
              {c.handledBy}
            </p>
          </article>
        ))}
      </div>

      <Panel title="Recent failure and block events" className="mt-6">
        {summary.recent.length === 0 ? (
          <Empty
            title="No failure or block events recorded on this instance."
            detail="Run the demo scenarios to exercise the guardrail and injection paths, or POST to /api/enforce to see the enforcement refusal audited."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="web-table">
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
                    <td className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">{e.sequence}</td>
                    <td className="web-strand text-xs text-[var(--color-chalk)]">{e.action}</td>
                    <td className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">{e.objectId}</td>
                    <td>
                      <span
                        className={`web-stamp ${
                          e.result === "BLOCKED"
                            ? "text-[var(--color-strand)]"
                            : "text-[var(--color-state-possible)]"
                        }`}
                      >
                        {e.result}
                      </span>
                    </td>
                    <td className="text-[0.6875rem] text-[var(--color-chalk-dim)]">{e.severity}</td>
                    <td>
                      <Relative iso={e.timestamp} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
