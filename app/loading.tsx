/**
 * The loading state, shown while a console page's server render is in flight.
 *
 * It draws the thing that is actually being built: an orb web with its strands
 * dashed in, marching outward. Four panels of skeleton under it stand in for
 * the sheets that are coming. The animation is transform and stroke-dashoffset
 * only, on a step timer, and is cancelled under reduced motion by the global
 * rule at the bottom of globals.css — which leaves a complete, still web.
 */
export default function Loading() {
  return (
    <div className="page py-10" role="status" aria-live="polite">
      <p className="cap">Building the graph</p>
      <h1 className="dsp ghost dsp-page mt-1">Spinning up</h1>
      <div className="strip mt-3 max-w-[13rem]" aria-hidden />

      <div className="sheet reveal mt-8 grid place-items-center py-14">
        <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden>
          {/* Twelve anchor lines and four catch-rings, drawn from the hub. */}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            return (
              <line
                key={i}
                x1="60"
                y1="60"
                x2={60 + Math.cos(angle) * 54}
                y2={60 + Math.sin(angle) * 54}
                stroke="var(--ink)"
                strokeOpacity="0.45"
                strokeWidth="1"
              />
            );
          })}
          {[18, 30, 42, 54].map((r, i) => (
            <circle
              key={r}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={i % 2 === 0 ? "var(--film-c)" : "var(--film-m)"}
              strokeWidth="2"
              strokeDasharray="6 7"
              className="web-march"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
          <circle cx="60" cy="60" r="4" fill="var(--ink)" />
        </svg>
        <p className="note-s mt-4">Resolving entities, building edges, clustering.</p>
      </div>

      <div className="stagger cards mt-5 grid gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sheet px-4 py-5">
            <div className="h-2.5 w-20 bg-[var(--rule-soft)]" />
            <div className="mt-3 h-6 w-16 bg-[var(--sheet-2)]" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading</span>
    </div>
  );
}
