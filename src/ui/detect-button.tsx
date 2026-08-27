"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Play } from "lucide-react";

/**
 * Runs a real detection against the real API route.
 *
 * Not a decorative control: it POSTs to /api/detect, which rebuilds the derived
 * edges, clusters the graph, scores every cluster, opens reviews and writes
 * audit events. The page then refreshes from the database, so what is shown
 * afterwards is what was actually stored.
 */
export function DetectButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "shared-entity", rebuild: true }),
      });
      const json = (await response.json()) as {
        clusterCount?: number;
        flagged?: number;
        cappedByGuardrail?: number;
        reviewsOpened?: number;
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(json.error?.message ?? `Request failed with ${response.status}.`);
        return;
      }
      setSummary(
        `${json.clusterCount} clusters · ${json.flagged} coordination likely · ${json.cappedByGuardrail} capped by the guardrail · ${json.reviewsOpened} reviews opened`,
      );
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const running = busy || pending;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="web-clip inline-flex items-center gap-2 bg-[var(--color-strand)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--color-strand-glow)] disabled:opacity-50"
      >
        {running ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />}
        {running ? "Detecting…" : "Run detection"}
      </button>
      {summary && <p className="max-w-md text-right text-[0.6875rem] text-[var(--color-chalk-faint)]">{summary}</p>}
      {error && <p className="max-w-xs text-right text-[0.6875rem] text-[var(--color-strand)]">{error}</p>}
    </div>
  );
}
