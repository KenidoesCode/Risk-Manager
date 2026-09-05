import { COUNTER_SIGNAL_LABELS } from "@/domain/vocabulary";

/**
 * THE OVERLAY STACK — the signature surface of this console.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------
 * Two windows onto the same field of accounts. Over the left one lie the films
 * the detector produced for the coordination reading; over the right one lie
 * the films for the ordinary reading — shared housing, a household device, a
 * post-sale returns burst. Both stacks are composited with `mix-blend-mode:
 * multiply`, which is the same arithmetic a lithographer gets from laying
 * process films on a light box: one film tints, three stacked go nearly black.
 *
 * ---------------------------------------------------------------------------
 * THE DENSITY IS THE SCORE. NOT A METAPHOR FOR IT.
 * ---------------------------------------------------------------------------
 * Optical density D = -log10(T), where T is the fraction of light a film
 * passes. Stacked films add their densities. Risk points also add. So:
 *
 *     D(signal) = points / 100
 *     T(signal) = 10^(-D)
 *     alpha     = 1 - T          <- what CSS is given
 *
 * The browser multiplies the transmittances, so the composite passes
 * 10^(-riskScore/100) of the backlight and nothing had to be chosen to make
 * that come out right. THE ONE JUDGEMENT IN THE CHAIN, stated here and on the
 * page: 100 risk points is defined as density 1.0 — one decade of light. That
 * choice sets how dark the page looks and nothing else; it cannot move a score.
 *
 * The counter-signal films are drawn on the same 0..1 density axis, at
 * 1 / (number of counter-signal types the detector tests) each. That is not a
 * tuned figure either: the scorer subtracts an identical 0.06 of confidence for
 * every counter-signal it finds, so the films are equal because the model
 * weights them equally, and the stack's density is the share of the available
 * innocent explanations that actually fit.
 *
 * ---------------------------------------------------------------------------
 * WHY BOTH STACKS, AND WHY IN THIS ORDER
 * ---------------------------------------------------------------------------
 * The two patches are readable against each other on one step wedge below
 * them. When the right-hand patch is nearly as dark as the left, two different
 * explanations account for the same evidence and the detector cannot separate
 * them — and the page says that in those words rather than leaving the reader
 * to notice. The counter-signals are on screen before any verdict language,
 * which is the ordering this product has always had.
 */

type Film = "c" | "m" | "y";

/** The process primaries, as RGB, so alphas can be computed rather than picked. */
const FILM_RGB: Record<Film, [number, number, number]> = {
  c: [0, 174, 239],
  m: [236, 0, 140],
  y: [255, 232, 0],
};

const FILM_SOLID: Record<Film, string> = {
  c: "var(--film-c)",
  m: "var(--film-m)",
  y: "var(--film-y)",
};

const FILM_TEXT: Record<Film, string> = { c: "t-c", m: "t-m", y: "t-y" };

const FILM_KIND: Record<Film, string> = {
  c: "structural",
  m: "behavioural",
  y: "concentration",
};

/**
 * Which plate each signal prints on. Cyan is exactly the scorer's structural
 * set; magenta is rate, timing and velocity; yellow is concentration. A cluster
 * whose evidence is all one kind therefore comes out as one flat hue, and only
 * a cluster with several independent kinds of evidence goes dark. That is the
 * detector's whole argument, drawn.
 */
const SIGNAL_FILM: Record<string, Film> = {
  SHARED_PAYMENT: "c",
  SHARED_DEVICE: "c",
  SHARED_ADDRESS: "c",
  CLUSTER_DENSITY: "c",
  RETURN_RATE: "m",
  TEMPORAL_SYNCHRONISATION: "m",
  REFUND_CONCENTRATION: "m",
  RETURN_VELOCITY: "m",
  CATEGORY_CONCENTRATION: "y",
  VALUE_CONCENTRATION: "y",
};

/** The innocent reading of the same kind of evidence prints on the same plate. */
const COUNTER_FILM: Record<string, Film> = {
  HOUSEHOLD_SIZE_PLAUSIBLE: "c",
  NO_PAYMENT_SHARING: "c",
  ADDRESS_ONLY_LINKAGE: "c",
  NORMAL_RETURN_BEHAVIOUR: "m",
  TEMPORALLY_DISPERSED: "m",
  LONG_TENURE: "m",
  DIVERSE_CATEGORIES: "y",
};

const COUNTER_SIGNAL_TYPES = Object.keys(COUNTER_SIGNAL_LABELS).length;

/** alpha = 1 - 10^(-density). The only place a film's opacity comes from. */
function alphaFor(density: number): number {
  return 1 - Math.pow(10, -Math.max(0, density));
}

function rgba(film: Film, density: number): string {
  const [r, g, b] = FILM_RGB[film];
  return `rgba(${r}, ${g}, ${b}, ${alphaFor(density).toFixed(4)})`;
}

const transmission = (density: number) => Math.pow(10, -density);

/** Deterministic 32-bit hash, so an account sits in the same place every visit. */
function hash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface StackSignal {
  signal: string;
  label: string;
  points: number;
  maxPoints: number;
  observation: string;
  rationale?: string;
}

export interface StackCounterSignal {
  signal: string;
  label: string;
  detail: string;
}

export interface StackAccount {
  id: string;
  eventCount: number;
}

interface Layer {
  key: string;
  film: Film;
  density: number;
}

/**
 * The field both stacks lie over: one mark per account in this cluster,
 * positioned deterministically from its entity id and sized by how many events
 * it carries. Identical under both windows, because the two readings are
 * readings of the same accounts.
 */
function AccountField({ accounts }: { accounts: StackAccount[] }) {
  const maxEvents = Math.max(1, ...accounts.map((a) => a.eventCount));
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 120 90"
      preserveAspectRatio="none"
      aria-hidden
    >
      {accounts.map((a) => {
        const h = hash(a.id);
        const x = 10 + ((h % 1000) / 1000) * 100;
        const y = 8 + (((h >>> 11) % 1000) / 1000) * 74;
        const r = 1.4 + (a.eventCount / maxEvents) * 2.4;
        return (
          <g key={a.id}>
            <circle cx={x} cy={y} r={r} fill="none" stroke="#10161b" strokeOpacity="0.5" strokeWidth="0.5" />
            <circle cx={x} cy={y} r="0.5" fill="#10161b" fillOpacity="0.6" />
          </g>
        );
      })}
    </svg>
  );
}

/** One window: the account field, then the films, in register, multiplied. */
function Window({
  accounts,
  layers,
  label,
}: {
  accounts: StackAccount[];
  layers: Layer[];
  label: string;
}) {
  // The sheets are dropped one after another, each a little further in, so the
  // outer bands show single films and the inner rectangle — where every sheet
  // is in register — is the composite. Never more than 42% of the window is
  // given away to the cascade, so the composite patch stays readable.
  const step = layers.length > 1 ? Math.min(9, 42 / layers.length) : 0;

  return (
    <div className="stack-win" role="img" aria-label={label}>
      <AccountField accounts={accounts} />
      {layers.map((layer, i) => (
        <div
          key={layer.key}
          className="stack-film"
          style={{
            left: `${i * step}%`,
            top: `${i * step * 0.8}%`,
            right: 0,
            bottom: 0,
            backgroundColor: rgba(layer.film, layer.density),
            boxShadow: i === 0 ? undefined : "inset 1px 1px 0 rgba(16,22,27,0.22)",
          }}
        />
      ))}
    </div>
  );
}

/**
 * A neutral step wedge, so the two patches can be read against a scale rather
 * than only against each other. Stop luminances are 10^(-D) at D = 0, 0.2 …
 * 1.0, converted to sRGB bytes with the standard transfer function.
 */
function DensityWedge({
  coordination,
  ordinary,
}: {
  coordination: number;
  ordinary: number;
}) {
  /*
   * Only the pointer is positioned; its label sits on a normal line under it.
   * A label pinned to a percentage overhangs its container at the ends of the
   * scale and collides with the other label when the two densities are close —
   * which is exactly the case this wedge exists to show.
   */
  const marker = (density: number, tone: string, text: string) => (
    <>
      <div className="relative mt-1 h-3">
        <span
          className={`absolute top-0 -translate-x-1/2 text-[10px] leading-none ${tone}`}
          style={{ left: `${Math.min(100, Math.max(0, density * 100))}%` }}
          aria-hidden
        >
          ▲
        </span>
      </div>
      <p className={`num text-[0.6875rem] ${tone}`}>{text}</p>
    </>
  );

  return (
    <div>
      <div
        className="h-4 border border-[var(--rule)]"
        style={{
          background:
            "linear-gradient(90deg, #ffffff 0%, #d0d0d0 20%, #a9a9a9 40%, #898989 60%, #6f6f6f 80%, #595959 100%)",
        }}
        aria-hidden
      />
      {marker(coordination, "t-m", `coordination — density ${coordination.toFixed(3)}`)}
      {marker(ordinary, "t-g", `ordinary — density ${ordinary.toFixed(3)}`)}
      <div className="mt-2 flex flex-wrap justify-between gap-x-4">
        <span className="cap">density 0.0</span>
        <span className="cap">1.0 — one decade of light</span>
      </div>
    </div>
  );
}

/** One film drawn apart from the stack, carrying its own observation. */
function FilmRow({
  film,
  title,
  points,
  maxPoints,
  density,
  body,
  footnote,
}: {
  film: Film;
  title: string;
  points?: number;
  maxPoints?: number;
  density: number;
  body: string;
  footnote?: string;
}) {
  return (
    <li
      className="film-row pl-4"
      style={
        {
          "--film-tint": rgba(film, density),
          "--film-edge-colour": FILM_SOLID[film],
        } as React.CSSProperties
      }
    >
      <span className="film-edge" aria-hidden />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-xs font-semibold t-ink">{title}</span>
        <span className="num shrink-0 text-[0.6875rem] t-2">
          {points !== undefined && maxPoints !== undefined && (
            <>
              +{points.toFixed(1)} / {maxPoints} ·{" "}
            </>
          )}
          D {density.toFixed(3)} · passes {(transmission(density) * 100).toFixed(0)}%
        </span>
      </div>
      <p className="note-s mt-1">{body}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`cap ${FILM_TEXT[film]}`}>{FILM_KIND[film]} plate</span>
        {footnote && <span className="note-s">{footnote}</span>}
      </div>
    </li>
  );
}

export function OverlayStack({
  signals,
  counterSignals,
  accounts,
  riskScore,
  riskThreshold,
  structuralPoints,
  behaviouralPoints,
  confidence,
}: {
  signals: StackSignal[];
  counterSignals: StackCounterSignal[];
  accounts: StackAccount[];
  riskScore: number;
  riskThreshold: number;
  structuralPoints: number;
  behaviouralPoints: number;
  confidence: number;
}) {
  const contributing = signals.filter((s) => s.points > 0.05);

  const signalLayers: Layer[] = contributing.map((s) => ({
    key: s.signal,
    film: SIGNAL_FILM[s.signal] ?? "y",
    density: s.points / 100,
  }));

  const counterDensity = 1 / COUNTER_SIGNAL_TYPES;
  const counterLayers: Layer[] = counterSignals.map((c) => ({
    key: c.signal,
    film: COUNTER_FILM[c.signal] ?? "y",
    density: counterDensity,
  }));

  const coordinationDensity = signalLayers.reduce((a, l) => a + l.density, 0);
  const ordinaryDensity = counterLayers.reduce((a, l) => a + l.density, 0);

  // Which plates each reading actually printed on. A reading that used one
  // plate is one kind of evidence, however many points it scored.
  const platesUsed = (layers: Layer[]) => new Set(layers.map((l) => l.film)).size;
  const coordinationPlates = platesUsed(signalLayers);

  return (
    <section className="sheet marks">
      <header className="sheet-hd">
        <div>
          <h2 className="sheet-ti">The overlay stack</h2>
          <p className="note-s mt-1">
            Two readings of the same {accounts.length} account{accounts.length === 1 ? "" : "s"}, laid
            on one light box. Each film is one piece of evidence at density
            <span className="mono"> points / 100</span>; multiply compositing stacks them, so what
            reaches the accounts through a stack is <span className="mono">10^(-density)</span> of the
            backlight. Nothing here is a colour picked per risk band.
          </p>
        </div>
        <span className="reg t-3 mt-1 hidden shrink-0 sm:inline-block" aria-hidden />
      </header>

      <div className="sheet-bd">
        <div className="stagger grid gap-6 md:grid-cols-2">
          {/* ------------------------------------------- COORDINATION --- */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="cap t-m">Coordination — {contributing.length} films</h3>
              <span className="num text-[0.6875rem] t-2">
                D {coordinationDensity.toFixed(3)} · passes{" "}
                {(transmission(coordinationDensity) * 100).toFixed(1)}%
              </span>
            </div>
            <Window
              accounts={accounts}
              layers={signalLayers}
              label={`Coordination stack: ${contributing.length} films at combined density ${coordinationDensity.toFixed(2)}`}
            />
            <p className="num mt-2 text-lg t-ink">
              risk {riskScore.toFixed(1)}
              <span className="text-xs t-3"> / 100 · threshold {riskThreshold}</span>
            </p>
            <p className="note-s mt-1">
              {structuralPoints.toFixed(1)} from structure, {behaviouralPoints.toFixed(1)} from
              behaviour. Printed on {coordinationPlates} of 3 plates.
            </p>
          </div>

          {/* ----------------------------------------------- ORDINARY --- */}
          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="cap t-g">Ordinary — {counterLayers.length} films</h3>
              <span className="num text-[0.6875rem] t-2">
                D {ordinaryDensity.toFixed(3)} · passes{" "}
                {(transmission(ordinaryDensity) * 100).toFixed(1)}%
              </span>
            </div>
            <Window
              accounts={accounts}
              layers={counterLayers}
              label={`Ordinary-explanation stack: ${counterLayers.length} films at combined density ${ordinaryDensity.toFixed(2)}`}
            />
            <p className="num mt-2 text-lg t-ink">
              {counterLayers.length}
              <span className="text-xs t-3">
                {" "}
                / {COUNTER_SIGNAL_TYPES} legitimate explanations fit
              </span>
            </p>
            <p className="note-s mt-1">
              Each one subtracts an equal 0.06 from confidence, which is now{" "}
              <span className="mono">{(confidence * 100).toFixed(0)}%</span>. Equal films because the
              scorer weights them equally.
            </p>
          </div>
        </div>

        {/* ------------------------------------------------ THE WEDGE -- */}
        <div className="mt-7">
          <p className="cap mb-1.5">Read both patches off one scale</p>
          <DensityWedge coordination={coordinationDensity} ordinary={ordinaryDensity} />
          <p className="note mt-2 max-w-3xl">
            {ordinaryDensity >= coordinationDensity * 0.75
              ? "The two patches are close. Two different explanations account for the same evidence at comparable strength, and this detector cannot separate them from the graph alone — which is why the cluster carries its counter-signals into review rather than a verdict."
              : "The ordinary patch is the lighter of the two here. That is a statement about this cluster and not a property of the design: on a household, the right-hand stack is the darker one, and the same wedge shows it."}
          </p>
        </div>

        {/* ------------------------------------------- FILMS, APART ---- */}
        <div className="stagger mt-7 grid gap-6 md:grid-cols-2">
          <div>
            <p className="cap mb-2">The coordination films, drawn apart</p>
            {contributing.length === 0 ? (
              <div className="empty">
                <p className="mono text-xs t-2">No signal contributed measurable points.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {contributing.map((s) => (
                  <FilmRow
                    key={s.signal}
                    film={SIGNAL_FILM[s.signal] ?? "y"}
                    title={s.label}
                    points={s.points}
                    maxPoints={s.maxPoints}
                    density={s.points / 100}
                    body={s.observation}
                    footnote={s.rationale}
                  />
                ))}
              </ul>
            )}

            {behaviouralPoints < 8 && (
              <p className="note mt-3 t-g">
                Behavioural evidence is below 8 points, so the structural-only guardrail caps this
                score below the {riskThreshold} threshold. Shared infrastructure alone cannot produce
                a detection.
              </p>
            )}
          </div>

          <div>
            <p className="cap mb-2">The ordinary films, drawn apart</p>
            {counterSignals.length === 0 ? (
              <div className="empty">
                <p className="mono text-xs t-2">No legitimate explanation fits this evidence.</p>
                <p className="note-s mx-auto mt-2 max-w-lg">
                  That is a meaningful statement rather than an empty panel: the detector looked for
                  household, tenure, category-diversity and payment-independence explanations and
                  found none of them present.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {counterSignals.map((c) => (
                  <FilmRow
                    key={c.signal}
                    film={COUNTER_FILM[c.signal] ?? "y"}
                    title={c.label}
                    density={counterDensity}
                    body={c.detail}
                  />
                ))}
              </ul>
            )}

            <p className="note mt-3">
              A detection presented without the legitimate readings that also fit the evidence is one
              a reviewer cannot properly evaluate. Each of these lowers the detector&rsquo;s
              confidence.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
