import { describe, expect, it } from "vitest";

import {
  intraDensity,
  jaccard,
  louvainClusters,
  measureStability,
  rotateOrder,
  sharedEntityClusters,
} from "../../src/detection/clustering";
import { temporalOverlapFactor } from "../../src/graph/builder";
import type { InMemoryGraph } from "../../src/graph/builder";

/** Builds an in-memory graph from an undirected edge list. */
function graphOf(
  accounts: string[],
  edges: Array<[string, string, number, string?]>,
): InMemoryGraph {
  const adjacency = new Map<string, Array<{ to: string; type: string; weight: number; via: string | null }>>();
  const push = (from: string, to: string, weight: number, via: string | null) => {
    const list = adjacency.get(from) ?? [];
    list.push({ to, type: "SHARES_DEVICE", weight, via });
    adjacency.set(from, list);
  };
  for (const [a, b, w, via] of edges) {
    push(a, b, w, via ?? null);
    push(b, a, w, via ?? null);
  }
  return {
    adjacency,
    accountEntityIds: accounts,
    entityById: new Map(accounts.map((a) => [a, { id: a, type: "ACCOUNT" as const, anonymizedKey: a }])),
  };
}

describe("shared-entity clustering", () => {
  it("groups accounts connected through shared infrastructure", () => {
    const graph = graphOf(
      ["a", "b", "c", "d"],
      [
        ["a", "b", 0.7, "dev1"],
        ["b", "c", 0.7, "dev1"],
      ],
    );
    const clusters = sharedEntityClusters(graph);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members.sort()).toEqual(["a", "b", "c"]);
  });

  it("does not pull in an account across a weak link", () => {
    const graph = graphOf(
      ["a", "b", "c"],
      [
        ["a", "b", 0.7, "dev1"],
        // A weak address link with a long time gap must not drag c in.
        ["b", "c", 0.12, "adr1"],
      ],
    );
    const clusters = sharedEntityClusters(graph, { minWeight: 0.3 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.members.sort()).toEqual(["a", "b"]);
  });

  it("records how each member joined, for provenance", () => {
    const graph = graphOf(["a", "b"], [["a", "b", 0.7, "dev1"]]);
    const [cluster] = sharedEntityClusters(graph);
    expect(cluster?.joinPaths.get("b")).toContain("SHARES_DEVICE");
    expect(cluster?.joinPaths.get("b")).toContain("dev1");
    expect(cluster?.bridgingEntities).toContain("dev1");
  });

  it("is order-independent", () => {
    const edges: Array<[string, string, number, string]> = [
      ["a", "b", 0.7, "d1"],
      ["c", "d", 0.7, "d2"],
    ];
    const forward = sharedEntityClusters(graphOf(["a", "b", "c", "d"], edges));
    const reversed = sharedEntityClusters(graphOf(["d", "c", "b", "a"], edges));

    const norm = (cs: ReturnType<typeof sharedEntityClusters>) =>
      cs.map((c) => [...c.members].sort().join(",")).sort();
    expect(norm(forward)).toEqual(norm(reversed));
  });

  it("ignores singletons", () => {
    const graph = graphOf(["a", "b", "lonely"], [["a", "b", 0.7, "d1"]]);
    const clusters = sharedEntityClusters(graph, { minSize: 2 });
    expect(clusters.flatMap((c) => c.members)).not.toContain("lonely");
  });
});

describe("density", () => {
  it("is 1 for a fully connected cluster at full weight", () => {
    const graph = graphOf(
      ["a", "b", "c"],
      [
        ["a", "b", 1, "d"],
        ["b", "c", 1, "d"],
        ["a", "c", 1, "d"],
      ],
    );
    expect(intraDensity(graph, ["a", "b", "c"])).toBe(1);
  });

  it("is lower for a chain than for a mesh of the same size", () => {
    const chain = graphOf(
      ["a", "b", "c"],
      [
        ["a", "b", 1, "d"],
        ["b", "c", 1, "d"],
      ],
    );
    const mesh = graphOf(
      ["a", "b", "c"],
      [
        ["a", "b", 1, "d"],
        ["b", "c", 1, "d"],
        ["a", "c", 1, "d"],
      ],
    );
    expect(intraDensity(chain, ["a", "b", "c"])).toBeLessThan(intraDensity(mesh, ["a", "b", "c"]));
  });

  it("is zero for a single member", () => {
    expect(intraDensity(graphOf(["a"], []), ["a"])).toBe(0);
  });
});

describe("louvain", () => {
  it("separates two groups joined by a single weak bridge", () => {
    const graph = graphOf(
      ["a1", "a2", "a3", "b1", "b2", "b3"],
      [
        ["a1", "a2", 1, "da"],
        ["a2", "a3", 1, "da"],
        ["a1", "a3", 1, "da"],
        ["b1", "b2", 1, "db"],
        ["b2", "b3", 1, "db"],
        ["b1", "b3", 1, "db"],
        // The bridge: one weak shared address between the two groups.
        ["a1", "b1", 0.05, "shared-address"],
      ],
    );

    const clusters = louvainClusters(graph, { minSize: 2 });
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    const withA1 = clusters.find((c) => c.members.includes("a1"));
    expect(withA1?.members).not.toContain("b2");
  });

  it("returns nothing on an edgeless graph", () => {
    expect(louvainClusters(graphOf(["a", "b"], []))).toHaveLength(0);
  });
});

describe("stability", () => {
  it("reports 1 when the cluster survives every perturbed run", () => {
    const graph = graphOf(["a", "b"], [["a", "b", 1, "d"]]);
    const [cluster] = sharedEntityClusters(graph);
    const runs = [sharedEntityClusters(graph), sharedEntityClusters(graph)];
    expect(measureStability(graph, cluster!, runs)).toBe(1);
  });

  it("falls when the cluster dissolves under reordering", () => {
    const graph = graphOf(["a", "b", "c", "d"], [["a", "b", 1, "d1"]]);
    const [cluster] = sharedEntityClusters(graph);
    // A perturbed run that split the pair apart.
    const runs = [[{ members: ["a"], method: "louvain" as const, density: 0, bridgingEntities: [], joinPaths: new Map() }]];
    expect(measureStability(graph, cluster!, runs)).toBeLessThan(1);
  });

  it("rotateOrder is deterministic and preserves membership", () => {
    const order = ["a", "b", "c", "d"];
    expect(rotateOrder(order, 1)).toEqual(["b", "c", "d", "a"]);
    expect(rotateOrder(order, 1)).toEqual(rotateOrder(order, 1));
    expect([...rotateOrder(order, 3)].sort()).toEqual([...order].sort());
  });
});

describe("jaccard", () => {
  it("is 1 for identical sets and 0 for disjoint ones", () => {
    expect(jaccard(["a", "b"], ["b", "a"])).toBe(1);
    expect(jaccard(["a"], ["b"])).toBe(0);
  });

  it("handles partial overlap", () => {
    expect(jaccard(["a", "b", "c"], ["b", "c", "d"])).toBeCloseTo(0.5, 4);
  });

  it("treats two empty sets as identical", () => {
    expect(jaccard([], [])).toBe(1);
  });
});

describe("temporal decay on shared links", () => {
  const d = (iso: string) => new Date(iso);

  it("gives full weight to overlapping usage windows", () => {
    expect(
      temporalOverlapFactor(
        d("2026-01-01T00:00:00Z"),
        d("2026-06-01T00:00:00Z"),
        d("2026-03-01T00:00:00Z"),
        d("2026-08-01T00:00:00Z"),
      ),
    ).toBe(1);
  });

  it("decays when the windows are far apart", () => {
    // A device used by one account in early 2025 and another in late 2026 is
    // more likely a resold handset than two people acting together.
    const factor = temporalOverlapFactor(
      d("2025-01-01T00:00:00Z"),
      d("2025-03-01T00:00:00Z"),
      d("2026-08-01T00:00:00Z"),
      d("2026-09-01T00:00:00Z"),
    );
    expect(factor).toBeLessThan(0.5);
    expect(factor).toBeGreaterThanOrEqual(0.25);
  });

  it("never falls below the floor", () => {
    const factor = temporalOverlapFactor(
      d("2015-01-01T00:00:00Z"),
      d("2015-02-01T00:00:00Z"),
      d("2026-08-01T00:00:00Z"),
      d("2026-09-01T00:00:00Z"),
    );
    expect(factor).toBe(0.25);
  });
});
