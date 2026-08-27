"use client";

import { useState } from "react";
import { AlertTriangle, Check, Info } from "lucide-react";

import { GraphView, type GraphEdge, type GraphNode } from "./graph-view";
import { Empty, Panel, SignalRow, StateChip } from "./primitives";

/**
 * Cluster detail.
 *
 * The graph, the signal breakdown and the counter-signals sit on one screen
 * because a reviewer deciding whether to investigate people needs all three at
 * once: the structure, the arithmetic behind the score, and the legitimate
 * explanations that fit the same evidence.
 *
 * Clicking a node or an edge opens its provenance panel. For an inferred edge
 * that panel names the shared node the inference came from, so the reviewer can
 * always walk from a conclusion back to an observation.
 */

interface ScoredSignal {
  signal: string;
  label: string;
  featureValue: number;
  maxPoints: number;
  points: number;
  rationale: string;
  observation: string;
}

interface CounterSignal {
  signal: string;
  label: string;
  detail: string;
}

interface Explanation {
  summary: string;
  signals: Array<{ signalType: string; explanation: string }>;
  caveats: string[];
}

export interface ClusterDetailProps {
  cluster: {
    id: string;
    accountCount: number;
    riskScore: number;
    confidence: number;
    verdict: string;
    requiresReview: boolean;
    reviewReason: string | null;
    method: string;
    stability: number | null;
    explanationSource: string;
    signals: ScoredSignal[];
    counterSignals: CounterSignal[];
    explanation: Explanation | null;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  riskThreshold: number;
  timeline: Array<{ at: string; kind: string; accountId: string; detail: string }>;
}

export function ClusterDetail({ cluster, nodes, edges, riskThreshold, timeline }: ClusterDetailProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  const contributing = cluster.signals.filter((s) => s.points > 0.05);
  const structural = new Set(["SHARED_PAYMENT", "SHARED_DEVICE", "SHARED_ADDRESS", "CLUSTER_DENSITY"]);
  const structuralPoints = contributing
    .filter((s) => structural.has(s.signal))
    .reduce((a, s) => a + s.points, 0);
  const behaviouralPoints = contributing
    .filter((s) => !structural.has(s.signal))
    .reduce((a, s) => a + s.points, 0);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------- GRAPH ---- */}
      <Panel
        title="Entity graph"
        subtitle="Solid cyan is observed. Dashed magenta is inferred by this system from a shared node."
      >
        <GraphView
          nodes={nodes}
          edges={edges}
          onSelectNode={(n) => {
            setSelectedNode(n);
            setSelectedEdge(null);
          }}
          onSelectEdge={(e) => {
            setSelectedEdge(e);
            setSelectedNode(null);
          }}
        />

        {(selectedNode || selectedEdge) && (
          <div className="mt-4 border-l-2 border-l-[var(--color-node)] bg-[var(--color-web-raised)] px-4 py-3">
            {selectedNode && (
              <>
                <p className="web-label">Node</p>
                <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="web-label">Type</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{selectedNode.type}</dd>
                  </div>
                  <div>
                    <dt className="web-label">Anonymised key</dt>
                    <dd className="web-strand mt-0.5 break-all text-[var(--color-chalk)]">
                      {selectedNode.anonymizedKey}
                    </dd>
                  </div>
                  <div>
                    <dt className="web-label">First seen</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">
                      {selectedNode.firstSeen.slice(0, 10)}
                    </dd>
                  </div>
                  <div>
                    <dt className="web-label">Last seen</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">
                      {selectedNode.lastSeen.slice(0, 10)}
                    </dd>
                  </div>
                  <div>
                    <dt className="web-label">Events</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">{selectedNode.eventCount}</dd>
                  </div>
                  <div>
                    <dt className="web-label">Links through this node</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">{selectedNode.fanout}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
                  This is an anonymised hash, not an address or a device identifier. The only question
                  the detection asks of it is whether two accounts touched the same one.
                </p>
              </>
            )}

            {selectedEdge && (
              <>
                <p className="web-label">
                  {selectedEdge.derived ? "Inferred link" : "Observed link"}
                </p>
                <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="web-label">Relationship</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">{selectedEdge.type}</dd>
                  </div>
                  <div>
                    <dt className="web-label">Weight</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk)]">
                      {selectedEdge.weight.toFixed(3)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="web-label">Provenance</dt>
                    <dd className="mt-0.5 leading-relaxed text-[var(--color-chalk-dim)]">
                      {selectedEdge.provenance}
                    </dd>
                  </div>
                  {selectedEdge.viaEntityId && (
                    <div className="sm:col-span-2">
                      <dt className="web-label">Shared node behind the inference</dt>
                      <dd className="web-strand mt-0.5 break-all text-[var(--color-node)]">
                        {selectedEdge.viaEntityId}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="web-label">Observed between</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">
                      {selectedEdge.firstSeen.slice(0, 10)} &rarr; {selectedEdge.lastSeen.slice(0, 10)}
                    </dd>
                  </div>
                  <div>
                    <dt className="web-label">Observations</dt>
                    <dd className="web-strand mt-0.5 text-[var(--color-chalk-dim)]">
                      {selectedEdge.observationCount}
                    </dd>
                  </div>
                </dl>
                {selectedEdge.derived && (
                  <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
                    This link never appeared in any event. It is an inference: both accounts touched
                    the shared node above. The weight includes a temporal factor, so a device used by
                    the two accounts a year apart counts for much less than one they used in the same
                    week.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------ SIGNALS --- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Why this score"
          subtitle={`${structuralPoints.toFixed(1)} from structure, ${behaviouralPoints.toFixed(1)} from behaviour, out of 100`}
        >
          {contributing.length === 0 ? (
            <Empty title="No signal contributed measurable points." />
          ) : (
            <ul>
              {contributing.map((s) => (
                <SignalRow
                  key={s.signal}
                  label={s.label}
                  points={s.points}
                  maxPoints={s.maxPoints}
                  observation={s.observation}
                  rationale={s.rationale}
                />
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-[var(--color-web-line)] pt-3">
            <div className="flex items-baseline justify-between">
              <span className="web-label">Total</span>
              <span className="web-strand text-lg text-[var(--color-chalk)]">
                {cluster.riskScore.toFixed(1)}
                <span className="text-xs text-[var(--color-chalk-faint)]"> / 100</span>
              </span>
            </div>
            {behaviouralPoints < 8 && (
              <p className="mt-2 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-[var(--color-state-clear)]">
                <Check size={12} className="mt-0.5 shrink-0" aria-hidden />
                Behavioural evidence is below 8 points, so the structural-only guardrail caps this
                score below the {riskThreshold} threshold. Shared infrastructure alone cannot produce
                a detection.
              </p>
            )}
          </div>
        </Panel>

        <Panel
          title="Legitimate explanations"
          subtitle="Computed and shown whether or not the risk score is high."
        >
          {cluster.counterSignals.length === 0 ? (
            <Empty
              title="No legitimate explanation fits this evidence."
              detail="That is a meaningful statement rather than an empty panel: the detector looked for household, tenure, category-diversity and payment-independence explanations and found none of them present."
            />
          ) : (
            <ul className="space-y-3">
              {cluster.counterSignals.map((c) => (
                <li key={c.signal} className="flex gap-2.5">
                  <Info size={13} className="mt-0.5 shrink-0 text-[var(--color-state-clear)]" aria-hidden />
                  <div>
                    <p className="text-xs font-medium text-[var(--color-chalk)]">{c.label}</p>
                    <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-dim)]">
                      {c.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 border-t border-[var(--color-web-line)] pt-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            A detection presented without the legitimate readings that also fit the evidence is one a
            reviewer cannot properly evaluate. Each of these lowers the detector&rsquo;s confidence.
          </p>
        </Panel>
      </div>

      {/* -------------------------------------------- EXPLANATION --- */}
      {cluster.explanation && (
        <Panel
          title={
            cluster.explanationSource === "model"
              ? "Explanation — model-written"
              : "Explanation — deterministic"
          }
          subtitle={
            cluster.explanationSource === "model"
              ? "Validated: it may only name signals the detector computed, and may not state a verdict."
              : "No model provider configured. Generated from the computed signals."
          }
        >
          <p className="text-sm leading-relaxed text-[var(--color-chalk-dim)]">
            {cluster.explanation.summary}
          </p>

          {cluster.explanation.caveats.length > 0 && (
            <ul className="mt-4 space-y-2">
              {cluster.explanation.caveats.map((caveat, i) => (
                <li key={i} className="flex gap-2 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[var(--color-state-possible)]" aria-hidden />
                  {caveat}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* ---------------------------------------------- TIMELINE ---- */}
      <Panel title="Timeline" subtitle="Orders, returns and refunds across the cluster, in order.">
        {timeline.length === 0 ? (
          <Empty title="No events recorded for this cluster." />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="web-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Account</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {timeline.slice(0, 200).map((e, i) => (
                  <tr key={i}>
                    <td className="web-strand text-[0.6875rem] text-[var(--color-chalk-faint)]">
                      {e.at.slice(0, 16).replace("T", " ")}
                    </td>
                    <td>
                      <span
                        className={`web-stamp ${
                          e.kind === "RETURN"
                            ? "text-[var(--color-state-possible)]"
                            : e.kind === "REFUND"
                              ? "text-[var(--color-strand)]"
                              : "text-[var(--color-chalk-dim)]"
                        }`}
                      >
                        {e.kind}
                      </span>
                    </td>
                    <td className="web-strand text-[0.625rem] text-[var(--color-chalk-faint)]">
                      {e.accountId.slice(-10)}
                    </td>
                    <td className="text-[0.6875rem] text-[var(--color-chalk-dim)]">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {timeline.length > 200 && (
              <p className="mt-2 text-[0.6875rem] text-[var(--color-chalk-faint)]">
                Showing the first 200 of {timeline.length} events.
              </p>
            )}
          </div>
        )}
      </Panel>

      {cluster.stability !== null && (
        <Panel title="Cluster stability">
          <div className="flex items-center gap-3">
            <div className="web-bar w-40">
              <span
                style={{
                  width: `${cluster.stability * 100}%`,
                  background:
                    cluster.stability < 0.5 ? "var(--color-state-possible)" : "var(--color-state-clear)",
                }}
              />
            </div>
            <span className="web-strand text-sm">{(cluster.stability * 100).toFixed(0)}%</span>
            <StateChip state={cluster.stability < 0.5 ? "ADVERSARIAL" : "EASY"} />
          </div>
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--color-chalk-faint)]">
            How much of this membership survives re-clustering under a different node ordering.
            Modularity has many near-optimal partitions, so a cluster that dissolves under reordering
            is an artefact of iteration order rather than a structure in the data — and presenting it
            as &ldquo;these accounts are connected&rdquo; would be presenting an accident. Low
            stability lowers confidence and routes the cluster to a person; it never raises the score.
          </p>
        </Panel>
      )}
    </div>
  );
}
