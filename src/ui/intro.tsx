import Link from "next/link";

/**
 * The landing page.
 *
 * It is a server component with no client JavaScript at all. The previous
 * version drove a scroll listener to fade panels in; the direction here is a
 * light table, and a light table does not animate — you lay sheets on it and
 * read what the overlap says. The one moment of motion is three films settling
 * into register on load, and that is a CSS keyframe on three divs.
 *
 * The hero is the product's argument drawn with the product's own mechanism:
 * one film tints, three films stacked go nearly black. That is exactly what
 * the detector claims about weak signals landing on the same set of accounts,
 * and it is the same compositing the cluster page uses to carry a real score.
 */

const STAGES = [
  {
    plate: "structural",
    tone: "t-c",
    kicker: "01 — The problem",
    title: "Six ordinary accounts.",
    body: "Each returns about a third of what it buys. No per-account rule fires on any of them, and none of them should - a third is what plenty of honest customers do.",
  },
  {
    plate: "structural",
    tone: "t-c",
    kicker: "02 — The structure",
    title: "Two devices. One address. One card.",
    body: "Seen together they are operating through the same infrastructure, buying in one product category, and returning inside the same eight hours. The pattern exists only across the group.",
  },
  {
    plate: "behavioural",
    tone: "t-m",
    kicker: "03 — The trap",
    title: "So does a family.",
    body: "A household shares an address, shares a tablet, shares a card. Structurally it is the same picture. The difference is entirely behavioural, and a detector that misses that is an automated accusation machine pointed at people who live together.",
  },
  {
    plate: "concentration",
    tone: "t-y",
    kicker: "04 — The boundary",
    title: "It recommends a look, not a verdict.",
    body: "Every score decomposes into named signals with the observation behind each one, and carries the legitimate explanations that fit the same evidence. There is no code path here that blocks an account.",
  },
];

const PLEDGES = [
  "SHARED ADDRESS IS NOT FRAUD",
  "STRUCTURE ALONE CANNOT REACH THE THRESHOLD",
  "RISK AND CONFIDENCE ARE DIFFERENT NUMBERS",
  "INSUFFICIENT DATA IS A REAL ANSWER",
  "NO ENFORCEMENT PATH EXISTS",
];

const PIPELINE = [
  "INGEST",
  "RESOLVE ENTITIES",
  "BUILD GRAPH",
  "CLUSTER",
  "FEATURES",
  "RISK + CONFIDENCE",
  "HUMAN REVIEW",
  "AUDIT",
];

/** Deterministic marks, so the hero composes the same way on every render. */
const MARKS = Array.from({ length: 14 }, (_, i) => {
  const a = Math.sin((i + 1) * 12.9898) * 43758.5453;
  const b = Math.sin((i + 1) * 78.233) * 12345.678;
  return {
    x: 6 + (a - Math.floor(a)) * 88,
    y: 8 + (b - Math.floor(b)) * 80,
    r: 1.6 + (a - Math.floor(a)) * 2.2,
  };
});

/** One film in the hero demonstration. */
function HeroFilm({
  colour,
  label,
  style,
  delay,
}: {
  colour: string;
  label: string;
  style: React.CSSProperties;
  delay: string;
}) {
  return (
    <div
      className="film-settle absolute"
      style={{ ...style, backgroundColor: colour, mixBlendMode: "multiply", animationDelay: delay }}
    >
      <span className="cap absolute left-2 top-1.5 t-ink">{label}</span>
    </div>
  );
}

export function Intro() {
  return (
    <div>
      {/* ------------------------------------------------------ HERO ---- */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <p className="cap mb-4 flex items-center gap-2.5">
            <span className="reg t-m" aria-hidden />
            Detection-only · graph-based return-abuse sentinel
          </p>

          <h1 className="dsp text-[clamp(1.55rem,6.4vw,4.1rem)]">
            The pattern is in
            <br />
            <span className="t-m">the connections.</span>
          </h1>

          <div className="strip mt-5 max-w-[18rem]" aria-hidden />

          <p className="mt-6 max-w-xl text-base leading-relaxed t-2">
            Six accounts that each look ordinary can be one operation. This system builds the entity
            graph, finds the clusters, scores them against a published weight table, and hands an
            investigator a decomposed answer.
          </p>
          <p className="note mt-3 max-w-xl">
            It also refuses to flag a family for living together. That is the harder half.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/overview" className="btn">
              Open the console
            </Link>
            <Link href="/demo" className="btn btn-ghost">
              Run the scenarios
            </Link>
          </div>
        </div>

        {/* The thesis, drawn with the mechanism it describes. */}
        <figure className="sheet marks p-4 sm:p-6">
          <figcaption className="cap mb-3">One film tints. Three go nearly black.</figcaption>
          <div className="stack-win" style={{ aspectRatio: "5 / 4" }}>
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 80"
              preserveAspectRatio="none"
              aria-hidden
            >
              {MARKS.map((m, i) => (
                <circle
                  key={i}
                  cx={m.x}
                  cy={m.y}
                  r={m.r}
                  fill="none"
                  stroke="#10161b"
                  strokeOpacity="0.45"
                  strokeWidth="0.6"
                />
              ))}
            </svg>

            <HeroFilm
              colour="rgba(0, 174, 239, 0.55)"
              label="one shared address"
              style={{ left: "4%", top: "6%", width: "62%", height: "56%" }}
              delay="0.05s"
            />
            <HeroFilm
              colour="rgba(236, 0, 140, 0.55)"
              label="+ a shared device"
              style={{ left: "22%", top: "22%", width: "62%", height: "56%" }}
              delay="0.2s"
            />
            <HeroFilm
              colour="rgba(255, 232, 0, 0.62)"
              label="+ returns in one 8h window"
              style={{ left: "38%", top: "8%", width: "56%", height: "62%" }}
              delay="0.35s"
            />
          </div>
          <p className="note-s mt-3">
            Each rectangle is one weak signal. Where all three land on the same accounts the light
            stops getting through, and that darkness is the risk score — computed by multiply
            compositing, not chosen. The cluster pages draw the real thing, with the observation
            behind every film printed on it and the innocent reading stacked beside it.
          </p>
        </figure>
      </section>

      {/* ------------------------------------------------- THE PLEDGES --- */}
      <div className="border-y border-[var(--rule)] bg-[rgba(255,255,255,0.6)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          {PLEDGES.map((p) => (
            <span key={p} className="cap flex items-center gap-2">
              <span className="t-m" aria-hidden>
                ◆
              </span>
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- STAGES ---- */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-5 md:grid-cols-2">
          {STAGES.map((stage) => (
            <article key={stage.kicker} className="sheet p-6">
              <p className={`cap ${stage.tone}`}>{stage.plate} plate</p>
              <p className="cap mt-3">{stage.kicker}</p>
              <h2 className="mt-1.5 text-lg font-bold tracking-tight t-ink">{stage.title}</h2>
              <p className="note mt-3">{stage.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-14">
          <p className="cap mb-3">The pipeline</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="tag tag-n">{step}</span>
                {i < PIPELINE.length - 1 && (
                  <span className="t-3" aria-hidden>
                    &rarr;
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="sheet marks mt-14 border-l-[3px] border-l-[var(--ink-m)] p-6">
          <p className="cap">What this refuses to do</p>
          <ul className="mt-4 space-y-2.5">
            {[
              "Act against a customer. There is no enforcement code path, and the endpoint that looks like one exists in order to refuse and audit the attempt.",
              "Flag a cluster on structure alone. Shared address, shared device and shared card together are capped below the detection threshold without behavioural evidence.",
              "Print a score without its arithmetic. Every point decomposes into a named signal with the observation behind it.",
              "Explain how to avoid detection, break linkage between accounts, or make activity look legitimate.",
            ].map((item) => (
              <li key={item} className="lede flex gap-2.5">
                <span className="t-m shrink-0" aria-hidden>
                  &#10007;
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
