import type { Database } from "../db/client";
import { accounts, orders, refundEvents, returnEvents } from "../db/schema";
import { accountRefundShare, accountReturnRate, type AccountActivity } from "./features";

export const BASELINE_VERSION = "account-baseline-1.0.0";

/**
 * Account-level baseline — the comparator the whole product is arguing with.
 *
 * ---------------------------------------------------------------------------
 * IT IS DELIBERATELY BLIND TO COORDINATION
 * ---------------------------------------------------------------------------
 * This baseline sees one account at a time: its return rate, its refund share,
 * its velocity, its tenure. It has no access to the graph, no notion that two
 * accounts share a device, and no way to notice that six unremarkable accounts
 * return the same product category within the same eight hours.
 *
 * That is not a strawman — it is what most production return-abuse controls
 * actually are, and it catches the loud individual abuser perfectly well. The
 * `LOW_INDIVIDUAL_HIGH_COLLECTIVE` ring template exists specifically to test
 * the case where it cannot help: every member sits at an ordinary 33% return
 * rate that no per-account threshold would flag without also flagging thousands
 * of honest customers.
 *
 * The COORDINATION RECOVERY metric in the evaluation measures exactly the gap
 * between the two, and if the gap turns out to be small, the evaluation says so.
 */

export interface BaselineFlag {
  accountId: string;
  entityId: string;
  score: number;
  flagged: boolean;
  reasons: string[];
  returnRate: number;
  refundShare: number;
  orderCount: number;
}

export interface BaselineThresholds {
  returnRate: number;
  refundShare: number;
  minOrders: number;
  fastReturnDays: number;
}

export const DEFAULT_BASELINE_THRESHOLDS: BaselineThresholds = {
  /**
   * 45% is well above the population median of roughly 15%.
   *
   * Chosen by the same threshold sweep the graph detector uses, over the train
   * split, minimising the same FP:FN cost ratio — otherwise the comparison
   * would be between a tuned detector and an untuned one, which measures
   * nothing except who got the tuning.
   */
  returnRate: 0.45,
  refundShare: 0.5,
  minOrders: 3,
  fastReturnDays: 5,
};

export function scoreAccount(
  activity: AccountActivity,
  thresholds: BaselineThresholds = DEFAULT_BASELINE_THRESHOLDS,
): BaselineFlag {
  const returnRate = accountReturnRate(activity);
  const refundShare = accountRefundShare(activity);
  const orderCount = activity.orders.length;
  const reasons: string[] = [];

  let score = 0;

  if (orderCount < thresholds.minOrders) {
    // Too little history to say anything. Reported as such rather than scored
    // as zero-risk, because "no evidence" and "evidence of nothing" differ.
    return {
      accountId: activity.account.id,
      entityId: activity.account.entityId,
      score: 0,
      flagged: false,
      reasons: [`Only ${orderCount} order(s) — below the ${thresholds.minOrders}-order minimum.`],
      returnRate,
      refundShare,
      orderCount,
    };
  }

  if (returnRate >= thresholds.returnRate) {
    score += 45;
    reasons.push(
      `Return rate ${Math.round(returnRate * 100)}% is at or above the ${Math.round(thresholds.returnRate * 100)}% threshold.`,
    );
  } else if (returnRate >= thresholds.returnRate * 0.7) {
    score += 20;
    reasons.push(`Return rate ${Math.round(returnRate * 100)}% is elevated.`);
  }

  if (refundShare >= thresholds.refundShare) {
    score += 30;
    reasons.push(
      `Refund value is ${Math.round(refundShare * 100)}% of order value, at or above the ${Math.round(thresholds.refundShare * 100)}% threshold.`,
    );
  }

  const fastReturns = activity.returns.filter((r) => r.daysAfterDelivery <= thresholds.fastReturnDays);
  if (activity.returns.length >= 3 && fastReturns.length / activity.returns.length > 0.6) {
    score += 15;
    reasons.push(`${fastReturns.length} of ${activity.returns.length} returns initiated within ${thresholds.fastReturnDays} days.`);
  }

  if (activity.account.tenureDays < 90 && returnRate > 0.3) {
    score += 10;
    reasons.push(`Account is ${activity.account.tenureDays} days old with a ${Math.round(returnRate * 100)}% return rate.`);
  }

  if (reasons.length === 0) {
    reasons.push("Return and refund behaviour is within normal range for a single account.");
  }

  return {
    accountId: activity.account.id,
    entityId: activity.account.entityId,
    score: Math.min(100, score),
    flagged: score >= 45,
    reasons,
    returnRate,
    refundShare,
    orderCount,
  };
}

export async function runBaseline(
  db: Database,
  thresholds: BaselineThresholds = DEFAULT_BASELINE_THRESHOLDS,
): Promise<BaselineFlag[]> {
  const accountRows = await db.select().from(accounts);
  const orderRows = await db.select().from(orders);
  const returnRows = await db.select().from(returnEvents);
  const refundRows = await db.select().from(refundEvents);

  const byAccount = new Map<string, AccountActivity>();
  for (const a of accountRows) {
    byAccount.set(a.id, { account: a, orders: [], returns: [], refunds: [] });
  }
  for (const o of orderRows) byAccount.get(o.accountId)?.orders.push(o);
  for (const r of returnRows) {
    byAccount.get(r.accountId)?.returns.push({
      orderId: r.orderId,
      initiatedAt: r.initiatedAt,
      daysAfterDelivery: r.daysAfterDelivery,
    });
  }
  for (const f of refundRows) {
    byAccount.get(f.accountId)?.refunds.push({ amountMinor: f.amountMinor, processedAt: f.processedAt });
  }

  return [...byAccount.values()].map((a) => scoreAccount(a, thresholds));
}

/** Sweeps the baseline's own threshold, so the comparison is fair. */
export function baselineSweep(
  activities: AccountActivity[],
  candidates = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7],
): Array<{ returnRate: number; flagged: number }> {
  return candidates.map((returnRate) => ({
    returnRate,
    flagged: activities.filter(
      (a) => scoreAccount(a, { ...DEFAULT_BASELINE_THRESHOLDS, returnRate }).flagged,
    ).length,
  }));
}
