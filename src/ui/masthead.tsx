"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The masthead.
 *
 * A light table has no navigation rail; it has a strip of information printed
 * along the edge of the sheet. So the shell is a thin bar carrying the name, a
 * registration target, the two counts that are actually live on this instance,
 * and the sections as tabs. Under it runs a process control strip, which is
 * the divider a prepress sheet actually has.
 *
 * The current tab is a yellow film laid over it. That is the same compositing
 * mechanism as the signature element on the cluster page, at its smallest
 * possible scale, so a reader meets the language once in the chrome before it
 * has to carry an argument.
 */

const SECTIONS = [
  { href: "/overview", label: "Overview" },
  { href: "/clusters", label: "Clusters" },
  { href: "/signals", label: "Signals" },
  { href: "/reviews", label: "Review" },
  { href: "/evaluation", label: "Measured" },
  { href: "/failures", label: "Failures" },
  { href: "/demo", label: "Scenarios" },
  { href: "/audit", label: "Audit" },
  { href: "/settings", label: "Settings" },
];

export function Masthead({ openClusters, pendingReviews }: { openClusters: number; pendingReviews: number }) {
  const pathname = usePathname();

  return (
    <header className="masthead sticky top-0 z-40">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-2 px-5 pt-3 pb-2 sm:px-7">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="reg t-m" aria-hidden />
          <span className="wordmark text-base sm:text-lg">Ring Sentinel</span>
        </Link>

        <span className="tag tag-c" title="Clusters currently stored on this instance.">
          {openClusters} clusters
        </span>
        <span className="tag tag-b" title="Clusters routed to a person and not yet decided.">
          {pendingReviews} awaiting a person
        </span>

        <span className="cap ml-auto hidden sm:inline-block">Detect only · never enforces</span>
      </div>

      <nav
        aria-label="Sections"
        className="scroll-x mx-auto flex max-w-[1500px] gap-0.5 px-5 pb-2 sm:px-7"
      >
        {SECTIONS.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className="tab"
            >
              {section.label}
              {section.href === "/reviews" && pendingReviews > 0 && (
                <span className="ml-1.5 t-b">{pendingReviews}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="strip" aria-hidden />
    </header>
  );
}
