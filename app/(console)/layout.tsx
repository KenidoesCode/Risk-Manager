import Link from "next/link";

import { WebNav } from "@/ui/nav";
import { DetectOnlyBadge, SyntheticBadge } from "@/ui/primitives";
import { ensureBootstrapped } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { overviewMetrics } from "@/api/queries";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  let pendingReviews = 0;
  try {
    await ensureBootstrapped();
    const db = await getDb();
    const metrics = await overviewMetrics(db);
    pendingReviews = metrics.review.pending;
  } catch {
    // A database that is unreachable must not take the whole console down; each
    // page renders its own error state.
    pendingReviews = 0;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-[var(--color-web-line)] bg-[var(--color-web-base)] lg:block">
        <div className="sticky top-0 h-screen">
          <WebNav pendingReviews={pendingReviews} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--color-web-line)] bg-[color-mix(in_oklab,var(--color-web-void)_88%,transparent)] px-6 py-3 backdrop-blur">
          <Link href="/" className="web-strand text-xs tracking-wide text-[var(--color-chalk-dim)] lg:hidden">
            &larr; RING SENTINEL
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <DetectOnlyBadge />
            <SyntheticBadge />
          </div>
        </header>

        <main className="px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
