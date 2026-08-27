import type { InMemoryGraph } from "../graph/builder";

/**
 * Two clustering methods, because the spec asks for more than one and because
 * they fail differently.
 *
 * ---------------------------------------------------------------------------
 * WHY BOTH, AND WHEN EACH IS WRONG
 * ---------------------------------------------------------------------------
 * SHARED-ENTITY (connected components over derived edges) is exact and
 * explainable: every member is reachable from every other through a chain of
 * concrete shared-infrastructure links a reviewer can walk. Its failure mode is
 * chaining — one flatmate who happens to share an address with a ring member
 * drags an entire unrelated household into the cluster, and with enough such
 * bridges the whole graph becomes one component.
 *
 * LOUVAIN optimises modularity and will cut those weak bridges, separating two
 * groups joined by a single low-weight address link. Its failure mode is
 * instability: modularity has many near-optimal partitions, and a different
 * node ordering can produce a different answer on the same data. That matters
 * when the output is "these seven people are being investigated together", so
 * the stability of a cluster across perturbed runs is measured and reported
 * rather than assumed.
 *
 * Neither is treated as ground truth. The evaluation reports both.
 */

export interface Cluster {
  members: string[];
  method: "shared-entity" | "louvain";
  /** Sum of intra-cluster edge weights divided by possible pairs, 0..1. */
  density: number;
  /** Infrastructure entity ids that hold the cluster together. */
  bridgingEntities: string[];
  /** Per-member: how they joined, for the provenance panel. */
  joinPaths: Map<string, string>;
}

/* -------------------------------------------------------------------------- */
/* Connected components over derived edges                                    */
/* -------------------------------------------------------------------------- */

export function sharedEntityClusters(
  graph: InMemoryGraph,
  options: { minWeight?: number; minSize?: number } = {},
): Cluster[] {
  const minWeight = options.minWeight ?? 0.3;
  const minSize = options.minSize ?? 2;

  const visited = new Set<string>();
  const clusters: Cluster[] = [];

  for (const start of graph.accountEntityIds) {
    if (visited.has(start)) continue;

    const members: string[] = [];
    const joinPaths = new Map<string, string>();
    const bridging = new Set<string>();
    const queue = [start];
    visited.add(start);
    joinPaths.set(start, "seed");

    while (queue.length > 0) {
      const current = queue.shift() as string;
      members.push(current);

      for (const edge of graph.adjacency.get(current) ?? []) {
        // A weak link — an address shared across a long time gap — is not
        // enough to pull a stranger into someone else's cluster.
        if (edge.weight < minWeight) continue;
        if (edge.via) bridging.add(edge.via);
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        joinPaths.set(
          edge.to,
          `${edge.type} with ${current.slice(-8)} via ${edge.via?.slice(-8) ?? "unknown"} (weight ${edge.weight.toFixed(2)})`,
        );
        queue.push(edge.to);
      }
    }

    if (members.length < minSize) continue;

    clusters.push({
      members,
      method: "shared-entity",
      density: intraDensity(graph, members),
      bridgingEntities: [...bridging],
      joinPaths,
    });
  }

  return clusters.sort((a, b) => b.members.length - a.members.length);
}

/** Weighted density: actual intra-cluster weight over the complete-graph max. */
export function intraDensity(graph: InMemoryGraph, members: string[]): number {
  if (members.length < 2) return 0;
  const set = new Set(members);
  let weight = 0;

  for (const m of members) {
    for (const edge of graph.adjacency.get(m) ?? []) {
      if (!set.has(edge.to)) continue;
      weight += edge.weight;
    }
  }

  // Each undirected edge was counted from both ends.
  weight /= 2;

  const possible = (members.length * (members.length - 1)) / 2;
  if (possible === 0) return 0;
  // Normalised by possible pairs, not by observed edges: a 6-account cluster
  // held together by 5 edges is genuinely sparser than one with 15, and
  // dividing by observed edges would hide exactly that.
  return Number(Math.min(1, weight / possible).toFixed(4));
}

/* -------------------------------------------------------------------------- */
/* Louvain                                                                    */
/* -------------------------------------------------------------------------- */

interface LouvainState {
  community: Map<string, number>;
  nodeWeight: Map<string, number>;
  communityTotal: Map<number, number>;
  totalWeight: number;
}

/**
 * Louvain modularity optimisation, one level, iterated to convergence.
 *
 * Implemented here rather than pulled from a package: the graphs are small
 * (thousands of nodes), the algorithm is short, and a dependency whose node
 * ordering we do not control would make the stability measurement meaningless.
 * Node order is taken from a caller-supplied array so a perturbed re-run is a
 * matter of shuffling that array.
 */
export function louvainClusters(
  graph: InMemoryGraph,
  options: { order?: string[]; minSize?: number; maxIterations?: number } = {},
): Cluster[] {
  const order = options.order ?? graph.accountEntityIds;
  const minSize = options.minSize ?? 2;
  const maxIterations = options.maxIterations ?? 20;

  const state: LouvainState = {
    community: new Map(),
    nodeWeight: new Map(),
    communityTotal: new Map(),
    totalWeight: 0,
  };

  order.forEach((node, index) => {
    state.community.set(node, index);
    const w = (graph.adjacency.get(node) ?? []).reduce((a, e) => a + e.weight, 0);
    state.nodeWeight.set(node, w);
    state.communityTotal.set(index, w);
    state.totalWeight += w;
  });

  // Each undirected edge contributes from both endpoints.
  const m = state.totalWeight / 2;
  if (m === 0) return [];

  let improved = true;
  let iteration = 0;

  while (improved && iteration < maxIterations) {
    improved = false;
    iteration += 1;

    for (const node of order) {
      const currentCommunity = state.community.get(node) as number;
      const nodeW = state.nodeWeight.get(node) ?? 0;

      // Weight from this node into each neighbouring community.
      const linksTo = new Map<number, number>();
      for (const edge of graph.adjacency.get(node) ?? []) {
        const c = state.community.get(edge.to);
        if (c === undefined) continue;
        linksTo.set(c, (linksTo.get(c) ?? 0) + edge.weight);
      }

      // Remove the node from its community before evaluating alternatives.
      state.communityTotal.set(
        currentCommunity,
        (state.communityTotal.get(currentCommunity) ?? 0) - nodeW,
      );

      let bestCommunity = currentCommunity;
      let bestGain = (linksTo.get(currentCommunity) ?? 0) -
        ((state.communityTotal.get(currentCommunity) ?? 0) * nodeW) / (2 * m);

      for (const [candidate, linkWeight] of linksTo) {
        if (candidate === currentCommunity) continue;
        const gain = linkWeight - ((state.communityTotal.get(candidate) ?? 0) * nodeW) / (2 * m);
        if (gain > bestGain) {
          bestGain = gain;
          bestCommunity = candidate;
        }
      }

      state.communityTotal.set(bestCommunity, (state.communityTotal.get(bestCommunity) ?? 0) + nodeW);
      if (bestCommunity !== currentCommunity) {
        state.community.set(node, bestCommunity);
        improved = true;
      }
    }
  }

  const grouped = new Map<number, string[]>();
  for (const [node, community] of state.community) {
    const list = grouped.get(community) ?? [];
    list.push(node);
    grouped.set(community, list);
  }

  const clusters: Cluster[] = [];
  for (const members of grouped.values()) {
    if (members.length < minSize) continue;

    const set = new Set(members);
    const bridging = new Set<string>();
    const joinPaths = new Map<string, string>();

    for (const member of members) {
      for (const edge of graph.adjacency.get(member) ?? []) {
        if (!set.has(edge.to)) continue;
        if (edge.via) bridging.add(edge.via);
        if (!joinPaths.has(member)) {
          joinPaths.set(
            member,
            `${edge.type} with ${edge.to.slice(-8)} via ${edge.via?.slice(-8) ?? "unknown"} (weight ${edge.weight.toFixed(2)})`,
          );
        }
      }
      if (!joinPaths.has(member)) joinPaths.set(member, "community assignment");
    }

    clusters.push({
      members,
      method: "louvain",
      density: intraDensity(graph, members),
      bridgingEntities: [...bridging],
      joinPaths,
    });
  }

  return clusters.sort((a, b) => b.members.length - a.members.length);
}

/* -------------------------------------------------------------------------- */
/* Stability                                                                  */
/* -------------------------------------------------------------------------- */

/** Jaccard overlap between two member sets. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const x of setA) if (setB.has(x)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : Number((intersection / union).toFixed(4));
}

/**
 * Measures how much a cluster survives re-running Louvain under a different
 * node ordering.
 *
 * This is not a nicety. Modularity has many near-optimal partitions, so a
 * cluster that dissolves under reordering is an artefact of iteration order
 * rather than a structure in the data — and presenting it to a reviewer as
 * "these seven accounts are connected" would be presenting an accident.
 *
 * Low stability lowers confidence and can route the cluster to review; it never
 * silently raises the risk score.
 */
export function measureStability(
  graph: InMemoryGraph,
  cluster: Cluster,
  perturbedRuns: Cluster[][],
): number {
  if (perturbedRuns.length === 0) return 1;

  const scores = perturbedRuns.map((run) => {
    let best = 0;
    for (const candidate of run) {
      const overlap = jaccard(cluster.members, candidate.members);
      if (overlap > best) best = overlap;
    }
    return best;
  });

  return Number((scores.reduce((a, s) => a + s, 0) / scores.length).toFixed(4));
}

/** Deterministic reordering for a perturbed run. Seeded, so it is repeatable. */
export function rotateOrder(order: readonly string[], offset: number): string[] {
  const n = order.length;
  if (n === 0) return [];
  const shift = ((offset % n) + n) % n;
  return [...order.slice(shift), ...order.slice(0, shift)];
}
