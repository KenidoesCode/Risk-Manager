# Failure diary

Things that actually went wrong, in the order they were found. Nothing here is
invented to populate the document.

---

## 1. Held-out F1 came out at 1.0000, and that was the bug

**Problem.** The first full evaluation reported ring-level precision 100%, recall
100%, F1 1.0000, and account-level the same. Every hard-negative template showed
a 0% false-positive rate.

**Why that is a bug report and not a result.** A perfect score on held-out data
almost always means the task is too easy or the split leaks. Believing it would
have meant shipping a README claiming a perfect detector.

**Cause.** `applyDifficulty` scaled both classes in the same direction. At
ADVERSARIAL it multiplied temporal jitter by 3 for everything: rings went from
14-42h to 42-126h, households from 500-900h to 1500-2700h. The absolute numbers
moved a long way and the ratio between the classes was untouched. The
synchronisation feature separated them exactly as easily at ADVERSARIAL as at
EASY.

**Fix.** Difficulty is now interpolation toward a shared midpoint, with different
rates per class: at ADVERSARIAL a ring's behaviour moves 88% of the way toward a
household's and a household's 60% toward a ring's. The classes genuinely overlap.

**Effect.** The corpus is materially harder. The graph detector still reaches
100% on this feature set, which is now reported as a **property of the corpus**
rather than a capability claim — see the README section that says so in bold.

**Regression test.** `tests/integration/pipeline.test.ts` asserts every difficulty
appears in every split, so the ADVERSARIAL cell can never again be silently empty.

**Lesson.** A metric that looks too good is a defect report about the measurement,
not a result about the system.

---

## 2. Difficulty and split were perfectly correlated

**Problem.** The per-difficulty table showed a dash for ADVERSARIAL: precision and
recall both undefined, meaning the held-out split contained no adversarial
suspicious rings at all.

**Cause.** `difficulty = DIFFICULTY_CYCLE[i % 10]` and `split =
splitCycle[(i + offset) % 10]`, with a fixed per-template offset. Both were
functions of `i mod 10`, so for any given template each difficulty always landed
in the same split. The hardest evaluation cell was empty while every other number
looked healthy.

**Fix.** Difficulty is drawn from an independent hash of `(seed, label, template,
i)`, and the difficulty cycle now has 7 entries against the split cycle's 10, so
they cannot line up.

**Effect.** All four difficulty levels now appear in held-out.

**Lesson.** Two derived properties that share a modulus are not independent, and
the symptom was a dash in a table rather than an error — which is how it survived
a first read.

*(This is the same class of fault as the stratification bug in the chargeback
project's generator. Round-robin assignment across small strata is systematically
biased, and I have now made the mistake twice in two different shapes.)*

---

## 3. The graph collapsed into one mega-cluster

**Problem.** During the first build the shared-entity clustering returned a single
cluster containing most of the accounts.

**Cause.** Background accounts were initially generated sharing a small pool of
address keys. One address touched by ~200 accounts produced ~19,900 pairwise
derived edges and joined every group that touched it into one component.

**Fix.** Two changes. Background accounts now get their own device, address and
payment key each, so they form no cluster — which is also more realistic. And a
fanout guard skips any infrastructure node touched by more than 40 accounts, on
the reasoning that such a node is a default value or a shared network egress, not
a family tablet.

**Regression test.** Building the same corpus with a cap of 2 and asserting fewer
derived edges than an uncapped build.

**Lesson.** Pairwise edge construction is quadratic in the fanout of the shared
node, and one bad node is enough to destroy the whole graph. This is now called
out in the builder as the single most important guard in the file.

---

## 4. The threshold was being chosen on the test set

**Problem.** The evaluation swept nine thresholds against held-out and printed the
lowest-cost row with a `<- lowest cost` marker. The obvious next step — quoting
that row's precision and recall — would have been reporting a parameter fitted to
the test set.

**Cause.** Straightforward carelessness. The sweep was written as a diagnostic and
was one copy-paste away from becoming the headline.

**Fix.** `selectThreshold()` runs the sweep on **dev** and returns the
cost-minimising value; held-out is scored once at that threshold. The held-out
sweep is still displayed, relabelled "diagnostic only" with a sentence saying why
taking the best row would be cheating.

**Effect.** The operating threshold came out at 50 rather than the configured
default of 70, which materially changed recall (75% to 100%). Both numbers are
real; the difference is which split chose the threshold.

**Regression test.** "selects the threshold on dev, not on held-out".

**Lesson.** A diagnostic table and a result table look identical. The label is
the only thing stopping one becoming the other.

---

## 5. `median()` was called with an empty array through a placeholder

**Problem.** `return_velocity` was computed from a `median([] as number[]) || …`
expression left in place while the aggregate was being written — a placeholder
that typechecked, ran, and silently produced a constant.

**Cause.** Writing the feature before the aggregate field it needed existed, and
leaving a working-but-wrong expression rather than a compile error.

**Fix.** `medianDaysAfterDelivery` added to `ClusterAggregate`, computed from the
actual return records, and the placeholder replaced.

**Lesson.** A placeholder that typechecks is worse than one that does not. `throw
new Error("TODO")` would have surfaced this immediately instead of shipping a
feature that always returned the same number.

---

## 6. Bash heredocs silently truncated several route files

**Problem.** Two attempts to write seven API route files via `cat > … <<'EOF'`
reported `unexpected EOF while looking for matching quote`, and created empty
directories with no files.

**Cause.** Not fully diagnosed — some interaction between the tooling and quoted
heredocs containing long TypeScript bodies. The failure was silent in the sense
that it produced directories, so a casual check for "did the folder appear" would
have passed.

**Fix.** Wrote the files through a Python script instead, which reported each file
it wrote.

**Lesson.** Verify the artefact, not the operation. `ls` on the parent directory
showed exactly what the failed command had produced: nothing.
