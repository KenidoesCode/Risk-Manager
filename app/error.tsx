"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * The error boundary for the whole app.
 *
 * It says what actually broke and what the reader can do about it. The one
 * thing it must not do is imply that a failed page means a clean result: this
 * console's answers are decisions to investigate people, and "the page did not
 * load" is not the same statement as "there is nothing here".
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side digests are the only handle on a production stack trace, so
    // put it where a reader can quote it back.
    console.error(error);
  }, [error]);

  return (
    <div className="page grid min-h-screen place-items-center py-16">
      <div className="w-full max-w-2xl">
        <span className="capbox inline-block" style={{ transform: "rotate(-1.2deg)" }}>
          Something on this page threw.
        </span>

        <h1 className="dsp ghost mt-6 text-[clamp(1.9rem,9vw,4.2rem)]">Panel torn.</h1>

        <div className="strip mt-4 max-w-[16rem]" aria-hidden />

        <div className="sheet marks pad mt-8">
          <p className="lede">
            This page failed to render. Nothing was written, no cluster was scored and no review was
            recorded — but do not read a failed page as a clean result. It is not an answer at all.
          </p>

          <p className="cap mt-5">What broke</p>
          <p className="id mt-1.5 t-2">{error.message || "No message was attached to the error."}</p>
          {error.digest && (
            <>
              <p className="cap mt-4">Digest — quote this in a bug report</p>
              <p className="id mt-1.5 t-2">{error.digest}</p>
            </>
          )}

          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="btn">
              Try this page again
            </button>
            <Link href="/overview" className="btn btn-ghost">
              Back to the overview
            </Link>
          </div>
        </div>

        <p className="note-s mt-4">
          If it keeps throwing, the most likely cause is an unreachable database on this instance.
          The health endpoint at <span className="id">/api/health</span> answers that directly.
        </p>
      </div>
    </div>
  );
}
