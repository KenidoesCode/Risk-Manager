import { DEMO_SCENARIOS, SCENARIO_SPECS } from "@/demo/scenarios";
import { Heading, Panel } from "@/ui/primitives";
import { DemoRunner } from "@/ui/demo-runner";

export const dynamic = "force-dynamic";

export default function DemoPage() {
  const scenarios = DEMO_SCENARIOS.map((key) => ({
    key,
    title: SCENARIO_SPECS[key].title,
    description: SCENARIO_SPECS[key].description,
    claim: SCENARIO_SPECS[key].expectation.claim,
  }));

  return (
    <>
      <Heading kicker="Work">Scenarios</Heading>

      <p className="mb-6 max-w-3xl text-xs leading-relaxed text-[var(--color-chalk-dim)]">
        Each scenario builds a small isolated graph and runs it through the same clustering, feature
        and scoring code a detection run uses. The outcome is checked against a stated expectation on
        the server. A scenario whose expectation stops holding reports DEVIATED here and fails{" "}
        <span className="web-strand">npm run demo</span> &mdash; it is a gate, not a slideshow.
      </p>

      <DemoRunner scenarios={scenarios} />

      <Panel title="The two that matter most" className="mt-6">
        <p className="text-xs leading-relaxed text-[var(--color-chalk-dim)]">
          <strong className="text-[var(--color-chalk)]">Legitimate household</strong> gives the system
          every structural signal a ring has &mdash; four accounts, one address, two shared devices
          and one shared card &mdash; with ordinary return behaviour spread across a year and eight
          product categories. It must not be flagged. A detector that fails this one is an automated
          accusation machine pointed at people who live together, and it would score beautifully on
          any evaluation that did not include the case.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-chalk-dim)]">
          <strong className="text-[var(--color-chalk)]">Isolated high returner</strong> is one account
          returning 80% of its orders with no linkage to anyone. The account baseline flags it and the
          graph reports no coordination. Both are correct: they are answering different questions, and
          the graph declining to invent a ring around a single account is exactly the behaviour a
          coordination detector should have.
        </p>
      </Panel>
    </>
  );
}
