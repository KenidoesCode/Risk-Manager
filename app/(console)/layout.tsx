import { mastheadCounts } from "@/api/queries";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { Masthead } from "@/ui/masthead";

export const dynamic = "force-dynamic";

/**
 * The console.
 *
 * No sidebar. A masthead across the top and then sheets laid out on the light
 * box, with real gutters between them. The content column is deliberately
 * wide: the surfaces that matter here are a graph and a stack of films, and
 * either one squeezed into what is left over after a navigation rail is a
 * surface nobody can read.
 */
export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let openClusters = 0;
  let pendingReviews = 0;
  try {
    await ensureBootstrapped();
    const db = await getDb();
    const counts = await mastheadCounts(db);
    openClusters = counts.clusters;
    pendingReviews = counts.pendingReviews;
  } catch {
    // An unreachable database must not blank the whole console; each page
    // renders its own error state and the masthead simply shows zero.
    openClusters = 0;
    pendingReviews = 0;
  }

  return (
    <div className="min-h-screen">
      <Masthead openClusters={openClusters} pendingReviews={pendingReviews} />
      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-7">{children}</main>
    </div>
  );
}
