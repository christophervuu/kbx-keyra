# SPEC

## Title

Short descriptive name for the change.

---

## ID

FS-###  
Assigned sequentially. `FS` = Feature Spec.

---

## Metadata

Owner: @name-or-team  
Reviewers: @name-or-team  
Created: YYYY-MM-DD  
Last Updated: YYYY-MM-DD  
Type: ui | engine | backend | workflow | cross-cutting

If unknown during early drafting, use `TBD`.

`Type` indicates the primary execution domain. Used to route tasks to the correct agent (`task` or `ui-task`). Cross-cutting specs may produce tasks of mixed types — declare the type per task in that case.

---

## Status

draft | refining | ready | in_progress | completed | archived

- `draft` = initial spec created, not yet refined
- `refining` = questions, tradeoffs, or repo grounding still being resolved
- `ready` = refined enough for reliable task generation and planning review
- `in_progress` = one or more tasks are being executed
- `completed` = implementation and verification finished
- `archived` = retired, replaced, or no longer relevant

This status tracks the overall lifecycle of the change, not just document editing.

This spec becomes part of the planning package together with its derived task set.

---

## Revision

Rev: 1

Rev bump required when any of the following materially change:

- intended behavior
- scope boundaries
- acceptance examples
- verification expectations
- materially affected system areas

See `Change Log` for revision history.

---

## Summary

2-4 sentences summarizing the change, why it exists, and what success looks like.

This should let someone understand the spec at a glance without reading the full document.

---

## Problem

Describe the current pain, gap, or limitation.

Focus on what is wrong or missing today.

---

## Goal

Describe the desired outcome of this change.

Focus on the observable result, not the implementation approach.

---

## Assumptions

List assumptions currently believed to be true that shape this spec.

Examples:
- existing identifiers remain stable
- current auth model remains unchanged
- current import size limits remain acceptable

If none:
- none

---

## Current Context

Describe the current system or workflow context relevant to this change.

Focus on what a task executor needs to know to understand why the current state is being changed — not a general system overview.

When the work affects an existing repository surface, this section should reflect actual repository findings, conventions, constraints, and relevant workflow structure rather than assumptions.

---

## Scope

### In Scope

List the behaviors, flows, or system areas this spec will change.

### Out of Scope

List concrete items intentionally excluded from this iteration.

Use this for nearby work that could be mistaken as included.

---

## Non-Goals

List things this change is explicitly not trying to accomplish.

Use this for broader product or architecture directions that should not be inferred from this spec.

---

## Relevant Areas

List the files, modules, services, UI surfaces, or architecture areas likely affected.

Mark uncertain entries with `?` if confidence is low.

Examples:
- `apps/web/src/features/mapping-studio/*`
- `packages/schema-import/*`
- `backend/schema-validation/* ?`

---

## Dependencies / Blockers

List any specs, tasks, migrations, approvals, external systems, or decisions this work depends on.

Examples:
- Depends on FS-042 being completed first
- Requires backend endpoint for schema validation
- Waiting on product decision for conflict handling

If none:
- none

---

## Constraints

List constraints that shape the solution.

Examples:
- must preserve current routing structure
- must work with existing schema records
- no breaking API changes
- must remain compatible with current auth model

Include performance, compatibility, compliance, or operational constraints when relevant.

---

## Proposed Behavior

Describe the intended behavior after this change.

Use the following subheadings.

### User Flow

Describe how the user experiences the behavior.

### System Behavior

Describe how the system responds, stores data, validates input, or coordinates components.

### Failure / Edge Behavior

Describe behavior for invalid input, empty states, conflicts, partial data, missing dependencies, or error conditions.

This is required if any such case is possible.

---

## Acceptance Examples

Provide deterministic examples with stable IDs.

Use `AE-##` identifiers so tasks and tests can reference them directly.

Include as many examples as needed to fully specify the behavior. Three is not a target.

### AE-01 — Short descriptive name

**Given**
- ...

**When**
- ...

**Then**
- ...

### AE-02 — Short descriptive name

**Given**
- ...

**When**
- ...

**Then**
- ...

---

## Open Questions

List unresolved questions that block confidence or task generation.

Format:
- `Q1.` ...
- `Q2.` ...

Resolved questions should be removed from this section and captured in `Change Log`.

If none:
- none

---

## Verification Strategy

Describe how this spec will be validated.

At minimum, identify which acceptance examples require automated coverage and which are manual-only.

This may include:
- unit tests
- integration tests
- end-to-end tests
- build / typecheck / lint expectations
- manual verification steps
- observability or logging checks

Prefer mapping verification back to acceptance example IDs where practical.

---

## Task Generation Notes

Describe how this work should be decomposed into atomic tasks.

This section should guide decomposition, sequencing, and risk isolation. It must not become a hidden implementation plan or checklist.

Where the spec is `cross-cutting`, note which tasks are `ui` type and which are `engine` or `backend` type so agents are routed correctly.

Tasks should be generated from the current revision of this spec.

If this spec changes materially after tasks are created, affected tasks should be reviewed for drift and revised or regenerated as needed.

---

## Change Log

Each revision entry should state what changed and why.

- Rev 1 — YYYY-MM-DD
  - Initial draft