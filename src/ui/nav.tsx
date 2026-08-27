"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FlaskConical,
  Gauge,
  Network,
  PlayCircle,
  ScrollText,
  Settings2,
  ShieldQuestion,
  Waypoints,
} from "lucide-react";

/**
 * Console navigation.
 *
 * Grouped by what an analyst is doing - read the board, work a cluster, then
 * check the detector - rather than by table name.
 */
const SECTIONS = [
  {
    label: "Board",
    items: [
      { href: "/overview", label: "Overview", icon: Gauge },
      { href: "/clusters", label: "Clusters", icon: Network },
      { href: "/reviews", label: "Human review", icon: ShieldQuestion },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/demo", label: "Scenarios", icon: PlayCircle },
      { href: "/signals", label: "Signal reference", icon: Waypoints },
    ],
  },
  {
    label: "Check the detector",
    items: [
      { href: "/evaluation", label: "Evaluation", icon: FlaskConical },
      { href: "/failures", label: "Failure modes", icon: Activity },
      { href: "/audit", label: "Audit trail", icon: ScrollText },
      { href: "/settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export function WebNav({ pendingReviews }: { pendingReviews: number }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col gap-6 p-4" aria-label="Console sections">
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <Network size={17} className="text-[var(--color-strand)]" aria-hidden />
        <span className="web-strand text-xs font-semibold tracking-wide text-[var(--color-chalk)]">
          RING SENTINEL
        </span>
      </Link>

      {SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="web-label px-2 pb-2">{section.label}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 px-2 py-1.5 text-sm transition ${
                      active
                        ? "bg-[color-mix(in_oklab,var(--color-strand)_16%,transparent)] text-[var(--color-strand-glow)]"
                        : "text-[var(--color-chalk-dim)] hover:bg-[var(--color-web-raised)] hover:text-[var(--color-chalk)]"
                    }`}
                  >
                    <Icon size={15} aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/reviews" && pendingReviews > 0 && (
                      <span className="web-strand bg-[var(--color-state-unknown)] px-1.5 text-[0.625rem] font-semibold text-[var(--color-web-void)]">
                        {pendingReviews}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mt-auto border-t border-[var(--color-web-line)] pt-4">
        <p className="text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
          Clusters here are recommendations to investigate. This system takes no action against any
          account.
        </p>
      </div>
    </nav>
  );
}
