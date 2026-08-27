import {
  COUNTER_SIGNAL_LABELS,
  SIGNAL_LABELS,
  VERDICT_DESCRIPTIONS,
  type ClusterVerdict,
  type CounterSignalType,
  type ReviewReason,
  type SignalType,
} from "../domain/vocabulary";
import type { ClusterAggregate, FeatureName, FeatureVector } from "../detection/features";

export const SCORER_VERSION = "risk-scorer-1.0.0";

/**
 * Interpretable risk scoring.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO MAGIC SCORE HERE
 * ---------------------------------------------------------------------------
 * The score is a published weighted sum over ten bounded features. It is not a
 * model output, it does not require a model to be configured, and every point
 * of it can be traced to a named signal with a stated weight and a stated
 * observation. `explainScore()` reconstructs the arithmetic exactly, and the
 * UI never renders a number without that breakdown beside it.
 *
 * This is deliberate rather than a limitation. The output of this system is
 * "these seven people are worth investigating together". A number that cannot
 * be decomposed in front of the person being investigated — or in front of the
 * analyst who has to justify the investigation — is not usable evidence.
 *
 * ---------------------------------------------------------------------------
 * WHY SHARED_ADDRESS IS WEIGHTED SO LOW
 * ---------------------------------------------------------------------------
 * Because millions of unrelated people share an address, and the cost of
 * getting this wrong is a family investigated for fraud because they live
 * together. Address concentration alone can contribute at most 6 points out of
 * 100, and `structuralOnly` below refuses to let structure of any kind reach
 * the detection threshold without behaviour.
 */

export interface SignalWeight {
  signal: SignalType;
  feature: FeatureName;
  /** Maximum points this signal can contribute, out of 100. */
  maxPoints: number;
  rationale: string;
}

export const SIGNAL_WEIGHTS: SignalWeight[] = [
  {
    signal: "RETURN_RATE",
    feature: "return_rate",
    maxPoints: 20,
    rationale:
      "Return rate well above the population median. The single most direct behavioural indicator, and useless on its own — plenty of honest customers return a lot.",
  },
  {
    signal: "TEMPORAL_SYNCHRONISATION",
    feature: "temporal_synchronisation",
    maxPoints: 18,
    rationale:
      "Returns from different accounts clustered in time. Hard to produce innocently: a household's returns are scattered across months, not hours.",
  },
  {
    signal: "SHARED_PAYMENT",
    feature: "shared_payment",
    maxPoints: 14,
    rationale:
      "Accounts funnelling through few payment fingerprints. The strongest structural link, because sharing a card is a deliberate act — though families do it routinely.",
  },
  {
    signal: "REFUND_CONCENTRATION",
    feature: "refund_concentration",
    maxPoints: 12,
    rationale: "Refund value as a share of order value, well above the population.",
  },
  {
    signal: "SHARED_DEVICE",
    feature: "shared_device",
    maxPoints: 10,
    rationale:
      "Accounts operating through few devices. Suggestive, not decisive — households share tablets.",
  },
  {
    signal: "CATEGORY_CONCENTRATION",
    feature: "category_concentration",
    maxPoints: 8,
    rationale:
      "The cluster buys and returns within a narrow product range. Rings target resaleable goods; households buy across the shop.",
  },
  {
    signal: "RETURN_VELOCITY",
    feature: "return_velocity",
    maxPoints: 6,
    rationale:
      "Returns initiated very soon after delivery. Genuine returns skew later, because a real customer takes time to find the problem.",
  },
  {
    signal: "CLUSTER_DENSITY",
    feature: "cluster_density",
    maxPoints: 6,
    rationale:
      "How thoroughly interconnected the cluster is. A tight mesh of links is different from a chain.",
  },
  {
    signal: "SHARED_ADDRESS",
    feature: "shared_address",
    maxPoints: 4,
    rationale:
      "Accounts shipping to few addresses. Weighted low on purpose: flatmates, families, offices, student halls and parcel lockers all produce this, and it must never drive a detection.",
  },
  {
    signal: "VALUE_CONCENTRATION",
    feature: "value_concentration",
    maxPoints: 2,
    rationale: "Refund value concentrated rather than spread. A weak corroborating signal.",
  },
];

export const MAX_POINTS = SIGNAL_WEIGHTS.reduce((a, w) => a + w.maxPoints, 0);

/** Signals whose weight comes from graph structure rather than behaviour. */
const STRUCTURAL_SIGNALS = new Set<SignalType>(["SHARED_PAYMENT", "SHARED_DEVICE", "SHARED_ADDRESS", "CLUSTER_DENSITY"]);

export interface ScoredSignal {
  signal: SignalType;
  label: string;
  featureValue: number;
  maxPoints: number;
  points: number;
  rationale: string;
  /** The concrete observation behind the number, for the evidence panel. */
  observation: string;
}

export interface ScoredCounterSignal {
  signal: CounterSignalType;
  label: string;
  detail: string;
}

export interface RiskAssessment {
  version: string;
  /** 0..100. */
  riskScore: number;
  /** 0..1, deliberately independent of the score. */
  confidence: number;
  verdict: ClusterVerdict;
  verdictDescription: string;
  requiresReview: boolean;
  reviewReason: ReviewReason | null;
  reviewDetail: string | null;
  signals: ScoredSignal[];
  counterSignals: ScoredCounterSignal[];
  /** Points that came from structure alone, for the guardrail explanation. */
  structuralPoints: number;
  behaviouralPoints: number;
  /** Set when the structural-only cap was applied. */
  cappedByGuardrail: boolean;
}

function observationFor(signal: SignalType, agg: ClusterAggregate, value: number): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  switch (signal) {
    case "SHARED_PAYMENT":
      return `${agg.accountCount} accounts across ${agg.distinctPayments} payment fingerprint(s).`;
    case "SHARED_DEVICE":
      return `${agg.accountCount} accounts across ${agg.distinctDevices} device(s).`;
    case "SHARED_ADDRESS":
      return `${agg.accountCount} accounts across ${agg.distinctAddresses} address(es).`;
    case "RETURN_RATE":
      return `${agg.returnCount} returns from ${agg.orderCount} orders (${pct(agg.orderCount === 0 ? 0 : agg.returnCount / agg.orderCount)}).`;
    case "REFUND_CONCENTRATION":
      return `${(agg.refundValueMinor / 100).toLocaleString("en-IN")} refunded of ${(agg.orderValueMinor / 100).toLocaleString("en-IN")} ordered.`;
    case "RETURN_VELOCITY":
      return `Median return initiated ${agg.medianDaysAfterDelivery} day(s) after delivery.`;
    case "TEMPORAL_SYNCHRONISATION":
      return Number.isFinite(agg.returnTimeSpreadHours)
        ? `Return timestamps spread by ${Math.round(agg.returnTimeSpreadHours)}h around the cluster median.`
        : "Too few returns to measure synchronisation.";
    case "CLUSTER_DENSITY":
      return `Weighted link density ${value.toFixed(2)} across ${agg.accountCount} accounts.`;
    case "VALUE_CONCENTRATION":
      return `Refund share ${pct(agg.orderValueMinor === 0 ? 0 : agg.refundValueMinor / agg.orderValueMinor)}.`;
    case "CATEGORY_CONCENTRATION":
      return `${agg.orderCount} orders across ${agg.distinctCategories} product categor${agg.distinctCategories === 1 ? "y" : "ies"}.`;
  }
}

/**
 * Counter-signals: the reasons this cluster might be an ordinary household.
 *
 * These are computed and displayed whether or not the risk score is high. A
 * detection presented without the legitimate explanations that also fit the
 * evidence is a detection a reviewer cannot properly evaluate.
 */
function counterSignals(agg: ClusterAggregate, features: FeatureVector): ScoredCounterSignal[] {
  const out: ScoredCounterSignal[] = [];
  const push = (signal: CounterSignalType, detail: string) =>
    out.push({ signal, label: COUNTER_SIGNAL_LABELS[signal], detail });

  if (agg.accountCount <= 6) {
    push(
      "HOUSEHOLD_SIZE_PLAUSIBLE",
      `${agg.accountCount} accounts is an ordinary household or flatshare size. Cluster size alone carries no weight here.`,
    );
  }
  if (features.return_rate < 0.25) {
    const rate = agg.orderCount === 0 ? 0 : agg.returnCount / agg.orderCount;
    push(
      "NORMAL_RETURN_BEHAVIOUR",
      `Return rate ${Math.round(rate * 100)}% is close to the population median. Whatever links these accounts, their behaviour is unremarkable.`,
    );
  }
  if (features.shared_payment === 0) {
    push(
      "NO_PAYMENT_SHARING",
      `Each account pays with its own fingerprint (${agg.distinctPayments} across ${agg.accountCount} accounts). The strongest structural link is absent.`,
    );
  }
  if (features.temporal_synchronisation < 0.2) {
    push(
      "TEMPORALLY_DISPERSED",
      Number.isFinite(agg.returnTimeSpreadHours)
        ? `Returns are spread by roughly ${Math.round(agg.returnTimeSpreadHours)}h — dispersed rather than coordinated.`
        : "There are too few returns for coordination to be visible.",
    );
  }
  if (agg.medianTenureDays > 365) {
    push(
      "LONG_TENURE",
      `Median account age is ${Math.round(agg.medianTenureDays)} days. Rings are usually built from newer accounts.`,
    );
  }
  if (agg.distinctCategories >= 5) {
    push(
      "DIVERSE_CATEGORIES",
      `Purchases span ${agg.distinctCategories} categories, which is shopping rather than targeted acquisition.`,
    );
  }
  if (features.shared_address > 0 && features.shared_device === 0 && features.shared_payment === 0) {
    push(
      "ADDRESS_ONLY_LINKAGE",
      "These accounts are connected by address and nothing else. That describes every block of flats and every office.",
    );
  }

  return out;
}

/**
 * Confidence: how well the evidence supports ANY interpretation.
 *
 * ---------------------------------------------------------------------------
 * SEPARATE FROM RISK, ON PURPOSE
 * ---------------------------------------------------------------------------
 * "Risk 91, confidence 63%" means the pattern looks strongly coordinated and
 * the detector is not sure the interpretation is right. Collapsing that into a
 * single 77 would destroy the only information a reviewer actually needs to
 * prioritise: whether to look harder or to look elsewhere.
 *
 * Confidence rises with evidence volume and falls when a legitimate explanation
 * fits equally well, when the cluster is unstable, or when the linkage is thin.
 */
function computeConfidence(
  agg: ClusterAggregate,
  features: FeatureVector,
  counters: ScoredCounterSignal[],
  stability: number | null,
): number {
  let c = 0.3;

  // Evidence volume. Six accounts with two orders each cannot support a
  // confident interpretation of anything.
  c += Math.min(0.25, (agg.eventsPerAccount / 12) * 0.25);
  c += Math.min(0.15, (agg.accountCount / 10) * 0.15);
  c += Math.min(0.15, (agg.returnCount / 15) * 0.15);

  // Strong structural links make the cluster itself more certain.
  c += features.shared_payment * 0.1;
  c += features.shared_device * 0.05;

  // Each plausible benign explanation subtracts. A cluster with four of them is
  // one where the detector genuinely cannot tell.
  c -= counters.length * 0.06;

  // An unstable cluster is an artefact of node ordering, not a structure.
  if (stability !== null) c -= (1 - stability) * 0.3;

  return Number(Math.max(0.05, Math.min(0.97, c)).toFixed(4));
}

export interface ScoreOptions {
  riskThreshold: number;
  confidenceThreshold: number;
  minClusterAccounts: number;
  minEventsPerAccount: number;
  stability?: number | null;
  /** Untrusted-content findings in cluster metadata. */
  injectionFindings?: number;
}

export function scoreCluster(
  agg: ClusterAggregate,
  features: FeatureVector,
  options: ScoreOptions,
): RiskAssessment {
  const signals: ScoredSignal[] = SIGNAL_WEIGHTS.map((w) => {
    const value = features[w.feature];
    const points = Number((value * w.maxPoints).toFixed(2));
    return {
      signal: w.signal,
      label: SIGNAL_LABELS[w.signal],
      featureValue: value,
      maxPoints: w.maxPoints,
      points,
      rationale: w.rationale,
      observation: observationFor(w.signal, agg, value),
    };
  }).sort((a, b) => b.points - a.points);

  const structuralPoints = Number(
    signals.filter((s) => STRUCTURAL_SIGNALS.has(s.signal)).reduce((a, s) => a + s.points, 0).toFixed(2),
  );
  const behaviouralPoints = Number(
    signals.filter((s) => !STRUCTURAL_SIGNALS.has(s.signal)).reduce((a, s) => a + s.points, 0).toFixed(2),
  );

  let riskScore = Number((structuralPoints + behaviouralPoints).toFixed(2));

  /**
   * THE STRUCTURAL-ONLY GUARDRAIL.
   *
   * A cluster whose points come almost entirely from shared infrastructure is a
   * description of people who live or work together. Without behavioural
   * evidence it is capped below the detection threshold, so no combination of
   * shared address, shared device and shared card can produce a detection on
   * its own.
   *
   * This is the control that stops the system being an expensive graph
   * visualisation of an ordinary household, and it is tested directly.
   */
  const cappedByGuardrail = behaviouralPoints < 8 && riskScore >= options.riskThreshold;
  if (cappedByGuardrail) {
    riskScore = Math.min(riskScore, options.riskThreshold - 1);
  }

  const counters = counterSignals(agg, features);
  const stability = options.stability ?? null;
  const confidence = computeConfidence(agg, features, counters, stability);

  // --- Verdict and routing ------------------------------------------------

  const sparse =
    agg.accountCount < options.minClusterAccounts ||
    agg.eventsPerAccount < options.minEventsPerAccount;

  let verdict: ClusterVerdict;
  let requiresReview = false;
  let reviewReason: ReviewReason | null = null;
  let reviewDetail: string | null = null;

  if (sparse) {
    // INSUFFICIENT_DATA is a real answer, not a failure to produce one.
    verdict = "INSUFFICIENT_DATA";
    requiresReview = true;
    reviewReason = "SPARSE_GRAPH";
    reviewDetail = `${agg.accountCount} account(s) averaging ${agg.eventsPerAccount} order(s) each is not enough activity to distinguish coordination from ordinary sharing.`;
  } else if (riskScore >= options.riskThreshold) {
    verdict = "COORDINATION_LIKELY";
    requiresReview = true;
    if (confidence < options.confidenceThreshold) {
      reviewReason = "HIGH_RISK_LOW_CONFIDENCE";
      reviewDetail = `Risk ${riskScore.toFixed(0)} with confidence ${(confidence * 100).toFixed(0)}%. The pattern is suspicious; the interpretation is not settled.`;
    } else {
      reviewReason = "HIGH_RISK_HIGH_CONFIDENCE";
      reviewDetail = `Risk ${riskScore.toFixed(0)} with confidence ${(confidence * 100).toFixed(0)}%. Recommended for investigation.`;
    }
  } else if (riskScore >= options.riskThreshold * 0.6) {
    verdict = "COORDINATION_POSSIBLE";
    if (counters.length >= 3) {
      requiresReview = true;
      reviewReason = "LEGITIMATE_EXPLANATION_PLAUSIBLE";
      reviewDetail = `${counters.length} legitimate explanations fit this evidence as well as coordination does.`;
    }
  } else {
    verdict = "NO_COORDINATION_INDICATED";
  }

  // Instability and untrusted content override the routing above.
  if (stability !== null && stability < 0.5 && verdict !== "INSUFFICIENT_DATA") {
    requiresReview = true;
    reviewReason = "UNSTABLE_CLUSTERING";
    reviewDetail = `Cluster membership survives re-clustering only ${(stability * 100).toFixed(0)}% of the time. Its boundaries are an artefact of iteration order rather than a structure in the data.`;
  }
  if ((options.injectionFindings ?? 0) > 0) {
    requiresReview = true;
    reviewReason = "UNTRUSTED_CONTENT_FLAGGED";
    reviewDetail = `${options.injectionFindings} span(s) of cluster metadata are addressed to the analysis system rather than describing events.`;
  }

  return {
    version: SCORER_VERSION,
    riskScore,
    confidence,
    verdict,
    verdictDescription: VERDICT_DESCRIPTIONS[verdict],
    requiresReview,
    reviewReason,
    reviewDetail,
    signals,
    counterSignals: counters,
    structuralPoints,
    behaviouralPoints,
    cappedByGuardrail,
  };
}

/** Reconstructs the arithmetic, so the score can be audited line by line. */
export function explainScore(assessment: RiskAssessment): string[] {
  const lines = assessment.signals
    .filter((s) => s.points > 0.05)
    .map(
      (s) =>
        `+${s.points.toFixed(1).padStart(5)}  ${s.label.padEnd(28)} ${(s.featureValue * 100).toFixed(0)}% of a possible ${s.maxPoints} — ${s.observation}`,
    );

  lines.push(`${"".padEnd(7)}${"─".repeat(60)}`);
  lines.push(
    `${assessment.riskScore.toFixed(1).padStart(6)}  total risk (structural ${assessment.structuralPoints.toFixed(1)}, behavioural ${assessment.behaviouralPoints.toFixed(1)})`,
  );

  if (assessment.cappedByGuardrail) {
    lines.push(
      `        CAPPED: behavioural evidence below 8 points. Structure alone cannot reach the detection threshold.`,
    );
  }
  return lines;
}
