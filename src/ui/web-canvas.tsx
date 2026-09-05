"use client";

import { useEffect, useRef } from "react";

/**
 * The intro background: a halftone field that resolves into an orb web, lights
 * its nodes along the strands, and snaps one cluster of six accounts into
 * focus. Canvas, no assets, no third-party request, works offline.
 *
 * ---------------------------------------------------------------------------
 * HOW IT IS DRIVEN, AND WHY IT DOES NOT THRASH
 * ---------------------------------------------------------------------------
 * The scroll listener does one thing: read `window.scrollY` and write a number
 * into a local. It reads no element geometry, sets no style, and touches no
 * class. Everything the progress calculation needs about the stage — its top
 * offset and its scrollable height — is measured in the resize handler and
 * cached, so a scroll event can never cause a layout.
 *
 * A single requestAnimationFrame loop does all the drawing. It also reports the
 * scene index upward, and only when that integer changes, so React re-renders
 * four times across the whole sequence rather than sixty times a second.
 *
 * ---------------------------------------------------------------------------
 * MOTION IS ON TWOS
 * ---------------------------------------------------------------------------
 * The autonomous part — the shimmer in the dots and the charge running out
 * along the spokes — is quantised to twelve frames a second before it is used,
 * and the canvas is only repainted when that frame number changes. Limited
 * animation is the look; it is also a fifth of the work.
 *
 * Under `prefers-reduced-motion: reduce` the loop never starts. One frame is
 * drawn, the web fully built, and that is what stays on the screen.
 */

const SPOKES = 12;
const RINGS = 6;

/** Grid pitch of the halftone screen, in CSS pixels. Coarser than the 6px page
 *  screen because these dots move and grow, and a 6px pitch at that size reads
 *  as noise rather than as a screen. Chosen by eye, not derived. */
const DOT_PITCH = 13;

/** Distance from a strand, in CSS pixels, past which a dot no longer belongs to
 *  it. Also tuned by eye at 1440x900: wide enough that the web has a halo,
 *  tight enough that the strands still read as lines. */
const HALO = 96;

/** The held frame rate of the autonomous motion. 12fps is animation on twos at
 *  a 24fps base, which is the convention this look comes from. */
const FRAME_MS = 83;

const TAU = Math.PI * 2;

/** Deterministic hash noise, so the web is identical on every machine. */
function rnd(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function clamp01(n: number) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

interface Vertex {
  x: number;
  y: number;
  /** 0..1, how far out this vertex sits; drives the order it lights in. */
  order: number;
}

interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  order: number;
  /** True for the radial anchor lines, false for the chords between them. */
  radial: boolean;
}

interface Dot {
  x: number;
  y: number;
  /** Distance to the nearest strand, in CSS pixels, computed once. */
  d: number;
  ph: number;
  /** Which plate this dot prints on: 0 paper, 1 cyan, 2 magenta. */
  plate: 0 | 1 | 2;
}

interface Scene {
  w: number;
  h: number;
  vertices: Vertex[];
  segments: Segment[];
  dots: Dot[];
  cluster: Vertex[];
}

function distanceToSegment(px: number, py: number, s: Segment) {
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const len = dx * dx + dy * dy;
  let t = len === 0 ? 0 : ((px - s.ax) * dx + (py - s.ay) * dy) / len;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = s.ax + t * dx - px;
  const cy = s.ay + t * dy - py;
  return Math.sqrt(cx * cx + cy * cy);
}

function buildScene(w: number, h: number): Scene {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) * 0.44;

  const vertices: Vertex[] = [];
  for (let s = 0; s < SPOKES; s++) {
    const angle = (s / SPOKES) * TAU + (rnd(s, 1) - 0.5) * 0.12;
    for (let r = 0; r < RINGS; r++) {
      const frac = (0.2 + 0.8 * ((r + 1) / RINGS)) * (0.9 + rnd(s * RINGS + r, 2) * 0.2);
      vertices.push({
        x: cx + Math.cos(angle) * radius * frac,
        y: cy + Math.sin(angle) * radius * frac * 0.82,
        order: r / RINGS,
      });
    }
  }

  // Non-null: every (spoke, ring) pair below was just pushed, in this order.
  const at = (s: number, r: number) => vertices[((s + SPOKES) % SPOKES) * RINGS + r]!;

  const segments: Segment[] = [];
  for (let s = 0; s < SPOKES; s++) {
    const first = at(s, 0);
    segments.push({ ax: cx, ay: cy, bx: first.x, by: first.y, order: 0, radial: true });
    for (let r = 0; r < RINGS - 1; r++) {
      const a = at(s, r);
      const b = at(s, r + 1);
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, order: (r + 1) / RINGS, radial: true });
    }
  }
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SPOKES; s++) {
      const a = at(s, r);
      const b = at(s + 1, r);
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, order: r / RINGS, radial: false });
    }
  }

  // The halftone screen. Distance to the nearest strand is computed once, here;
  // the per-frame cost of a dot is one multiply against a cached number.
  const dots: Dot[] = [];
  let i = 0;
  for (let y = DOT_PITCH / 2; y < h; y += DOT_PITCH) {
    for (let x = DOT_PITCH / 2; x < w; x += DOT_PITCH) {
      i++;
      let d = Infinity;
      for (const s of segments) {
        const candidate = distanceToSegment(x, y, s);
        if (candidate < d) d = candidate;
      }
      // Dots outside the halo carry the ground texture only, and are decimated
      // to a third: drawing all of them costs three times as much for no gain.
      if (d > HALO && i % 3 !== 0) continue;
      const r = rnd(i, 3);
      dots.push({ x, y, d, ph: rnd(i, 4) * TAU, plate: r > 0.86 ? 1 : r > 0.72 ? 2 : 0 });
    }
  }

  // The ring: six accounts on the same strands. Fixed indices, so the cluster
  // that snaps into focus is the same six on every load and on every machine.
  const cluster = [2, 3, 14, 15, 27, 38].map((n) => vertices[n % vertices.length]!);

  return { w, h, vertices, segments, dots, cluster };
}

const PLATE_FILL = ["rgba(251,247,236,0.5)", "rgba(0,174,239,0.62)", "rgba(236,0,140,0.62)"];

/**
 * One frame. `p` is scroll progress through the stage, 0..1. `frame` is the
 * held 12fps counter. `dpr` is folded into every transform so the whole
 * function can work in CSS pixels.
 */
function draw(ctx: CanvasRenderingContext2D, scene: Scene, p: number, frame: number, dpr: number) {
  const { w, h, dots, segments, vertices, cluster } = scene;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0b0a12";
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.62);
  glow.addColorStop(0, "rgba(23, 19, 52, 0.95)");
  glow.addColorStop(1, "rgba(11, 10, 18, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // The whole scene pushes in as it resolves.
  const zoom = 0.9 + 0.14 * clamp01((p - 0.1) / 0.9);
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, (dpr * w * (1 - zoom)) / 2, (dpr * h * (1 - zoom)) / 2);

  // ---------------------------------------------------------------- DOTS ---
  // First scene: an even screen. From the second on, the dots that belong to a
  // strand grow and the ones that do not fall away. That is the whole
  // "halftone resolves into a web" beat, and it is one number per dot. All the
  // dots on one plate go into a single path and one fill.
  const focus = clamp01((p - 0.04) / 0.4);
  PLATE_FILL.forEach((fill, plate) => {
    ctx.beginPath();
    for (const dot of dots) {
      if (dot.plate !== plate) continue;
      const near = 1 - clamp01(dot.d / HALO);
      const shimmer = 0.82 + 0.18 * Math.sin(dot.ph + frame * 0.5);
      const r = (1.55 * (1 - focus) * 0.75 + focus * near * near * 2.9) * shimmer;
      if (r < 0.18) continue;
      ctx.moveTo(dot.x + r, dot.y);
      ctx.arc(dot.x, dot.y, r, 0, TAU);
    }
    ctx.fillStyle = fill;
    ctx.fill();
  });

  // ------------------------------------------------------------- STRANDS ---
  // Each strand draws from its inner end outward, staggered by how far out it
  // sits, so the web builds from the hub.
  const strand = clamp01((p - 0.18) / 0.34);
  if (strand > 0) {
    ctx.lineCap = "round";
    for (const s of segments) {
      const grown = clamp01((strand - s.order * 0.35) / 0.5);
      if (grown <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.ax + (s.bx - s.ax) * grown, s.ay + (s.by - s.ay) * grown);
      ctx.strokeStyle = s.radial ? "rgba(251,247,236,0.62)" : "rgba(0,174,239,0.55)";
      ctx.lineWidth = s.radial ? 1.4 : 1;
      ctx.stroke();
    }
  }

  // --------------------------------------------------------------- NODES ---
  const lit = clamp01((p - 0.4) / 0.26);
  if (lit > 0) {
    for (const v of vertices) {
      const on = clamp01((lit - v.order * 0.5) / 0.5);
      if (on <= 0) continue;
      const r = 1.8 + 2.6 * on;
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, 0, TAU);
      ctx.fillStyle = "rgba(251,247,236,0.95)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(v.x, v.y, r + 2.5, 0, TAU);
      ctx.strokeStyle = `rgba(0,174,239,${0.5 * on})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // A charge running out along the anchor lines, advancing in held steps.
    const along = (frame * 0.06) % 1;
    for (let s = 0; s < SPOKES; s++) {
      const outer = vertices[s * RINGS + RINGS - 1]!;
      ctx.beginPath();
      ctx.arc(w / 2 + (outer.x - w / 2) * along, h / 2 + (outer.y - h / 2) * along, 2.4, 0, TAU);
      ctx.fillStyle = `rgba(255,232,0,${0.85 * lit * (1 - along)})`;
      ctx.fill();
    }
  }

  // ------------------------------------------------------------- CLUSTER ---
  // Six accounts on the same strands, snapped into focus in four held steps.
  const snap = clamp01((p - 0.64) / 0.18);
  if (snap > 0) {
    const stepped = Math.round(snap * 4) / 4;
    ctx.beginPath();
    cluster.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
    ctx.fillStyle = `rgba(236,0,140,${0.14 * stepped})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(236,0,140,${0.75 * stepped})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const v of cluster) {
      ctx.beginPath();
      ctx.arc(v.x, v.y, 6 + 9 * (1 - stepped), 0, TAU);
      ctx.strokeStyle = `rgba(236,0,140,${stepped})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------ HAND-OFF ---
  // The last of the scroll prints the page: paper rises over the void and the
  // console's own ground takes the screen.
  const handoff = clamp01((p - 0.86) / 0.14);
  if (handoff > 0) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(236,226,207,${handoff})`;
    ctx.fillRect(0, 0, w, h);
  }
}

export function WebCanvas({
  stageRef,
  onScene,
  reduced,
}: {
  stageRef: React.RefObject<HTMLElement | null>;
  onScene: (index: number) => void;
  reduced: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onSceneRef = useRef(onScene);
  onSceneRef.current = onScene;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !stage || !ctx) return;

    let scene: Scene | null = null;
    let progress = 0;
    let reported = -1;
    let raf = 0;
    let lastFrame = -1;
    // Cached here, read by the scroll handler, never measured inside it.
    let stageTop = 0;
    let scrollable = 1;
    let dpr = 1;

    function paint(frame: number) {
      if (scene) draw(ctx!, scene, progress, frame, dpr);
    }

    function measure() {
      stageTop = stage!.getBoundingClientRect().top + window.scrollY;
      scrollable = Math.max(1, stage!.offsetHeight - window.innerHeight);

      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      if (w === 0 || h === 0) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      scene = buildScene(w, h);
    }

    function readScroll() {
      // The only DOM read here is window.scrollY. No geometry, no styles.
      progress = clamp01((window.scrollY - stageTop) / scrollable);
    }

    function loop() {
      const frame = Math.floor(performance.now() / FRAME_MS);
      if (frame !== lastFrame) {
        lastFrame = frame;
        paint(frame);
      }
      const index = progress < 0.22 ? 0 : progress < 0.46 ? 1 : progress < 0.7 ? 2 : 3;
      if (index !== reported) {
        reported = index;
        onSceneRef.current(index);
      }
      raf = requestAnimationFrame(loop);
    }

    measure();
    readScroll();

    if (reduced) {
      // One frame, the web fully built, and nothing after it.
      progress = 0.82;
      paint(0);
      onSceneRef.current(3);
    } else {
      window.addEventListener("scroll", readScroll, { passive: true });
      raf = requestAnimationFrame(loop);
    }

    const resized = () => {
      measure();
      readScroll();
      paint(lastFrame < 0 ? 0 : lastFrame);
    };
    const observer = new ResizeObserver(resized);
    observer.observe(stage);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", readScroll);
      observer.disconnect();
    };
  }, [stageRef, reduced]);

  return <canvas ref={canvasRef} className="intro-canvas" aria-hidden />;
}
