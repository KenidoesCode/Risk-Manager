"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Page transition: two sheets of film sliding apart off the light box.
 *
 * The left sheet is process cyan, the right is process magenta, and they meet
 * with an overlap so the seam is the dark patch those two films make together.
 * The transition opens by splitting exactly the thing this product is about.
 *
 * Three properties this has to hold and does:
 *
 *   1. It never eats a click. The container is `pointer-events: none` in the
 *      stylesheet with no state that turns it on.
 *   2. It does not run on first paint. The previous pathname is tracked in a
 *      ref; the first render only records it, so a cold load is not a flash of
 *      coloured film.
 *   3. It leaves nothing on screen. The panels' base transform is off-screen
 *      and the animation runs from on-screen back to that base with
 *      `fill-mode: forwards`, so a page at rest is uncovered whether or not an
 *      animation has ever played.
 *
 * The animation itself is two CSS transforms. No library, no canvas, no
 * per-frame JavaScript. Remounting on a key restarts it; under
 * `prefers-reduced-motion: reduce` the stylesheet cancels it and the panels
 * stay where they already are, which is off the screen.
 */
export function Curtain() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (previous.current === null) {
      previous.current = pathname;
      return;
    }
    if (previous.current === pathname) return;
    previous.current = pathname;
    setRun((n) => n + 1);
  }, [pathname]);

  return (
    <div className="curtain" aria-hidden>
      {run > 0 && (
        <div key={run}>
          <div className="curtain-panel curtain-l" />
          <div className="curtain-panel curtain-r" />
        </div>
      )}
    </div>
  );
}
