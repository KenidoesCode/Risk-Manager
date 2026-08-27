/**
 * Ring dossiers.
 *
 * ---------------------------------------------------------------------------
 * WHAT LEAVES THE BUILDING
 * ---------------------------------------------------------------------------
 * Both formats are generated from the same query the console renders from, so
 * what an analyst downloads is what was on screen. Neither is a screenshot and
 * neither is a summary — the JSON carries every edge with its weight and the
 * reason it was derived, because a link a reviewer cannot interrogate is a link
 * they have to take on trust.
 *
 * The CSV is deliberately narrower: accounts and scores, the shape a person
 * opens in a spreadsheet before starting to make calls. It carries a header
 * comment naming the run and the threshold, because a CSV that outlives its
 * context is a list of accused people with no way to check why.
 */

export const DOSSIER_VERSION = "ring-dossier-1.0.0";

export interface SubgraphNode {
  id: string;
  type: string;
  label: string;
  eventCount: number;
  fanout: number;
  firstSeen: string;
  lastSeen: string;
  [key: string]: unknown;
}

export interface SubgraphEdge {
  source: string;
  target: string;
  type: string;
  derived: boolean;
  weight: number;
  provenance: string;
  observationCount: number;
  [key: string]: unknown;
}

export interface SubgraphMember {
  entityId: string;
  entityType: string;
  /** This member's share of the cluster's risk score. */
  contribution: number;
  joinedVia: string | null;
  [key: string]: unknown;
}

export interface DossierInput {
  cluster: Record<string, unknown> & { id: string };
  nodes: SubgraphNode[];
  edges: SubgraphEdge[];
  members: SubgraphMember[];
  generatedAt: string;
}

export function toJson(input: DossierInput): string {
  return JSON.stringify(
    {
      dossierVersion: DOSSIER_VERSION,
      generatedAt: input.generatedAt,
      notice:
        "Synthetic corpus. These accounts are generated and correspond to no real person. This system detects and explains; it never enforces, and nothing here is an instruction to act on an account.",
      cluster: input.cluster,
      members: input.members,
      nodes: input.nodes,
      edges: input.edges,
    },
    null,
    2,
  );
}

/** RFC 4180 quoting: a field containing a comma, quote or newline is quoted. */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(input: DossierInput): string {
  const lines: string[] = [];

  // A leading comment block. Excel shows it as a first column, which is ugly
  // and correct: a file of accused accounts that has lost its provenance is
  // worse than an ugly first row.
  lines.push(`# ring dossier ${DOSSIER_VERSION}`);
  lines.push(`# cluster ${input.cluster.id}`);
  lines.push(`# generated ${input.generatedAt}`);
  lines.push("# synthetic corpus - these accounts correspond to no real person");
  lines.push("# detection only - this system never enforces");

  const header = ["account_id", "type", "label", "risk_score", "degree", "derived_links", "observed_links"];
  lines.push(header.join(","));

  const degree = new Map<string, { derived: number; observed: number }>();
  for (const edge of input.edges) {
    for (const id of [edge.source, edge.target]) {
      const entry = degree.get(id) ?? { derived: 0, observed: 0 };
      if (edge.derived) entry.derived += 1;
      else entry.observed += 1;
      degree.set(id, entry);
    }
  }

  for (const node of input.nodes) {
    const d = degree.get(node.id) ?? { derived: 0, observed: 0 };
    lines.push(
      [
        cell(node.id),
        cell(node.type),
        cell(node.label),
        cell(node.riskScore ?? ""),
        cell(d.derived + d.observed),
        cell(d.derived),
        cell(d.observed),
      ].join(","),
    );
  }

  return lines.join("\r\n") + "\r\n";
}
