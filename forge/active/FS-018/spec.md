# SPEC

## Title

Mapping Editor — Version History (Panel 8)

---

## ID

FS-018

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-02
Last Updated: 2026-05-02
Type: ui

---

## Status

draft

---

## Revision

Rev: 2

---

## Summary

Build Panel 8 of the Mapping Editor — a version history surface showing a chronological list of saved versions, rule-level diffs between versions (including config changes), and the ability to restore any previous version. Every save (FS-010) already increments the version number; this spec adds persistent version snapshots so users can compare what changed and safely revert. The panel is presented as a drawer/side panel toggled from the editor top bar, giving it more screen real estate than the fixed 180px bottom-row slot allows. This is critical for user confidence before deployment features arrive in Phase 4.

---

## Problem

Users can save mappings (FS-010) and the version number increments, but there is no record of previous versions. Once saved, the prior state is irreversibly lost. Users cannot:

- See what changed between saves (which rules were added, modified, or removed).
- Compare the current working state against any prior version.
- Restore a previous version if a mistake was made.
- Audit the mapping's evolution over time.

This creates anxiety around saves ("what if I break something?") and makes it impossible to understand the mapping's change history — a prerequisite for confident deployment workflows in Phase 4.

---

## Goal

A fully functional Version History panel (Panel 8) that:

- Stores a full MappingConfig snapshot on every save (up to 50 versions retained)
- Displays a chronological version list with timestamps, rule counts, and auto-generated change summaries
- Shows a rule-level + config-level diff between any two versions
- Allows restoring any previous version as a new save (non-destructive restore)
- Integrates with the existing save flow (save now also persists a version entry)
- Provides a drawer/side-panel toggle accessible from the editor top bar

---

## Assumptions

- FS-010 (Rule Editor) is complete — `useMappingEditor` hook, save flow, `EditorTopBar` exist
- FS-008 (UI Scaffold) is complete — shared primitives, adapter, Lucide icons available
- The `ApiAdapter` interface can be extended with version-history methods (additive, non-breaking)
- `LocalStorageAdapter` can store per-mapping version arrays as separate localStorage keys
- Full MappingConfig snapshots are small enough that 50 copies per mapping in localStorage is manageable (typical config < 50KB → 50 versions ≈ 2.5MB per mapping, well within the ~5-10MB localStorage limit for a single mapping)
- The version number in `MappingConfig.version` is the stable identifier for each snapshot
- The diff algorithm matches rules by target path (stable identifier per the DSL/engine contract)
- Panel 8 slot in the grid (`data-testid="panel-slot-8"`) exists but is too constrained (180px height) for full history + diff — a drawer/overlay approach provides better UX

---

## Current Context

The Mapping Editor currently provides:

- `useMappingEditor(mappingId)` — orchestrates load/save; save increments version and calls `adapter.updateMapping()`
- `MappingEditorPage` — 8-panel grid; Panel 8 labeled "History (Panel 8)" renders a `PanelPlaceholder`
- `EditorTopBar` — metadata strip with mapping name, version, save status, deploy badges
- `LocalStorageAdapter.updateMapping()` — overwrites the current `StoredMapping` in `keyra:mappings` array; no version history
- `ApiAdapter` interface — `getMapping()`, `updateMapping()` exist but no version history methods
- `MappingConfig` has `version: number` that increments on each save

Key gaps:

1. No version history storage — `updateMapping()` overwrites; previous state is lost
2. No adapter methods for version CRUD (`listVersions`, `getVersion`, `saveVersion`)
3. No diff utility to compare two MappingConfig objects at the rule/config level
4. No UI surface for viewing history or restoring versions
5. Panel 8 slot has no content prop — renders placeholder directly

---

## Scope

### In Scope

- Extend `ApiAdapter` interface with version history methods
- Implement version storage in `LocalStorageAdapter` (separate localStorage key per mapping: `keyra:versions:{mappingId}`)
- Version pruning: retain max 50 versions, oldest pruned when exceeded
- Auto-persist version snapshot on every save (extend `useMappingEditor` save flow)
- Version diff utility: rule-level diff by target path + config-level diff
- Auto-generated change summary per version: "N added, M modified, K removed"
- Version History drawer/panel component with version list
- Diff view component showing added/modified/removed rules and config changes
- Restore flow: confirmation modal → replace working config → save as new version
- Toggle button in `EditorTopBar` (clock icon + "History" label) to open/close the drawer
- Panel 8 slot in the grid: show compact summary ("v7 — saved 3m ago") with clock icon button to open drawer
- Loading state: skeleton while versions load
- Empty state: "This is the first version. Save changes to build version history."

### Out of Scope

- Backend-persisted version history (Phase 1+; localStorage only)
- Deployment-specific version history (Phase 4)
- Branch/fork model for versions (linear history only)
- User identity tracking ("Updated by" is always "You" in Phase 0)
- Collaborative editing conflict resolution
- Version annotations/comments (potential Phase 2)
- Undo/redo (separate concern from version history)
- Diff at expression-token level (diff is at whole-expression granularity)

---

## Non-Goals

- This spec does not implement deployment workflows — it provides mapping authoring history only
- This spec does not create a general-purpose diff library — it implements mapping-specific diffing
- This spec does not change the engine's validate/execute behavior
- This spec does not implement real-time auto-save or auto-versioning — versions are created only on explicit save

---

## Relevant Areas

- `ui/src/lib/api/types.ts` — extend `ApiAdapter` with version methods
- `ui/src/lib/api/local-storage-adapter.ts` — implement version storage
- `ui/src/lib/types/domain.ts` — add `MappingVersionEntry` type
- `ui/src/features/mappings/hooks/use-mapping-editor.ts` — extend save to write version
- `ui/src/features/mappings/hooks/use-version-history.ts` — new hook for version list + operations
- `ui/src/features/mappings/lib/version-diff.ts` — new diff utility
- `ui/src/features/mappings/components/VersionHistoryDrawer.tsx` — new drawer component
- `ui/src/features/mappings/components/VersionDiffView.tsx` — new diff view component
- `ui/src/features/mappings/components/VersionListItem.tsx` — version entry in list
- `ui/src/features/mappings/components/EditorTopBar.tsx` — add history toggle button
- `ui/src/features/mappings/components/MappingEditorPage.tsx` — Panel 8 slot update
- `ui/src/routes/pages/MappingEditor.tsx` — wire drawer state and component

---

## Dependencies / Blockers

- Depends on FS-008 (UI Scaffold) — **completed**
- Depends on FS-010 (Rule Editor) — save flow, `useMappingEditor`, `EditorTopBar` — **completed**
- No dependency on FS-017 (Configuration Panel) — config diffs reference `MappingConfigOptions` fields that already exist in the type; FS-017 and FS-018 are independent

---

## Constraints

- No backend dependency. All version data in `LocalStorageAdapter`.
- Must integrate with FS-010's save behavior — save now additionally writes a version entry.
- Must integrate with FS-010's editor state — restore replaces the current config and triggers `validate()`.
- No direct localStorage access outside adapter implementations.
- TypeScript strict mode, zero lint/typecheck errors.
- Tailwind CSS 4 for styling.
- No external state management library (`useState`/`useReducer` only).
- Version storage: full configs (not incremental diffs) for simplicity. Configs are small.
- Max 50 retained versions per mapping; oldest pruned on exceed.
- Desktop-first: 1280px+ target, 1024px minimum.
- Drawer width: ~400-480px from right edge; overlays the panel grid (does not push content).

---

## Proposed Behavior

### User Flow

1. **Save creates version** — User saves (Ctrl+S or Save button). The save flow persists the config AND stores a version snapshot with timestamp. This is invisible — no extra action required.
2. **Open history** — User clicks the clock icon / "History" button in `EditorTopBar`. A drawer slides in from the right showing the version list (most recent first).
3. **View version list** — Each entry shows: version number (v1, v2...), timestamp ("2 min ago", "Yesterday at 3:15 PM"), rule count, and change summary ("+2 added, ~1 modified, -1 removed").
4. **View diff** — User clicks a version entry. A diff view appears comparing that version against the last saved version (stable comparison between durable artifacts). Shows:
   - Summary line: "+N added, ~M modified, -K removed"
   - Rules added (green): target path + new expression
   - Rules modified (yellow): target path + before/after expression
   - Rules removed (red): target path + old expression
   - Config changes (if any): field name + before/after value
   - If unsaved changes exist: banner "You have unsaved changes not reflected in this diff."
5. **Compare against different version** — By default, diff compares selected version vs. last saved version. User can optionally select a different "compare to" version from a dropdown.
6. **Restore version** — User clicks "Restore this version" on a non-current entry. Confirmation modal: "This will restore version v{N} as a new version (v{current+1}). Your current unsaved changes will be lost." On confirm:
   - Current working config is replaced with the selected version's config
   - A new save is triggered (creating version current+1)
   - Rule list (Panel 3) updates to reflect restored state
   - Validation re-runs
7. **Close history** — User clicks X or clicks outside the drawer. Drawer closes.

### System Behavior

**Version storage model:**

```typescript
// New type in domain.ts
interface MappingVersionEntry {
  readonly version: number;
  readonly savedAt: string; // ISO timestamp
  readonly savedBy: string; // "You" in Phase 0
  readonly ruleCount: number;
  readonly config: MappingConfig; // full snapshot
}
```

localStorage key: `keyra:versions:{mappingId}` → JSON array of `MappingVersionEntry[]`

**ApiAdapter extension:**

```typescript
// New methods on ApiAdapter
listMappingVersions(mappingId: string): Promise<MappingVersionEntry[]>;
getMappingVersion(mappingId: string, version: number): Promise<MappingVersionEntry>;
saveMappingVersion(mappingId: string, entry: MappingVersionEntry): Promise<void>;
```

**Save flow extension (in `useMappingEditor`):**

After successful `adapter.updateMapping()`:
1. Build a `MappingVersionEntry` from the saved config
2. Call `adapter.saveMappingVersion(mappingId, entry)`
3. This is fire-and-forget (version save failure should not break the main save flow — log warning but don't surface error)

**Version pruning:**

In `LocalStorageAdapter.saveMappingVersion()`:
1. Read current versions array
2. Append new entry
3. If length > 50, remove oldest entries (lowest version numbers) to bring to 50
4. Write back

**Diff algorithm (`version-diff.ts`):**

```typescript
interface RuleDiff {
  type: 'added' | 'modified' | 'removed';
  targetPath: string;
  oldExpression?: string;
  newExpression?: string;
  oldDescription?: string;
  newDescription?: string;
}

interface ConfigDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface VersionDiff {
  summary: { added: number; modified: number; removed: number };
  ruleDiffs: RuleDiff[];
  configDiffs: ConfigDiff[];
}

function computeVersionDiff(oldConfig: MappingConfig, newConfig: MappingConfig): VersionDiff;
```

Rule matching logic:
- Index rules by `target` path (stable identifier)
- If target exists only in new → `added`
- If target exists only in old → `removed`
- If target exists in both but `expression` differs → `modified`
- If target exists in both and expression is identical → unchanged (not shown)
- Position/order changes are NOT flagged as modifications

Config diff logic:
- Compare `config.unmappedTargets`, `config.nullSubtrees`, `config.constants`, `config.externalSources`
- Only show fields that actually changed (deep equality per field)

**Change summary generation:**

For each version entry, compute diff against previous version (version - 1):
- v1: "Initial version — N rules"
- v2+: "+A added, ~M modified, -K removed" (computed lazily when list renders)

**Restore flow:**

1. User confirms restore of version N
2. Load full config from version N entry
3. Set as current working state (replace rules, config options, etc.)
4. Trigger immediate save (version = current + 1)
5. Save writes the restored config as the new latest version (no special tagging — a restore is just a save)
6. Version history is linear: v5 → v6 (which has v3's content). In Phase 1+, a `restoredFrom?: number` field on `MappingVersionEntry` could be added for audit.

**Drawer component:**

- Slides in from right edge, overlays the panel grid
- Width: 400-480px
- Semi-transparent backdrop (click to close)
- Fixed header: "Version History" + close button
- Scrollable body: version list
- When a version is selected: splits into list (top) + diff view (bottom), or navigates to diff detail

### Failure / Edge Behavior

- **No versions stored (first load before any save):** Show empty state: "This is the first version. Save changes to build version history." After first save, v1 appears.
- **Version storage fails (quota exceeded):** Log warning, do not block the main save. History just won't include that version. Show toast: "Version history could not be saved (storage full)."
- **Version entry missing for diff comparison:** If previous version entry is not in storage (pruned), show summary "Changes unknown (previous version not in history)."
- **Restore with unsaved changes:** The confirmation modal warns about lost unsaved changes. User must confirm.
- **Restore target version is the current version:** "Restore this version" button is hidden/disabled on the current version entry.
- **Multiple rules with same target path:** If a mapping has duplicate target paths, diff may show confusing results. Show them as individual entries (group by occurrence order). This is a known limitation noted in diff output.
- **Large version list (50 entries):** List must render smoothly. No virtualization needed at 50 items. Simple CSS scroll.
- **Drawer opened while unsaved changes exist:** Versions still show correctly. The diff compares against the last saved version (not the working unsaved state). A banner clarifies: "You have unsaved changes not reflected in this diff." User saves first to include current edits in the comparison.

---

## Acceptance Examples

### AE-01 — Save creates a version entry

**Given**
- A mapping "Order Transform" loaded at version 3
- 5 rules exist
- No version history entries stored yet

**When**
- User makes a change and saves (version becomes 4)

**Then**
- `adapter.saveMappingVersion()` is called with a `MappingVersionEntry`:
  - `version: 4`
  - `savedAt: <ISO timestamp>`
  - `ruleCount: 5`
  - `config: <full MappingConfig snapshot at version 4>`
- Version entry is persisted in localStorage at `keyra:versions:{mappingId}`

### AE-02 — Version list displays chronologically

**Given**
- A mapping with version history: v1 (3 rules), v2 (4 rules), v3 (4 rules, 1 modified), v4 (5 rules)
- History panel is opened

**When**
- User clicks the History button in the top bar

**Then**
- Drawer opens showing 4 version entries (most recent first):
  - v4 — "just now" — 5 rules — "+1 added"
  - v3 — "5 min ago" — 4 rules — "~1 modified"
  - v2 — "10 min ago" — 4 rules — "+1 added"
  - v1 — "20 min ago" — 3 rules — "Initial version — 3 rules"

### AE-03 — Diff view shows rule changes

**Given**
- Version 2 has rules: `A.B` ← `source("x")`, `A.C` ← `static("y")`
- Version 3 (current) has rules: `A.B` ← `source("x2")`, `A.D` ← `static("z")`

**When**
- User clicks v2 in the version list

**Then**
- Diff summary shows: "+1 added, ~1 modified, -1 removed"
- Modified (yellow): `A.B` — before: `source("x")`, after: `source("x2")`
- Added (green): `A.D` ← `static("z")`
- Removed (red): `A.C` ← `static("y")`

### AE-04 — Diff shows config changes

**Given**
- Version 2: `config.unmappedTargets = "null"`, `config.constants = { TAX: 0.08 }`
- Version 3 (current): `config.unmappedTargets = "error"`, `config.constants = { TAX: 0.10 }`

**When**
- User views diff between v2 and current

**Then**
- Config changes section shows:
  - `unmappedTargets`: "null" → "error"
  - `constants.TAX`: 0.08 → 0.10

### AE-05 — Restore a previous version

**Given**
- Current version is 5 (8 rules)
- Version 3 in history has 5 rules
- User has no unsaved changes

**When**
- User opens history, clicks v3, clicks "Restore this version"
- Confirmation: "This will restore version v3 as a new version (v6). Your current unsaved changes will be lost."
- User confirms

**Then**
- Working config is replaced with v3's snapshot
- An immediate save is triggered → version becomes 6
- Version 6 snapshot is stored in history (with v3's rules/config content)
- Rule list (Panel 3) shows 5 rules (from v3)
- Validation re-runs
- Top bar shows v6
- Drawer updates: v6 appears at top of list

### AE-06 — Empty history state

**Given**
- A mapping that has never been saved (only initial version v1, no version history entries)

**When**
- User opens the History drawer

**Then**
- Empty state message: "This is the first version. Save changes to build version history."
- No version list rendered
- No restore button available

### AE-07 — Version pruning at 50

**Given**
- A mapping with 50 version entries (v1 through v50)

**When**
- User saves (creating v51)

**Then**
- v1 is pruned from storage
- Version list shows v2 through v51 (50 entries)
- Attempting to compare against v1 shows "Previous version not in history"

### AE-08 — Restore with unsaved changes

**Given**
- Current saved version is 4
- User has unsaved rule edits (added 2 rules not yet saved)

**When**
- User opens history and clicks "Restore this version" on v2

**Then**
- Confirmation includes warning: "Your current unsaved changes will be lost."
- On confirm: working state is replaced, unsaved changes are discarded
- Restore triggers save → v5 is created with v2's content

### AE-09 — History toggle in top bar

**Given**
- Mapping editor is loaded

**When**
- User clicks the clock icon / "History" button in EditorTopBar

**Then**
- Version history drawer slides in from the right
- Clicking again (or X button or backdrop) closes the drawer
- Drawer does not affect the editor grid layout (overlays it)

---

## Resolved Questions

- `Q1.` **Compare against last saved version.** Comparing against unsaved state introduces instability (the diff changes on every keystroke). The diff answers "what changed between v5 and v7?" — a stable comparison between durable artifacts. If unsaved changes exist, show a banner: "You have unsaved changes not reflected in this diff." The user saves first if they want to see current edits in the comparison.
- `Q2.` **Panel 8 slot shows minimal summary; drawer is the expanded view.** The panel slot shows: "v7 — saved 3m ago" with a clock icon button to open the full history drawer. This keeps the editor compact (most of the time users don't need version history visible) while providing instant access. The drawer slides in from the right and doesn't displace other panels.
- `Q3.` **No special tagging in Phase 0.** A restore is just a save — it creates v8 with the content of v3. The version list shows v8 with a normal timestamp. In Phase 1+, a `restoredFrom?: number` field could be added to version metadata for audit purposes, but it's not needed now. Keep it simple.

---

## Verification Strategy

- **Unit tests (Vitest):**
  - `computeVersionDiff()` — correct added/modified/removed detection (AE-03, AE-04)
  - `computeVersionDiff()` — handles duplicate target paths, empty configs, identical versions
  - `LocalStorageAdapter` version methods — save, list, prune at 50 (AE-01, AE-07)
  - `useVersionHistory` hook — loads versions, derives summaries, handles empty state
  - `useMappingEditor` save extension — calls `saveMappingVersion` after successful save

- **Component tests (React Testing Library):**
  - `VersionHistoryDrawer` — renders version list, opens/closes on toggle (AE-02, AE-09)
  - `VersionDiffView` — renders added/modified/removed items with correct colors (AE-03)
  - Restore confirmation modal — shows correct message, executes restore (AE-05, AE-08)
  - Empty state renders correctly (AE-06)

- **Build verification:**
  - `tsc --noEmit` passes
  - `pnpm lint` passes
  - `pnpm build` succeeds in `ui/`

---

## Task Generation Notes

Decompose into 7 tasks:

1. **T-01: Extend ApiAdapter with version history methods and implement in LocalStorageAdapter** — Add `listMappingVersions`, `getMappingVersion`, `saveMappingVersion` to `ApiAdapter` interface. Implement in `LocalStorageAdapter` with pruning. Add `MappingVersionEntry` type. Agent: `task` (adapter/data-layer work).

2. **T-02: Build version diff utility** — Create `computeVersionDiff()` in `features/mappings/lib/version-diff.ts`. Rule matching by target path, config field comparison, summary generation. Agent: `task` (pure logic utility).

3. **T-03: Extend useMappingEditor save to persist version snapshots** — After successful save, call `adapter.saveMappingVersion()` with the saved config snapshot. Fire-and-forget (don't block save on version write failure). Agent: `ui-task`.

4. **T-04: Build useVersionHistory hook** — New hook that loads version list for a mapping, derives change summaries (lazy), exposes restore action. Agent: `ui-task`.

5. **T-05: Build VersionHistoryDrawer and VersionListItem components** — Drawer that slides from right, version list with entries showing version/time/rules/summary, loading/empty states. Agent: `ui-task`.

6. **T-06: Build VersionDiffView and restore confirmation** — Diff display component with colored sections for added/modified/removed/config changes. Restore button + confirmation modal. Agent: `ui-task`.

7. **T-07: Integrate into MappingEditorPage and EditorTopBar** — Add history toggle button to `EditorTopBar`, manage drawer open/close state at page level, wire `VersionHistoryDrawer` to page composition. Update Panel 8 slot with compact summary or toggle hint. Update `ui-application.md` architecture. Agent: `ui-task`.

Dependency chain:
- T-01 is the data-layer prerequisite — T-02, T-03, T-04 depend on it
- T-02 has no dependencies beyond T-01 (pure utility)
- T-03 depends on T-01 (adapter methods must exist)
- T-04 depends on T-01 + T-02 (uses adapter + diff utility)
- T-05 depends on T-04 (consumes hook state)
- T-06 depends on T-04 + T-05 (extends the drawer with diff view + restore)
- T-07 depends on T-03 + T-05 (integration wiring)

Parallelization:
- T-01 runs first (foundation)
- T-02 and T-03 can run in parallel after T-01
- T-04 depends on T-01 + T-02
- T-05 and T-06 can partially overlap (T-05 is list, T-06 adds diff + restore)
- T-07 runs last (integration)

---

## Change Log

- Rev 2 — 2026-05-02
  - Resolved all Open Questions (Q1–Q3) with definitive answers
  - Q1: Diff always compares against last saved version (stable artifacts); banner shown if unsaved changes exist
  - Q2: Panel 8 slot shows compact summary ("v7 — saved 3m ago") + clock icon button; drawer is the full expanded view
  - Q3: No special restore tagging in Phase 0; a restore is just a save creating a new version
  - Updated user flow step 4/5 to reflect stable diff comparison
  - Updated Panel 8 slot description to be specific (compact summary + button)
  - Updated restore flow to explicitly note no tagging
  - Updated edge case for unsaved changes to include banner text
  - Renamed section from "Open Questions" to "Resolved Questions"
- Rev 1 — 2026-05-02
  - Initial draft
