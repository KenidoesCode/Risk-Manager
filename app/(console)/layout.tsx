import { overviewMetrics } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { IssueBanner } from "@/ui/issue-banner";

export const dynamic = "force-dynamic";

/**
 * The page.
 *
 * No sidebar. A masthead across the top and then panels on paper, with the
 * gutters a comic page has. The content area is deliberately wide: the
 * signature surface here is a graph, and a graph squeezed into the two-thirds
 * of a screen left over after a navigation rail is a graph nobody can read.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let openClusters = 0;
  let pendingReviews = 0;
  try {
    await ensureBootstrapped();
    const db = await getDb();
    const metrics = await overviewMetrics(db);
    openClusters = metrics.detection.clusters;
    pendingReviews = metrics.review.pending;
  } catch {
    // An unreachable database must not blank the whole console; each page
    // renders its own error state and the masthead simply shows zero.
    openClusters = 0;
    pendingReviews = 0;
  }

  return (
    <div className="min-h-screen bg-[var(--color-paper)]">
      <IssueBanner openClusters={openClusters} pendingReviews={pendingReviews} />
      <main className="mx-auto max-w-[1500px] px-5 py-7 sm:px-7">{children}</main>
    </div>
  );
}
