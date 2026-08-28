import { randomBytes, randomUUID } from "node:crypto";

/** Prefixed identifiers, readable in logs, evidence tables and the console. */
export type IdPrefix =
  | "ent" // graph entity
  | "edg" // graph edge
  | "acc" // account
  | "run" // detection run
  | "clu" // cluster
  | "mem" // cluster member
  | "rng" // labelled ring
  | "rev" // human review
  | "aud" // audit event
  | "evr" // evaluation run
  | "evc" // evaluation case
  | "exc" // exception
  | "ord" // order
  | "ret" // return
  | "rfd" // refund
  | "cor" // correlation
  | "req"; // request

// Crockford-style alphabet: no i, l, o, u - unambiguous when read aloud.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  }
  return out;
}

/**
 * Deterministic-id mode, entered only around cold-start bootstrap.
 *
 * The deployment runs with `DATABASE_URL=pglite://:memory:`, so the database
 * lives inside the process rather than on a server every process shares. On a
 * serverless host each function instance therefore holds its OWN database and
 * seeds its OWN copy of the corpus. The Next.js page renderer and the API route
 * handlers are separate functions: they cold-start separately, bootstrap
 * separately, and never see each other's rows.
 *
 * That is survivable as long as both tiers arrive at the same identifiers. The
 * corpus generator is seeded and content-hashed, so entities, accounts, orders
 * and clusters already agreed. Ids minted through `newId` did not: they were
 * built from `Date.now()` plus ten bytes of `randomBytes`, so the detection run
 * and every audit event got a different id in every instance. A run id or audit
 * id handed out by the API named a row that did not exist on the page tier, and
 * anything linking the two — a deep link, a copied id pasted into a filter, an
 * audit entry cited from an API response — resolved to a 404 or an empty view
 * on a corpus that provably contained the record.
 *
 * Inside `withDeterministicIds` the counter replaces time and randomness, so
 * two independently bootstrapped instances mint the identical id sequence. The
 * counter is null everywhere else, which keeps ids minted for genuine runtime
 * events — a reviewer's decision, an operator-triggered detection run — unique
 * as they must be.
 */
let deterministicCounter: number | null = null;

export async function withDeterministicIds<T>(fn: () => Promise<T>): Promise<T> {
  deterministicCounter = 0;
  try {
    return await fn();
  } finally {
    deterministicCounter = null;
  }
}

/**
 * Time-prefixed id. The leading base36 timestamp makes ids roughly sortable by
 * creation order, which matters when scanning an execution log by eye.
 */
export function newId(prefix: IdPrefix): string {
  if (deterministicCounter !== null) {
    const n = deterministicCounter;
    deterministicCounter += 1;
    return `${prefix}_${n.toString(36).padStart(12, "0")}`;
  }
  const time = Date.now().toString(36).padStart(9, "0");
  return `${prefix}_${time}${randomSuffix(10)}`;
}

export function newCorrelationId(): string {
  return newId("cor");
}

export function newRequestId(): string {
  return newId("req");
}

export function newUuid(): string {
  return randomUUID();
}

/**
 * Deterministic id derived from a key.
 *
 * Scenario ids, suite ids and reference-agent ids use this so a given seed
 * always produces the same identifiers. Certification results therefore
 * reference stable scenario ids across regenerations, which is what makes a
 * historical run comparable to a new one.
 */
export function deterministicId(prefix: IdPrefix, key: string | number): string {
  const slug = String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56);
  return `${prefix}_${slug}`;
}
