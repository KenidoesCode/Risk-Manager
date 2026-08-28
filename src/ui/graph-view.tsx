"use client";

import { useMemo, useRef, useState } from "react";

/**
 * Interactive cluster graph.
 *
 * ---------------------------------------------------------------------------
 * WHY THE LAYOUT IS DETERMINISTIC
 * ---------------------------------------------------------------------------
 * A force simulation seeded from `Math.random()` draws the same cluster
 * differently on every visit. That is fine for a poster and wrong for an
 * investigation tool: an analyst who looked at a cluster yesterday and looks
 * again today should see the same picture, and two people discussing the same
 * cluster should be looking at the same arrangement.
 *
 * So the simulation is seeded from the node ids and run to a fixed iteration
 * count. Same cluster, same picture, every time, on every machine.
 *
 * ---------------------------------------------------------------------------
 * DERIVED EDGES LOOK DIFFERENT, ALWAYS
 * ---------------------------------------------------------------------------
 * A dashed magenta line is an inference this system drew. A solid cyan line is
 * an observation from an event. They are never drawn the same way, because the
 * entire investigative value of this view is that a reviewer can tell which is
 * which and walk from one to the other. Those are the same two plates the
 * overlay stack prints on, and they mean the same two things here.
 */

export interface GraphNode {
  id: string;
  type: string;
  anonymizedKey: string;
  label: string;
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
  fanout: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  derived: boolean;
  weight: number;
  provenance: string;
  viaEntityId: string | null;
  firstSeen: string;
  lastSeen: string;
  observationCount: number;
}

/*
 * The process films and the two secondaries they make, so a node's colour is
 * the same colour its evidence prints on in the overlay stack.
 */
const NODE_STYLE: Record<string, { fill: string; stroke: string; r: number }> = {
  ACCOUNT: { fill: "#ec008c", stroke: "#bf0072", r: 11 },
  DEVICE: { fill: "#00aeef", stroke: "#00738f", r: 8 },
  ADDRESS: { fill: "#ffe800", stroke: "#8a6800", r: 8 },
  PAYMENT: { fill: "#6a5cf0", stroke: "#4436c4", r: 8 },
  CUSTOMER: { fill: "#19a86a", stroke: "#0d7145", r: 7 },
};

const DEFAULT_STYLE = { fill: "#c3cfd8", stroke: "#7b8b96", r: 6 };

/** Deterministic 32-bit hash, used to seed positions from node ids. */
function hash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

interface Positioned {
  node: GraphNode;
  x: number;
  y: number;
}

const WIDTH = 760;
const HEIGHT = 460;

/**
 * Seeded force-directed layout.
 *
 * Fruchterman-Reingold with a fixed iteration count and a cooling schedule.
 * Small graphs (a cluster is typically under fifty nodes) settle well within
 * 300 iterations, and the whole layout is computed once in a `useMemo` rather
 * than animated — an analyst reading an evidence panel does not need the
 * picture to keep moving.
 */
function layout(nodes: GraphNode[], edges: GraphEdge[]): Positioned[] {
  const n = nodes.length;
  if (n === 0) return [];

  const pos = nodes.map((node) => {
    const h = hash(node.id);
    // Deterministic starting positions on a circle, jittered by the hash.
    const angle = ((h % 1000) / 1000) * Math.PI * 2;
    const radius = 60 + ((h >>> 10) % 140);
    return {
      node,
      x: WIDTH / 2 + Math.cos(angle) * radius,
      y: HEIGHT / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const index = new Map(pos.map((p, i) => [p.node.id, i]));
  const k = Math.sqrt((WIDTH * HEIGHT) / n) * 0.62;

  const links = edges
    .map((e) => ({ s: index.get(e.source), t: index.get(e.target), w: e.derived ? e.weight : 1 }))
    .filter((l): l is { s: number; t: number; w: number } => l.s !== undefined && l.t !== undefined);

  let temperature = WIDTH / 8;
  const iterations = 300;

  for (let iter = 0; iter < iterations; iter += 1) {
    // Repulsion between every pair.
    for (let i = 0; i < n; i += 1) {
      const a = pos[i] as (typeof pos)[number];
      a.vx = 0;
      a.vy = 0;
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const b = pos[j] as (typeof pos)[number];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) {
          // Coincident nodes: nudge apart deterministically by index.
          dx = (i - j) * 0.01;
          dy = 0.01;
          dist = 0.02;
        }
        const force = (k * k) / dist;
        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
      }
    }

    // Attraction along edges, weighted so a strong shared-payment link pulls
    // harder than a weak shared-address one.
    for (const link of links) {
      const a = pos[link.s] as (typeof pos)[number];
      const b = pos[link.t] as (typeof pos)[number];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
      const force = ((dist * dist) / k) * (0.4 + link.w);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }

    for (const p of pos) {
      const speed = Math.max(0.01, Math.sqrt(p.vx * p.vx + p.vy * p.vy));
      p.x += (p.vx / speed) * Math.min(speed, temperature);
      p.y += (p.vy / speed) * Math.min(speed, temperature);
      // Keep everything inside the viewport with a margin for labels.
      p.x = Math.max(28, Math.min(WIDTH - 28, p.x));
      p.y = Math.max(28, Math.min(HEIGHT - 28, p.y));
    }

    temperature *= 0.97;
  }

  return pos.map((p) => ({ node: p.node, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}

export interface GraphFilters {
  showDerived: boolean;
  showRaw: boolean;
  nodeTypes: Set<string>;
}

export function GraphView({
  nodes,
  edges,
  onSelectNode,
  onSelectEdge,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode?: (node: GraphNode) => void;
  onSelectEdge?: (edge: GraphEdge) => void;
}) {
  const [showDerived, setShowDerived] = useState(true);
  const [showRaw, setShowRaw] = useState(true);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const visibleNodes = useMemo(
    () => nodes.filter((n) => !hidden.has(n.type)),
    [nodes, hidden],
  );

  const visibleEdges = useMemo(() => {
    const ids = new Set(visibleNodes.map((n) => n.id));
    return edges.filter(
      (e) =>
        ids.has(e.source) &&
        ids.has(e.target) &&
        ((e.derived && showDerived) || (!e.derived && showRaw)),
    );
  }, [edges, visibleNodes, showDerived, showRaw]);

  // Layout depends only on which nodes and edges are visible, so toggling a
  // filter re-lays-out deterministically rather than jumping randomly.
  const positioned = useMemo(() => layout(visibleNodes, visibleEdges), [visibleNodes, visibleEdges]);
  const positionOf = useMemo(
    () => new Map(positioned.map((p) => [p.node.id, p])),
    [positioned],
  );

  const nodeTypes = useMemo(() => [...new Set(nodes.map((n) => n.type))].sort(), [nodes]);

  const toggleType = (type: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const derivedCount = edges.filter((e) => e.derived).length;
  const rawCount = edges.length - derivedCount;

  return (
    <div>
      {/* ------------------------------------------------ FILTERS ---- */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowDerived((v) => !v)}
          aria-pressed={showDerived}
          className={`tag ${showDerived ? "tag-m" : "tag-n"}`}
        >
          Inferred links ({derivedCount})
        </button>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-pressed={showRaw}
          className={`tag ${showRaw ? "tag-c" : "tag-n"}`}
        >
          Observed links ({rawCount})
        </button>

        <span className="mx-1 h-4 w-px bg-[var(--rule)]" />

        {nodeTypes.map((type) => {
          const style = NODE_STYLE[type] ?? DEFAULT_STYLE;
          const on = !hidden.has(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              aria-pressed={on}
              className="tag"
              style={{
                borderColor: on ? style.stroke : "var(--rule)",
                color: on ? style.stroke : "var(--ink-3)",
                background: on ? `color-mix(in srgb, ${style.fill} 14%, transparent)` : "transparent",
              }}
            >
              {type}
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------- CANVAS --- */}
      <div className="sheet scroll-x graph-scroll">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[680px]"
          role="img"
          aria-label={`Cluster graph with ${visibleNodes.length} nodes and ${visibleEdges.length} links`}
        >
          <defs>
            {/* The light box's own grid, ruled under the sheet. */}
            <pattern id="lightbox-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="#10161b" strokeOpacity="0.05" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="#ffffff" />
          <rect width={WIDTH} height={HEIGHT} fill="url(#lightbox-grid)" />

          {/* Edges first, so nodes sit above them. */}
          <g>
            {visibleEdges.map((edge) => {
              const a = positionOf.get(edge.source);
              const b = positionOf.get(edge.target);
              if (!a || !b) return null;

              return (
                <line
                  key={edge.id}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={edge.derived ? "var(--film-m)" : "var(--ink-c)"}
                  strokeWidth={edge.derived ? Math.max(1, edge.weight * 3) : 1.2}
                  strokeOpacity={edge.derived ? 0.5 + edge.weight * 0.4 : 0.55}
                  className={`g-edge ${edge.derived ? "g-derived" : ""}`}
                  onClick={() => onSelectEdge?.(edge)}
                >
                  <title>
                    {edge.derived ? "INFERRED — " : "OBSERVED — "}
                    {edge.type} · weight {edge.weight.toFixed(2)} · {edge.provenance}
                  </title>
                </line>
              );
            })}
          </g>

          {/* Nodes. */}
          <g>
            {positioned.map((p) => {
              const style = NODE_STYLE[p.node.type] ?? DEFAULT_STYLE;
              const isSelected = selected === p.node.id;
              // An infrastructure node touched by many accounts is drawn bigger:
              // a device shared by three people reads differently from one
              // shared by thirty, and that difference matters to a reviewer.
              const radius = style.r + Math.min(6, p.node.fanout * 0.35);

              return (
                <g key={p.node.id}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={radius}
                    fill={style.fill}
                    fillOpacity={isSelected ? 0.95 : 0.7}
                    stroke={isSelected ? "#10161b" : style.stroke}
                    strokeWidth={isSelected ? 3 : 1.5}
                    className="g-node"
                    onClick={() => {
                      setSelected(p.node.id);
                      onSelectNode?.(p.node);
                    }}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(p.node.id);
                        onSelectNode?.(p.node);
                      }
                    }}
                    role="button"
                    aria-label={`${p.node.type} ${p.node.label}, ${p.node.eventCount} events`}
                  >
                    <title>
                      {p.node.type} · {p.node.label} · {p.node.eventCount} event(s)
                      {p.node.fanout > 0 ? ` · touched by ${p.node.fanout} link(s)` : ""}
                    </title>
                  </circle>
                  {p.node.type === "ACCOUNT" && (
                    <text
                      x={p.x}
                      y={p.y + radius + 11}
                      textAnchor="middle"
                      className="mono"
                      fontSize="8"
                      fill="var(--ink-3)"
                      pointerEvents="none"
                    >
                      {p.node.anonymizedKey.slice(-6)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* --------------------------------------------------- LEGEND -- */}
      <div className="note-s mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-1.5">
          <svg width="26" height="6" aria-hidden>
            <line x1="0" y1="3" x2="26" y2="3" stroke="var(--film-m)" strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          Inferred — this system concluded it from a shared node
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="26" height="6" aria-hidden>
            <line x1="0" y1="3" x2="26" y2="3" stroke="var(--ink-c)" strokeWidth="1.5" />
          </svg>
          Observed — an event asserted it
        </span>
        <span>Node size grows with how many accounts touch it.</span>
      </div>

      {visibleNodes.length === 0 && (
        <p className="note-s mt-3">
          Every node type is hidden. Re-enable one above.
        </p>
      )}
    </div>
  );
}
