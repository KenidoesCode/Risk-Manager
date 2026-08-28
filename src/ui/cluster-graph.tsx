"use client";

import { useState } from "react";

import { GraphView, type GraphEdge, type GraphNode } from "./graph-view";

/**
 * The entity graph and its provenance panel.
 *
 * This is the only interactive part of the cluster page, so it is the only
 * part that ships as a client component. Clicking a node or an edge opens the
 * provenance below it; for an inferred edge that panel names the shared node
 * the inference came from, so a reviewer can always walk from a conclusion back
 * to an observation.
 */
export function ClusterGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  return (
    <>
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
        <div className="mt-4 border-l-2 border-l-[var(--film-c)] bg-[var(--sheet-2)] px-4 py-3">
          {selectedNode && (
            <>
              <p className="cap">Node</p>
              <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="cap">Type</dt>
                  <dd className="mono mt-0.5 t-ink">{selectedNode.type}</dd>
                </div>
                <div>
                  <dt className="cap">Anonymised key</dt>
                  <dd className="id mt-0.5 t-ink">{selectedNode.anonymizedKey}</dd>
                </div>
                <div>
                  <dt className="cap">First seen</dt>
                  <dd className="num mt-0.5 t-2">{selectedNode.firstSeen.slice(0, 10)}</dd>
                </div>
                <div>
                  <dt className="cap">Last seen</dt>
                  <dd className="num mt-0.5 t-2">{selectedNode.lastSeen.slice(0, 10)}</dd>
                </div>
                <div>
                  <dt className="cap">Events</dt>
                  <dd className="num mt-0.5 t-2">{selectedNode.eventCount}</dd>
                </div>
                <div>
                  <dt className="cap">Links through this node</dt>
                  <dd className="num mt-0.5 t-2">{selectedNode.fanout}</dd>
                </div>
              </dl>
              <p className="note-s mt-3">
                This is an anonymised hash, not an address or a device identifier. The only question
                the detection asks of it is whether two accounts touched the same one.
              </p>
            </>
          )}

          {selectedEdge && (
            <>
              <p className="cap">{selectedEdge.derived ? "Inferred link" : "Observed link"}</p>
              <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="cap">Relationship</dt>
                  <dd className="mono mt-0.5 t-ink">{selectedEdge.type}</dd>
                </div>
                <div>
                  <dt className="cap">Weight</dt>
                  <dd className="num mt-0.5 t-ink">{selectedEdge.weight.toFixed(3)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="cap">Provenance</dt>
                  <dd className="note mt-0.5">{selectedEdge.provenance}</dd>
                </div>
                {selectedEdge.viaEntityId && (
                  <div className="sm:col-span-2">
                    <dt className="cap">Shared node behind the inference</dt>
                    <dd className="id mt-0.5 t-c">{selectedEdge.viaEntityId}</dd>
                  </div>
                )}
                <div>
                  <dt className="cap">Observed between</dt>
                  <dd className="num mt-0.5 t-2">
                    {selectedEdge.firstSeen.slice(0, 10)} &rarr; {selectedEdge.lastSeen.slice(0, 10)}
                  </dd>
                </div>
                <div>
                  <dt className="cap">Observations</dt>
                  <dd className="num mt-0.5 t-2">{selectedEdge.observationCount}</dd>
                </div>
              </dl>
              {selectedEdge.derived && (
                <p className="note-s mt-3">
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
    </>
  );
}
