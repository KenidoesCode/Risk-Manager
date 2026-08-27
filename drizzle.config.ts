import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/chargeback_responder",
  },
  verbose: true,
  strict: true,
} satisfies Config;
