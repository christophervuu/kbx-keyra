# SPEC

## Title

FS-074 Add AI suggestion review UX and acceptance workflow hardening

---

## ID

FS-074

---

## Metadata

Owner: TBD  
Reviewers: TBD  
Created: 2026-06-02  
Last Updated: 2026-06-02  
Type: cross-cutting

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

This spec hardens KeyRa’s Phase 2 AI suggestion workflows so every generated output is always user-reviewed before any mapping mutation. It introduces a reusable suggestion review pattern across Explain Rule, NL→DSL Suggest, Smart Fix, AI Validation follow-on recommendations, and Auto-Map suggestions. Success means users always see a clear generated-vs-committed distinction, explicit Accept/Edit/Dismiss controls, optional batch accept where safe, and zero silent mapping-config mutation.

---

## Problem

Current and in-progress Phase 2 AI specs define feature-specific review experiences, but review semantics can drift by surface. Without one hardened, shared pattern, users may encounter inconsistent controls, unclear generated-state labeling, or accidental mutation risks when suggestions are fetched/refreshed. The system needs an explicit cross-feature contract that enforces “suggest, never auto-commit” behavior in both UX and state transitions.

---

## Goal

Deliver a consistent AI suggestion review and acceptance model across all Phase 2 AI features where:

1. AI outputs are always presented as generated suggestions, never committed content.
2. Users can explicitly Accept, Edit, or Dismiss each suggestion.
3. Batch Accept is available only on eligible multi-suggestion surfaces with clear safeguards.
4. Mapping config changes occur only through explicit user acceptance/edit-apply actions.
5. Generated vs committed state is visible and auditable in UI behavior and state logic.

---

## Assumptions

- All Phase 2 AI feature surfaces in active scope (FS-069 through FS-073) adopt the shared suggestion contract in this spec revision.
- Existing Mapping Editor draft-state model (`updateDraft`, `commitDraft`, `revertDraft`) remains the canonical mutation boundary.
- AI endpoints remain backend-mediated through `ApiAdapter` and existing Lambda conventions.
- Auto-Map already has multi-suggestion review primitives that can be generalized/normalized.
- Explain Rule remains read-only (no accept-to-rule behavior), but still participates in generated-state labeling standards.

---

## Current Context

- `forge/architecture/INDEX.md` and relevant architecture docs were loaded: `ui-application.md`, `ai-runtime.md`, and `backend-api.md`.
- Active AI specs in `forge/active/` (`FS-069`..`FS-073`) already define feature-specific Accept/Edit/Dismiss or advisory semantics, but with per-feature variation risk.
- `ui-application.md` already documents Auto-Map workspace cards and suggestion lifecycle states; this spec extends those patterns into a reusable, cross-feature contract.
- AI runtime architecture already declares suggestion-only constraints, but this needs explicit workflow hardening and verification coverage at feature integration boundaries.
- Existing architecture docs cover required subsystems; this spec does not introduce a new subsystem.

---

## Scope

### In Scope

- Define a reusable suggestion card/panel interaction contract for AI suggestion-bearing UI surfaces.
- Standardize per-suggestion actions: Accept, Edit, Dismiss (and Undo when applicable).
- Standardize batch Accept behavior for eligible list-based suggestion surfaces (for example Auto-Map).
- Enforce explicit generated-vs-committed distinction in UI state and copy.
- Add guardrails so AI responses/failures/refresh events cannot silently mutate mapping config.
- Align AI feature state models and adapter/domain contracts to support hardened review semantics.
- Add cross-feature verification coverage for no-auto-commit invariants.

### Out of Scope

- Redesigning overall Mapping Editor layout or navigation.
- Introducing new AI capabilities or prompts beyond review/acceptance hardening.
- Changing persistence/versioning architecture for mappings.
- Introducing autonomous remediation or auto-apply behaviors.
- Replacing deterministic engine validation semantics.

---

## Non-Goals

- Guaranteeing AI suggestion quality/correctness for all generated outputs.
- Standardizing prompt wording/model behavior across AI features.
- Converging all AI surfaces into a single component instance regardless of UX needs.
- Removing existing feature-specific affordances that are additive and safe.

---

## Relevant Areas

- `ui/src/features/mappings/components/WorkspaceSuggestionCard.tsx`
- `ui/src/features/mappings/components/SuggestExpressionInline.tsx`
- `ui/src/features/mappings/components/ScalarFieldBuilder.tsx`
- `ui/src/features/mappings/components/RuleList.tsx ?`
- `ui/src/features/mappings/components/*Explain*/*.tsx ?`
- `ui/src/features/mappings/components/*SmartFix*/*.tsx ?`
- `ui/src/features/mappings/hooks/use-auto-map-workspace.ts`
- `ui/src/features/mappings/hooks/use-suggest-expression.ts`
- `ui/src/features/mappings/hooks/use-mapping-editor.ts`
- `ui/src/lib/types/domain.ts`
- `ui/src/lib/api/types.ts`
- `ui/src/lib/api/http-adapter.ts`
- `src/lambda/ai/explain-rule.ts`
- `src/lambda/ai/suggest-expression.ts`
- `src/lambda/ai/smart-fix.ts ?`
- `src/lambda/ai/validate-mappings.ts ?`
- `src/lambda/ai/auto-map.ts`
- `tests/lambda/ai/*.test.ts`
- `ui/src/features/mappings/**/*.test.tsx`
- `forge/architecture/ui-application.md`
- `forge/architecture/ai-runtime.md`

---

## Dependencies / Blockers

- Depends on continued contract alignment across active specs FS-069 to FS-073.
- Depends on FS-068 adapter endpoint canonicalization where method signatures are still in flux.
- Batch accept remains limited to eligible multi-suggestion surfaces (for example Auto-Map) and is not introduced for single-suggestion/read-only surfaces.

---

## Constraints

- Must enforce “suggest, never auto-commit” for all AI-generated rule/expression/correction outputs.
- No mapping config mutation may occur from generation success, refresh, or failure paths alone.
- Accept/Edit/Dismiss actions must be explicit user actions.
- Batch accept must be deterministic and limited to eligible suggestion states (e.g., valid/not-dismissed/not-stale).
- Invalid suggestions are universally blocked from apply until user edits them into a valid state.
- Stale suggestions are universally hard-blocked from acceptance in V1.
- Explain Rule follows generated/discard-only behavior and never mutates mapping rules.
- Generated-vs-committed distinction must be visible in copy/state badges and reflected in behavior.
- Existing backend error envelope and UI error normalization conventions must be preserved.

---

## Proposed Behavior

### User Flow

1. User invokes an AI feature (Explain, Suggest, Smart Fix, Validate-with-recommendations, or Auto-Map).
2. UI renders generated output in a standardized suggestion review card/panel treatment with generated-state labeling.
3. Where applicable, user chooses one of:
   - **Accept**: applies suggestion into draft mapping state.
   - **Edit**: modifies generated content first, then explicitly applies.
   - **Dismiss**: marks suggestion dismissed/no-op.
   - Explain Rule remains generated/discard-only (no accept-to-mutate action).
4. Eligible list surfaces offer **Batch Accept** with clear scope/result summary and validation/staleness safeguards.
5. Committed mapping content changes only after explicit accept/apply action; otherwise generated outputs remain non-committed artifacts.

### System Behavior

1. Suggestion-bearing UI surfaces consume a shared review-state contract (status, validation, stale/generated metadata, action availability).
2. `use-mapping-editor` (or equivalent mutation boundary) is the only path that mutates draft rule content, and only from explicit user action handlers.
3. AI response handling paths (success/error/retry/refresh) are prohibited from calling mutation APIs unless in accept/apply handlers.
4. Batch Accept iterates deterministically over eligible suggestions and applies each through explicit mutation pipeline with per-item result accounting.
5. UI distinguishes generated artifacts from committed rule content via badge/label/state and diff/unsaved-change signaling where relevant.
6. Minimum telemetry/audit events are emitted for workflow proof and traceability:
   - `suggestion_generated` (`id`, `feature`, `promptVersion`, `modelVersion`)
   - `suggestion_viewed`
   - `suggestion_edited`
   - `suggestion_accepted` (explicit user action timestamp/user)
   - `suggestion_dismissed`
   - `apply_blocked_invalid`
   - `apply_blocked_stale`
7. Correlation IDs link UI event -> API request -> persisted mutation path so no-auto-commit behavior is auditable.

### Failure / Edge Behavior

- AI request fails: suggestion remains absent/error state; mapping config remains unchanged.
- Suggestion becomes stale due to draft/rule changes: card shows stale status; acceptance is hard-blocked until refreshed.
- Invalid generated expression/correction: visible as non-apply-ready and blocked from apply until edited to valid.
- Batch accept with mixed eligibility: only eligible items apply; skipped items are reported with reasons.
- Dismissed suggestions are never auto-reopened as committed content; refresh may regenerate as new generated artifacts.

---

## Acceptance Examples

### AE-01 — Suggestion card/panel pattern is consistent across AI suggestion surfaces

**Given**
- User opens two or more AI features that produce suggestion artifacts

**When**
- Suggestions are rendered

**Then**
- Each surface presents consistent generated-state labeling, action layout, and review status semantics

### AE-02 — Accept/Edit/Dismiss are explicit and deterministic

**Given**
- A suggestion is shown for a rule-capable surface

**When**
- User accepts, edits-and-applies, or dismisses

**Then**
- Accept/apply mutates draft rule content exactly once via explicit action
- Dismiss performs no mapping mutation
- Edit alone performs no mapping mutation until apply

### AE-03 — Batch Accept applies only eligible suggestions with clear results

**Given**
- A list surface contains valid, invalid, stale, and dismissed suggestions

**When**
- User runs Batch Accept

**Then**
- Only eligible suggestions are applied
- Ineligible suggestions are skipped with deterministic reason tracking
- No non-eligible suggestion mutates mapping config

### AE-04 — Generated-vs-committed distinction remains visible and behaviorally correct

**Given**
- Generated suggestions and existing committed/draft rules both exist

**When**
- User reviews the surface

**Then**
- Generated suggestions are clearly labeled as generated/not committed
- Committed or accepted draft content is visually and behaviorally distinct

### AE-05 — No silent mutation on AI lifecycle events

**Given**
- User triggers AI generation, refresh, retry, or encounters failure

**When**
- No explicit accept/apply action is performed

**Then**
- Mapping config and rule content remain unchanged

### AE-06 — Existing rule content is comparable when suggestion targets same rule/path

**Given**
- A suggestion is provided for a target/rule that already has content

**When**
- User opens review details

**Then**
- UI shows generated-vs-existing comparison context sufficient for informed acceptance/editing

---

## Open Questions

- none

---

## Verification Strategy

Automated:
- UI tests for shared suggestion-card contract and action behavior across affected feature components (`AE-01`, `AE-02`, `AE-04`, `AE-06`).
- Hook/state tests proving no mutation during generation/refresh/failure lifecycle (`AE-05`).
- Batch accept tests covering mixed eligibility and deterministic result accounting (`AE-03`).
- Backend/adapter tests ensuring AI endpoints remain suggestion-only and do not return implicit commit instructions (`AE-05`).
- Telemetry tests/assertions for required event emission and schema fields, including block events for invalid/stale apply attempts (`AE-03`, `AE-05`).
- Correlation-ID verification that links UI interaction, API request handling, and mutation execution records.

Manual:
- Walk through each Phase 2 AI surface and confirm generated labels, explicit actions, and no-auto-commit behavior (`AE-01`, `AE-02`, `AE-04`, `AE-05`).
- Validate comparison visibility for suggestions over existing rule content (`AE-06`).
- Validate batch accept UX and partial-eligibility feedback on list surfaces (`AE-03`).

Quality gates:
- `pnpm typecheck`
- targeted Vitest suites for mappings hooks/components and AI lambdas/adapters touched by this work

---

## Task Generation Notes

- This spec is cross-cutting and must be split by execution domain.
- Use `Agent: ui-task` for reusable review component/pattern work and feature-surface integration.
- Use `Agent: task` for contract hardening, invariant guardrails, and architecture document updates.
- Include telemetry/audit instrumentation and verification in task decomposition.
- Include an explicit architecture update task because this spec materially changes AI UX and suggestion workflow architecture in existing docs.
- Sequence recommendation:
  1. Shared contract + invariant guardrails
  2. Reusable UI pattern implementation
  3. Feature-by-feature adoption and batch behavior hardening
  4. Cross-feature verification and architecture doc updates

---

## Change Log

- Rev 2 — 2026-06-02
  - Resolved Open Questions Q1-Q5 with explicit decisions:
    - all FS-069..FS-073 surfaces adopt shared contract now
    - invalid suggestions are universally blocked pending edit-to-valid
    - stale suggestions are universally hard-blocked from acceptance in V1
    - Explain Rule is generated/discard-only (no rule mutation)
    - minimum telemetry/audit event set and correlation-ID requirement added
- Rev 1 — 2026-06-02
  - Initial draft
