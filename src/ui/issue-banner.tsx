"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The masthead.
 *
 * A comic has an issue banner across the top, not a navigation rail down the
 * side. The strip carries the title, the issue number — which here is the real
 * count of open clusters, because a number that is decorative is a number a
 * reader learns to ignore — and the sections as printed tabs.
 */

const SECTIONS = [
  { href: "/overview", label: "Front page" },
  { href: "/clusters", label: "Rings" },
  { href: "/signals", label: "Signals" },
  { href: "/reviews", label: "Review" },
  { href: "/evaluation", label: "Measured" },
  { href: "/failures", label: "Failures" },
  { href: "/demo", label: "Walkthrough" },
  { href: "/audit", label: "Record" },
  { href: "/settings", label: "Settings" },
];

export function IssueBanner({ openClusters, pendingReviews }: { openClusters: number; pendingReviews: number }) {
  const pathname = usePathname();

  return (
    <header className="border-b-[3px] border-[var(--color-ink)] bg-[var(--color-paper-bright)]">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 sm:px-7">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="misprint text-xl leading-none sm:text-2xl">RING SENTINEL</span>
        </Link>

        <span className="caption caption-magenta">NO. {String(openClusters).padStart(3, "0")}</span>

        <span className="strand ml-auto hidden text-[0.6875rem] text-[var(--color-ink-faint)] sm:block">
          detect only · never enforces
        </span>
      </div>

      <nav
        aria-label="Sections"
        className="mx-auto flex max-w-[1500px] gap-1.5 overflow-x-auto px-5 pb-3 sm:px-7"
      >
        {SECTIONS.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className="issue-tab"
            >
              {section.label}
              {section.href === "/reviews" && pendingReviews > 0 && (
                <span className={active ? "ml-1.5 text-[var(--color-magenta-soft)]" : "ml-1.5 text-[var(--color-magenta)]"}>
                  {pendingReviews}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
