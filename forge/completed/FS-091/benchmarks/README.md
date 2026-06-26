# FS-091 T-07 Benchmark & Cutover Readiness Evidence

This directory stores reproducible benchmark/parity inputs and generated cutover-readiness evidence for **FS-091 T-07**.

## Artifacts

- `cutover-input.json`
  - Canonical benchmark/parity dataset used by the readiness runner.
  - Includes schema-size-segmented latency samples (`small` / `medium` / `large`, including a **23,000-field** large-schema sample), shadow parity samples (`Jaccard@10`, `NDCG@10 delta`), and acceptance-rate baseline/post values.
- `cutover-readiness-report.json`
  - Generated output from the readiness runner.
  - Contains computed p95 latency gates by segment, parity gate outcomes, acceptance-rate safety gate, go/no-go decision, and explicit rollback triggers.

## Repro Command

Run from repo root:

```bash
npx tsx scripts/run-fs091-cutover-readiness.ts
```

Optional path overrides:

```bash
npx tsx scripts/run-fs091-cutover-readiness.ts \
  --input=forge/active/FS-091/benchmarks/cutover-input.json \
  --report=forge/active/FS-091/benchmarks/cutover-readiness-report.json
```

## Gate Definitions (FS-091 Rev 2)

- **Latency p95 targets**
  - small `< 300ms`
  - medium `< 800ms`
  - large `< 1500ms`
- **Shadow parity gates**
  - Top-K Jaccard overlap @10 average `>= 0.70`
  - NDCG@10 delta average `>= -0.10`
- **Quality safety gate**
  - Suggestion acceptance-rate drop `<= 0.10`

## Operational Runbook Notes (FS-091 T-09)

### Runtime mode / feature-flag posture

- Canonical serving mode after T-08 decommission: `RAG_RETRIEVER=dynamodb`.
- Historical migration modes (`opensearch`, `shadow`) are decommissioned for serving paths and should not be re-enabled in production.
- Rollback posture is **not** "switch back to OpenSearch"; rollback actions are Dynamo-tuning and release-gating actions:
  - tighten/adjust `lexicalCap`, `rerankCap`, `topK`, `contextExpansionCap`
  - revert to last known-good retrieval config and re-run readiness checks
  - gate rollout progression until parity/latency/acceptance checks pass again

### Cutover operation sequence

1. Generate/refresh readiness report from canonical input.
2. Verify all gates pass (`goNoGo = "go"`, zero rollback triggers).
3. Promote decommission changes only after readiness evidence is captured.
4. If any gate fails, stop progression and execute rollback posture above.

### Go/No-Go and rollback triggers

The runner emits `summary.goNoGo` and `summary.rollbackTriggers`.

- `goNoGo = "go"` requires all latency, parity, and acceptance-rate gates to pass.
- Any failing gate produces explicit rollback trigger strings for auditable cutover decisions.

### Current recorded outcome

Per `cutover-readiness-report.json` in this folder:

- `goNoGo`: `go`
- `rollbackTriggers`: `[]`
- p95 gates passed (small/medium/large)
- parity gates passed (Jaccard@10 and NDCG@10 delta)
- acceptance-rate safety gate passed
