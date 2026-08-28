import { currentDriver } from "@/db/client";
import { ensureBootstrapped } from "@/db/bootstrap";
import { environmentStatus } from "@/shared/env";
import { MAX_ACCOUNTS_PER_INFRA_NODE } from "@/graph/builder";
import { POPULATION } from "@/detection/features";
import { DEFAULT_BASELINE_THRESHOLDS } from "@/detection/baseline";
import { Heading, Sheet } from "@/ui/primitives";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await ensureBootstrapped();
  const driver = await currentDriver();
  const env = environmentStatus();

  return (
    <>
      <Heading kicker="Check the detector">Settings</Heading>

      {!env.auth.required && (
        <div className="sheet mb-6 border-l-[3px] border-l-[var(--ink-y)] px-4 py-3">
          <p className="cap t-y">Authentication is disabled</p>
          <p className="note mt-1.5 max-w-3xl">
            <span className="mono">API_TOKEN</span> is unset, so mutating endpoints accept
            unauthenticated requests. That is the intended default for a local clone and is stated
            here rather than left to be discovered. A graph of who is connected to whom is exactly
            the kind of artefact that should not be readable by anyone who finds the URL.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Sheet title="Sentinel mode">
          <dl className="space-y-3">
            <div>
              <dt className="cap">Mode</dt>
              <dd className="num mt-0.5 text-sm t-ink">{env.sentinelMode}</dd>
            </div>
            <div>
              <dt className="cap">Can block a customer</dt>
              <dd className="num mt-0.5 text-sm t-g">NO &mdash; structurally</dd>
            </div>
            <div>
              <dt className="cap">Can deny a refund</dt>
              <dd className="num mt-0.5 text-sm t-g">NO &mdash; structurally</dd>
            </div>
          </dl>
          <p className="note-s mt-4 max-w-2xl">
            The environment parser refuses BLOCK, ENFORCE, AUTO_BLOCK, SUSPEND, LIVE, PRODUCTION and
            PROD by name and the process will not start with any of them. A misconfigured deployment
            fails to boot rather than quietly acting against customers on the strength of a graph
            score.
          </p>
        </Sheet>

        <Sheet title="Database">
          <dl className="space-y-3">
            <div>
              <dt className="cap">Driver</dt>
              <dd className="num mt-0.5 text-sm t-ink">{driver}</dd>
            </div>
            <div>
              <dt className="cap">Target</dt>
              <dd className="num mt-0.5 text-sm t-ink">{env.database.target}</dd>
            </div>
          </dl>
          <p className="note-s mt-4 max-w-2xl">
            PostgreSQL is the system of record for the graph; clustering runs in memory. PGlite is
            PostgreSQL compiled to WASM &mdash; the same SQL, the same migrations, the same jsonb and
            index semantics &mdash; so the system runs end to end with no infrastructure while
            remaining one environment variable away from a real server.
          </p>
        </Sheet>

        <Sheet title="Detection thresholds">
          <dl className="space-y-3">
            <div>
              <dt className="cap">Risk threshold</dt>
              <dd className="num mt-0.5 text-sm t-ink">{env.thresholds.risk} / 100</dd>
            </div>
            <div>
              <dt className="cap">Confidence threshold</dt>
              <dd className="num mt-0.5 text-sm t-ink">{env.thresholds.confidence}</dd>
            </div>
            <div>
              <dt className="cap">Minimum cluster size</dt>
              <dd className="num mt-0.5 text-sm t-ink">
                {env.thresholds.minClusterAccounts} accounts
              </dd>
            </div>
            <div>
              <dt className="cap">Minimum events per account</dt>
              <dd className="num mt-0.5 text-sm t-ink">
                {env.thresholds.minEventsPerAccount}
              </dd>
            </div>
            <div>
              <dt className="cap">Max accounts per shared node</dt>
              <dd className="num mt-0.5 text-sm t-ink">{MAX_ACCOUNTS_PER_INFRA_NODE}</dd>
            </div>
          </dl>
          <p className="note-s mt-4 max-w-2xl">
            A node touched by more accounts than the cap is skipped entirely. A device seen by 400
            accounts is a default value or a shared network egress, not a family tablet, and
            connecting those accounts pairwise would produce 79,800 edges and one meaningless
            mega-cluster.
          </p>
        </Sheet>

        <Sheet title="Population baselines">
          <dl className="space-y-3">
            <div>
              <dt className="cap">Median return rate</dt>
              <dd className="num mt-0.5 text-sm t-ink">
                {(POPULATION.returnRate * 100).toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="cap">Clearly atypical return rate</dt>
              <dd className="num mt-0.5 text-sm t-ink">
                {(POPULATION.returnRateHigh * 100).toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="cap">Baseline account threshold</dt>
              <dd className="num mt-0.5 text-sm t-ink">
                {(DEFAULT_BASELINE_THRESHOLDS.returnRate * 100).toFixed(0)}% return rate
              </dd>
            </div>
          </dl>
          <p className="note-s mt-4 max-w-2xl">
            These decide what &ldquo;unusually high&rdquo; means. They describe the synthetic corpus
            and would need re-deriving from real data before production use &mdash; a threshold
            calibrated to the wrong population is how a detector starts flagging ordinary customers.
          </p>
        </Sheet>
      </div>

      <Sheet title="Explanation model" className="mt-5">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="cap">Provider</dt>
            <dd className="num mt-0.5 text-sm t-ink">{env.model.provider}</dd>
          </div>
          <div>
            <dt className="cap">Enabled</dt>
            <dd className="num mt-0.5 text-sm t-ink">{env.model.enabled ? "yes" : "no"}</dd>
          </div>
          <div>
            <dt className="cap">API key</dt>
            <dd className="num mt-0.5 text-sm t-ink">
              {env.model.apiKeyPresent ? "present" : "absent"}
            </dd>
          </div>
        </dl>
        <p className="note-s mt-4 max-w-2xl">
          Role: {env.model.role}. An explanation naming a signal the detector never computed, or
          containing verdict language, is discarded entirely and the deterministic explanation is
          used instead. The deterministic one is generated first on every cluster, so the model is an
          upgrade to a working output rather than a dependency of one.
        </p>
      </Sheet>

      <Sheet title="API" className="mt-5">
        <ul className="space-y-2">
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
            <li key={path} className="flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="mono w-12 shrink-0 text-[0.625rem] t-m">{method}</span>
              <span className="mono w-56 shrink-0 text-[0.6875rem] t-ink">{path}</span>
              <span className="note flex-1">{description}</span>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
