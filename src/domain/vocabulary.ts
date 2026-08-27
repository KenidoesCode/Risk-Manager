/**
 * Controlled vocabularies for the entity graph.
 *
 * ---------------------------------------------------------------------------
 * RAW EDGES AND DERIVED EDGES ARE DIFFERENT KINDS OF CLAIM
 * ---------------------------------------------------------------------------
 * `ACCOUNT --USES--> DEVICE` is an observation: an event said so.
 * `ACCOUNT_A <-SHARES_DEVICE-> ACCOUNT_B` is an inference this system drew by
 * noticing both accounts touched the same device node.
 *
 * They are kept in separate edge classes and the UI never renders a derived
 * edge as though it were observed, because the whole investigative value of a
 * cluster is that a reviewer can trace every link back to the event that
 * produced it. A system that presents an inference as a fact makes its own
 * output unauditable.
 */

export const NODE_TYPES = [
  "CUSTOMER",
  "ACCOUNT",
  "DEVICE",
  "ADDRESS",
  "PAYMENT",
  "ORDER",
  "RETURN",
  "REFUND",
  "PRODUCT",
  "MERCHANT",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

/** Edges asserted directly by an ingested event. */
export const RAW_EDGE_TYPES = [
  "OWNS", // customer -> account
  "USES", // account -> device
  "SHIPS_TO", // account -> address
  "PAID_WITH", // account -> payment fingerprint
  "PLACED", // account -> order
  "CONTAINS", // order -> product
  "RETURNED", // order -> return
  "REFUNDED", // return -> refund
  "SOLD_BY", // order -> merchant
] as const;
export type RawEdgeType = (typeof RAW_EDGE_TYPES)[number];

/** Edges this system inferred from shared infrastructure nodes. */
export const DERIVED_EDGE_TYPES = ["SHARES_DEVICE", "SHARES_ADDRESS", "SHARES_PAYMENT"] as const;
export type DerivedEdgeType = (typeof DERIVED_EDGE_TYPES)[number];

export const EDGE_TYPES = [...RAW_EDGE_TYPES, ...DERIVED_EDGE_TYPES] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export function isDerived(type: EdgeType): type is DerivedEdgeType {
  return (DERIVED_EDGE_TYPES as readonly string[]).includes(type);
}

/**
 * Infrastructure node types that can link two accounts.
 *
 * Ordered by how much a shared node actually implies. A payment fingerprint is
 * the strongest — sharing a card is a deliberate act between people who know
 * each other. An address is the weakest, because millions of unrelated people
 * share one: flatmates, families, office buildings, and every customer of a
 * parcel-locker service.
 */
export const LINKING_TYPES = ["PAYMENT", "DEVICE", "ADDRESS"] as const;
export type LinkingType = (typeof LINKING_TYPES)[number];

/**
 * How much a shared node of each type contributes, before any behavioural
 * signal is considered. These are the numbers that decide whether a household
 * gets investigated, so they are stated here rather than buried in the scorer.
 */
export const LINK_STRENGTH: Record<LinkingType, number> = {
  PAYMENT: 1.0,
  DEVICE: 0.7,
  ADDRESS: 0.35,
};

export const LINK_RATIONALE: Record<LinkingType, string> = {
  PAYMENT:
    "Sharing a payment fingerprint is a deliberate act between people who know each other. It is the strongest structural link available, and still not fraud on its own — couples and families share cards routinely.",
  DEVICE:
    "A shared device means the accounts were operated from the same hardware. Households share tablets and family computers, so this is suggestive rather than decisive.",
  ADDRESS:
    "Shared addresses are extremely common and mostly innocent: flatmates, families, office buildings, parcel lockers, student halls. Address sharing alone must never drive a detection.",
};

/** Signals the risk model can emit. Each has a fixed weight and a rationale. */
export const SIGNAL_TYPES = [
  "SHARED_PAYMENT",
  "SHARED_DEVICE",
  "SHARED_ADDRESS",
  "RETURN_RATE",
  "REFUND_CONCENTRATION",
  "RETURN_VELOCITY",
  "TEMPORAL_SYNCHRONISATION",
  "CLUSTER_DENSITY",
  "VALUE_CONCENTRATION",
  "CATEGORY_CONCENTRATION",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

/** Counter-signals: reasons a cluster may be an ordinary household. */
export const COUNTER_SIGNAL_TYPES = [
  "HOUSEHOLD_SIZE_PLAUSIBLE",
  "NORMAL_RETURN_BEHAVIOUR",
  "NO_PAYMENT_SHARING",
  "TEMPORALLY_DISPERSED",
  "LONG_TENURE",
  "DIVERSE_CATEGORIES",
  "ADDRESS_ONLY_LINKAGE",
] as const;
export type CounterSignalType = (typeof COUNTER_SIGNAL_TYPES)[number];

export const SIGNAL_LABELS: Record<SignalType, string> = {
  SHARED_PAYMENT: "Shared payment fingerprint",
  SHARED_DEVICE: "Shared device",
  SHARED_ADDRESS: "Shared address",
  RETURN_RATE: "Return rate",
  REFUND_CONCENTRATION: "Refund concentration",
  RETURN_VELOCITY: "Return velocity",
  TEMPORAL_SYNCHRONISATION: "Temporal synchronisation",
  CLUSTER_DENSITY: "Cluster density",
  VALUE_CONCENTRATION: "Value concentration",
  CATEGORY_CONCENTRATION: "Category concentration",
};

export const COUNTER_SIGNAL_LABELS: Record<CounterSignalType, string> = {
  HOUSEHOLD_SIZE_PLAUSIBLE: "Cluster size is plausible for one household",
  NORMAL_RETURN_BEHAVIOUR: "Return behaviour is within normal range",
  NO_PAYMENT_SHARING: "No shared payment fingerprint",
  TEMPORALLY_DISPERSED: "Activity is spread out rather than synchronised",
  LONG_TENURE: "Accounts have long, stable histories",
  DIVERSE_CATEGORIES: "Purchases span many product categories",
  ADDRESS_ONLY_LINKAGE: "Accounts are linked by address alone",
};

/** Cluster verdicts. Note what is absent: nothing here punishes anyone. */
export const CLUSTER_VERDICTS = [
  "COORDINATION_LIKELY",
  "COORDINATION_POSSIBLE",
  "NO_COORDINATION_INDICATED",
  "INSUFFICIENT_DATA",
] as const;
export type ClusterVerdict = (typeof CLUSTER_VERDICTS)[number];

export const VERDICT_DESCRIPTIONS: Record<ClusterVerdict, string> = {
  COORDINATION_LIKELY:
    "Structural links and behaviour together indicate coordination. This is a recommendation to investigate, not a finding of fraud.",
  COORDINATION_POSSIBLE:
    "Some indicators are present but a legitimate explanation is equally consistent with the evidence.",
  NO_COORDINATION_INDICATED:
    "The cluster's structure and behaviour are consistent with ordinary shared infrastructure.",
  INSUFFICIENT_DATA:
    "There is not enough activity to distinguish coordination from ordinary sharing. The detector declines to interpret rather than guessing.",
};

/** Why a cluster was routed to a person. */
export const REVIEW_REASONS = [
  "HIGH_RISK_HIGH_CONFIDENCE",
  "HIGH_RISK_LOW_CONFIDENCE",
  "SPARSE_GRAPH",
  "CONTRADICTORY_SIGNALS",
  "LEGITIMATE_EXPLANATION_PLAUSIBLE",
  "UNSTABLE_CLUSTERING",
  "UNTRUSTED_CONTENT_FLAGGED",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export const RING_TEMPLATES = [
  "SHARED_DEVICE_HIGH_RETURN",
  "SHARED_ADDRESS_REFUND_CONCENTRATION",
  "MULTI_INFRASTRUCTURE_SYNCHRONISED",
  "LOW_INDIVIDUAL_HIGH_COLLECTIVE",
] as const;
export type RingTemplate = (typeof RING_TEMPLATES)[number];

export const BENIGN_TEMPLATES = [
  "FAMILY_HOUSEHOLD",
  "SHARED_APARTMENT",
  "OFFICE_NETWORK",
  "CORPORATE_PROCUREMENT",
] as const;
export type BenignTemplate = (typeof BENIGN_TEMPLATES)[number];

export const TEMPLATE_DESCRIPTIONS: Record<RingTemplate | BenignTemplate, string> = {
  SHARED_DEVICE_HIGH_RETURN:
    "Accounts operated from a small number of devices with a return rate well above the population.",
  SHARED_ADDRESS_REFUND_CONCENTRATION:
    "Accounts shipping to one address with refund value concentrated in a short window.",
  MULTI_INFRASTRUCTURE_SYNCHRONISED:
    "Accounts sharing devices, addresses and payment fingerprints, returning within tight time windows.",
  LOW_INDIVIDUAL_HIGH_COLLECTIVE:
    "Each account looks unremarkable alone. The pattern exists only across the cluster — the case graph analysis is for.",
  FAMILY_HOUSEHOLD:
    "A family at one address sharing a tablet, with ordinary return behaviour.",
  SHARED_APARTMENT:
    "Flatmates at one address on separate devices, buying independently.",
  OFFICE_NETWORK:
    "Colleagues on a shared office network and delivery address, buying for work.",
  CORPORATE_PROCUREMENT:
    "A procurement team at one address with high order volume and legitimate returns.",
};

export type Difficulty = "EASY" | "MEDIUM" | "HARD" | "ADVERSARIAL";
export type Split = "train" | "dev" | "held-out";
