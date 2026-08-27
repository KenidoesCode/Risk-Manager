/**
 * Evaluation metrics.
 *
 * Every rate carries its denominator or is null. A precision of 1.0 over two
 * detections and a precision of 0.94 over three hundred are different claims,
 * and a dashboard printing only the first invites confusing them.
 */

export interface RateWithDenominator {
  value: number | null;
  numerator: number;
  denominator: number;
}

export function rate(numerator: number, denominator: number): RateWithDenominator {
  return {
    // null, not 0. "Nothing was flagged" is not "precision is zero", and a 0.00
    // printed for an undefined ratio is a lie with a decimal point on it.
    value: denominator === 0 ? null : Number((numerator / denominator).toFixed(4)),
    numerator,
    denominator,
  };
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  abstained: number;
  total: number;
  decided: number;
}

export interface PerformanceMetrics {
  threshold: number;
  confusion: ConfusionMatrix;
  precision: RateWithDenominator;
  recall: RateWithDenominator;
  f1: number | null;
  falsePositiveRate: RateWithDenominator;
  falseNegativeRate: RateWithDenominator;
  abstentionRate: RateWithDenominator;
}

export interface GroupPrediction {
  ringId: string;
  template: string;
  difficulty: string;
  actualLabel: "SUSPICIOUS" | "BENIGN";
  /** Best matching detected cluster's risk, or null if nothing matched. */
  predictedRisk: number | null;
  flagged: boolean;
  abstained: boolean;
  /** Jaccard overlap between the true ring and the best matching cluster. */
  memberOverlap: number;
  clusterId: string | null;
}

export function classify(p: GroupPrediction): "TP" | "FP" | "TN" | "FN" | "ABSTAINED" {
  if (p.abstained) return "ABSTAINED";
  const actual = p.actualLabel === "SUSPICIOUS";
  if (p.flagged && actual) return "TP";
  if (p.flagged && !actual) return "FP";
  if (!p.flagged && !actual) return "TN";
  return "FN";
}

export function performance(predictions: GroupPrediction[], threshold: number): PerformanceMetrics {
  const m: ConfusionMatrix = {
    tp: 0,
    fp: 0,
    tn: 0,
    fn: 0,
    abstained: 0,
    total: predictions.length,
    decided: 0,
  };

  for (const p of predictions) {
    switch (classify(p)) {
      case "TP":
        m.tp += 1;
        break;
      case "FP":
        m.fp += 1;
        break;
      case "TN":
        m.tn += 1;
        break;
      case "FN":
        m.fn += 1;
        break;
      default:
        m.abstained += 1;
    }
  }
  m.decided = m.tp + m.fp + m.tn + m.fn;

  const precision = rate(m.tp, m.tp + m.fp);
  const recall = rate(m.tp, m.tp + m.fn);
  const f1 =
    precision.value === null || recall.value === null || precision.value + recall.value === 0
      ? null
      : Number(((2 * precision.value * recall.value) / (precision.value + recall.value)).toFixed(4));

  return {
    threshold,
    confusion: m,
    precision,
    recall,
    f1,
    falsePositiveRate: rate(m.fp, m.fp + m.tn),
    falseNegativeRate: rate(m.fn, m.fn + m.tp),
    abstentionRate: rate(m.abstained, m.total),
  };
}

/* -------------------------------------------------------------------------- */
/* Hard negatives, per template                                               */
/* -------------------------------------------------------------------------- */

export interface HardNegativeMetric {
  template: string;
  groups: number;
  falsePositives: number;
  falsePositiveRate: RateWithDenominator;
  /** Mean risk assigned to groups of this template. */
  meanRisk: number | null;
  description: string;
}

/**
 * Per-template false-positive rates.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE AGGREGATE FPR IS NOT ENOUGH
 * ---------------------------------------------------------------------------
 * An overall 4% false-positive rate can hide a 30% rate on families and 0% on
 * everything else. Those are wildly different products: one is a working
 * detector, the other is an automated accusation machine pointed at households.
 *
 * The templates are broken out so that failure cannot be averaged away.
 */
export function hardNegativeMetrics(
  predictions: GroupPrediction[],
  descriptions: Record<string, string>,
): HardNegativeMetric[] {
  const benign = predictions.filter((p) => p.actualLabel === "BENIGN");
  const byTemplate = new Map<string, GroupPrediction[]>();

  for (const p of benign) {
    const list = byTemplate.get(p.template) ?? [];
    list.push(p);
    byTemplate.set(p.template, list);
  }

  return [...byTemplate.entries()]
    .map(([template, group]) => {
      const falsePositives = group.filter((p) => p.flagged && !p.abstained).length;
      const risks = group.map((p) => p.predictedRisk).filter((r): r is number => r !== null);
      return {
        template,
        groups: group.length,
        falsePositives,
        falsePositiveRate: rate(falsePositives, group.length),
        meanRisk:
          risks.length === 0 ? null : Number((risks.reduce((a, r) => a + r, 0) / risks.length).toFixed(2)),
        description: descriptions[template] ?? "",
      };
    })
    .sort((a, b) => (b.falsePositiveRate.value ?? 0) - (a.falsePositiveRate.value ?? 0));
}

/* -------------------------------------------------------------------------- */
/* Coordination recovery — the product thesis, measured                       */
/* -------------------------------------------------------------------------- */

export interface CoordinationRecovery {
  /** Suspicious rings in the split. */
  suspiciousRings: number;
  /** Rings where the account baseline flagged at least one member. */
  baselineDetected: number;
  /** Rings the baseline missed entirely. */
  baselineMissed: number;
  /** Of those missed rings, how many the graph detector caught. */
  graphRecovered: number;
  /** graphRecovered / baselineMissed. */
  recoveryRate: RateWithDenominator;
  /** Rings the baseline caught that the graph missed — the honest other half. */
  graphMissedBaselineCaught: number;
  /** Per-template breakdown of what was recovered. */
  byTemplate: Array<{ template: string; missed: number; recovered: number }>;
}

export interface RecoveryInput {
  ringId: string;
  template: string;
  label: "SUSPICIOUS" | "BENIGN";
  /** True when the account-level baseline flagged any member. */
  baselineFlagged: boolean;
  /** True when the graph detector flagged the matching cluster. */
  graphFlagged: boolean;
}

/**
 * Measures the specific claim the product makes.
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE METRIC THAT CAN FALSIFY THE THESIS
 * ---------------------------------------------------------------------------
 * If the account-level baseline already catches every ring, then the graph is
 * an expensive way to draw the same conclusion and the evaluation must say so.
 * `graphMissedBaselineCaught` is reported alongside, because a recovery rate
 * quoted without the cases going the other way is a half-truth.
 */
export function coordinationRecovery(inputs: RecoveryInput[]): CoordinationRecovery {
  const suspicious = inputs.filter((i) => i.label === "SUSPICIOUS");
  const baselineDetected = suspicious.filter((i) => i.baselineFlagged);
  const baselineMissed = suspicious.filter((i) => !i.baselineFlagged);
  const graphRecovered = baselineMissed.filter((i) => i.graphFlagged);
  const graphMissedBaselineCaught = baselineDetected.filter((i) => !i.graphFlagged).length;

  const byTemplate = new Map<string, { missed: number; recovered: number }>();
  for (const i of baselineMissed) {
    const entry = byTemplate.get(i.template) ?? { missed: 0, recovered: 0 };
    entry.missed += 1;
    if (i.graphFlagged) entry.recovered += 1;
    byTemplate.set(i.template, entry);
  }

  return {
    suspiciousRings: suspicious.length,
    baselineDetected: baselineDetected.length,
    baselineMissed: baselineMissed.length,
    graphRecovered: graphRecovered.length,
    recoveryRate: rate(graphRecovered.length, baselineMissed.length),
    graphMissedBaselineCaught,
    byTemplate: [...byTemplate.entries()].map(([template, v]) => ({ template, ...v })),
  };
}

/* -------------------------------------------------------------------------- */
/* Cost-sensitive thresholds                                                  */
/* -------------------------------------------------------------------------- */

export interface CostModel {
  /**
   * Cost of investigating a legitimate cluster.
   *
   * Analyst time, plus something this system cannot price: a household being
   * investigated for fraud because they live together. The weight is set high
   * relative to a miss for that reason, and the ratio is configurable because a
   * business's real trade-off is not this system's to assume.
   */
  falsePositive: number;
  /** Cost of missing a real ring: refund loss and continued abuse. */
  falseNegative: number;
  /** Cost of routing to a human. Real, and lower than either error. */
  abstention: number;
}

export const DEFAULT_COSTS: CostModel = {
  falsePositive: 6,
  falseNegative: 10,
  abstention: 1,
};

export interface ThresholdOption {
  threshold: number;
  metrics: PerformanceMetrics;
  totalCost: number;
  costPerGroup: number;
  /** False positives landing specifically on hard negatives. */
  householdFalsePositives: number;
}

export function thresholdSweep(
  predictions: GroupPrediction[],
  costs: CostModel = DEFAULT_COSTS,
  candidates = [50, 55, 60, 65, 70, 75, 80, 85, 90],
): { options: ThresholdOption[]; recommended: ThresholdOption | null; costs: CostModel } {
  const options = candidates.map((threshold) => {
    // Re-derive flagged at this threshold rather than reusing the stored flag.
    const rescored = predictions.map((p) => ({
      ...p,
      flagged: p.predictedRisk !== null && p.predictedRisk >= threshold,
    }));

    const metrics = performance(rescored, threshold);
    const householdFalsePositives = rescored.filter(
      (p) => p.actualLabel === "BENIGN" && p.flagged && !p.abstained,
    ).length;

    const totalCost =
      metrics.confusion.fp * costs.falsePositive +
      metrics.confusion.fn * costs.falseNegative +
      metrics.confusion.abstained * costs.abstention;

    return {
      threshold,
      metrics,
      totalCost,
      costPerGroup:
        predictions.length === 0 ? 0 : Number((totalCost / predictions.length).toFixed(4)),
      householdFalsePositives,
    };
  });

  const recommended =
    options.length === 0
      ? null
      : options.reduce((best, o) => (o.totalCost < best.totalCost ? o : best), options[0] as ThresholdOption);

  return { options, recommended, costs };
}

/* -------------------------------------------------------------------------- */
/* Slices                                                                     */
/* -------------------------------------------------------------------------- */

export interface Slice {
  key: string;
  count: number;
  metrics: PerformanceMetrics;
}

export function sliceBy(
  predictions: GroupPrediction[],
  threshold: number,
  keyOf: (p: GroupPrediction) => string,
): Slice[] {
  const groups = new Map<string, GroupPrediction[]>();
  for (const p of predictions) {
    const k = keyOf(p);
    const list = groups.get(k) ?? [];
    list.push(p);
    groups.set(k, list);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, count: list.length, metrics: performance(list, threshold) }))
    .sort((a, b) => b.count - a.count);
}

/* -------------------------------------------------------------------------- */
/* Account-level metrics                                                      */
/* -------------------------------------------------------------------------- */

export interface AccountPrediction {
  accountId: string;
  actualLabel: "SUSPICIOUS" | "BENIGN";
  flagged: boolean;
}

/**
 * Account-level precision and recall.
 *
 * Reported alongside the ring-level figures because they answer different
 * questions. Ring-level asks "did we find the group?"; account-level asks "did
 * we name the right people?" A detector can find every ring while sweeping in
 * two innocent flatmates per cluster, and only the account-level numbers show it.
 */
export function accountMetrics(predictions: AccountPrediction[]): PerformanceMetrics {
  return performance(
    predictions.map((p) => ({
      ringId: p.accountId,
      template: "account",
      difficulty: "n/a",
      actualLabel: p.actualLabel,
      predictedRisk: p.flagged ? 100 : 0,
      flagged: p.flagged,
      abstained: false,
      memberOverlap: 1,
      clusterId: null,
    })),
    0,
  );
}
