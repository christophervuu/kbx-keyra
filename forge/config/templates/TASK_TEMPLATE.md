# TASK

## Title

Short, action-oriented task name.

Use a verb-led title that describes the concrete change.

Examples:
- Populate mapping studio from selected schemas
- Add schema import validation for pasted JSON
- Render target field badges in secondary row

---

## ID

T-##

Assigned sequentially within the spec's `tasks/` folder.

---

## Spec

FS-###

Source spec this task implements.

---

## Spec Rev

Rev: #

Revision of the source spec this task was generated from or last reviewed against.

If the spec changes materially, review this task for drift before continuing execution.

---

## Agent

task | ui-task

- `task` = engine, backend, workflow, config, or architecture work
- `ui-task` = React component and UI surface work

---

## Status

todo | in_progress | blocked | done

- `todo` = created, not yet started
- `in_progress` = currently being executed
- `blocked` = cannot proceed; re-run with blocker context or return to refinement if the spec is wrong
- `done` = implementation and task-level verification complete, all Acceptance Checks satisfied

A task must not be marked `done` until all `Acceptance Checks` are satisfied.

---

## Depends On

List hard prerequisite task IDs that must complete before this task begins.

If none:
- none

---

## Implements

List the acceptance example IDs from the spec this task directly implements, partially enables, or verifies.

Examples:
- `AE-01`
- `AE-03`

If the task does not map cleanly to a single example, list the nearest relevant IDs and explain in `Notes`.

---

## Summary

1-3 sentences describing the concrete change this task will make and why it exists.

Focus on the observable development outcome, not general project context.

---

## Scope

### In Scope

List exactly what this task must change.

### Out of Scope

List what this task must not change, even if encountered during implementation.

Use this to keep the task atomic and prevent nearby cleanup from leaking in.

---

## Relevant Areas

List the files, modules, services, UI surfaces, or test areas likely involved.

Cross-reference `forge/architecture/project-structure.md` to confirm file placement before implementation begins.

Mark uncertain entries with `?` if confidence is low.

Examples:
- `src/engine/dsl/parser.ts`
- `ui/src/features/mappings/MappingEditor.tsx`
- `tests/engine/dsl/parser.test.ts ?`

---

## Change Requirements

Describe the required code or configuration changes.

Focus on what must become true after the task is complete.

This may include:
- logic to add or modify
- UI behavior to introduce
- data handling to update
- interfaces or contracts to preserve
- migration or compatibility considerations within this task

Do not turn this into step-by-step implementation instructions.

---

## Verification Requirements

Describe the tests, validation steps, and quality checks required to verify this task.

This may include:
- unit tests
- integration tests
- end-to-end tests
- lint / typecheck / build expectations
- manual verification steps

Where practical, map verification back to `AE-##` IDs.

---

## Acceptance Checks

List deterministic checks that must all be true before this task can be marked `done`.

These are the task completion gate.

Examples:
- tests covering `AE-01` and `AE-02` pass
- typecheck passes for touched areas
- mapping studio renders selected schemas on load
- invalid JSON input is rejected with the expected validation state
- `forge/architecture/project-structure.md` updated if new files or folders were created

---

## Blockers / Risks

List anything that could prevent completion or create meaningful execution risk.

If none:
- none

---

## Notes

Optional execution context that helps the task agent stay deterministic.

Use this for:
- sequencing hints
- repo-specific context
- temporary constraints
- clarification when `Implements` is partial or indirect
- drift notes when the spec revision changed and the task was reviewed for continued alignment