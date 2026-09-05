"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Page transition: the panel gutters close and pull apart.
 *
 * Three black bands lie across the viewport and slide off in alternating
 * directions on a six-step timer, each with a cyan edge above and a magenta
 * edge below so the plates read as out of register while they move, and a
 * yellow action word snaps over the top of them. A comic page changes scene by
 * cutting to the next panel; so does this.
 *
 * Three properties this has to hold and does — the first two live here, the
 * third lives in the stylesheet:
 *
 *   1. It does not run on first paint. The previous pathname is tracked in a
 *      ref and the first render only records it, so a cold load is not a flash
 *      of black bands.
 *   2. It never eats a click. The container is `pointer-events: none` in the
 *      stylesheet with no state anywhere that turns it back on.
 *   3. It cannot leave the screen covered. Every band's base transform is
 *      off-screen and its animation runs from on-screen back to that base, so
 *      a navigation that never lands — or a reduced-motion reader, where the
 *      animation is cancelled outright — leaves the page uncovered.
 *
 * The animation is four CSS transforms. No library, no canvas, no per-frame
 * JavaScript. Remounting on a key restarts it.
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
          <div className="curtain-band curtain-b1" />
          <div className="curtain-band curtain-b2" />
          <div className="curtain-band curtain-b3" />
          <span className="curtain-word">THWIP</span>
        </div>
      )}
    </div>
  );
}
