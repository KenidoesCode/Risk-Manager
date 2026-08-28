import { getDb, runMigrations } from "./client";
import { getEnv } from "../shared/env";
import { withDeterministicIds } from "../shared/ids";
import { logger } from "../shared/logger";
import { entities } from "./schema";

/**
 * Makes a fresh process usable without a manual seed step.
 *
 * An in-memory database starts empty on every serverless cold start, and a
 * deployment whose pages all read "no data" is indistinguishable from a broken
 * one. The corpus is generated deterministically from a seed, so this leaves
 * the instance in exactly the state `npm run db:seed` produces.
 *
 * The graph is built here too. Without derived edges there are no clusters, and
 * a console showing an empty cluster list would be reporting "we found no
 * coordinated abuse" when it had not looked.
 *
 * The in-flight promise is memoised rather than a boolean set on completion: a
 * page issuing several queries at once produces simultaneous calls that would
 * all observe a boolean as false and all begin seeding.
 */

let bootstrapping: Promise<void> | null = null;

export async function ensureBootstrapped(): Promise<void> {
  if (bootstrapping) return bootstrapping;

  // The whole cold-start path runs in deterministic-id mode — seeding, graph
  // build and detection alike — so that two instances that bootstrap
  // independently produce byte-identical identifiers in every table. See
  // `withDeterministicIds` for the failure that requires it.
  bootstrapping = withDeterministicIds(async () => {
    const started = Date.now();
    await runMigrations();
    const db = await getDb();

    const existing = await db.select().from(entities).limit(1);
    if (existing.length > 0) {
      logger.debug("bootstrap_skipped", { reason: "entities already present" });
      return;
    }

    const { seedCorpus } = await import("../evaluation/seed-corpus");
    const summary = await seedCorpus(db);

    const { buildGraph } = await import("../graph/builder");
    const build = await buildGraph(db, { correlationId: "bootstrap" });

    // Detection runs here too, and on a memory-backed instance it has to.
    //
    // A serverless instance holds its database for the life of one invocation,
    // so a detection run triggered by a button click is gone before the next
    // request reads the cluster list. The console then shows an empty ring list
    // on a corpus that provably contains rings — which reads as "we looked and
    // found nothing", the single most misleading thing this product could say.
    //
    // The explainer is skipped: it is the slow, optional, model-backed step,
    // and a cold start that spends thirty seconds on prose is a request that
    // times out. Every ring is still detected, scored and explainable from its
    // deterministic signals.
    const { runDetection } = await import("../detection/engine");
    const detection = await runDetection(db, {
      correlationId: "bootstrap",
      rebuild: false,
      skipExplainer: true,
    });

    logger.info("bootstrap_complete", {
      durationMs: Date.now() - started,
      accounts: summary.accounts,
      entities: summary.entities,
      derivedEdges: build.derivedEdges,
      clusters: detection.clusters.length,
      inMemory: getEnv().pgliteInMemory,
    });
  }).catch((error: unknown) => {
    bootstrapping = null;
    throw error;
  });

  return bootstrapping;
}
