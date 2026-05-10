# SPEC

## Title

Add Environment-Aware Comparison Workflows to Test Lab

---

## ID

FS-037

---

## Metadata

Owner: TBD
Reviewers: TBD
Created: 2026-05-09
Last Updated: 2026-05-10
Type: cross-cutting

---

## Status

completed

---

## Revision

Rev: 2

---

## Summary

Extend the Test Lab page to support comparison workflows between the current working mapping configuration and deployed environment snapshots. This spec introduces a Compare tab with support for client-side execution of the working config, server-side execution of deployed snapshots (gated behind Phase 1), side-by-side result presentation with diff highlighting, environment/snapshot metadata display, and guardrails that keep Test Lab deployment-free. The goal is to increase deployment confidence and enable parity validation before deployment decisions are made on the separate Deployment page.

---

## Problem

Today the Test Lab (formerly Advanced Testing) page supports only a single execution mode: client-side preview of the current working mapping config. Users have no way to:

1. **See what a deployed environment would produce** for the same input data. Server-side preview exists as an `ApiAdapter` method (`previewOnServer`) but has no UI surface.
2. **Compare outputs across environments** (e.g., "Does my working config produce the same result as QA?"). Without comparison, users must mentally track differences across separate manual test runs.
3. **Understand deployment context** when reviewing results. The current output display shows no metadata about which config version, environment, or snapshot produced the result.
4. **Validate parity before promoting** a mapping from one environment to another. There is no structured workflow for verifying that QA and PROD would produce identical outputs for the same input.

This gap forces users to deploy speculatively and discover discrepancies in production, or to perform ad-hoc manual comparisons across separate test runs with no structured diff.

---

## Goal

After this change:

- Users can select a comparison mode (e.g., Current vs DEV) and see side-by-side results with differences highlighted
- Each result side is clearly labeled with its execution context: environment name, snapshot version, deployment timestamp, and engine version where applicable
- The current working config preview and deployed environment previews are visually distinguished
- Comparison workflows enforce read-only semantics: no deploy, promote, or rollback actions are available in Test Lab
- The comparison framework is extensible for Phase 1+ server-side preview integration while delivering useful client-side comparisons in Phase 0
- Users can optionally store comparison results alongside a test case for regression tracking

---

## Assumptions

- FS-032 (Rename to Test Lab + full-bleed layout) will be completed before or concurrently with this spec
- The `ApiAdapter.previewOnServer()` method and `ServerPreviewResult` type are stable contracts that will not change materially
- In Phase 0 (`LocalStorageAdapter`), `previewOnServer` throws "Not available in offline mode" — all server-side comparison modes are disabled in Phase 0
- The existing `computeDiff` utility and diff rendering primitives (color conventions, entry formatting) can be reused in the comparison-specific diff component without reusing `DiffDisplay` itself
- The existing `PreviewProvider` / `usePreviewExecution` pattern for client-side execution remains the correct foundation for the "Current" side of comparisons
- The Compare tab shares source data state with the rest of Test Lab via the existing `PreviewProvider` — a single source-of-truth payload, not a separate compare-only copy
- Deployment metadata for the "Current" side is derived from the in-memory `MappingConfig` (version, last saved timestamp), not from a server call

---

## Current Context

### Test Lab page structure (post FS-032)

The Test Lab page (route: `/projects/:projectId/mappings/:mappingId/test-lab`) is a two-panel full-bleed workspace:

- **Left panel (~35%):** `SourceDataInput` (full textarea) + `TestCaseManager` (below source input)
- **Right panel (~65%, tabbed):** tab bar (Output | Diagnostics | Trace | Diff) + corresponding display components

The page wraps content in its own `<PreviewProvider>` and uses `useMappingEditor(mappingId)` to load config/schemas independently from the Mapping Editor. `usePreviewExecution` drives execution lifecycle.

### Existing domain types

```ts
export type Environment = 'DEV' | 'QA' | 'PROD';

export interface ServerPreviewInput {
  readonly environment: Environment;
  readonly sourceData: Readonly<Record<string, unknown>>;
}

export interface ServerPreviewResult {
  readonly output: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly Diagnostic[];
  readonly metadata: {
    readonly environment: Environment;
    readonly snapshotVersion: number;
    readonly deployedAt: ISODateString;
    readonly engineVersion: string;
  };
}

export interface DeploymentEnvironmentStatus {
  readonly environment: Environment;
  readonly status: DeployStatus;
  readonly deployedVersion?: number;
  readonly deployedAt?: ISODateString;
}

export interface DeploymentContext {
  readonly mappingId: string;
  readonly mappingName: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly environments: readonly DeploymentEnvironmentStatus[];
}
```

### Existing ApiAdapter surface

```ts
previewOnServer(mappingId: string, input: ServerPreviewInput): Promise<ServerPreviewResult>;
getDeploymentContext(mappingId: string): Promise<DeploymentContext>;
```

### Preview execution hook

`usePreviewExecution` currently runs `executeMapping()` (client-side engine) and publishes results to `PreviewContext`. It has no concept of environment selection or server-side execution.

### Phase 0 boundary

`LocalStorageAdapter` throws `Error("Not available in offline mode")` for `previewOnServer` and returns stub data for `getDeploymentContext`. All server-dependent features must be gracefully disabled.

---

## Scope

### In Scope

- New **Compare tab** in the Test Lab tab bar alongside Output, Diagnostics, Trace, Diff
- **Comparison mode selector** supporting: Current vs DEV, Current vs QA, DEV vs QA, QA vs PROD
- **Client-side execution** for the "Current" (working config) side of any comparison
- **Server-side execution** via `previewOnServer` for deployed environment sides (Phase 1+; disabled in Phase 0)
- **Side-by-side result display** showing left and right outputs in parallel panels
- **Diff highlighting** between left and right comparison outputs using the existing `computeDiff` utility
- **Environment metadata display** for each comparison side: environment label, snapshot version, deployment timestamp, engine context
- **"Current" metadata display**: working config version, saved/unsaved state, engine version (client)
- **Deployment context loading** via `getDeploymentContext` to determine which environments have active deployments and are therefore selectable
- **Phase 0 disabled states**: environment comparison modes shown as unavailable with "(requires backend)" messaging; only "Current" execution is functional
- **Guardrails**: no deploy, promote, rollback, or write actions anywhere in the Compare tab
- **Comparison result snapshot**: optional ability to store a comparison result as a separate `ComparisonSnapshot` record linked to a test case by ID
- New comparison-related types in the domain model
- New hooks: `useServerPreview`, `useEnvironmentComparison`
- New components: `CompareTab`, `ComparisonModeSelector`, `ComparisonSidePanel`, `EnvironmentMetadataBar`, `ComparisonDiffDisplay`

### Out of Scope

- Changes to the Mapping Editor inline preview strip
- Changes to the existing Output, Diagnostics, Trace, or Diff tabs
- Actual deployment, promotion, or rollback functionality
- Server-side preview implementation in `LocalStorageAdapter` (stays as throw)
- Backend Lambda changes or server infrastructure
- Environment-to-environment diff at the mapping config level (rule diff) — this spec compares execution outputs only
- Batch comparison across multiple test cases (single source data at a time)
- Real-time environment health monitoring or status polling

---

## Non-Goals

- This spec is not building a deployment workflow — Test Lab is read-only for environment state
- This spec is not replacing the Deployment page's comparison capabilities — it complements them with execution-output comparison
- This spec is not introducing server-side preview for the first time — it creates the UI surface for it; the adapter method already exists
- This spec is not adding environment management or configuration

---

## Relevant Areas

- `ui/src/features/mappings/components/AdvancedTestingPage.tsx` (to be `TestLabPage.tsx` after FS-032)
- `ui/src/features/mappings/components/preview/` — existing preview display components
- `ui/src/features/mappings/hooks/use-preview-execution.ts`
- `ui/src/features/mappings/context/preview-context.tsx`
- `ui/src/lib/types/domain.ts` — `ServerPreviewInput`, `ServerPreviewResult`, `Environment`, `DeploymentContext`
- `ui/src/lib/api/types.ts` — `ApiAdapter.previewOnServer`, `ApiAdapter.getDeploymentContext`
- `ui/src/lib/utils/json-diff.ts` — `computeDiff` utility
- `forge/architecture/ui-application.md` — Test Lab architecture section

---

## Dependencies / Blockers

- FS-032 (Rename to Test Lab + full-bleed layout) — should be completed first so this spec builds on the renamed/restructured page. If FS-032 is not complete, this spec can proceed using the old `AdvancedTestingPage` naming and be updated after.

---

## Constraints

- Test Lab must remain deployment-free: no deploy, promote, or rollback actions
- Consistent with the product rule: **Save != Deploy** — comparison workflows show what *would* happen, they never trigger deployment
- Server-side preview modes must be gracefully disabled in Phase 0 (LocalStorageAdapter) with clear user messaging
- The Compare tab must work with the same source data input as the other tabs (shared left panel)
- Comparison execution must not interfere with the existing Output/Diagnostics/Trace/Diff tab behavior
- TypeScript strict mode, zero-error lint/typecheck
- Desktop-first only (1024px minimum)
- Components must remain adapter-agnostic (use `ApiAdapter` interface, not direct localStorage)

---

## Proposed Behavior

### User Flow

#### Comparison workflow

1. User navigates to Test Lab and pastes source JSON in the left panel
2. User clicks the **Compare** tab in the right panel tab bar
3. The Compare tab renders:
   - A **comparison mode selector** at the top (dropdown or segmented control)
   - Two **side-by-side result panels** (Left / Right)
   - A **Run Comparison** button
4. User selects a comparison mode (e.g., "Current vs DEV")
5. The selector shows which environments have active deployments — unavailable environments are disabled with a reason tooltip
6. User clicks **Run Comparison**
7. The left side executes the "Current" working config via client-side engine
8. The right side executes via `previewOnServer` for the selected environment (Phase 1+; disabled in Phase 0)
9. Both results render in their respective panels with:
   - The output JSON
   - An **environment metadata bar** above the output (environment name, version, timestamp, engine context)
   - Color-coded status (match/mismatch)
10. Below the two panels, a **diff summary** shows the structural differences between left and right outputs
11. User can optionally click **Save to Test Case** to snapshot the comparison alongside the current test case

#### Phase 0 experience

1. User opens the Compare tab
2. Comparison modes that require server-side preview (any mode with DEV/QA/PROD on either side) are shown as disabled with "(requires backend connection)" label
3. A Phase 0 fallback comparison mode is available: **"Current (Working) vs Current (Saved)"** — compares the working config (with unsaved changes) against the last-saved config version
4. The "Current (Saved)" side re-executes the mapping using the last-persisted `MappingConfig` from the adapter
5. This mode demonstrates the comparison framework and provides useful pre-save validation

### System Behavior

#### User-facing comparison labels

All comparison UIs use these canonical labels consistently:

| Label | Meaning |
|-------|---------|
| **Current** | The current working mapping config in the editor, including any unsaved changes |
| **Saved** | The latest persisted mapping version (last successful save to adapter) |
| **DEV** | The snapshot currently deployed and active in the DEV environment |
| **QA** | The snapshot currently deployed and active in the QA environment |
| **PROD** | The snapshot currently deployed and active in the PROD environment |

"Current" always reflects the in-memory editor state. "Saved" always reflects the latest adapter-persisted state. DEV/QA/PROD always reflect the currently deployed snapshot in that environment — not a historical deployment or a pending deployment.

#### Comparison mode model

Each comparison mode defines a left side and a right side:

| Mode | Left Side | Right Side |
|------|-----------|------------|
| Current vs Saved | Client-side execute (working config) | Client-side execute (last-saved config) |
| Current vs DEV | Client-side execute (working config) | Server preview (DEV) |
| Current vs QA | Client-side execute (working config) | Server preview (QA) |
| DEV vs QA | Server preview (DEV) | Server preview (QA) |
| QA vs PROD | Server preview (QA) | Server preview (PROD) |

Each side produces a `ComparisonSideResult`:

```ts
interface ComparisonSideResult {
  label: string;                    // "Current (Working)", "DEV (v5)", etc.
  output: Record<string, unknown> | null;
  diagnostics: Diagnostic[];
  metadata: ComparisonSideMetadata;
  status: 'idle' | 'executing' | 'success' | 'error';
  error?: string;
}

interface ComparisonSideMetadata {
  executionContext: 'client' | 'server';
  environment?: Environment;        // undefined for "Current"
  configVersion: number;
  snapshotVersion?: number;         // server-side only
  deployedAt?: ISODateString;       // server-side only
  engineVersion: string;
  savedAt?: ISODateString;          // client-side: last save timestamp
  hasUnsavedChanges?: boolean;      // client-side: working config only
}
```

#### Deployment context loading

On Compare tab mount, `getDeploymentContext(mappingId)` is called to determine which environments have active deployments. The result is used to:

- Enable/disable environment-dependent comparison modes
- Populate environment metadata (deployed version, timestamp) in the selector UI
- Show tooltips for disabled modes ("No active deployment in DEV")

In Phase 0, `getDeploymentContext` returns stub data. All environment modes are additionally gated by the Phase 0 adapter check.

#### Client-side "Current" execution

Uses the same `executeMapping()` path as `usePreviewExecution` but runs independently within the comparison hook. The working config comes from `useMappingEditor`'s in-memory state.

The "Current (Saved)" variant loads the last-persisted config by calling `adapter.getMapping(mappingId)` on each comparison run — not from a page-load cache. This ensures the comparison always reflects the latest persisted version, even if the mapping was saved in another tab or context between comparison runs. The async loading step happens at the start of `runComparison()`, before engine execution begins.

#### Server-side environment execution

Calls `adapter.previewOnServer(mappingId, { environment, sourceData })`. The result includes `ServerPreviewResult.metadata` with environment, snapshot version, deployment timestamp, and engine version. In Phase 0, this call throws and the mode is disabled.

For modes where both sides are server previews (DEV vs QA, QA vs PROD), both requests fire in parallel. The hook uses `Promise.allSettled` to ensure one side's failure does not prevent the other from completing. Partial failures are handled explicitly: the successful side displays its result while the failed side shows its error.

When inputs change (source data edited, mode changed) while a comparison is in-flight, stale requests are cancelled. The hook tracks a run ID (incrementing counter) and discards results from superseded runs. This prevents race conditions where a slow prior request overwrites the results of a newer run.

#### Diff computation

After both sides complete, `computeDiff(leftOutput, rightOutput)` produces a diff entry list. The diff is rendered below the side-by-side panels in a dedicated `ComparisonDiffDisplay` component. This component is separate from the existing `DiffDisplay` (which includes an editable expected-output textarea for the Diff tab); `ComparisonDiffDisplay` is read-only comparison output. Both components share the underlying `computeDiff` utility and diff entry color conventions (green for added, red for removed, amber for changed), but `ComparisonDiffDisplay` labels entries using the left/right comparison labels (e.g., "Current (Working)" / "DEV") instead of "expected"/"actual".

#### Comparison result storage

When the user clicks **Save Comparison**, the comparison result is stored as a separate `ComparisonSnapshot` record linked to a test case by ID. This record is stored independently from the `TestCase` data — the `TestCase` type is not extended with comparison fields.

```ts
interface ComparisonSnapshot {
  id: string;                       // unique snapshot ID
  testCaseId: string;               // linked test case
  mappingId: string;                // mapping context
  mode: ComparisonMode;
  leftResult: ComparisonSideResult;
  rightResult: ComparisonSideResult;
  diffEntries: DiffEntry[];
  capturedAt: ISODateString;
}
```

Storage key: `keyra:comparison-snapshots:{mappingId}` in localStorage (Phase 0). Each mapping stores an array of `ComparisonSnapshot` records. Snapshots are linked to test cases via `testCaseId` — the `TestCaseManager` can query for snapshots belonging to a given test case.

Stored comparison snapshots are read-only historical records — they are not re-executable. Deleting a test case does not automatically delete its linked snapshots (orphaned snapshots are harmless and can be cleaned up lazily).

### Failure / Edge Behavior

- **Server preview timeout:** If `previewOnServer` takes longer than 10 seconds, show a timeout error on that side. The other side's result is still displayed.
- **Server preview error:** If `previewOnServer` throws (including Phase 0 "Not available"), show the error message on the affected side. The other side executes independently.
- **One side succeeds, one fails:** Both panels render — the successful side shows its output, the failed side shows its error. Diff section shows "Cannot compute diff — one side has no output."
- **Both sides identical:** Diff section shows a green "Outputs match" indicator with no diff entries.
- **No source data:** Run Comparison is disabled. Tooltip: "Enter source data to run comparison."
- **No active deployments:** Environment comparison modes are disabled. Tooltip shows the specific reason per mode.
- **Working config has no rules:** "Current" side executes and returns an empty output. This is valid and may be useful for comparing against a deployed version.
- **Unsaved changes indicator:** The "Current (Working)" side metadata bar shows an "unsaved" badge when the working config differs from the last save.
- **Stale request cancellation:** If the user changes the comparison mode or edits source data while a comparison is in-flight, the in-flight results are discarded. The UI resets to idle or immediately starts a new comparison if auto-triggered.

---

## Acceptance Examples

### AE-01 — Compare tab appears in Test Lab tab bar

**Given**
- User is on the Test Lab page

**When**
- The page loads

**Then**
- The tab bar shows: Output | Diagnostics | Trace | Diff | Compare
- Clicking "Compare" switches the right panel to the comparison view

### AE-02 — Comparison mode selector shows available modes

**Given**
- User is on the Compare tab

**When**
- User opens the comparison mode selector

**Then**
- All defined comparison modes are listed: Current vs Saved, Current vs DEV, Current vs QA, DEV vs QA, QA vs PROD
- In Phase 0, modes requiring server preview are disabled with "(requires backend connection)" label
- "Current vs Saved" is selectable in Phase 0

### AE-03 — Current vs Saved comparison executes both sides

**Given**
- User has a mapping with 3 rules and unsaved changes (1 rule modified)
- Source data JSON is entered in the left panel
- Comparison mode is set to "Current vs Saved"

**When**
- User clicks "Run Comparison"

**Then**
- Left panel shows output from working config (with unsaved changes) labeled "Current (Working)"
- Right panel shows output from last-saved config labeled "Current (Saved v3)"
- Left metadata bar shows: "Client-side | v3 (unsaved changes) | Engine: {version}"
- Right metadata bar shows: "Client-side | v3 | Saved: {timestamp} | Engine: {version}"
- Diff section below shows the structural differences between the two outputs

### AE-04 — Environment metadata displayed for server-side result

**Given**
- Phase 1+ with DEV having an active deployment at v5
- Comparison mode is "Current vs DEV"
- Source data is entered

**When**
- User clicks "Run Comparison" and both sides complete

**Then**
- Left metadata bar shows: "Client-side | v7 (unsaved changes) | Engine: {clientVersion}"
- Right metadata bar shows: "DEV | Snapshot v5 | Deployed: 2026-04-20 | Engine: {serverVersion}"
- Both outputs are displayed side-by-side

### AE-05 — Diff shows matching outputs

**Given**
- Comparison executed with both sides producing identical output

**When**
- Both sides complete

**Then**
- Diff summary section shows a green "Outputs match" indicator
- No diff entries are listed

### AE-06 — Diff shows structural differences

**Given**
- Comparison executed where left output has `{ "name": "John", "age": 30 }` and right output has `{ "name": "Jane", "age": 30, "email": "j@x.com" }`

**When**
- Both sides complete

**Then**
- Diff summary shows "2 differences found"
- Diff entries show:
  - `"name"`: expected "John" -> got "Jane" (changed)
  - `"email"`: present in right but not in left (added/removed depending on direction)

### AE-07 — One side fails, other side shows result

**Given**
- Comparison mode is "Current vs DEV"
- DEV server preview returns an error

**When**
- Execution completes

**Then**
- Left panel (Current) shows its output normally
- Right panel (DEV) shows the error message with error styling
- Diff section shows "Cannot compute diff -- one side has no output"

### AE-08 — No deploy actions in Compare tab

**Given**
- User is on the Compare tab viewing a comparison result

**When**
- User looks for deploy, promote, or rollback actions

**Then**
- No deploy, promote, or rollback buttons exist anywhere in the Compare tab
- No links to the Deployment page are present in the comparison result area

### AE-09 — Run Comparison disabled without source data

**Given**
- User is on the Compare tab
- No source data has been entered

**When**
- User views the Run Comparison button

**Then**
- The button is disabled
- Tooltip shows "Enter source data to run comparison"

### AE-10 — Phase 0 environment modes disabled

**Given**
- Application is running with LocalStorageAdapter (Phase 0)
- User is on the Compare tab

**When**
- User opens the comparison mode selector

**Then**
- "Current vs Saved" is enabled
- "Current vs DEV", "Current vs QA", "DEV vs QA", "QA vs PROD" are disabled
- Disabled modes show "(requires backend connection)" label

### AE-11 — Save comparison result to test case

**Given**
- A comparison has completed with both sides producing results
- A test case is loaded or source data matches a test case

**When**
- User clicks "Save Comparison"

**Then**
- A `ComparisonSnapshot` record is created and linked to the test case by ID
- The snapshot is stored in `keyra:comparison-snapshots:{mappingId}` in localStorage
- The TestCaseManager shows an indicator that the test case has linked comparison snapshots
- Viewing the stored comparison shows the historical results (read-only, not re-executable)

### AE-12 — Comparison mode selector shows deployment status

**Given**
- Phase 1+ with DEV at v5 (deployed 2026-04-20), QA with no deployment, PROD at v3 (deployed 2026-04-15)

**When**
- User opens the comparison mode selector

**Then**
- "Current vs DEV" is enabled, shows "DEV: v5"
- "Current vs QA" is disabled, shows "QA: no deployment"
- "DEV vs QA" is disabled, shows "QA: no deployment"
- "QA vs PROD" is disabled, shows "QA: no deployment"

---

## Open Questions

- none

---

## Verification Strategy

- **AE-01, AE-02, AE-09, AE-10**: Verified by component tests for `CompareTab` and `ComparisonModeSelector` rendering correct states and disabled modes
- **AE-03**: Verified by integration test using `useEnvironmentComparison` hook with mock adapter, asserting both sides execute and produce distinct outputs
- **AE-04**: Verified by component test with mocked `ServerPreviewResult` metadata rendering
- **AE-05, AE-06**: Verified by unit tests on diff computation between comparison outputs using `computeDiff`
- **AE-07**: Verified by component test where one side returns error state
- **AE-08**: Verified by component test asserting no deploy/promote/rollback elements exist in Compare tab DOM
- **AE-11**: Verified by hook/component test for comparison snapshot save and retrieval
- **AE-12**: Verified by component test with mock `DeploymentContext` showing correct enabled/disabled states
- All tasks must pass: `pnpm typecheck`, `pnpm lint`, `pnpm test` in the `ui/` workspace

---

## Task Generation Notes

This is a cross-cutting spec with primarily UI work and one architecture task. Tasks should be decomposed as follows:

1. **Comparison domain types** (ui-task): Add `ComparisonMode`, `ComparisonSideResult`, `ComparisonSideMetadata`, `ComparisonState`, and `ComparisonSnapshot` types to domain model and feature types. Foundation for all other tasks.

2. **useServerPreview hook** (ui-task): Wrap `adapter.previewOnServer()` with Phase 0 gating, error handling, and typed result. Used by the comparison hook for server-side execution.

3. **useDeploymentContext hook** (ui-task): Load deployment context for the mapping to determine which environments have active deployments. Used by the comparison mode selector.

4. **useEnvironmentComparison hook** (ui-task): Orchestrate two-sided comparison execution — client-side for "Current", server-side for environments. Loads saved config via `adapter.getMapping()` on each run for freshness. Fires both sides in parallel via `Promise.allSettled`. Cancels stale in-flight results via run ID tracking. Depends on T-01, T-02, T-03.

5. **ComparisonModeSelector component** (ui-task): Dropdown or segmented control for selecting comparison mode. Shows deployment status per environment, disables unavailable modes. Depends on T-01, T-03.

6. **ComparisonSidePanel + EnvironmentMetadataBar components** (ui-task): Side panel displaying a single comparison result with metadata bar above output. Depends on T-01.

7. **ComparisonDiffDisplay component** (ui-task): Dedicated comparison diff display between two outputs. Reuses `computeDiff` utility and shared diff rendering primitives (color conventions, entry formatting) but is a separate read-only component from `DiffDisplay`. Depends on T-01.

8. **CompareTab composition and Test Lab integration** (ui-task): Compose all comparison components into a Compare tab, wire into the Test Lab tab bar, connect to shared source data via existing `PreviewProvider`. Depends on T-04, T-05, T-06, T-07.

9. **Comparison snapshot storage** (ui-task): Implement separate `ComparisonSnapshot` storage linked to test cases by ID. New localStorage key `keyra:comparison-snapshots:{mappingId}`. Add save/view functionality in CompareTab and TestCaseManager. Depends on T-08.

10. **Architecture update** (task): Update `ui-application.md` with comparison workflow architecture section. Update `INDEX.md` date.

Tasks 2, 3, 5, 6, 7 can proceed in parallel after T-01. T-04 depends on T-01, T-02, T-03. T-08 depends on T-04, T-05, T-06, T-07. T-09 depends on T-08. T-10 depends on all UI tasks.

---

## Change Log

- Rev 2 — 2026-05-10
  - All 5 open questions resolved:
    - Q1: "Current vs Saved" loads saved config via `adapter.getMapping()` on each comparison run for freshness
    - Q2: Comparison snapshots stored as separate `ComparisonSnapshot` records linked by test case ID, not as TestCase type extension
    - Q3: New `ComparisonDiffDisplay` component (read-only), reusing shared `computeDiff` utility and diff primitives; `DiffDisplay` not reused directly
    - Q4: Both server preview requests fire in parallel via `Promise.allSettled`; stale in-flight results cancelled via run ID tracking
    - Q5: Compare tab shares source data state via existing `PreviewProvider` — single source-of-truth
  - Added user-facing comparison label definitions (Current, Saved, DEV, QA, PROD)
  - Added stale request cancellation to failure/edge behavior
  - Updated AE-11 for separate ComparisonSnapshot storage model
  - Renamed ComparisonDiffSummary → ComparisonDiffDisplay throughout
  - Renamed TestCaseComparisonSnapshot → ComparisonSnapshot throughout
  - No scope change; all changes are design clarifications
- Rev 1 — 2026-05-09
  - Initial draft
