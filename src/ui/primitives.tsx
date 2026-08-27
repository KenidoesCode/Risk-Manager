import type { ReactNode } from "react";

/**
 * Shared display primitives.
 *
 * One rule they all obey: a value that was never measured renders as an
 * explicit dash with a reason, never as zero. This system's output is a
 * decision to investigate people, and a dashboard printing 0% for "no data"
 * makes a measurement claim it cannot support.
 */

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`web-panel web-clip ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-web-line)] px-5 py-3.5">
          <div className="web-rule">
            {title && <h2 className="text-sm font-semibold tracking-wide text-[var(--color-chalk)]">{title}</h2>}
            {subtitle && <p className="mt-1 text-xs text-[var(--color-chalk-dim)]">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Metric({
  label,
  value,
  denominator,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number | null;
  denominator?: string;
  hint?: string;
  tone?: "neutral" | "strand" | "possible" | "unknown" | "clear";
}) {
  const colour =
    tone === "strand"
      ? "text-[var(--color-strand)]"
      : tone === "possible"
        ? "text-[var(--color-state-possible)]"
        : tone === "unknown"
          ? "text-[var(--color-state-unknown)]"
          : tone === "clear"
            ? "text-[var(--color-state-clear)]"
            : "text-[var(--color-chalk)]";

  const missing = value === null || value === undefined || value === "";

  return (
    <div className="web-panel px-4 py-3">
      <p className="web-label">{label}</p>
      <p className={`web-strand mt-1.5 text-2xl font-semibold ${missing ? "text-[var(--color-chalk-faint)]" : colour}`}>
        {missing ? "—" : value}
        {!missing && denominator && (
          <span className="ml-1.5 text-xs font-normal text-[var(--color-chalk-faint)]">{denominator}</span>
        )}
      </p>
      {(hint || missing) && (
        <p className="mt-1 text-[0.6875rem] leading-snug text-[var(--color-chalk-faint)]">
          {missing ? (hint ?? "Not measured.") : hint}
        </p>
      )}
    </div>
  );
}

const STATE_TONE: Record<string, string> = {
  COORDINATION_LIKELY: "text-[var(--color-state-likely)]",
  COORDINATION_POSSIBLE: "text-[var(--color-state-possible)]",
  NO_COORDINATION_INDICATED: "text-[var(--color-state-clear)]",
  INSUFFICIENT_DATA: "text-[var(--color-state-unknown)]",
  PENDING: "text-[var(--color-state-unknown)]",
  CONFIRMED: "text-[var(--color-state-likely)]",
  DISMISSED: "text-[var(--color-state-clear)]",
  ESCALATED: "text-[var(--color-state-possible)]",
  NEEDS_MORE_DATA: "text-[var(--color-chalk-dim)]",
  SUSPICIOUS: "text-[var(--color-state-likely)]",
  BENIGN: "text-[var(--color-state-clear)]",
  EASY: "text-[var(--color-chalk-dim)]",
  MEDIUM: "text-[var(--color-chalk-dim)]",
  HARD: "text-[var(--color-state-possible)]",
  ADVERSARIAL: "text-[var(--color-state-likely)]",
};

export function StateChip({ state, title }: { state: string | null | undefined; title?: string }) {
  if (!state) return <span className="web-stamp text-[var(--color-chalk-faint)]">—</span>;
  return (
    <span className={`web-stamp ${STATE_TONE[state] ?? "text-[var(--color-chalk-dim)]"}`} title={title}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

/** Risk bar over a fixed 0–100 scale, so scores are visually comparable. */
export function RiskBar({ risk, threshold }: { risk: number | null | undefined; threshold?: number }) {
  if (risk === null || risk === undefined) {
    return (
      <div className="flex items-center gap-2">
        <div className="web-bar w-24" />
        <span className="web-strand text-xs text-[var(--color-chalk-faint)]">—</span>
      </div>
    );
  }

  const colour =
    threshold !== undefined && risk >= threshold
      ? "var(--color-strand)"
      : risk >= (threshold ?? 70) * 0.6
        ? "var(--color-state-possible)"
        : "var(--color-state-clear)";

  return (
    <div className="flex items-center gap-2">
      <div className="web-bar relative w-24">
        <span style={{ width: `${Math.min(100, risk)}%`, background: colour }} />
        {threshold !== undefined && (
          <span
            className="absolute top-0 h-full w-px bg-[var(--color-chalk-faint)]"
            style={{ left: `${threshold}%`, background: "var(--color-chalk-faint)" }}
            title={`Detection threshold ${threshold}`}
          />
        )}
      </div>
      <span className="web-strand text-xs text-[var(--color-chalk-dim)]">{risk.toFixed(0)}</span>
    </div>
  );
}

/** A single scored signal with its points, maximum and observation. */
export function SignalRow({
  label,
  points,
  maxPoints,
  observation,
  rationale,
}: {
  label: string;
  points: number;
  maxPoints: number;
  observation: string;
  rationale?: string;
}) {
  return (
    <li className="border-b border-[color-mix(in_oklab,var(--color-web-line)_60%,transparent)] py-2.5 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-[var(--color-chalk)]">{label}</span>
        <span className="web-strand shrink-0 text-xs text-[var(--color-chalk-dim)]">
          +{points.toFixed(1)}
          <span className="text-[var(--color-chalk-faint)]"> / {maxPoints}</span>
        </span>
      </div>
      <div className="signal-bar mt-1.5">
        <span style={{ width: `${(points / maxPoints) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-dim)]">{observation}</p>
      {rationale && (
        <p className="mt-1 text-[0.625rem] leading-relaxed text-[var(--color-chalk-faint)]">{rationale}</p>
      )}
    </li>
  );
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="border border-dashed border-[var(--color-web-line)] px-6 py-10 text-center">
      <p className="web-strand text-sm text-[var(--color-chalk-dim)]">{title}</p>
      {detail && (
        <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-[var(--color-chalk-faint)]">{detail}</p>
      )}
    </div>
  );
}

export function DetectOnlyBadge() {
  return (
    <span
      className="web-stamp border-[var(--color-state-unknown)] text-[var(--color-state-unknown)]"
      title="This system surfaces clusters for a human to investigate. It cannot block an account, deny a refund, or take any action against a customer."
    >
      DETECT-ONLY
    </span>
  );
}

export function SyntheticBadge() {
  return (
    <span
      className="web-stamp border-[var(--color-node)] text-[var(--color-node)]"
      title="Synthetic commerce data generated from a fixed seed. No real customer appears in this system."
    >
      SYNTHETIC DATA
    </span>
  );
}

export function Money({ minor }: { minor: number }) {
  const major = Math.floor(minor / 100);
  return <span className="web-strand">₹{new Intl.NumberFormat("en-IN").format(major)}</span>;
}

export function Relative({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-[var(--color-chalk-faint)]">—</span>;
  return (
    <time dateTime={iso} className="web-strand text-xs text-[var(--color-chalk-dim)]">
      {iso.replace("T", " ").replace(/\.\d+Z$/, "Z")}
    </time>
  );
}

export function Heading({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <div className="web-rule mb-6">
      {kicker && <p className="web-label mb-1.5">{kicker}</p>}
      <h1 className="text-xl font-semibold tracking-tight text-[var(--color-chalk)]">{children}</h1>
    </div>
  );
}
