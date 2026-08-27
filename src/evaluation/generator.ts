import { SeededRandom, hashSeed } from "../shared/rng";
import { sha256Hex } from "../shared/hash";
import {
  BENIGN_TEMPLATES,
  RING_TEMPLATES,
  type BenignTemplate,
  type Difficulty,
  type RingTemplate,
  type Split,
} from "../domain/vocabulary";

export const GENERATOR_VERSION = "graph-generator-1.0.0";
export const DATASET_VERSION = "1.0.0";

/**
 * Synthetic commerce graph with labelled rings and hard negatives.
 *
 * ---------------------------------------------------------------------------
 * THE HARD NEGATIVES ARE THE POINT
 * ---------------------------------------------------------------------------
 * A generator that produces suspicious rings and uniform random noise builds a
 * detector that learns "shared address = fraud". That detector achieves
 * excellent metrics and is useless, because in the real world the overwhelming
 * majority of shared-address clusters are families, flatmates and offices.
 *
 * So roughly half the *clustered* population here is deliberately benign but
 * structurally identical to a ring: same shared devices, same shared address,
 * sometimes the same shared card. The ONLY thing separating them is behaviour —
 * return rates, timing dispersion, category diversity, tenure.
 *
 * The consequence is that the headline false-positive rate on this corpus is
 * meaningful rather than flattering, and the per-template hard-negative rates
 * in the evaluation are where the detector's real quality shows.
 *
 * ---------------------------------------------------------------------------
 * SPLITS ARE RING-LEVEL, NOT ROW-LEVEL
 * ---------------------------------------------------------------------------
 * Splitting individual accounts would put members of the same ring in train and
 * held-out at once, and a detector that memorised one member's device would
 * score on the other. Whole rings are assigned to a split, together with every
 * entity they touch.
 */

export type EntitySpec = {
  id: string;
  type: "CUSTOMER" | "ACCOUNT" | "DEVICE" | "ADDRESS" | "PAYMENT" | "MERCHANT";
  anonymizedKey: string;
  metadata: Record<string, unknown>;
  firstSeenIso: string;
  lastSeenIso: string;
  eventCount: number;
};

export interface GeneratedOrder {
  id: string;
  accountId: string;
  productCategory: string;
  amountMinor: number;
  placedAtIso: string;
  deviceKey: string | null;
  addressKey: string | null;
  paymentKey: string | null;
  returned: boolean;
  returnReason: string;
  returnInitiatedAtIso: string | null;
  daysAfterDelivery: number;
  refunded: boolean;
  refundAmountMinor: number;
  refundProcessedAtIso: string | null;
}

export interface GeneratedAccount {
  id: string;
  customerKey: string;
  openedAtIso: string;
  tenureDays: number;
  deviceKeys: string[];
  addressKeys: string[];
  paymentKeys: string[];
  orders: GeneratedOrder[];
  groundTruthRingId: string | null;
  groundTruthLabel: "SUSPICIOUS" | "BENIGN";
  split: Split;
}

export interface GeneratedGroup {
  ringId: string;
  label: "SUSPICIOUS" | "BENIGN";
  template: RingTemplate | BenignTemplate;
  difficulty: Difficulty;
  split: Split;
  memberAccountIds: string[];
  sharedInfrastructure: Record<string, string[]>;
  notes: string;
}

export interface GeneratedCorpus {
  accounts: GeneratedAccount[];
  groups: GeneratedGroup[];
  generatorVersion: string;
  datasetVersion: string;
  seed: number;
  stats: {
    accounts: number;
    orders: number;
    returns: number;
    refunds: number;
    suspiciousGroups: number;
    benignGroups: number;
    unclusteredAccounts: number;
  };
}

const CATEGORIES = [
  "electronics",
  "apparel",
  "footwear",
  "home",
  "beauty",
  "sports",
  "toys",
  "grocery",
  "books",
  "accessories",
];

const RETURN_REASONS_BENIGN = [
  "SIZE_WRONG",
  "CHANGED_MIND",
  "ARRIVED_DAMAGED",
  "NOT_AS_DESCRIBED",
  "DUPLICATE_ORDER",
];

const RETURN_REASONS_ABUSE = ["NOT_AS_DESCRIBED", "ITEM_MISSING", "CHANGED_MIND", "ARRIVED_DAMAGED"];

const BASE_TIME = Date.parse("2026-01-05T09:00:00.000Z");
const iso = (hours: number) => new Date(BASE_TIME + hours * 3_600_000).toISOString();

/** Stable anonymised key. No raw identifier is ever retained. */
function key(prefix: string, seedText: string): string {
  return `${prefix}_${sha256Hex(seedText).slice(0, 16)}`;
}

interface GroupShape {
  accounts: number;
  devices: number;
  addresses: number;
  payments: number;
  /** Probability any given order is returned. */
  returnRate: number;
  /** Orders per account. */
  ordersPerAccount: [number, number];
  /** Hours of jitter around the group's shared return window. Small = synced. */
  temporalJitterHours: number;
  /** How many distinct categories the group buys across. */
  categorySpread: number;
  tenureDays: [number, number];
  orderValueMinor: [number, number];
  returnReasons: readonly string[];
  notes: string;
}

/**
 * Ring templates.
 *
 * `LOW_INDIVIDUAL_HIGH_COLLECTIVE` is the one that justifies the whole product:
 * each account has an ordinary return rate that no account-level rule would
 * flag, and the signal exists only in the shared infrastructure and the
 * synchronisation across the group.
 */
const RING_SHAPES: Record<RingTemplate, GroupShape> = {
  SHARED_DEVICE_HIGH_RETURN: {
    accounts: 8,
    devices: 3,
    addresses: 1,
    payments: 2,
    returnRate: 0.72,
    ordersPerAccount: [5, 9],
    temporalJitterHours: 30,
    categorySpread: 2,
    tenureDays: [30, 160],
    orderValueMinor: [180_000, 700_000],
    returnReasons: RETURN_REASONS_ABUSE,
    notes: "Eight accounts operated from three devices at one address, returning most of what they buy.",
  },
  SHARED_ADDRESS_REFUND_CONCENTRATION: {
    accounts: 5,
    devices: 5,
    addresses: 1,
    payments: 1,
    returnRate: 0.6,
    ordersPerAccount: [4, 7],
    temporalJitterHours: 42,
    categorySpread: 2,
    tenureDays: [25, 120],
    orderValueMinor: [250_000, 950_000],
    returnReasons: RETURN_REASONS_ABUSE,
    notes: "Five accounts on separate devices sharing one address and one payment fingerprint, with refund value concentrated in a short window.",
  },
  MULTI_INFRASTRUCTURE_SYNCHRONISED: {
    accounts: 12,
    devices: 4,
    addresses: 3,
    payments: 3,
    returnRate: 0.66,
    ordersPerAccount: [4, 8],
    temporalJitterHours: 14,
    categorySpread: 3,
    tenureDays: [20, 140],
    orderValueMinor: [200_000, 800_000],
    returnReasons: RETURN_REASONS_ABUSE,
    notes: "Twelve accounts sharing devices, addresses and cards, returning inside tight windows.",
  },
  LOW_INDIVIDUAL_HIGH_COLLECTIVE: {
    accounts: 6,
    devices: 2,
    addresses: 2,
    payments: 2,
    // Deliberately ordinary. A per-account rule at 0.4 will not fire.
    returnRate: 0.33,
    ordersPerAccount: [6, 10],
    temporalJitterHours: 20,
    categorySpread: 1,
    tenureDays: [60, 300],
    orderValueMinor: [220_000, 620_000],
    returnReasons: RETURN_REASONS_ABUSE,
    notes: "Each account looks unremarkable alone. The pattern exists only across the group: shared infrastructure, one product category, synchronised returns.",
  },
};

/**
 * Hard negatives, structurally indistinguishable from rings.
 *
 * These share the same infrastructure a ring shares. What differs is behaviour:
 * ordinary return rates, dispersed timing, diverse categories, long tenure.
 */
const BENIGN_SHAPES: Record<BenignTemplate, GroupShape> = {
  FAMILY_HOUSEHOLD: {
    accounts: 4,
    devices: 2,
    addresses: 1,
    // A family shares a card. This is the case that makes payment-sharing
    // alone an unusable signal.
    payments: 1,
    returnRate: 0.14,
    ordersPerAccount: [6, 14],
    temporalJitterHours: 900,
    categorySpread: 6,
    tenureDays: [400, 1400],
    orderValueMinor: [40_000, 400_000],
    returnReasons: RETURN_REASONS_BENIGN,
    notes: "A family at one address sharing a tablet and a card, with ordinary return behaviour over years.",
  },
  SHARED_APARTMENT: {
    accounts: 5,
    devices: 5,
    addresses: 1,
    payments: 5,
    returnRate: 0.17,
    ordersPerAccount: [4, 11],
    temporalJitterHours: 800,
    categorySpread: 7,
    tenureDays: [200, 900],
    orderValueMinor: [30_000, 350_000],
    returnReasons: RETURN_REASONS_BENIGN,
    notes: "Flatmates: one address, entirely separate devices and cards, independent buying.",
  },
  OFFICE_NETWORK: {
    accounts: 10,
    devices: 3,
    addresses: 1,
    payments: 8,
    returnRate: 0.12,
    ordersPerAccount: [3, 9],
    temporalJitterHours: 700,
    categorySpread: 8,
    tenureDays: [300, 1100],
    orderValueMinor: [25_000, 300_000],
    returnReasons: RETURN_REASONS_BENIGN,
    notes: "Colleagues behind a shared office network and delivery address, buying for themselves.",
  },
  CORPORATE_PROCUREMENT: {
    accounts: 7,
    devices: 4,
    addresses: 1,
    payments: 2,
    // High volume AND a real return rate — the closest benign case to a ring.
    returnRate: 0.26,
    ordersPerAccount: [14, 26],
    temporalJitterHours: 500,
    categorySpread: 5,
    tenureDays: [500, 1500],
    orderValueMinor: [150_000, 1_200_000],
    returnReasons: RETURN_REASONS_BENIGN,
    notes: "A procurement team: one address, shared corporate cards, high volume, and legitimate returns of wrong-spec items.",
  },
};

/**
 * Difficulty, implemented as CLASS CONVERGENCE.
 *
 * ---------------------------------------------------------------------------
 * WHY SCALING BOTH CLASSES THE SAME WAY IS NOT DIFFICULTY
 * ---------------------------------------------------------------------------
 * An earlier version multiplied every shape's temporal jitter by 3 at
 * ADVERSARIAL. Rings went from 14–42h to 42–126h and households from 500–900h
 * to 1500–2700h: the absolute numbers moved a long way and the GAP between the
 * classes stayed exactly as wide. The detector's synchronisation feature
 * separated them as easily as before, and the held-out F1 came out at 1.0000 —
 * a number that described the generator, not the detector.
 *
 * Difficulty is therefore an interpolation toward a shared midpoint. At
 * ADVERSARIAL a ring's behaviour is pulled 70% of the way toward what an
 * ordinary household does, and a household's is pulled 45% of the way toward a
 * ring. The classes genuinely overlap, some cases become undecidable on the
 * evidence, and the resulting metrics are informative because they are no
 * longer achievable by reading one feature.
 */
const CONVERGENCE: Record<Difficulty, { suspicious: number; benign: number }> = {
  EASY: { suspicious: -0.15, benign: -0.1 },
  MEDIUM: { suspicious: 0.15, benign: 0.1 },
  HARD: { suspicious: 0.45, benign: 0.3 },
  // Near-total overlap. At this level a ring's behaviour is 88% of the way to
  // an ordinary household's and a household's is 60% of the way to a ring's,
  // so some cases are genuinely undecidable from the evidence — which is the
  // point of having an adversarial cell at all.
  ADVERSARIAL: { suspicious: 0.88, benign: 0.6 },
};

/** Midpoints between the two classes, in the units each feature uses. */
const MIDPOINT = {
  returnRate: 0.36,
  temporalJitterHours: 260,
  categorySpread: 4.5,
  tenureDays: 420,
};

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

function applyDifficulty(
  shape: GroupShape,
  difficulty: Difficulty,
  label: "SUSPICIOUS" | "BENIGN",
  rng: SeededRandom,
): GroupShape {
  const t = label === "SUSPICIOUS" ? CONVERGENCE[difficulty].suspicious : CONVERGENCE[difficulty].benign;
  const s = { ...shape };

  s.returnRate = Math.max(0.03, Math.min(0.95, lerp(shape.returnRate, MIDPOINT.returnRate, t)));
  s.temporalJitterHours = Math.max(4, lerp(shape.temporalJitterHours, MIDPOINT.temporalJitterHours, t));
  s.categorySpread = Math.max(
    1,
    Math.min(CATEGORIES.length, Math.round(lerp(shape.categorySpread, MIDPOINT.categorySpread, t))),
  );
  s.tenureDays = [
    Math.max(10, Math.round(lerp(shape.tenureDays[0], MIDPOINT.tenureDays, t))),
    Math.max(20, Math.round(lerp(shape.tenureDays[1], MIDPOINT.tenureDays, t))),
  ];

  // Size varies at the harder levels so account count alone carries no signal.
  if (difficulty === "HARD" || difficulty === "ADVERSARIAL") {
    s.accounts = Math.max(3, shape.accounts + rng.int(-2, 3));
  }

  return s;
}

function buildGroup(
  rng: SeededRandom,
  options: {
    groupIndex: number;
    label: "SUSPICIOUS" | "BENIGN";
    template: RingTemplate | BenignTemplate;
    difficulty: Difficulty;
    split: Split;
    seed: number;
  },
): { group: GeneratedGroup; accounts: GeneratedAccount[] } {
  const base = options.label === "SUSPICIOUS"
    ? RING_SHAPES[options.template as RingTemplate]
    : BENIGN_SHAPES[options.template as BenignTemplate];
  const shape = applyDifficulty(base, options.difficulty, options.label, rng);

  const ringId = `ring_${String(options.groupIndex).padStart(4, "0")}`;
  const salt = `${options.seed}:${ringId}`;

  const devices = Array.from({ length: shape.devices }, (_, i) => key("dev", `${salt}:device:${i}`));
  const addresses = Array.from({ length: shape.addresses }, (_, i) => key("adr", `${salt}:address:${i}`));
  const payments = Array.from({ length: shape.payments }, (_, i) => key("pay", `${salt}:payment:${i}`));

  // The group's shared return window. Suspicious groups cluster around it;
  // benign ones are scattered by a much larger jitter.
  const groupWindowHours = rng.int(200, 900);
  const categories = rng.sample(CATEGORIES, Math.max(1, shape.categorySpread));

  const accounts: GeneratedAccount[] = [];

  for (let a = 0; a < shape.accounts; a += 1) {
    const accountId = `acct_${ringId.replace("ring_", "")}_${String(a).padStart(2, "0")}`;
    const tenureDays = rng.int(shape.tenureDays[0], shape.tenureDays[1]);
    const openedHours = -(tenureDays * 24);

    // Each account touches a subset of the group's infrastructure. Assigning
    // every account every device would make the derived-edge graph a complete
    // clique and the density signal meaningless.
    const accountDevices = rng.sample(devices, Math.max(1, Math.min(devices.length, rng.int(1, 2))));
    const accountAddresses = rng.sample(addresses, Math.max(1, Math.min(addresses.length, 1)));
    const accountPayments = rng.sample(payments, Math.max(1, Math.min(payments.length, rng.int(1, 2))));

    const orderCount = rng.int(shape.ordersPerAccount[0], shape.ordersPerAccount[1]);
    const orders: GeneratedOrder[] = [];

    for (let o = 0; o < orderCount; o += 1) {
      const placedHours = -rng.int(24, Math.max(48, tenureDays * 24));
      const amountMinor = rng.int(shape.orderValueMinor[0], shape.orderValueMinor[1]);
      const returned = rng.next() < shape.returnRate;

      const returnHours = returned
        ? groupWindowHours * -1 + rng.int(-shape.temporalJitterHours, shape.temporalJitterHours)
        : 0;

      // A refund does not always follow a return: some are rejected, some are
      // still in flight. Making refunds automatic would collapse two features
      // into one.
      const refunded = returned && rng.next() < (options.label === "SUSPICIOUS" ? 0.92 : 0.78);

      orders.push({
        id: `ord_${accountId}_${String(o).padStart(2, "0")}`,
        accountId,
        productCategory: rng.pick(categories),
        amountMinor,
        placedAtIso: iso(placedHours),
        deviceKey: rng.pick(accountDevices),
        addressKey: rng.pick(accountAddresses),
        paymentKey: rng.pick(accountPayments),
        returned,
        returnReason: returned ? rng.pick(shape.returnReasons) : "",
        returnInitiatedAtIso: returned ? iso(returnHours) : null,
        daysAfterDelivery: returned ? rng.int(1, options.label === "SUSPICIOUS" ? 12 : 25) : 0,
        refunded,
        refundAmountMinor: refunded ? amountMinor : 0,
        refundProcessedAtIso: refunded ? iso(returnHours + rng.int(24, 120)) : null,
      });
    }

    accounts.push({
      id: accountId,
      customerKey: key("cus", `${salt}:customer:${a}`),
      openedAtIso: iso(openedHours),
      tenureDays,
      deviceKeys: accountDevices,
      addressKeys: accountAddresses,
      paymentKeys: accountPayments,
      orders,
      groundTruthRingId: ringId,
      groundTruthLabel: options.label,
      split: options.split,
    });
  }

  return {
    group: {
      ringId,
      label: options.label,
      template: options.template,
      difficulty: options.difficulty,
      split: options.split,
      memberAccountIds: accounts.map((a) => a.id),
      sharedInfrastructure: { devices, addresses, payments },
      notes: shape.notes,
    },
    accounts,
  };
}

/**
 * Unclustered background accounts.
 *
 * Without these the graph is nothing but groups, every account belongs to a
 * cluster, and the detector never has to decide whether a cluster exists at
 * all. Some of these have high individual return rates with no cross-account
 * linkage — the case the spec requires be treated as an account-level signal
 * rather than a ring.
 */
function buildBackgroundAccount(rng: SeededRandom, index: number, seed: number, split: Split): GeneratedAccount {
  const accountId = `acct_bg_${String(index).padStart(4, "0")}`;
  const salt = `${seed}:bg:${index}`;
  const tenureDays = rng.int(40, 1200);

  // ~8% are solo high-returners: individually suspicious, structurally isolated.
  const soloHighReturn = rng.next() < 0.08;
  const returnRate = soloHighReturn ? rng.int(55, 85) / 100 : rng.int(2, 25) / 100;

  const deviceKey = key("dev", `${salt}:device`);
  const addressKey = key("adr", `${salt}:address`);
  const paymentKey = key("pay", `${salt}:payment`);

  const orderCount = rng.int(2, 16);
  const orders: GeneratedOrder[] = [];

  for (let o = 0; o < orderCount; o += 1) {
    const placedHours = -rng.int(24, Math.max(48, tenureDays * 24));
    const amountMinor = rng.int(20_000, 900_000);
    const returned = rng.next() < returnRate;
    const returnHours = returned ? placedHours + rng.int(48, 900) : 0;
    const refunded = returned && rng.next() < 0.8;

    orders.push({
      id: `ord_${accountId}_${String(o).padStart(2, "0")}`,
      accountId,
      productCategory: rng.pick(CATEGORIES),
      amountMinor,
      placedAtIso: iso(placedHours),
      deviceKey,
      addressKey,
      paymentKey,
      returned,
      returnReason: returned ? rng.pick(RETURN_REASONS_BENIGN) : "",
      returnInitiatedAtIso: returned ? iso(returnHours) : null,
      daysAfterDelivery: returned ? rng.int(1, 28) : 0,
      refunded,
      refundAmountMinor: refunded ? amountMinor : 0,
      refundProcessedAtIso: refunded ? iso(returnHours + rng.int(24, 200)) : null,
    });
  }

  return {
    id: accountId,
    customerKey: key("cus", `${salt}:customer`),
    openedAtIso: iso(-(tenureDays * 24)),
    tenureDays,
    deviceKeys: [deviceKey],
    addressKeys: [addressKey],
    paymentKeys: [paymentKey],
    orders,
    groundTruthRingId: null,
    groundTruthLabel: "BENIGN",
    split,
  };
}

export interface GenerateOptions {
  seed: number;
  /** Number of labelled suspicious rings. */
  suspiciousGroups?: number;
  /** Number of benign hard-negative groups. */
  benignGroups?: number;
  /** Unclustered background accounts. */
  backgroundAccounts?: number;
}

/**
 * Difficulty mix. Weighted toward HARD and MEDIUM, because an evaluation
 * dominated by EASY cases measures almost nothing.
 *
 * Seven entries, not ten, and drawn by a hash rather than by index — see the
 * note on split assignment below for why that matters.
 */
const DIFFICULTY_CYCLE: Difficulty[] = [
  "EASY",
  "MEDIUM",
  "MEDIUM",
  "HARD",
  "HARD",
  "ADVERSARIAL",
  "HARD",
];

export function generateCorpus(options: GenerateOptions): GeneratedCorpus {
  const suspiciousGroups = options.suspiciousGroups ?? 30;
  const benignGroups = options.benignGroups ?? 30;
  const backgroundAccounts = options.backgroundAccounts ?? 240;

  const groups: GeneratedGroup[] = [];
  const accounts: GeneratedAccount[] = [];

  // Ring-level split assignment on a fixed cycle, offset per (label, template)
  // so no template lands entirely in one split.
  const splitCycle: Split[] = [
    "train", "train", "train", "train", "train", "train",
    "dev", "dev",
    "held-out", "held-out",
  ];

  let groupIndex = 0;

  const emit = (
    label: "SUSPICIOUS" | "BENIGN",
    templates: readonly (RingTemplate | BenignTemplate)[],
    count: number,
  ) => {
    for (let i = 0; i < count; i += 1) {
      const template = templates[i % templates.length] as RingTemplate | BenignTemplate;

      /**
       * DIFFICULTY AND SPLIT MUST BE INDEPENDENT.
       *
       * Deriving both from `i % 10` — as an earlier version of this file did —
       * makes them perfectly correlated: for any given template, each
       * difficulty always lands in the same split. The consequence was that the
       * held-out set contained no ADVERSARIAL suspicious rings at all, and the
       * per-difficulty table reported a dash for the cell that matters most
       * while every other number looked healthy.
       *
       * Difficulty is now drawn from an independent hash, and the split cycle
       * has a different length from the difficulty cycle, so the two cannot
       * line up.
       */
      const difficulty = DIFFICULTY_CYCLE[
        hashSeed(`${options.seed}:difficulty:${label}:${template}:${i}`) % DIFFICULTY_CYCLE.length
      ] as Difficulty;

      const offset = hashSeed(`${options.seed}:split:${label}:${template}`) % splitCycle.length;
      const split = splitCycle[(i + offset) % splitCycle.length] as Split;

      const rng = new SeededRandom(hashSeed(`${options.seed}:group:${label}:${i}`));
      const built = buildGroup(rng, {
        groupIndex,
        label,
        template,
        difficulty,
        split,
        seed: options.seed,
      });
      groups.push(built.group);
      accounts.push(...built.accounts);
      groupIndex += 1;
    }
  };

  emit("SUSPICIOUS", RING_TEMPLATES, suspiciousGroups);
  emit("BENIGN", BENIGN_TEMPLATES, benignGroups);

  for (let i = 0; i < backgroundAccounts; i += 1) {
    const rng = new SeededRandom(hashSeed(`${options.seed}:bg:${i}`));
    const cycle = i % 10;
    const split: Split = cycle < 6 ? "train" : cycle < 8 ? "dev" : "held-out";
    accounts.push(buildBackgroundAccount(rng, i, options.seed, split));
  }

  const allOrders = accounts.flatMap((a) => a.orders);

  return {
    accounts,
    groups,
    generatorVersion: GENERATOR_VERSION,
    datasetVersion: DATASET_VERSION,
    seed: options.seed,
    stats: {
      accounts: accounts.length,
      orders: allOrders.length,
      returns: allOrders.filter((o) => o.returned).length,
      refunds: allOrders.filter((o) => o.refunded).length,
      suspiciousGroups,
      benignGroups,
      unclusteredAccounts: backgroundAccounts,
    },
  };
}
