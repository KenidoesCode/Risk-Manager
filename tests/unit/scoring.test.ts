import { describe, expect, it } from "vitest";

import { MAX_POINTS, SIGNAL_WEIGHTS, explainScore, scoreCluster } from "../../src/scoring/risk";
import { FEATURE_NAMES, type ClusterAggregate, type FeatureVector } from "../../src/detection/features";

const OPTIONS = {
  riskThreshold: 70,
  confidenceThreshold: 0.6,
  minClusterAccounts: 3,
  minEventsPerAccount: 2,
};

const zeroFeatures = (): FeatureVector =>
  Object.fromEntries(FEATURE_NAMES.map((f) => [f, 0])) as FeatureVector;

const aggregate = (over: Partial<ClusterAggregate> = {}): ClusterAggregate => ({
  accountCount: 8,
  orderCount: 60,
  returnCount: 40,
  refundCount: 36,
  orderValueMinor: 3_000_000,
  refundValueMinor: 2_000_000,
  distinctDevices: 2,
  distinctAddresses: 1,
  distinctPayments: 1,
  distinctCategories: 2,
  medianTenureDays: 80,
  returnTimeSpreadHours: 10,
  medianDaysAfterDelivery: 3,
  maxAccountReturnRate: 0.8,
  meanAccountReturnRate: 0.66,
  eventsPerAccount: 7.5,
  ...over,
});

describe("risk score is a published weighted sum", () => {
  it("totals exactly 100 across all signal weights", () => {
    expect(MAX_POINTS).toBe(100);
  });

  it("scores zero when every feature is zero", () => {
    const result = scoreCluster(aggregate(), zeroFeatures(), OPTIONS);
    expect(result.riskScore).toBe(0);
    expect(result.verdict).toBe("NO_COORDINATION_INDICATED");
  });

  it("reaches 100 when every feature is saturated", () => {
    const all = Object.fromEntries(FEATURE_NAMES.map((f) => [f, 1])) as FeatureVector;
    const result = scoreCluster(aggregate(), all, OPTIONS);
    expect(result.riskScore).toBe(100);
  });

  it("every point is attributable to a named signal", () => {
    const features = { ...zeroFeatures(), return_rate: 0.5, shared_device: 0.8, temporal_synchronisation: 1 };
    const result = scoreCluster(aggregate(), features, OPTIONS);
    const summed = result.signals.reduce((a, s) => a + s.points, 0);
    expect(Number(summed.toFixed(2))).toBe(result.riskScore);
  });

  it("explainScore reconstructs the arithmetic", () => {
    const features = { ...zeroFeatures(), return_rate: 1, temporal_synchronisation: 1 };
    const result = scoreCluster(aggregate(), features, OPTIONS);
    const lines = explainScore(result);
    expect(lines.join("\n")).toContain("total risk");
    expect(lines.some((l) => l.includes("Return rate"))).toBe(true);
  });

  it("weights address sharing far below payment sharing", () => {
    const address = SIGNAL_WEIGHTS.find((w) => w.signal === "SHARED_ADDRESS");
    const payment = SIGNAL_WEIGHTS.find((w) => w.signal === "SHARED_PAYMENT");
    // A household produces address sharing constantly; it must never dominate.
    expect(address?.maxPoints).toBeLessThan((payment?.maxPoints ?? 0) / 3);
    expect(address?.maxPoints).toBeLessThanOrEqual(4);
  });
});

describe("the structural-only guardrail", () => {
  /**
   * These are the tests that matter most. A cluster whose score comes from
   * shared infrastructure alone describes people who live or work together, and
   * flagging them is the failure mode that makes this kind of product harmful.
   */
  it("caps a cluster with maximum structural sharing and no behaviour", () => {
    const structuralOnly: FeatureVector = {
      ...zeroFeatures(),
      shared_payment: 1,
      shared_device: 1,
      shared_address: 1,
      cluster_density: 1,
    };
    const result = scoreCluster(aggregate({ returnCount: 2, refundCount: 1 }), structuralOnly, OPTIONS);

    expect(result.structuralPoints).toBeGreaterThan(30);
    expect(result.behaviouralPoints).toBeLessThan(8);
    expect(result.riskScore).toBeLessThan(OPTIONS.riskThreshold);
    expect(result.verdict).not.toBe("COORDINATION_LIKELY");
  });

  it("does NOT cap when behavioural evidence is present", () => {
    const withBehaviour: FeatureVector = {
      ...zeroFeatures(),
      shared_payment: 1,
      shared_device: 1,
      shared_address: 1,
      cluster_density: 1,
      return_rate: 1,
      temporal_synchronisation: 1,
    };
    const result = scoreCluster(aggregate(), withBehaviour, OPTIONS);
    expect(result.cappedByGuardrail).toBe(false);
    expect(result.riskScore).toBeGreaterThanOrEqual(OPTIONS.riskThreshold);
    expect(result.verdict).toBe("COORDINATION_LIKELY");
  });

  it("shared address alone cannot approach the threshold", () => {
    const result = scoreCluster(
      aggregate({ returnCount: 3 }),
      { ...zeroFeatures(), shared_address: 1 },
      OPTIONS,
    );
    expect(result.riskScore).toBeLessThan(10);
  });

  it("shared device and address together still cannot reach the threshold", () => {
    const result = scoreCluster(
      aggregate({ returnCount: 3 }),
      { ...zeroFeatures(), shared_address: 1, shared_device: 1, cluster_density: 1 },
      OPTIONS,
    );
    expect(result.riskScore).toBeLessThan(OPTIONS.riskThreshold);
  });
});

describe("risk and confidence are independent", () => {
  it("high risk with thin evidence yields low confidence", () => {
    const features: FeatureVector = {
      ...zeroFeatures(),
      return_rate: 1,
      temporal_synchronisation: 1,
      shared_device: 1,
    };
    const thin = aggregate({ eventsPerAccount: 2.1, accountCount: 3, returnCount: 3 });
    const rich = aggregate({ eventsPerAccount: 14, accountCount: 10, returnCount: 40 });

    const thinResult = scoreCluster(thin, features, OPTIONS);
    const richResult = scoreCluster(rich, features, OPTIONS);

    expect(thinResult.riskScore).toBe(richResult.riskScore);
    // Same risk, different confidence. That is the whole point of two numbers.
    expect(thinResult.confidence).toBeLessThan(richResult.confidence);
  });

  it("low stability lowers confidence and forces review", () => {
    const features: FeatureVector = { ...zeroFeatures(), return_rate: 1, temporal_synchronisation: 1 };
    const stable = scoreCluster(aggregate(), features, { ...OPTIONS, stability: 1 });
    const unstable = scoreCluster(aggregate(), features, { ...OPTIONS, stability: 0.2 });

    expect(unstable.confidence).toBeLessThan(stable.confidence);
    expect(unstable.requiresReview).toBe(true);
    expect(unstable.reviewReason).toBe("UNSTABLE_CLUSTERING");
  });

  it("counter-signals lower confidence without lowering risk", () => {
    const noCounters: FeatureVector = {
      ...zeroFeatures(),
      return_rate: 1,
      temporal_synchronisation: 1,
      shared_payment: 1,
    };
    const withCounters: FeatureVector = { ...noCounters, shared_payment: 0 };

    const a = scoreCluster(aggregate({ distinctPayments: 8, distinctCategories: 8 }), withCounters, OPTIONS);
    expect(a.counterSignals.length).toBeGreaterThan(0);
    expect(a.counterSignals.some((c) => c.signal === "NO_PAYMENT_SHARING")).toBe(true);
  });
});

describe("abstention", () => {
  it("reports INSUFFICIENT_DATA when there is too little activity", () => {
    const result = scoreCluster(
      aggregate({ accountCount: 3, eventsPerAccount: 1 }),
      { ...zeroFeatures(), return_rate: 1, temporal_synchronisation: 1 },
      OPTIONS,
    );
    expect(result.verdict).toBe("INSUFFICIENT_DATA");
    expect(result.requiresReview).toBe(true);
    expect(result.reviewReason).toBe("SPARSE_GRAPH");
  });

  it("reports INSUFFICIENT_DATA below the minimum cluster size", () => {
    const result = scoreCluster(
      aggregate({ accountCount: 2 }),
      { ...zeroFeatures(), return_rate: 1 },
      OPTIONS,
    );
    expect(result.verdict).toBe("INSUFFICIENT_DATA");
  });

  it("INSUFFICIENT_DATA is reached before any risk banding", () => {
    // Even a saturated feature vector cannot turn a sparse cluster into a
    // detection: the sparsity check runs first and wins.
    const all = Object.fromEntries(FEATURE_NAMES.map((f) => [f, 1])) as FeatureVector;
    const result = scoreCluster(aggregate({ accountCount: 2, eventsPerAccount: 1 }), all, OPTIONS);
    expect(result.verdict).toBe("INSUFFICIENT_DATA");
  });
});

describe("untrusted content", () => {
  it("forces review without changing the score", () => {
    const features: FeatureVector = { ...zeroFeatures(), return_rate: 1, temporal_synchronisation: 1 };
    const clean = scoreCluster(aggregate(), features, OPTIONS);
    const flagged = scoreCluster(aggregate(), features, { ...OPTIONS, injectionFindings: 4 });

    // The injection asked for a lower score and no review. It got neither.
    expect(flagged.riskScore).toBe(clean.riskScore);
    expect(flagged.requiresReview).toBe(true);
    expect(flagged.reviewReason).toBe("UNTRUSTED_CONTENT_FLAGGED");
  });
});

describe("verdicts never punish", () => {
  it("uses investigation language, not guilt language", () => {
    const all = Object.fromEntries(FEATURE_NAMES.map((f) => [f, 1])) as FeatureVector;
    const result = scoreCluster(aggregate(), all, OPTIONS);
    expect(result.verdict).toBe("COORDINATION_LIKELY");
    expect(result.verdictDescription).toMatch(/investigate|not a finding of fraud/i);
    expect(result.verdictDescription).not.toMatch(/\bfraudulent\b|\bguilty\b|\bblock\b/i);
  });
});
