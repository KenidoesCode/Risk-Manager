# Architecture

## System flow

```mermaid
flowchart TD
  E[Commerce events] --> R[Entity resolution<br/>exact hash match only]
  R --> RAW[(Raw edges<br/>observations)]
  RAW --> D{Fanout guard<br/>node touched by &gt; 40 accounts?}
  D -->|yes| SKIP[Node skipped entirely<br/>a default value, not a family tablet]
  D -->|no| DER[(Derived edges<br/>marked derived, carry viaEntityId)]
  DER --> C[Clustering<br/>shared-entity or Louvain]
  C --> ST{Stability<br/>survives reordering?}
  ST -->|low| REV1[Human review<br/>UNSTABLE_CLUSTERING]
  C --> AGG[Behavioural aggregation]
  AGG --> F[10 bounded features]
  F --> S[Weighted sum, published table]
  S --> G{Behavioural points &lt; 8?}
  G -->|yes| CAP[CAPPED below threshold<br/>GUARDRAIL_APPLIED]
  G -->|no| V[Verdict]
  CAP --> V
  V --> CONF[Confidence<br/>from input quality, not from risk]
  CONF --> ROUTE{Routing}
  ROUTE -->|sparse| REV2[INSUFFICIENT_DATA]
  ROUTE -->|risk high| REV3[Human review]
  ROUTE -->|counter-signals >= 3| REV4[LEGITIMATE_EXPLANATION_PLAUSIBLE]
  V --> EXP[Deterministic explanation<br/>ALWAYS generated first]
  EXP -.optional.-> M[Model rewrite]
  M --> VAL{Names only computed signals?<br/>No verdict language?}
  VAL -->|no| DISCARD[Discarded, deterministic used]
  VAL -->|yes| USE[Model prose used]
  ROUTE --> AU[(Append-only audit)]
```

The model sits at the far right of this diagram on purpose. Nothing it produces
feeds back into a score, a cluster or a verdict, and the validation gate runs
after it rather than trusting the prompt.

## Data model

```mermaid
erDiagram
  entities ||--o{ graph_edges : connects
  entities ||--|| accounts : "is an ACCOUNT"
  accounts ||--o{ orders : places
  orders ||--o{ return_events : returned
  return_events ||--o{ refund_events : refunded
  detection_runs ||--o{ clusters : produced
  clusters ||--o{ cluster_members : contains
  clusters ||--o{ human_reviews : escalated
  evaluation_runs ||--o{ evaluation_cases : contains

  entities {
    text id PK
    text type "CUSTOMER|ACCOUNT|DEVICE|ADDRESS|PAYMENT"
    text anonymized_key "the ONLY identifier stored - a hash"
    timestamp first_seen
    timestamp last_seen
  }

  graph_edges {
    text type
    bool derived "false = observed, true = inferred by this system"
    real weight "link strength x temporal overlap"
    text provenance "the event, or the rule"
    text via_entity_id "for derived: the shared node behind it"
  }

  accounts {
    text ground_truth_label "SYNTHETIC ONLY - read by the eval harness alone"
    text split "ring-level, never row-level"
  }

  clusters {
    real risk_score "0-100, from the published weight table"
    real confidence "0-1, independent of risk"
    text verdict
    jsonb signals "full breakdown - no score is stored unexplained"
    jsonb counter_signals "legitimate readings that fit the same evidence"
    real stability "survives re-clustering, or null"
  }
```

`entities.anonymized_key` is the only identifier the system holds. There is no
column anywhere containing a raw address, device id or card number.

## The AI boundary

```mermaid
flowchart LR
  subgraph DET["Deterministic - decides"]
    d1[Which accounts are linked?]
    d2[Which clusters exist?]
    d3[What is the risk score?]
    d4[What is the confidence?]
    d5[What is the verdict?]
    d6[Does this go to a human?]
  end

  subgraph AI["Model - narrates only"]
    a1[Turn signals into sentences]
    a2[Phrase the caveats readably]
  end

  DET -->|computed signals only| AI
  AI --> GATE{Only computed signals?<br/>No verdict language?}
  GATE -->|no| DISCARD[Discarded entirely]
  GATE -->|yes| RENDER[Rendered as prose]
  DET --> RENDER
```

Everything on the left is arithmetic over stored events. The model receives the
*output* of that arithmetic and returns English. There is no arrow from AI back
into DET, and that is enforced by the call graph rather than by instruction.

## Security boundary

```mermaid
flowchart TD
  subgraph UNTRUSTED["Untrusted"]
    U1[Return reasons]
    U2[Merchant notes]
    U3[Imported metadata]
  end

  subgraph BOUNDARY["Boundary controls"]
    P1[PII minimisation - hashes only]
    P2[Injection scan, every string leaf, depth 8]
    P3[Fenced as untrusted-metadata in the prompt]
  end

  subgraph TRUSTED["Trusted - version-controlled"]
    T1[Signal weight table]
    T2[Routing rules]
    T3[Guardrail]
    T4[Thresholds]
  end

  UNTRUSTED --> BOUNDARY
  BOUNDARY --> PROMPT[Prompt assembly]
  TRUSTED --> SCORER[Deterministic scorer]
  SCORER --> PROMPT
  PROMPT --> MODEL[Model]
  MODEL --> VALIDATE[Signal + verdict validation]
```

Precedence is `SYSTEM POLICY > APPLICATION RULES > COMPUTED SIGNALS > UNTRUSTED
TEXT`, and it holds because untrusted text cannot reach the scorer at all - not
because the model is asked to respect an ordering.

## Evaluation flow

```mermaid
flowchart LR
  CORPUS[(120 labelled groups)] --> SPLIT[Ring-level split]
  SPLIT --> TR[train]
  SPLIT --> DV[dev]
  SPLIT --> HO[held-out]

  DV --> SWEEP[Threshold sweep<br/>minimise FP:FN cost]
  SWEEP --> THRESH[Operating threshold]

  HO --> DETECT[Detection over the WHOLE graph]
  THRESH --> SCORE[Score held-out rings once]
  DETECT --> MATCH[Match rings to clusters<br/>by Jaccard, floor 0.3]
  MATCH --> SCORE
  SCORE --> RING[Ring precision / recall]
  SCORE --> ACC[Account precision / recall]
  SCORE --> HN[Hard negatives PER TEMPLATE]
  SCORE --> REC[Coordination recovery vs baseline]
```

Two choices here matter:

**Detection runs over the whole graph, not the split.** Restricting the graph to
one split would sever links to accounts elsewhere and change the structure being
measured. The split governs which rings are SCORED, not which entities exist.

**The threshold comes from dev.** Sweeping nine thresholds against held-out and
reporting the best is fitting a parameter to the test set. The held-out sweep is
still displayed, labelled as diagnostic.

## Module map

| Module | Responsibility | Reads ground truth? |
|---|---|---|
| `src/domain/vocabulary.ts` | Node/edge types, link strengths, verdicts | no |
| `src/graph/builder.ts` | Entity resolution, derived edges, fanout guard | no |
| `src/detection/clustering.ts` | Connected components, Louvain, stability | no |
| `src/detection/features.ts` | 10 bounded features | no |
| `src/scoring/risk.ts` | Weighted sum, guardrail, confidence, routing | no |
| `src/detection/baseline.ts` | Account-level comparator | no |
| `src/model/explainer.ts` | Prose, plus the validation gate | no |
| `src/reviews/service.ts` | Queue, decisions, benign explanations | no |
| `src/audit/service.ts` | Append-only trail | no |
| `src/evaluation/generator.ts` | Corpus generation | writes it |
| `src/evaluation/harness.ts` | Matching, metrics, recovery | **yes - only here** |

Confining ground-truth access to one module is what makes the no-leakage claim
auditable. Every other module's signature cannot reach a label.
