import type { ReactNode } from "react";

/**
 * Shared display primitives.
 *
 * One rule they all obey: a value that was never measured renders as an
 * explicit dash with a reason, never as zero. This system's output is a
 * decision to investigate people, and a dashboard printing 0% for "no data"
 * makes a measurement claim it cannot support.
 *
 * The second rule is about colour. Every hue on this console is one of the
 * subtractive primaries or one of the two secondaries they make, and each one
 * means exactly one thing:
 *
 *   cyan     structural evidence, observed
 *   magenta  behavioural evidence
 *   yellow   concentration evidence, and below-threshold states
 *   green    (cyan over yellow) no coordination indicated
 *   blue     (cyan over magenta) the detector declined; a person has it
 */

export function Sheet({
  title,
  subtitle,
  actions,
  children,
  className = "",
  marks = false,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Crop corners at the trim edge. Reserved for the sheets that carry an argument. */
  marks?: boolean;
}) {
  return (
    <section className={`sheet ${marks ? "marks" : ""} ${className}`}>
      {(title || actions) && (
        <header className="sheet-hd">
          <div>
            {title && <h2 className="sheet-ti">{title}</h2>}
            {subtitle && <p className="note-s mt-1">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="sheet-bd">{children}</div>
    </section>
  );
}

const TONE_CLASS = {
  neutral: "t-ink",
  structural: "t-c",
  behavioural: "t-m",
  possible: "t-y",
  unknown: "t-b",
  clear: "t-g",
} as const;

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
  tone?: keyof typeof TONE_CLASS;
}) {
  const missing = value === null || value === undefined || value === "";

  return (
    <div className="sheet px-4 py-3.5">
      <p className="cap">{label}</p>
      <p className={`num fig mt-1.5 font-medium ${missing ? "t-3" : TONE_CLASS[tone]}`}>
        {missing ? "—" : value}
        {!missing && denominator && <span className="ml-1.5 text-xs t-3">{denominator}</span>}
      </p>
      {(hint || missing) && <p className="note-s mt-1">{missing ? (hint ?? "Not measured.") : hint}</p>}
    </div>
  );
}

const STATE_TAG: Record<string, string> = {
  COORDINATION_LIKELY: "tag-m",
  COORDINATION_POSSIBLE: "tag-y",
  NO_COORDINATION_INDICATED: "tag-g",
  INSUFFICIENT_DATA: "tag-b",
  PENDING: "tag-b",
  CONFIRMED: "tag-m",
  DISMISSED: "tag-g",
  ESCALATED: "tag-y",
  NEEDS_MORE_DATA: "tag-n",
  SUSPICIOUS: "tag-m",
  BENIGN: "tag-g",
  EASY: "tag-n",
  MEDIUM: "tag-n",
  HARD: "tag-y",
  ADVERSARIAL: "tag-m",
};

export function StateChip({ state, title }: { state: string | null | undefined; title?: string }) {
  if (!state) return <span className="tag tag-n">—</span>;
  return (
    <span className={`tag ${STATE_TAG[state] ?? "tag-n"}`} title={title}>
      {state.replace(/_/g, " ")}
    </span>
  );
}

/** Risk bar over a fixed 0–100 scale, so scores are visually comparable. */
export function RiskBar({ risk, threshold }: { risk: number | null | undefined; threshold?: number }) {
  if (risk === null || risk === undefined) {
    return (
      <div className="flex items-center gap-2">
        <div className="meter w-24" />
        <span className="num text-xs t-3">—</span>
      </div>
    );
  }

  const colour =
    threshold !== undefined && risk >= threshold
      ? "var(--ink-m)"
      : risk >= (threshold ?? 70) * 0.6
        ? "var(--ink-y)"
        : "var(--ink-g)";

  return (
    <div className="flex items-center gap-2">
      <div className="meter relative w-24">
        <span style={{ width: `${Math.min(100, risk)}%`, background: colour }} />
        {threshold !== undefined && (
          <span className="meter-mark" style={{ left: `${threshold}%` }} title={`Detection threshold ${threshold}`} />
        )}
      </div>
      <span className="num text-xs t-2">{risk.toFixed(0)}</span>
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
    <li className="rule-x py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold t-ink">{label}</span>
        <span className="num shrink-0 text-xs t-2">
          +{points.toFixed(1)}
          <span className="t-3"> / {maxPoints}</span>
        </span>
      </div>
      <div className="meter mt-1.5">
        <span style={{ width: `${(points / maxPoints) * 100}%`, background: "var(--ink-m)" }} />
      </div>
      <p className="note-s mt-1.5">{observation}</p>
      {rationale && <p className="note-s mt-1 opacity-80">{rationale}</p>}
    </li>
  );
}

export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty">
      {/* An empty panel says nothing was found, in the same lettering the rest
          of the page uses. It must never be mistaken for a clean result. */}
      <p className="dsp text-base t-ink sm:text-lg">{title}</p>
      {detail && <p className="note-s mx-auto mt-2 max-w-lg">{detail}</p>}
    </div>
  );
}

export function DetectOnlyBadge() {
  return (
    <span
      className="tag tag-b"
      title="This system surfaces clusters for a human to investigate. It cannot block an account, deny a refund, or take any action against a customer."
    >
      DETECT-ONLY
    </span>
  );
}

export function SyntheticBadge() {
  return (
    <span
      className="tag tag-c"
      title="Synthetic commerce data generated from a fixed seed. No real customer appears in this system."
    >
      SYNTHETIC DATA
    </span>
  );
}

export function Money({ minor }: { minor: number }) {
  const major = Math.floor(minor / 100);
  return <span className="num">₹{new Intl.NumberFormat("en-IN").format(major)}</span>;
}

export function Relative({ iso }: { iso: string | null }) {
  if (!iso) return <span className="t-3">—</span>;
  return (
    <time dateTime={iso} className="num text-[0.6875rem] t-3">
      {iso.replace("T", " ").replace(/\.\d+Z$/, "Z")}
    </time>
  );
}

/**
 * A page title, set the way a comic page sets one: the section eyebrow, the
 * name in tight heavy uppercase with the plates out of register, and the
 * four-colour bar under it.
 */
export function Heading({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <div className="reveal mb-7">
      {kicker && <p className="cap mb-1.5">{kicker}</p>}
      <h1 className="dsp ghost dsp-page">{children}</h1>
      <div className="strip mt-3 max-w-[13rem]" aria-hidden />
    </div>
  );
}

/**
 * The one sentence a section needs before its data means anything, set in the
 * yellow box a comic page puts it in. Kept separate from Heading because most
 * pages carry more than one, at the point in the page where it is needed.
 */
export function Caption({ children, tone = "y" }: { children: ReactNode; tone?: "y" | "c" }) {
  return <p className={`capbox ${tone === "c" ? "capbox-c" : ""} my-5 max-w-3xl`}>{children}</p>;
}
