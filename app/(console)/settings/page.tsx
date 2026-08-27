import { currentDriver } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { environmentStatus } from "@/shared/env";
import { MAX_ACCOUNTS_PER_INFRA_NODE } from "@/graph/builder";
import { POPULATION } from "@/detection/features";
import { DEFAULT_BASELINE_THRESHOLDS } from "@/detection/baseline";
import { Heading, Panel } from "@/ui/primitives";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureBootstrapped();
  const driver = await currentDriver();
  const env = environmentStatus();

  return (
    <>
      <Heading kicker="Check the detector">Settings</Heading>

      {!env.auth.required && (
        <div className="mb-6 border-l-2 border-l-[var(--color-state-possible)] bg-[var(--color-web-raised)] px-4 py-3">
          <p className="web-label text-[var(--color-state-possible)]">Authentication is disabled</p>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-chalk-dim)]">
            <span className="web-strand">API_TOKEN</span> is unset, so mutating endpoints accept
            unauthenticated requests. That is the intended default for a local clone and is stated
            here rather than left to be discovered. A graph of who is connected to whom is exactly
            the kind of artefact that should not be readable by anyone who finds the URL.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Sentinel mode">
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="web-label">Mode</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{env.sentinelMode}</dd>
            </div>
            <div>
              <dt className="web-label">Can block a customer</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-state-clear)]">NO &mdash; structurally</dd>
            </div>
            <div>
              <dt className="web-label">Can deny a refund</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-state-clear)]">NO &mdash; structurally</dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            The environment parser refuses BLOCK, ENFORCE, AUTO_BLOCK, SUSPEND, LIVE, PRODUCTION and
            PROD by name and the process will not start with any of them. A misconfigured deployment
            fails to boot rather than quietly acting against customers on the strength of a graph
            score.
          </p>
        </Panel>

        <Panel title="Database">
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="web-label">Driver</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{driver}</dd>
            </div>
            <div>
              <dt className="web-label">Target</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{env.database.target}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            PostgreSQL is the system of record for the graph; clustering runs in memory. PGlite is
            PostgreSQL compiled to WASM &mdash; the same SQL, the same migrations, the same jsonb and
            index semantics &mdash; so the system runs end to end with no infrastructure while
            remaining one environment variable away from a real server.
          </p>
        </Panel>

        <Panel title="Detection thresholds">
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="web-label">Risk threshold</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{env.thresholds.risk} / 100</dd>
            </div>
            <div>
              <dt className="web-label">Confidence threshold</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{env.thresholds.confidence}</dd>
            </div>
            <div>
              <dt className="web-label">Minimum cluster size</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">
                {env.thresholds.minClusterAccounts} accounts
              </dd>
            </div>
            <div>
              <dt className="web-label">Minimum events per account</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">
                {env.thresholds.minEventsPerAccount}
              </dd>
            </div>
            <div>
              <dt className="web-label">Max accounts per shared node</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{MAX_ACCOUNTS_PER_INFRA_NODE}</dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            A node touched by more accounts than the cap is skipped entirely. A device seen by 400
            accounts is a default value or a shared network egress, not a family tablet, and
            connecting those accounts pairwise would produce 79,800 edges and one meaningless
            mega-cluster.
          </p>
        </Panel>

        <Panel title="Population baselines">
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="web-label">Median return rate</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">
                {(POPULATION.returnRate * 100).toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="web-label">Clearly atypical return rate</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">
                {(POPULATION.returnRateHigh * 100).toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="web-label">Baseline account threshold</dt>
              <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">
                {(DEFAULT_BASELINE_THRESHOLDS.returnRate * 100).toFixed(0)}% return rate
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            These decide what &ldquo;unusually high&rdquo; means. They describe the synthetic corpus
            and would need re-deriving from real data before production use &mdash; a threshold
            calibrated to the wrong population is how a detector starts flagging ordinary customers.
          </p>
        </Panel>
      </div>

      <Panel title="Explanation model" className="mt-5">
        <dl className="grid gap-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="web-label">Provider</dt>
            <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{env.model.provider}</dd>
          </div>
          <div>
            <dt className="web-label">Enabled</dt>
            <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{env.model.enabled ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="web-label">API key</dt>
            <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">
              {env.model.apiKeyPresent ? "present" : "absent"}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
          Role: {env.model.role}. An explanation naming a signal the detector never computed, or
          containing verdict language, is discarded entirely and the deterministic explanation is
          used instead. The deterministic one is generated first on every cluster, so the model is an
          upgrade to a working output rather than a dependency of one.
        </p>
      </Panel>

      <Panel title="API" className="mt-5">
        <ul className="space-y-2 text-xs">
          {[
            ["GET", "/api/health", "Liveness, driver and environment. Returns 503 when the database is unreachable."],
            ["GET", "/api/overview", "Board metrics with denominators."],
            ["GET", "/api/clusters", "Detected clusters, filterable by verdict and risk."],
            ["GET", "/api/clusters/:id/graph", "The subgraph: nodes, inferred links and the observations beneath them."],
            ["GET", "/api/clusters/:id/timeline", "Orders, returns and refunds across the cluster."],
            ["POST", "/api/detect", "Rebuild the graph, cluster, score, open reviews."],
            ["POST", "/api/evaluate", "Ring and account metrics, hard negatives, coordination recovery."],
            ["GET", "/api/evaluations", "Stored evaluation runs."],
            ["GET", "/api/audit", "Append-only audit query."],
            ["GET", "/api/reviews", "Review queue, agreement rate and accepted benign explanations."],
            ["POST", "/api/reviews/:id", "Record a decision. Dismissal requires a benign explanation."],
            ["POST", "/api/demo/:scenario", "Run one scenario through the real pipeline."],
            ["GET", "/api/failures", "Failure taxonomy derived from audit events."],
            ["POST", "/api/explain", "Free-text question surface. Refuses evasion requests."],
            ["POST", "/api/enforce", "Refuses, with a reason, and audits the attempt."],
          ].map(([method, path, description]) => (
            <li key={path} className="flex gap-3">
              <span className="web-strand w-14 shrink-0 text-[0.625rem] text-[var(--color-strand)]">{method}</span>
              <span className="web-strand w-64 shrink-0 text-[0.6875rem] text-[var(--color-chalk)]">{path}</span>
              <span className="leading-relaxed text-[var(--color-chalk-dim)]">{description}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
