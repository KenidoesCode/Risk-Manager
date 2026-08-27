import type { AccountRow, OrderRow } from "../db/schema";
import type { Cluster } from "./clustering";

export const FEATURE_VERSION = "cluster-features-1.0.0";

/**
 * Cluster feature extraction.
 *
 * Every feature is computed from stored events. None is a model opinion and
 * none reads the ground-truth columns — the function signature below cannot
 * reach them, which is what makes the no-leakage claim checkable rather than
 * aspirational.
 *
 * Features are bounded to 0..1 so the published weight table means what it
 * says. An unbounded count would let one enormous cluster dominate the score
 * through size alone.
 */

export interface AccountActivity {
  account: AccountRow;
  orders: OrderRow[];
  returns: Array<{ orderId: string; initiatedAt: Date; daysAfterDelivery: number }>;
  refunds: Array<{ amountMinor: number; processedAt: Date }>;
}

export const FEATURE_NAMES = [
  "shared_payment",
  "shared_device",
  "shared_address",
  "return_rate",
  "refund_concentration",
  "return_velocity",
  "temporal_synchronisation",
  "cluster_density",
  "value_concentration",
  "category_concentration",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Record<FeatureName, number>;

export interface ClusterAggregate {
  accountCount: number;
  orderCount: number;
  returnCount: number;
  refundCount: number;
  orderValueMinor: number;
  refundValueMinor: number;
  distinctDevices: number;
  distinctAddresses: number;
  distinctPayments: number;
  distinctCategories: number;
  medianTenureDays: number;
  /** Median absolute deviation of return timestamps, in hours. */
  returnTimeSpreadHours: number;
  /** Median days between delivery and return initiation. */
  medianDaysAfterDelivery: number;
  /** Highest per-account return rate inside the cluster. */
  maxAccountReturnRate: number;
  /** Mean per-account return rate. */
  meanAccountReturnRate: number;
  eventsPerAccount: number;
}

/**
 * Population baselines.
 *
 * These decide what "unusually high" means, so they are stated rather than
 * implied. They describe the synthetic corpus and would need re-deriving from
 * real data before production use — a fact repeated in the README because a
 * threshold calibrated to the wrong population is how a detector starts
 * flagging ordinary customers.
 */
export const POPULATION = {
  /** Median account return rate across the corpus. */
  returnRate: 0.15,
  /** Return rate above which a cluster is clearly atypical. */
  returnRateHigh: 0.55,
  /** Typical refund value as a share of order value. */
  refundShare: 0.14,
  refundShareHigh: 0.6,
  /** Returns initiated within this many days is fast. */
  fastReturnDays: 7,
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number);
}

/** Saturating ratio: 0 at the population level, 1 at the "clearly high" level. */
function saturate(value: number, low: number, high: number): number {
  if (high <= low) return 0;
  return Number(Math.max(0, Math.min(1, (value - low) / (high - low))).toFixed(4));
}

export function aggregateCluster(activities: AccountActivity[], _cluster: Cluster): ClusterAggregate {
  const orders = activities.flatMap((a) => a.orders);
  const returns = activities.flatMap((a) => a.returns);
  const refunds = activities.flatMap((a) => a.refunds);

  const devices = new Set<string>();
  const addresses = new Set<string>();
  const payments = new Set<string>();
  const categories = new Set<string>();

  for (const o of orders) {
    if (o.deviceKey) devices.add(o.deviceKey);
    if (o.addressKey) addresses.add(o.addressKey);
    if (o.paymentKey) payments.add(o.paymentKey);
    categories.add(o.productCategory);
  }

  const perAccountReturnRates = activities.map((a) =>
    a.orders.length === 0 ? 0 : a.returns.length / a.orders.length,
  );

  const returnTimes = returns.map((r) => r.initiatedAt.getTime());
  const medianReturnTime = median(returnTimes);
  const spreadHours =
    returnTimes.length < 2
      ? Number.POSITIVE_INFINITY
      : median(returnTimes.map((t) => Math.abs(t - medianReturnTime))) / 3_600_000;

  const orderValueMinor = orders.reduce((a, o) => a + o.amountMinor, 0);
  const refundValueMinor = refunds.reduce((a, r) => a + r.amountMinor, 0);

  return {
    accountCount: activities.length,
    orderCount: orders.length,
    returnCount: returns.length,
    refundCount: refunds.length,
    orderValueMinor,
    refundValueMinor,
    distinctDevices: devices.size,
    distinctAddresses: addresses.size,
    distinctPayments: payments.size,
    distinctCategories: categories.size,
    medianTenureDays: median(activities.map((a) => a.account.tenureDays)),
    returnTimeSpreadHours: spreadHours,
    medianDaysAfterDelivery:
      returns.length === 0
        ? POPULATION.fastReturnDays * 3
        : median(returns.map((r) => r.daysAfterDelivery)),
    maxAccountReturnRate: Number(Math.max(0, ...perAccountReturnRates).toFixed(4)),
    meanAccountReturnRate:
      perAccountReturnRates.length === 0
        ? 0
        : Number(
            (perAccountReturnRates.reduce((a, r) => a + r, 0) / perAccountReturnRates.length).toFixed(4),
          ),
    eventsPerAccount:
      activities.length === 0 ? 0 : Number((orders.length / activities.length).toFixed(2)),
  };
}

export function extractFeatures(agg: ClusterAggregate, cluster: Cluster): FeatureVector {
  /**
   * Infrastructure concentration.
   *
   * The signal is not "these accounts share a device" — it is "these N accounts
   * are operating through only M devices". Eight accounts on three devices is
   * concentration; eight accounts on eight devices is not, even if two of them
   * happen to overlap.
   *
   * A shared payment fingerprint across many accounts is the strongest of the
   * three; a shared address is the weakest, because households, flatshares and
   * offices produce it constantly.
   */
  const concentration = (accounts: number, distinct: number): number => {
    if (accounts < 2 || distinct === 0) return 0;
    // 1 when all accounts funnel through one node, 0 when each has its own.
    return Number(Math.max(0, (accounts - distinct) / (accounts - 1)).toFixed(4));
  };

  const sharedPayment = concentration(agg.accountCount, agg.distinctPayments);
  const sharedDevice = concentration(agg.accountCount, agg.distinctDevices);
  const sharedAddress = concentration(agg.accountCount, agg.distinctAddresses);

  const returnRate = agg.orderCount === 0 ? 0 : agg.returnCount / agg.orderCount;
  const refundShare = agg.orderValueMinor === 0 ? 0 : agg.refundValueMinor / agg.orderValueMinor;

  /**
   * Return velocity: how quickly returns follow delivery.
   *
   * Abuse tends to return fast — the goods were never wanted. Genuine returns
   * skew later, because a real customer takes time to discover the problem.
   */
  const daysAfter = agg.medianDaysAfterDelivery;

  /**
   * Temporal synchronisation.
   *
   * A tight spread of return timestamps across DIFFERENT accounts is hard to
   * produce innocently: a family's returns are scattered across months. Guarded
   * so a cluster with fewer than two returns scores zero rather than infinity.
   */
  const synchronisation =
    !Number.isFinite(agg.returnTimeSpreadHours) || agg.returnCount < 3
      ? 0
      : Number(Math.max(0, Math.min(1, 1 - agg.returnTimeSpreadHours / 240)).toFixed(4));

  /**
   * Category concentration.
   *
   * A ring returning only electronics is different from a household returning
   * across eight categories. Normalised against how many categories the cluster
   * COULD plausibly span given its order count, so a 3-order cluster is not
   * penalised for touching 3 categories.
   */
  const categorySpan = Math.min(agg.orderCount, 10);
  const categoryConcentration =
    categorySpan <= 1
      ? 0
      : Number(Math.max(0, (categorySpan - agg.distinctCategories) / (categorySpan - 1)).toFixed(4));

  /**
   * Value concentration: refund value relative to order value, saturating.
   */
  const valueConcentration = saturate(refundShare, POPULATION.refundShare, POPULATION.refundShareHigh);

  return {
    shared_payment: sharedPayment,
    shared_device: sharedDevice,
    shared_address: sharedAddress,
    return_rate: saturate(returnRate, POPULATION.returnRate, POPULATION.returnRateHigh),
    refund_concentration: saturate(refundShare, POPULATION.refundShare, POPULATION.refundShareHigh),
    return_velocity:
      agg.returnCount === 0
        ? 0
        : Number(
            Math.max(0, Math.min(1, 1 - daysAfter / (POPULATION.fastReturnDays * 3))).toFixed(4),
          ),
    temporal_synchronisation: synchronisation,
    cluster_density: cluster.density,
    value_concentration: valueConcentration,
    category_concentration: categoryConcentration,
  };
}

/** Raw per-account return rate, used by the account-level baseline. */
export function accountReturnRate(activity: AccountActivity): number {
  if (activity.orders.length === 0) return 0;
  return Number((activity.returns.length / activity.orders.length).toFixed(4));
}

export function accountRefundShare(activity: AccountActivity): number {
  const orderValue = activity.orders.reduce((a, o) => a + o.amountMinor, 0);
  if (orderValue === 0) return 0;
  const refundValue = activity.refunds.reduce((a, r) => a + r.amountMinor, 0);
  return Number((refundValue / orderValue).toFixed(4));
}
