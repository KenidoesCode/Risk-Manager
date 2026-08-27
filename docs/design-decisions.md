# Design decisions

Each with the alternative that was rejected, and why.

---

## 1. Why a graph rather than a transaction classifier?

Because the pattern the product exists to find has no per-row expression. Three
accounts at 6/2, 7/2 and 5/2 orders-to-returns are individually unremarkable;
together, sharing a device and returning within one window, they are one
operation.

`LOW_INDIVIDUAL_HIGH_COLLECTIVE` exists to test exactly that case.

**Honest caveat:** on the held-out split the account baseline caught every ring,
so this build does not demonstrate the recall advantage. What it demonstrates is
precision — see decision 4.

---

## 2. Why exact-match entity resolution and no fuzzy matching?

Because the cost of a wrong merge is a person investigated for someone else's
behaviour. Edit distance on addresses and near-duplicate email detection both
silently create that error at scale.

Exact matching under-links, which is the safer failure. **Rejected:** a
similarity threshold with a confidence weight — it moves the error from "did not
link" to "linked with 0.7 confidence", and a reviewer reading a cluster has no
way to act on that number.

---

## 3. Why are derived edges a separate class?

`ACCOUNT_A shares a device with ACCOUNT_B` is an inference. Storing it beside
observations, in the same shape, makes the system's own conclusions
indistinguishable from its inputs.

**Rejected:** implying the distinction from the edge type. A query would still
have to know which types were derived, and one that forgot would treat an
inference as evidence. A column cannot be forgotten.

---

## 4. Why is shared address worth only 4 points?

Because millions of unrelated people share an address, and the false positive is
a household. Payment sharing gets 14 because sharing a card is a deliberate act
between people who know each other — and even that is not fraud, since families
do it routinely.

The whole weight table is published at `/signals` precisely so this can be
argued with.

---

## 5. Why the structural-only guardrail?

Weights alone were not enough. Saturated structural signals reach 34 points, and
with a lower threshold or an added structural feature they could creep toward a
detection. The guardrail makes the property explicit: **below 8 behavioural
points, the score is capped below the threshold regardless of structure.**

Every firing is audited as `GUARDRAIL_APPLIED`, so the reader can count how often
the system protected a household rather than flagging one.

**Rejected:** simply lowering the structural weights further. That degrades the
signal for genuine rings, which really do share infrastructure. The guardrail
targets the specific failure without weakening the general case.

---

## 6. Why a published weighted sum instead of a learned model?

Because the output is a decision to investigate people. A gradient-boosted model
would likely score better on this corpus and could not be decomposed in front of
the person being investigated, or the analyst who has to justify the
investigation.

`explainScore()` reconstructs the arithmetic exactly, and the UI never renders a
score without that breakdown beside it.

**Rejected:** a learned model with SHAP values. Feature attributions on a boosted
ensemble are an approximation of the model's reasoning; a weighted sum's
attribution *is* the reasoning.

---

## 7. Why are risk and confidence separate?

"Risk 91, confidence 63%" says the pattern looks strongly coordinated and the
interpretation is unsettled. A single 77 destroys the only information an analyst
needs to prioritise.

Confidence measures input quality — evidence volume, provenance, stability, how
many legitimate explanations fit — and is deliberately independent of which way
the score points.

---

## 8. Why is INSUFFICIENT_DATA a verdict rather than a low score?

Three accounts with one order each is not evidence of innocence, it is absence of
evidence. Scoring it low would encode "we looked and found nothing" when the
truth is "we could not look".

The sparsity check runs **before** any risk banding, so even a saturated feature
vector cannot turn a sparse cluster into a detection. Tested.

---

## 9. Why two clustering methods?

They fail differently. Shared-entity components are exact and explainable but
chain through weak links. Louvain cuts weak bridges but is order-sensitive.

Neither is treated as ground truth; the evaluation reports both, and stability is
measured rather than assumed.

**Rejected:** picking one and describing its failure mode in a comment. The
failure modes are opposite, which makes having both genuinely informative.

---

## 10. Why measure cluster stability?

Because modularity has many near-optimal partitions, and a cluster that dissolves
under reordering is an artefact of iteration order. Presenting it as "these seven
accounts are connected" would be presenting an accident.

Low stability lowers confidence and routes to review. It never raises the score —
instability is a reason for less certainty, never for more suspicion.

---

## 11. Why does temporal overlap affect link weight?

A device used by account A in early 2025 and account B in late 2026 is more
likely a resold handset than two people acting together. Ignoring time treats
those two as identical to a device both used last week.

Weight decays to a floor of 0.25 rather than zero, because a long-gap link is
weak evidence rather than no evidence.

---

## 12. Why is the model confined to prose?

Because everything else it might do, this system can do deterministically and
must be able to explain. Scoring, clustering and routing all produce numbers a
reviewer has to defend.

Two rejection conditions are enforced after the call: an uncomputed signal name,
or verdict language. Either discards the whole response. The deterministic
explanation is generated first, so the model is an upgrade to a working output
rather than a dependency of one.

---

## 13. Why does dismissing a cluster require a benign explanation?

The legitimate readings reviewers accept are the best available evidence about
where the detector is wrong. A dismissal with no reason teaches nobody anything,
and this queue is the only feedback loop in the system.

The console groups accepted explanations so the pattern is visible.

---

## 14. Why is difficulty implemented as class convergence?

An earlier version multiplied both classes' temporal jitter by 3 at ADVERSARIAL.
The absolute numbers moved a long way; the *gap* stayed identical, and the
detector separated them as easily as before.

Difficulty is now interpolation toward a shared midpoint: at ADVERSARIAL a ring's
behaviour is 88% of the way to a household's. The classes genuinely overlap.

See the failure diary — this was found by noticing a held-out F1 of 1.0000 and
not believing it.

---

## 15. Why PostgreSQL and not a graph database?

The graph is thousands of nodes and tens of thousands of edges. It fits in memory
comfortably, and clustering it takes under two seconds.

What PostgreSQL provides that a graph database would not improve on: relational
integrity between clusters, members, reviews and audit events; a single system of
record; and no second operational dependency. The README states the split
explicitly — **PostgreSQL is persistence, in-memory is computation.**

**Rejected:** Neo4j. It would add an operational dependency, a second consistency
model, and a query language, in exchange for traversal performance this problem
size does not need.

**Also rejected:** a vector database. Nothing here does semantic retrieval. The
neighbours of a node are reached by foreign key.
