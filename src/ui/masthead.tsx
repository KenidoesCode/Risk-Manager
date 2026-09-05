"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The masthead.
 *
 * A comic page carries its title along the top of the first panel and its
 * indicia in small type beside it, so the shell is a strip: the name, a web
 * target, the two counts that are actually live on this instance, and the
 * sections as small panels you can push. Under it runs the four-colour bar,
 * which is the legend for every colour used anywhere below it.
 *
 * The current section is a filled yellow panel — the same yellow the caption
 * boxes use, meaning the same thing.
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
      <div className="page flex flex-nowrap overflow-x-auto nav-strip md:flex-wrap md:overflow-visible items-center gap-x-3 gap-y-2 pt-3 pb-2 sm:gap-x-5">
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

      <nav aria-label="Sections" className="nav-strip page flex gap-1 pb-2.5">
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
