"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Home, Network, ShieldQuestion, Users } from "lucide-react";

/**
 * Scroll-driven intro.
 *
 * Drawn entirely with SVG and CSS - no image, no video, no WebGL, no
 * third-party request. A product arguing for auditability should not need a CDN
 * to render its own argument.
 *
 * Scroll progress is read by one passive listener writing into a ref and
 * flushed on requestAnimationFrame, so scrolling does not queue a React render
 * per pixel. Under prefers-reduced-motion the whole sequence resolves to its end
 * state immediately - content is never gated behind an animation.
 */

/** Deterministic web geometry. A fixed seed, so server and client agree. */
const WEB_NODES = Array.from({ length: 22 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.678;
  const r1 = a - Math.floor(a);
  const r2 = b - Math.floor(b);
  const ring = Math.floor(i / 7);
  const angle = ((i % 7) / 7) * Math.PI * 2 + ring * 0.4;
  const radius = 90 + ring * 85 + r1 * 30;
  return {
    x: 400 + Math.cos(angle) * radius,
    y: 260 + Math.sin(angle) * radius * 0.8,
    r: 3 + r2 * 4,
    account: i % 3 === 0,
    delay: r1 * 0.9,
  };
});

const WEB_EDGES: Array<[number, number]> = [];
for (let i = 0; i < WEB_NODES.length; i += 1) {
  for (let j = i + 1; j < WEB_NODES.length; j += 1) {
    const a = WEB_NODES[i];
    const b = WEB_NODES[j];
    if (!a || !b) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < 150) WEB_EDGES.push([i, j]);
  }
}

const STAGES = [
  {
    icon: Users,
    kicker: "01 - The problem",
    title: "Six ordinary accounts.",
    body: "Each returns about a third of what it buys. No per-account rule fires on any of them, and none of them should - a third is what plenty of honest customers do.",
  },
  {
    icon: Network,
    kicker: "02 - The structure",
    title: "Two devices. One address. One card.",
    body: "Seen together they are operating through the same infrastructure, buying in one product category, and returning inside the same eight hours. The pattern exists only across the group.",
  },
  {
    icon: Home,
    kicker: "03 - The trap",
    title: "So does a family.",
    body: "A household shares an address, shares a tablet, shares a card. Structurally it is the same picture. The difference is entirely behavioural, and a detector that misses that is an automated accusation machine pointed at people who live together.",
  },
  {
    icon: ShieldQuestion,
    kicker: "04 - The boundary",
    title: "It recommends a look, not a verdict.",
    body: "Every score decomposes into named signals with the observation behind each one, and carries the legitimate explanations that fit the same evidence. There is no code path here that blocks an account.",
  },
];

export function Intro() {
  const [progress, setProgress] = useState(0);
  const [reduced, setReduced] = useState(false);
  const raf = useRef<number | null>(null);
  const pending = useRef(0);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) {
      setProgress(1);
      return;
    }
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      pending.current = max <= 0 ? 1 : Math.min(1, window.scrollY / max);
      if (raf.current !== null) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = null;
        setProgress(pending.current);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf.current !== null) window.cancelAnimationFrame(raf.current);
    };
  }, [reduced]);

  return (
    <div className="relative">
      {/* ------------------------------------------------- HERO ------ */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden">
        <div
          className="halftone halftone-drift pointer-events-none absolute inset-0 opacity-[0.3]"
          style={{ transform: `translateY(${progress * -70}px)` }}
          aria-hidden
        />

        {/* The web, drawing itself. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
          viewBox="0 0 800 520"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          {WEB_EDGES.map(([i, j], k) => {
            const a = WEB_NODES[i];
            const b = WEB_NODES[j];
            if (!a || !b) return null;
            const length = Math.hypot(a.x - b.x, a.y - b.y);
            return (
              <line
                key={`${i}-${j}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={k % 3 === 0 ? "var(--color-strand)" : "var(--color-node)"}
                strokeWidth={k % 3 === 0 ? 1.1 : 0.6}
                strokeOpacity={0.4}
                className={reduced ? "" : "strand-draw"}
                style={
                  reduced
                    ? undefined
                    : ({ "--strand-length": length, "--strand-delay": `${0.2 + k * 0.014}s`, "--strand-dur": "1.4s" } as React.CSSProperties)
                }
              />
            );
          })}
          {WEB_NODES.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.account ? "var(--color-strand)" : "var(--color-node)"}
              fillOpacity={0.75}
              className={reduced ? "" : "node-pop"}
              style={reduced ? undefined : ({ "--node-delay": `${0.6 + n.delay}s` } as React.CSSProperties)}
            />
          ))}
        </svg>

        <div className="relative mx-auto w-full max-w-6xl px-6">
          <p className="web-label mb-4">Detection-only - graph-based return-abuse sentinel</p>
          <h1 className="web-offset max-w-4xl text-[clamp(2.25rem,7vw,4.75rem)] font-bold leading-[0.95] tracking-tight">
            The pattern is in
            <br />
            <span className="text-[var(--color-strand)]">the connections.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-chalk-dim)]">
            Six accounts that each look ordinary can be one operation. This system builds the entity
            graph, finds the clusters, scores them against a published weight table, and hands an
            investigator a decomposed answer.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--color-chalk-faint)]">
            It also refuses to flag a family for living together. That is the harder half.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/overview"
              className="web-clip inline-flex items-center gap-2 bg-[var(--color-strand)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--color-strand-glow)]"
            >
              Open the console
              <ArrowRight size={15} aria-hidden />
            </Link>
            <Link
              href="/demo"
              className="web-clip inline-flex items-center gap-2 border border-[var(--color-web-line-bright)] px-5 py-2.5 text-sm text-[var(--color-chalk-dim)] transition hover:border-[var(--color-node)] hover:text-[var(--color-chalk)]"
            >
              Run the scenarios
            </Link>
          </div>
        </div>

        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[0.625rem] tracking-[0.2em] text-[var(--color-chalk-faint)]"
          style={{ opacity: Math.max(0, 1 - progress * 6) }}
          aria-hidden
        >
          SCROLL
        </div>
      </section>

      {/* ---------------------------------------------- MARQUEE ------ */}
      <div className="relative overflow-hidden border-y border-[var(--color-web-line)] bg-[var(--color-web-base)] py-2.5">
        <div className="marquee-track flex w-max gap-8 whitespace-nowrap">
          {Array.from({ length: 2 }, (_, dup) => (
            <div key={dup} className="flex gap-8">
              {[
                "SHARED ADDRESS IS NOT FRAUD",
                "STRUCTURE ALONE CANNOT REACH THE THRESHOLD",
                "RISK AND CONFIDENCE ARE DIFFERENT NUMBERS",
                "INSUFFICIENT DATA IS A REAL ANSWER",
                "NO ENFORCEMENT PATH EXISTS",
              ].map((t) => (
                <span key={t} className="web-strand text-[0.6875rem] tracking-[0.18em] text-[var(--color-chalk-faint)]">
                  {t}
                  <span className="ml-8 text-[var(--color-strand)]">&#9670;</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ----------------------------------------------- STAGES ------ */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-5 md:grid-cols-2">
          {STAGES.map((stage, i) => {
            const Icon = stage.icon;
            const band = 0.12 + i * 0.14;
            const local = reduced ? 1 : Math.max(0, Math.min(1, (progress - band) / 0.16));
            return (
              <article
                key={stage.kicker}
                className="web-panel web-clip p-6"
                style={{
                  opacity: 0.25 + local * 0.75,
                  transform: `translateY(${(1 - local) * 22}px)`,
                  borderColor: local > 0.6 ? "var(--color-web-line-bright)" : "var(--color-web-line)",
                }}
              >
                <Icon size={18} className="text-[var(--color-strand)]" aria-hidden />
                <p className="web-label mt-4">{stage.kicker}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">{stage.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-chalk-dim)]">{stage.body}</p>
              </article>
            );
          })}
        </div>

        <div className="mt-16">
          <p className="web-label mb-4">The pipeline</p>
          <div className="flex flex-wrap items-center gap-2">
            {[
              "INGEST",
              "RESOLVE ENTITIES",
              "BUILD GRAPH",
              "CLUSTER",
              "FEATURES",
              "RISK + CONFIDENCE",
              "HUMAN REVIEW",
              "AUDIT",
            ].map((step, i, all) => (
              <span key={step} className="flex items-center gap-2">
                <span
                  className="web-clip border px-3 py-1.5 text-[0.625rem] tracking-[0.14em]"
                  style={{
                    borderColor: i <= progress * all.length * 1.4 ? "var(--color-strand)" : "var(--color-web-line)",
                    color: i <= progress * all.length * 1.4 ? "var(--color-strand)" : "var(--color-chalk-faint)",
                  }}
                >
                  {step}
                </span>
                {i < all.length - 1 && <span className="text-[var(--color-web-line-bright)]">&rarr;</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="web-panel web-clip mt-16 border-l-2 border-l-[var(--color-strand)] p-6">
          <p className="web-label">What this refuses to do</p>
          <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-[var(--color-chalk-dim)]">
            <li>
              <span className="text-[var(--color-strand)]">&#10007;</span> Act against a customer. There
              is no enforcement code path, and the endpoint that looks like one exists in order to
              refuse and audit the attempt.
            </li>
            <li>
              <span className="text-[var(--color-strand)]">&#10007;</span> Flag a cluster on structure
              alone. Shared address, shared device and shared card together are capped below the
              detection threshold without behavioural evidence.
            </li>
            <li>
              <span className="text-[var(--color-strand)]">&#10007;</span> Print a score without its
              arithmetic. Every point decomposes into a named signal with the observation behind it.
            </li>
            <li>
              <span className="text-[var(--color-strand)]">&#10007;</span> Explain how to avoid
              detection, break linkage between accounts, or make activity look legitimate.
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
