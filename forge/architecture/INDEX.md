# Architecture Index

This file is the entry point for all architecture reference documents in this repository.

Agents must load this file before beginning any spec drafting or task execution. Load the specific documents relevant to the work area — do not load all documents indiscriminately.

This file must be kept current. When an architecture document is created or meaningfully updated, update the entry here.

---

## Documents

| Document                                       | Covers                                                                                                                                                                                                    | Last Updated |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| [project-structure.md](./project-structure.md) | Repository layout — where source code, UI code, and tests live. File and folder conventions within `src/`, `ui/`, and `tests/`.                                                                           | 2026-05-11   |
| [mapping-engine.md](./mapping-engine.md)       | Mapping engine public API, internal module boundaries, function registry pattern, execution + validate pipelines, parser/evaluator architecture, type system, constraints, and error handling philosophy. | 2026-05-01   |
| [ui-application.md](./ui-application.md)       | UI application architecture — adapter pattern, state management (AsyncState), engine integration boundary/hooks, Mapping Editor three-column target-driven layout with toolbar consolidation + resizable panels + Rules View search + inline preview refinements (FS-020, FS-021, FS-022), UnifiedExpressionBuilder multi-mode redesign + decomposition flow (FS-023), builder state hydration on target selection + navigation reset + conditional branch expressions + Apply stay-on-field + Next unmapped accelerator (FS-025), Schema Detail page architecture (FS-015), routing, component organization, technology stack, and Phase 0 constraints. FS-027: dirty-state detection, static value inputType + bare literal DSL, clear mapping action, object coverage via leaf descendants, header compression, live result wiring, diagnostics wrap. FS-030: transform chain pipeline model (TransformChainStep/InlineTransform chain state, chain generation/decomposition, type-compatible add-step filtering, SourceCard vertical pipeline). FS-032: Test Lab rename (`/test-lab` route), focused-workspace layout semantics, and Test Lab component naming updates. FS-034: TestCaseListPanel, TestRunResult type, useTestRunResults, useBatchExecution, scratchpad selection model, sequential batch execution. FS-035: ExecutionSummaryBar pass/fail verdict (deriveExecutionVerdict), categorized diff mismatch types (6 DiffChangeType categories + DiffSummary), DiffDisplay category rendering, diff-first UX (auto-tab-switch + diff tab badge + diffSummaryLabel), per-test icon indicators (CheckCircle2/XCircle/AlertCircle), sessionStorage persistence for test results, SuiteSummary inline batch results component. FS-036: linked cross-panel debugging model (DebugSelection, useLinkedDebugSelection hook, panel interaction matrix, jump-to-rule route state, failure explainer module). FS-037: comparison workflow architecture (ComparisonMode/ComparisonState model, Compare tab hierarchy, environment-mode Phase 0 gating, `useServerPreview`/`useDeploymentContext`/`useEnvironmentComparison`, and separate `ComparisonSnapshot` storage + `useComparisonSnapshots`). FS-038: chain-based Builder panel redesign (ChainBuilderState/LogicStep type system, entry-point model Source/Static/External, chain semantics, progressive disclosure, ChainBuilderShell + EntryPointSelector + ChainSourceCard + StaticValueInput + AddLogicPicker + TransformStepForm + ChainConditionForm + ChainValueMapForm + CollapsibleStepContainer + LogicStepList, chain-expression-generator, chain-decomposer, ScalarFieldBuilder + ExpressionBuilderPanel integration, backward compatibility with legacy decomposers). FS-039: auto-draft save model (draftRules map, updateDraft/commitDraft/revertDraft/revertAllDrafts, hasUnsavedChanges, unsavedChangeCount, UnsavedChangesOverlay), ChainState type system (ChainSource/ChainStep/OperandValue/currentValue default, conditions total, value maps required default), ChainBuilder.tsx new component boundary, step collapse/expand accordion, chain-summary.ts, ConditionStepEditor, ValueMapStepEditor, ChainStepCard, EditorTopBar unsavedChangeCount+onViewUnsavedChanges, ConnectedInlinePreviewStrip draft-expression auto-preview trigger. FS-040: two-level validation model (useBuilderValidation: structural + output-type inference via engine, BuilderValidationState, canApply/canSave gating), BuilderFeedbackArea pinned panel (Expression/Result/Validation rows, replaces LiveExpressionDisplay+LiveResultDisplay in scalar path), Suggested Sources removed, action row redesign (Reset draft with confirmation, AI placeholder tooltips, Remove mapping moved to header overflow menu HeaderOverflowMenu), per-field unsaved diff (useUnsavedDiff hook, UnsavedDiffPanel component, savedRules baseline from useMappingEditor). | 2026-05-11   |
| [e2e-testing.md](./e2e-testing.md)             | E2E test infrastructure — Playwright configuration, page object conventions, fixture patterns, storage helpers, selector strategy, performance budget, and CI integration.                                                  | 2026-05-02   |
| [ai-runtime.md](./ai-runtime.md)               | Shared AI runtime — prompt loading, DSL asset resolution, prompt rendering, GitHub Models invocation, structured output parsing, orchestration entry point, adapter pattern for local testing, Lambda handler conventions.   | 2026-05-11   |

**Recent update note (2026-05-11):** `ui-application.md` was updated for FS-042 Suggest Expression showcase architecture (HybridAdapter/AI client extension, `useSuggestExpression`, `SuggestExpressionInline`, sourceContext→RAG transition compatibility).

---

## Maintenance Rules

- Add a row when a new architecture document is created.
- Update the `Last Updated` date when a document is meaningfully changed.
- Do not remove rows without an explicit architecture task authorizing the removal.
- Documents are created by the spec agent during planning and updated by the task agent during execution of architecture tasks.

---
## Reference Specifications

| Document | Path | Covers |
|----------|------|--------|
| Product & Technical Spec | `specs/PRODUCT-TECHNICAL.md` | Full product requirements, screen specs, engine overview, backend architecture |
| DSL Specification | `specs/KEYRA-DSL-SPECIFICATION.md` | DSL grammar, function catalog, type system, error codes |
| DSL Arrays | `specs/KEYRA-DSL-ARRAYS.md` | Array scoping, map/filter/find, nested contexts |
