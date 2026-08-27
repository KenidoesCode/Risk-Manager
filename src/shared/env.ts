import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv({ quiet: true });

/**
 * Environment configuration.
 *
 * ---------------------------------------------------------------------------
 * DETECTION-ONLY BOUNDARY
 * ---------------------------------------------------------------------------
 * This system surfaces coordinated return-abuse patterns for a human to
 * investigate. It never blocks a customer, suspends an account, denies a
 * refund, or takes any action against a person.
 *
 * `SENTINEL_MODE` makes that structural rather than a matter of discipline.
 * There is deliberately no value meaning "enforce": the parser refuses BLOCK,
 * ENFORCE, AUTO_BLOCK, SUSPEND and LIVE by name, so a misconfigured deployment
 * fails to start rather than quietly acting against customers on the strength
 * of a graph score.
 *
 * The asymmetry matters here more than in most risk systems. A false positive
 * is a real family, sharing a real home, being investigated for fraud because
 * they live together — and the graph signal that produces it (shared address,
 * shared device) is exactly the signal a household produces.
 */

export const SENTINEL_MODES = ["DETECT_ONLY", "TEST_MODE"] as const;
export type SentinelMode = (typeof SENTINEL_MODES)[number];

const FORBIDDEN_MODES = ["BLOCK", "ENFORCE", "AUTO_BLOCK", "SUSPEND", "LIVE", "PRODUCTION", "PROD"];

const SentinelModeSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? "DETECT_ONLY" : v.trim().toUpperCase()))
  .superRefine((value, ctx) => {
    if (FORBIDDEN_MODES.includes(value)) {
      ctx.addIssue({
        code: "custom",
        message:
          `SENTINEL_MODE="${value}" is refused. This system detects and explains; it never acts against a customer. ` +
          `Allowed values: ${SENTINEL_MODES.join(", ")}.`,
      });
      return;
    }
    if (!(SENTINEL_MODES as readonly string[]).includes(value)) {
      ctx.addIssue({
        code: "custom",
        message: `SENTINEL_MODE="${value}" is not recognised. Allowed: ${SENTINEL_MODES.join(", ")}.`,
      });
    }
  })
  .transform((v) => v as SentinelMode);

const numeric = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SENTINEL_MODE: SentinelModeSchema,

  DATABASE_URL: z.string().default("pglite://./.data/sentinel"),

  /** Explanation only. The model never scores, clusters or decides. */
  LLM_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
  LLM_MODEL: z.string().default("claude-opus-5"),
  LLM_MAX_TOKENS: numeric(1200),
  LLM_TIMEOUT_MS: numeric(20_000),
  LLM_API_KEY: z.string().default(""),
  LLM_BASE_URL: z.string().default(""),

  /** Risk at or above this is treated as a detection, 0..100. */
  RISK_THRESHOLD: numeric(70),
  /** Below this confidence the cluster routes to review rather than a call. */
  CONFIDENCE_THRESHOLD: numeric(0.6),
  /** A cluster with fewer accounts than this cannot be a ring detection. */
  MIN_CLUSTER_ACCOUNTS: numeric(3),
  /** Below this many events per account, the cluster is INSUFFICIENT_DATA. */
  MIN_EVENTS_PER_ACCOUNT: numeric(2),

  AUTH_SECRET: z.string().default(""),
  API_TOKEN: z.string().default(""),

  SEED: numeric(20_260_301),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

export type RawEnv = z.infer<typeof EnvSchema>;
export type DbDriver = "postgres" | "pglite";

export interface AppEnv extends RawEnv {
  dbDriver: DbDriver;
  pglitePath: string;
  pgliteInMemory: boolean;
  llmEnabled: boolean;
  authRequired: boolean;
  isProduction: boolean;
  isTest: boolean;
}

function derive(raw: RawEnv): AppEnv {
  const url = raw.DATABASE_URL.trim();
  const isPglite = url.startsWith("pglite://") || url === "" || url.startsWith("file:");
  const pglitePath = isPglite
    ? url.replace(/^pglite:\/\//, "").replace(/^file:/, "") || "./.data/sentinel"
    : "";

  return {
    ...raw,
    dbDriver: isPglite ? "pglite" : "postgres",
    pglitePath,
    pgliteInMemory:
      isPglite && (pglitePath === ":memory:" || pglitePath === "memory" || pglitePath === ""),
    llmEnabled: raw.LLM_PROVIDER !== "none" && raw.LLM_API_KEY.trim().length > 0,
    authRequired: raw.API_TOKEN.trim().length > 0,
    isProduction: raw.NODE_ENV === "production",
    isTest: raw.NODE_ENV === "test",
  };
}

let cached: AppEnv | null = null;

export function parseEnv(source: Record<string, string | undefined>): AppEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return derive(parsed.data);
}

export function getEnv(): AppEnv {
  if (cached) return cached;
  cached = parseEnv(process.env);
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

/** Called before anything that writes a detection. */
export function assertDetectOnly(): SentinelMode {
  const mode = getEnv().SENTINEL_MODE;
  if (!(SENTINEL_MODES as readonly string[]).includes(mode)) {
    throw new Error(`Refusing to operate in mode '${String(mode)}'.`);
  }
  return mode;
}

export function environmentStatus() {
  const env = getEnv();
  return {
    nodeEnv: env.NODE_ENV,
    sentinelMode: env.SENTINEL_MODE,
    /** Structural: nothing here can act against a customer. */
    canBlockCustomers: false as const,
    canDenyRefunds: false as const,
    database: {
      driver: env.dbDriver,
      target: env.dbDriver === "pglite" ? env.pglitePath : "postgres server",
    },
    model: {
      provider: env.LLM_PROVIDER,
      model: env.LLM_MODEL,
      enabled: env.llmEnabled,
      apiKeyPresent: env.LLM_API_KEY.trim().length > 0,
      role: "explanation only — never scores, clusters or decides",
    },
    thresholds: {
      risk: env.RISK_THRESHOLD,
      confidence: env.CONFIDENCE_THRESHOLD,
      minClusterAccounts: env.MIN_CLUSTER_ACCOUNTS,
      minEventsPerAccount: env.MIN_EVENTS_PER_ACCOUNT,
    },
    auth: { required: env.authRequired },
    seed: env.SEED,
  };
}
