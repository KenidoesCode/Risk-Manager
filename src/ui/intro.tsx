"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { WebCanvas } from "./web-canvas";

/**
 * The landing route.
 *
 * A dark stage four screens tall with the web canvas stuck to it, four scenes
 * of copy that swap as the web resolves, and then a hand-off: the last screen
 * of scroll prints paper over the void and the console's own ground takes
 * over. Everything below the stage is the argument, on the page, in ink.
 *
 * The copy is the product's actual claim and its actual limits. Nothing on
 * this page is softened for the sake of the sequence — the third scene is the
 * one where the detector is at its weakest, and it says so.
 */

const SCENES = [
  {
    kicker: "Return-abuse ring sentinel",
    title: ["The pattern is in", "the connections."],
    body: "Six accounts that each look ordinary can be one operation. This builds the entity graph, finds the clusters, scores them against a published weight table, and hands an investigator a decomposed answer.",
  },
  {
    kicker: "01 — the screen",
    title: ["Every account", "looks ordinary."],
    body: "Each returns about a third of what it buys. No per-account rule fires on any of them, and none of them should — a third is what plenty of honest customers do. Read one at a time, there is nothing here.",
  },
  {
    kicker: "02 — the strands",
    title: ["Two devices.", "One address. One card."],
    body: "Seen together they are operating through the same infrastructure, buying inside one product category, and returning inside the same eight hours. The pattern exists only across the group, so only a graph can hold it.",
  },
  {
    kicker: "03 — the trap",
    title: ["So does", "a family."],
    body: "A household shares an address, shares a tablet, shares a card. Structurally it is the same picture. The difference is entirely behavioural, and a detector that misses that is an automated accusation machine pointed at people who live together.",
  },
];

const STAGES = [
  {
    plate: "cyan plate — structural",
    tone: "t-c",
    n: "01",
    title: "Structure alone cannot reach the threshold.",
    body: "Shared address, shared device and shared card together are capped below the detection threshold. Infrastructure is where an investigation starts, never where it ends.",
  },
  {
    plate: "magenta plate — behavioural",
    tone: "t-m",
    n: "02",
    title: "Behaviour is what moves the number.",
    body: "Return rate against the cohort, the width of the window the returns land in, the velocity of account creation. These are the points that carry a cluster over the line, and each one prints its own observation.",
  },
  {
    plate: "yellow plate — concentration",
    tone: "t-y",
    n: "03",
    title: "Concentration is the third reading.",
    body: "A narrow product category and a narrow value band, held across a group, are evidence of an operation rather than of shopping. They are worth points, and fewer than people expect.",
  },
  {
    plate: "blue — the detector declined",
    tone: "t-b",
    n: "04",
    title: "Insufficient data is a real answer.",
    body: "A cluster with too little history returns INSUFFICIENT_DATA and routes to a person. It is not scored low and it is not scored high; the system says it does not know, and that state is on the same footing as the other three.",
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

const REFUSALS = [
  "Act against a customer. There is no enforcement code path, and the endpoint that looks like one exists in order to refuse the attempt and audit it.",
  "Flag a cluster on structure alone. Shared address, shared device and shared card together are capped below the detection threshold without behavioural evidence.",
  "Print a score without its arithmetic. Every point decomposes into a named signal with the observation behind it.",
  "Explain how to avoid detection, break linkage between accounts, or make activity look legitimate.",
];

/**
 * Deterministic marks, so the film stack composes the same way every render.
 *
 * Rounded to 2 decimals ON PURPOSE. The raw hash multiplies Math.sin by ~43758,
 * which amplifies the last-ULP difference between Node's Math.sin (this renders
 * server-side) and the browser's into the 9th decimal — enough to stringify
 * `cx`/`cy` differently on the server and the client and trip a React hydration
 * mismatch on the SVG. Two decimals is imperceptible in a 100×80 viewBox and
 * makes the two environments print the identical number. */
const round2 = (n: number) => Math.round(n * 100) / 100;
const MARKS = Array.from({ length: 14 }, (_, i) => {
  const a = Math.sin((i + 1) * 12.9898) * 43758.5453;
  const b = Math.sin((i + 1) * 78.233) * 12345.678;
  return {
    x: round2(6 + (a - Math.floor(a)) * 88),
    y: round2(8 + (b - Math.floor(b)) * 80),
    r: round2(1.6 + (a - Math.floor(a)) * 2.2),
  };
});

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
  const stageRef = useRef<HTMLElement>(null);
  const [scene, setScene] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div>
      {/* ------------------------------------------------- THE STAGE ---- */}
      <section
        ref={stageRef}
        className="intro-stage"
        style={{ height: reduced ? "auto" : "400svh" }}
        aria-label="Introduction"
      >
        <div className="intro-sticky" data-reduced={reduced}>
          <WebCanvas stageRef={stageRef} onScene={setScene} reduced={reduced} />

          {SCENES.map((s, i) => (
            <div
              key={s.kicker}
              className="intro-scene page-6"
              data-on={reduced || scene === i}
              aria-hidden={!reduced && scene !== i}
            >
              <p className="cap" style={{ color: "#ffe800" }}>
                {s.kicker}
              </p>
              <h1 className="dsp intro-title mt-3 max-w-[16ch] text-[clamp(1.55rem,5.4vw,3.5rem)]">
                {s.title[0]}
                <br />
                {s.title[1]}
              </h1>
              <p
                className="mt-5 max-w-xl text-sm leading-relaxed sm:text-base"
                style={{ color: "rgba(251,247,236,0.82)" }}
              >
                {s.body}
              </p>

              {(i === 0 || i === SCENES.length - 1) && (
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link href="/overview" className="btn">
                    Open the console
                  </Link>
                  <Link href="/demo" className="btn btn-ghost">
                    Run the scenarios
                  </Link>
                </div>
              )}

              {i === 0 && !reduced && (
                <p className="cap intro-cue mt-10" style={{ color: "rgba(251,247,236,0.55)" }}>
                  Scroll — the screen resolves
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- THE THESIS --- */}
      <section className="page-6 grid items-center gap-10 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div className="reveal">
          <p className="cap mb-4 flex items-center gap-2.5">
            <span className="reg t-m" aria-hidden />
            Detection-only · it never acts against a customer
          </p>

          <h2 className="dsp ghost text-[clamp(1.5rem,6vw,3.4rem)]">
            One film tints.
            <br />
            Three go black.
          </h2>

          <div className="strip mt-5 max-w-[18rem]" aria-hidden />

          <p className="capbox mt-7 max-w-xl">
            A shared address is nothing. A shared address plus a shared device plus a burst of
            returns inside eight hours is something. This whole product is the arithmetic of
            stacking weak evidence — so the page stacks it, in ink, and lets you read the result.
          </p>

          <p className="note mt-5 max-w-xl">
            It also refuses to flag a family for living together. That is the harder half, and it is
            the half the evaluation page reports honestly, including where the detector does worse
            than a baseline.
          </p>
        </div>

        <figure className="sheet marks pad reveal" style={{ ["--d" as string]: "80ms" }}>
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
                  stroke="#131117"
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
      <div className="border-y-[3px] border-[var(--ink)] bg-[var(--paper-2)]">
        <div className="page-6 stagger flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          {PLEDGES.map((p) => (
            <span key={p} className="cap flex items-center gap-2">
              <span className="reg t-m" aria-hidden />
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------------------------------------------- PLATES ---- */}
      <section className="page-6 py-16 sm:py-20">
        <div className="stagger grid gap-5 md:grid-cols-2">
          {STAGES.map((stage) => (
            <article key={stage.n} className="sheet pad">
              <div className="flex items-start justify-between gap-3">
                <p className={`cap ${stage.tone}`}>{stage.plate}</p>
                <span className="pnum">{stage.n}</span>
              </div>
              <h3 className="dsp mt-3 text-base leading-tight t-ink sm:text-lg">{stage.title}</h3>
              <p className="note mt-3">{stage.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-14">
          <p className="cap mb-3">The pipeline</p>
          <div className="stagger flex flex-wrap items-center gap-x-2 gap-y-2">
            {PIPELINE.map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                <span className="tag tag-n">{step}</span>
                {i < PIPELINE.length - 1 && (
                  <span className="strut t-3" aria-hidden>
                    &rarr;
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="sheet marks pad mt-14 reveal">
          <p className="cap">What this refuses to do</p>
          <ul className="stagger mt-4 space-y-2.5">
            {REFUSALS.map((item) => (
              <li key={item} className="lede flex gap-2.5">
                <span className="t-m shrink-0 font-bold" aria-hidden>
                  &#10007;
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link href="/overview" className="btn">
            Open the console
          </Link>
          <Link href="/evaluation" className="btn btn-ghost">
            Read the measured results
          </Link>
        </div>
      </section>
    </div>
  );
}
