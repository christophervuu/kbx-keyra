# AGENTS.md

## Purpose

This repository uses Spark-Forge, a personal spec-driven development workflow for turning ideas into durable planning artifacts, executable task sets, verified implementation, and preserved work history.

This file defines the global operating rules that any AI agent, assistant, or automated workflow must follow when working in this repository.

This file is intentionally repository-wide. It defines the shared contract for how work should be planned, executed, verified, and recorded. It is not the place for agent-specific personas, model configuration, or tool-specific runtime settings — those belong in `.opencode/agents/`.

---

## Scope

These rules apply to all AI-assisted work performed in this repository, including:

- drafting and refining specifications
- generating tasks
- executing approved work
- verifying implementation
- updating workflow artifacts
- maintaining architecture documentation when relevant

If a tool-specific configuration or agent prompt exists elsewhere, it must remain consistent with this file.

---

## Canonical Workflow Documents

The following documents define the Spark-Forge operating model and should be treated as authoritative when present:

- `WORKFLOW.md`
- `SPEC_TEMPLATE.md`
- `TASK_TEMPLATE.md`

`WORKFLOW.md` is the authoritative document for process, repository structure, and artifact placement.

If repository artifacts conflict with one another, the inconsistency should be surfaced explicitly rather than silently worked around.

---

## Architecture Reference Documents

Projects may define architecture reference documents under `forge/architecture/`. These are grounding documents — stable, distilled references that give agents the context needed to plan and execute accurately.

The entry point is always `forge/architecture/INDEX.md`. This file lists every architecture document in the project, what it covers, and when it was last updated. Agents should load `INDEX.md` first, then load specific documents relevant to their work area.

When architecture reference documents exist, agents should:

- load `INDEX.md` before treating a plan as ready
- load specific documents relevant to the work area before execution begins
- treat them as authoritative context for the project's conventions, constraints, and system model
- not modify them as a side effect of planning or execution work unless an explicit architecture task authorizes it

The one exception is `forge/architecture/project-structure.md` — this document is updated in-place by task and ui-task agents as a lightweight side update whenever a task creates files or folders not yet reflected in it. This does not require a separate architecture task.

Architecture documents are reference material. They do not replace specs or tasks.

---

## Core Operating Principles

### 1. Spec-Driven Work

All meaningful work should begin with a durable specification.

The spec is the primary planning artifact for a work item. It defines the problem, goals, scope, constraints, assumptions, expected behavior, and other planning context required to support safe implementation.

Tasks are derived from the spec. Tasks do not replace the spec.

### 2. Plan Before Execution

Agents must not jump directly from idea to implementation.

Before execution begins, the work should have:

- a current spec
- a current task set derived from that spec

### 3. One Planning Package

The planning package consists of:

- the current spec
- the current task set

### 4. Explicitness Over Guessing

Ambiguity, missing context, conflicting constraints, and uncertain scope must be surfaced explicitly.

Agents should not silently invent missing requirements, implementation context, or decisions.

### 5. Draft First, Surface Gaps

The spec agent should produce a draft immediately from whatever input is provided. Gaps, unknowns, and ambiguities are captured in the `Open Questions` section of the spec — not used as a gate before drafting.

The one exception: if the input is so thin that no meaningful draft can be produced, the agent should ask one focused question to establish the minimum required context. This should be rare.

### 6. Durable Artifacts Over Chat-Only Decisions

Important planning, execution, and verification outcomes should be reflected in durable repository artifacts where practical.

The repository should not depend on hidden conversational context as the sole source of workflow truth.

### 7. Verification Before Completion

Work is not complete simply because implementation appears finished.

Completion requires verification against the planning package.

Verification may include tests, builds, lint, typecheck, deterministic checks, or other explicit validation appropriate to the work.

### 8. Repository Workflow Structure Is Authoritative

The workflow-related repository structure defined in `WORKFLOW.md` is part of this repository's operating contract.

Agents must treat that structure as authoritative and preserve it during workflow-related changes.

---

## Workflow Rules

### 1. Idea to Spec

A new request, idea, feature, improvement, or bug fix should be converted into a durable spec before meaningful execution begins.

### 2. Context Loading

Context loading happens inside the drafting step — not as a separate step.

When the work affects an existing repository, subsystem, implementation surface, or architecture area, agents should load relevant context before producing the draft:

- load `forge/architecture/INDEX.md` and relevant architecture documents
- review related files in `src/`, `ui/`, or `tests/` when the work affects existing code
- identify likely touchpoints, constraints, and established conventions
- use Tavily to look up current external documentation if requirements reference version-sensitive technology

### 3. Refinement

Specs may be refined iteratively.

To refine: edit `spec.md` directly, add inline notes or items to `Open Questions`, then re-run the spec agent pointing at the current draft. The agent reads the annotations and produces an updated version.

Refinement should:

- tighten scope
- resolve inconsistencies
- clarify requirements
- make assumptions explicit
- defer non-critical unknowns clearly when appropriate

### 4. Task Generation

Tasks must be generated from the current spec.

Tasks should be:

- atomic enough to execute safely
- specific enough to act on directly
- explicit about expected validation or verification
- assigned to the correct agent using the `Agent` field (`task` or `ui-task`)

For cross-cutting specs, tasks of different execution domains must be assigned to different agents. Tasks of mixed type must not be merged.

When a spec introduces or modifies a subsystem with architecture impact, task generation must include an explicit architecture update task assigned to `Agent: task`.

When a spec introduces a new subsystem with no existing architecture document, the spec agent creates the initial document as part of producing the planning package.

### 5. Drift and Material Change

If the spec changes after tasks are created, agents must evaluate whether the tasks have drifted.

If a change is material, affected tasks should be revised or regenerated before execution continues.

If execution reveals a material issue in the approved plan, the workflow should return to refinement rather than improvising scope changes.

### 6. Blocked Tasks

When a task is blocked:

- re-run it through the appropriate agent with context about the blocker
- if the blocker reveals the spec is wrong, return to refinement first

### 7. Verification

After execution, the implementation should be verified against the planning package.

If verification fails:

- the work remains active
- remediation is required
- execution and verification may repeat until the scope is satisfied

### 8. Completion

A work item is complete when:

- all tasks have `Status: done`
- all `Acceptance Checks` are satisfied
- the human runs `/archive-spec` as the deliberate sign-off

### 9. Repository Structure Preservation

Agents must not:

- treat the structure as optional guidance
- relocate canonical workflow documents casually
- duplicate canonical templates in unrelated directories without explicit reason
- introduce alternate workflow roots that create ambiguity

---

## Artifact Expectations

### Specification

The spec should define enough context to explain:

- what is changing and why
- what is in scope and out of scope
- what behavior is expected
- what constraints or assumptions matter
- what execution domain the work belongs to (`Type`)

### Tasks

Tasks are execution-facing artifacts derived from the current spec. They must not become informal replacement specs.

Each task must declare the `Agent` that will execute it. This is a required field. The `Agent` field is the execution routing instruction — read it and invoke the corresponding agent.

### Architecture Documents

Architecture documents in `forge/architecture/` are created and updated through explicit, scoped tasks — except `project-structure.md`, which is updated in-place by task and ui-task agents whenever a task creates files or folders not yet reflected in it.

`INDEX.md` must be kept current whenever an architecture document is created or meaningfully updated.

### Workflow and Template Documents

Workflow docs and templates should remain stable enough to support consistent authoring.

Agents must not casually rename required sections, remove required structure, or introduce incompatible formatting in canonical templates.

---

## Execution Discipline

Agents performing implementation work must:

- stay within approved scope
- use the current spec and current tasks as execution inputs
- load `forge/architecture/INDEX.md`, `forge/architecture/project-structure.md`, and relevant architecture documents before beginning
- surface blockers or inconsistencies explicitly
- avoid hidden scope expansion
- update `forge/architecture/project-structure.md` in-place if the task creates files or folders not yet reflected in it

If the implementation needs to diverge materially from the plan, the plan should be revised first.

---

## Roles & Responsibilities

### Human

- provides requirements and direction
- reviews planning packages
- annotates and refines specs when needed
- re-runs agents to resolve blocked tasks
- runs `/archive-spec` as the sign-off when all tasks are done

### Orchestrator (spec agent)

- converts requirements into a structured spec using the canonical spec template
- loads architecture context and repository files before drafting
- produces a draft immediately — surfaces gaps in `Open Questions`
- generates tasks from the current spec with correct `Agent` assignment
- creates initial architecture documents when a spec introduces a new subsystem with no existing coverage
- generates explicit architecture update tasks when a spec has architecture impact

### Executor (task agent)

- implements approved tasks of type `engine`, `backend`, `workflow`, `config`, or `architecture`
- keeps execution aligned to approved scope
- updates `forge/architecture/project-structure.md` in-place if the task creates files or folders not yet reflected in it
- surfaces blockers explicitly
- updates task `Status` to `done` after all Acceptance Checks pass
- when executing an architecture task: updates the relevant document(s) and keeps `INDEX.md` current

### Executor (ui-task agent)

- implements approved tasks of type `ui`
- loads and follows any UI conventions document at `forge/config/workflow/UI_CONVENTIONS.md` if present
- keeps UI execution aligned to approved scope
- updates `forge/architecture/project-structure.md` in-place if the task creates files or folders not yet reflected in it
- surfaces blockers explicitly
- updates task `Status` to `done` after all Acceptance Checks pass

### Architecture

There is no separate architecture agent. Architecture is managed through:
- spec agent bootstrapping new architecture documents
- explicit architecture tasks executed by the task agent
- `project-structure.md` updated in-place by task and ui-task agents whenever new files or folders are created
- `INDEX.md` kept current as documents are created or updated

---

## Practical Default Behavior

**Spec agent:**
1. check memory for current FS number and known project constraints
2. scan `forge/active/` to determine next FS number
3. load `forge/architecture/INDEX.md` and relevant architecture documents
4. load repository context when the work affects existing code
5. use Tavily if requirements reference version-sensitive external technology
6. produce a draft spec immediately — capture gaps in `Open Questions`
7. generate tasks from the spec with correct `Agent` assignment per task
8. create initial architecture document if the spec introduces a new subsystem with no existing coverage
9. generate an explicit architecture update task if the spec has architecture impact
10. store new FS number and any architecture decisions in memory

**Task and ui-task agents:**
1. load the assigned task file
2. load the source spec
3. load `forge/architecture/INDEX.md` and `forge/architecture/project-structure.md`
4. load relevant architecture documents for the task area
5. check memory for known constraints or decisions relevant to this task
6. execute within approved scope
7. update `project-structure.md` in-place if new files or folders were created
8. verify results against all Acceptance Checks
9. if executing an architecture task: update the relevant document and `INDEX.md`, store change in memory
10. update task `Status` to `done`

---

## What This File Should Not Contain

- agent-specific personas
- tool-specific runtime configuration
- model selection or temperature settings
- provider-specific syntax
- long task-specific playbooks
- duplicated copies of detailed workflow docs better maintained elsewhere

Those concerns belong in `.opencode/agents/` or `forge/config/workflow/`.