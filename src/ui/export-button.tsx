"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * Downloads a ring dossier.
 *
 * Two formats, because they are for two different people: the JSON is the
 * complete subgraph with every edge, weight and derivation reason, for someone
 * who is going to load it into their own tooling; the CSV is the account list
 * with scores, for someone who is going to open it in a spreadsheet and start
 * making calls.
 *
 * Neither is a screenshot of the page. Both are generated from the same query
 * the console renders from, so what leaves the building is what was on screen.
 */
export function ExportButton({ clusterId }: { clusterId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: "json" | "csv") {
    setBusy(format);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/clusters/${clusterId}/export?format=${format}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.message ?? `Export failed (${response.status}).`);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ring-${clusterId}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage(`${format.toUpperCase()} saved · ${(blob.size / 1024).toFixed(1)} KB`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => download("json")} disabled={busy !== null} className="stamp-button stamp-button-ghost inline-flex items-center gap-1.5">
          {busy === "json" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Download size={12} aria-hidden />}
          Subgraph JSON
        </button>
        <button type="button" onClick={() => download("csv")} disabled={busy !== null} className="stamp-button stamp-button-ghost inline-flex items-center gap-1.5">
          {busy === "csv" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Download size={12} aria-hidden />}
          Accounts CSV
        </button>
      </div>
      {message && <p className="strand text-[0.625rem] text-[var(--color-clear)]">{message}</p>}
      {error && <p className="strand text-[0.625rem] text-[var(--color-magenta)]">{error}</p>}
    </div>
  );
}
