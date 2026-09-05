import Link from "next/link";

/**
 * The 404.
 *
 * A route that does not exist gets the same treatment as a cluster with no
 * evidence: an explicit statement that there is nothing here, rather than a
 * blank page that could be mistaken for an empty result.
 */

const SECTIONS = [
  { href: "/overview", label: "Overview", note: "Counts, states and the current threshold." },
  { href: "/clusters", label: "Clusters", note: "Every cluster this instance has scored." },
  { href: "/signals", label: "Signals", note: "The published weight table, in full." },
  { href: "/reviews", label: "Review", note: "Clusters routed to a person." },
  { href: "/evaluation", label: "Measured", note: "Precision, recall, and where a baseline wins." },
  { href: "/failures", label: "Failures", note: "The cases this detector gets wrong." },
];

export default function NotFound() {
  return (
    <div className="page py-16">
      <div className="mx-auto w-full max-w-3xl">
        <span className="capbox inline-block" style={{ transform: "rotate(-1.2deg)" }}>
          No page is printed at this address.
        </span>

        <h1 className="dsp ghost mt-6 text-[clamp(2.4rem,14vw,6rem)]">404</h1>

        <div className="strip mt-4 max-w-[16rem]" aria-hidden />

        <p className="lede mt-6 max-w-xl">
          This route does not exist in the console. That is a missing page, not an empty result —
          nothing here says anything about a cluster, an account or a score.
        </p>

        <div className="stagger mt-10 grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link key={section.href} href={section.href} className="sheet pad block">
              <p className="sheet-ti">{section.label}</p>
              <p className="note-s mt-1.5">{section.note}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
