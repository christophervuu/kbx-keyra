# SPEC

## Title

Schema Tree View Component

---

## ID

FS-009

---

## Metadata

Owner: @keyra-ui-team
Reviewers: TBD
Created: 2026-05-01
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

Build a reusable, high-performance `<SchemaTreeView />` component that parses JSON Schema and XSD content client-side into a normalized tree structure and renders an interactive, virtualized, searchable tree. This component serves as the source/target schema browser in the Mapping Editor (Panels 1 & 2) and the Schema Detail page (Section 6.7). It must handle schemas from a handful of fields to 23,000+ fields without degraded UX.

---

## Problem

The Mapping Editor requires source and target schema browsers that let users explore schema structure, select fields for rule authoring, and see mapping coverage at a glance. The Schema Detail page needs a read-only (initially) tree view of schema contents. No schema parsing or tree rendering capability exists in the UI today. Downstream specs (FS-010 through FS-013) are blocked on this component.

---

## Goal

A single, production-quality `<SchemaTreeView />` React component that:
- Parses JSON Schema, XSD, and inferred schemas (from sample data) entirely client-side
- Renders an interactive, accessible tree with expand/collapse, type icons, required indicators, search/filter, and mapping status overlays
- Handles 23,000+ field schemas via virtualization with sub-3-second parse times and sub-300ms search
- Exposes a clean component API suitable for embedding in the Mapping Editor panels and Schema Detail page

---

## Assumptions

- FS-008 is complete and provides the project scaffold, shared primitives, domain types, and `LocalStorageAdapter`
- Schemas are stored as raw content (JSON or XML string) in `LocalStorageAdapter` and passed to the parser as strings
- The `SchemaNodes` DynamoDB shape from Section 15.1 (path, fieldName, type, description, depth, isArray, isRequired, parentPath, childCount) is the canonical field set — the parser output must be compatible so Phase 1 backend-parsed schemas can feed directly into the tree view
- Local `$ref` resolution only for Phase 0; remote `$ref` is deferred
- No XSD-to-JSON-Schema conversion — each format is parsed natively into the same `SchemaTreeNode` shape
- Tree editing (Section 6.7 edit mode) is deferred to FS-013+; this spec adds the `editable` prop placeholder only
- `SchemaTreeNode` and `ParsedSchema` are domain model types defined in `ui/src/lib/types/domain.ts` (shared across features), since downstream specs (FS-010–012) also consume them. Parser implementation details and tree-rendering-specific types (expanded state, virtual row metadata) remain in the `ui/src/features/schemas/` feature module.
- Inferred schema parser handles nested objects/arrays recursively (not top-level-only)
- XSD `xs:choice` renders as an inline union indicator (e.g., `(A | B | C)`) for Phase 0; expandable children deferred
- Initial tree render always expands depth 0 (shows top-level children); never auto-expands deeper. The "Expand to depth N" toolbar button covers deliberate deeper expansion.
- `@tanstack/react-virtual` is the recommended virtualization library (variable-height row support, actively maintained), but not a hard constraint — the implementer may substitute if a tree-specific edge case warrants it

---

## Current Context

The UI application (FS-008) provides:
- React 18 + TypeScript + Vite + Tailwind CSS 4 scaffold
- `ui/src/features/schemas/` directory exists as a feature module placeholder
- Shared primitives: `Button`, `Card`, `PageHeader`, `StatusBadge`
- `LocalStorageAdapter` stores `SchemaDetail` objects with raw `content` field (JSON object or XML string)
- Lucide React icon library is installed
- `SchemaDetail`, `SchemaMetadata`, `SchemaFormat` types are defined in `ui/src/lib/types/domain.ts`
- `SchemaSearchResult` type exists with `path`, `fieldName`, `type`, `description` fields
- No schema parsing logic exists anywhere in the UI codebase
- No tree component exists

Per `forge/architecture/ui-application.md`:
- Feature-specific code goes in `ui/src/features/{feature}/`
- No cross-feature imports; shared code must be lifted to `components/`, `hooks/`, or `lib/`
- TypeScript strict mode, zero lint errors required
- Phase 0: no external state management libraries, use React Context + `useReducer` for shared state, `useState` for local

---

## Scope

### In Scope

- `SchemaTreeNode` type and `ParsedSchema` type definitions
- JSON Schema parser (properties, items, local `$ref`, required, type, description, enum, oneOf/anyOf union indicator)
- XSD parser (xs:element, xs:complexType, xs:simpleType, xs:sequence, xs:choice, xs:attribute, minOccurs/maxOccurs, xs:annotation/xs:documentation)
- Inferred schema parser (from sample JSON/XML, flagged as inferred)
- `<SchemaTreeView />` component with:
  - Expand/collapse nodes
  - Type icons (string, number, boolean, object, array, enum, null/any) using Lucide
  - Required-field indicators
  - Field descriptions on hover (tooltip)
  - Depth indentation with tree lines/guides
  - Node count badges on expandable nodes
  - Search/filter with debounced input, auto-expand ancestors, highlight matches
  - Mapping status indicators for target variant (mapped/unmapped/warning)
  - Selection behavior with `onSelectNode` callback
  - "Expand All" / "Collapse All" / "Expand to depth N" toolbar controls
  - Keyboard navigation (arrow keys, Enter/Space, Home/End)
  - ARIA tree roles and screen reader support
  - Virtualized rendering for 1,000+ node trees
  - Lazy expansion (children rendered only when parent expanded)
  - Loading, empty, error, and populated states
- Component API with props: `schema`, `variant`, `mappingStatus`, `onSelectNode`, `selectedPath`, `searchable`, `editable`

### Out of Scope

- Remote `$ref` resolution (deferred to Phase 1 backend parsing)
- Inline editing of schema fields (FS-013+)
- Drag-and-drop from tree to expression builder (FS-011 owns that interaction)
- Schema upload/import flows (FS-013)
- Backend schema parsing or `querySchemaNodes` API integration
- XSD namespace handling beyond `xs:` prefix
- Schema validation/linting
- Context menus on tree nodes

---

## Non-Goals

- This component does not manage schema data lifecycle (loading, saving, syncing) — that belongs to FS-013
- This component does not compute mapping status — it receives it as a prop from the Mapping Editor
- This component does not include the expression builder panel — it only provides node selection callbacks
- This is not a generic tree component — it is schema-domain-specific

---

## Relevant Areas

- `ui/src/lib/types/domain.ts` — `SchemaTreeNode`, `ParsedSchema`, `SchemaNodeType`, `MappingNodeStatus` type definitions (shared domain types)
- `ui/src/features/schemas/` — primary feature module location
- `ui/src/features/schemas/components/` — SchemaTreeView component
- `ui/src/features/schemas/lib/` — parser implementations
- `ui/src/features/schemas/types.ts` — tree-rendering-specific types (expanded state, virtual row metadata, internal component types)
- `ui/src/lib/types/domain.ts` — existing domain types (SchemaFormat, SchemaDetail)
- `ui/src/components/` — if any shared primitives are extracted (e.g., Tooltip)
- `tests/ui/features/schemas/` — test files

---

## Dependencies / Blockers

- Depends on FS-008 (UI Scaffold & App Shell) being completed — **satisfied** (FS-008 is in `forge/completed/`)
- No other blockers

---

## Constraints

- No backend dependency — all parsing is client-side
- Must work with `LocalStorageAdapter` — schemas passed to parser as raw content strings
- Must integrate with FS-008's app shell (mounts inside page layouts, uses shared primitives)
- TypeScript strict mode, zero lint/typecheck errors
- Parse 23,000-field schemas in < 3 seconds; show loading indicator if > 500ms
- Search on 23,000-field schemas returns results within 300ms of debounce
- Virtualized rendering — only visible nodes in the DOM for trees with 1,000+ nodes; `@tanstack/react-virtual` recommended
- Component must be testable standalone (isolated from Mapping Editor layout)
- No external state management libraries (per Phase 0 rules)
- Tailwind CSS 4 for styling (no CSS modules, no styled-components)
- Lucide React for icons

---

## Proposed Behavior

### User Flow

1. **Schema loads** — User navigates to Schema Detail page or opens a mapping. The parent component retrieves schema content from `LocalStorageAdapter` and passes it to the parser.
2. **Parsing** — The parser converts raw JSON Schema / XSD / sample data into a `ParsedSchema` (normalized tree). If parsing takes > 500ms, a skeleton loading state is shown.
3. **Tree renders** — The tree view displays all top-level fields expanded (depth 0 children visible), with deeper levels collapsed. Users use expand controls or the "Expand to depth N" toolbar to drill deeper.
4. **Exploring** — User clicks expand arrows to drill into nested objects/arrays. Child count badges help orient on large schemas.
5. **Searching** — User types in the search input. After 200–300ms debounce, the tree filters to show only matching nodes (and their ancestors). Matching text is highlighted. A count ("12 results") is announced.
6. **Selecting** — User clicks a node. It highlights. The `onSelectNode` callback fires. In the Mapping Editor, this feeds the expression builder (source) or navigates to a rule (target).
7. **Mapping status** — In target variant, each node shows a status icon. As the user authors rules, these update (driven by parent component re-rendering with updated `mappingStatus` map).

### System Behavior

**Parser layer:**
- `parseJsonSchema(content: string | object): ParsedSchema` — traverses JSON Schema recursively, resolving local `$ref` references, and produces a flat-to-tree structure of `SchemaTreeNode` objects
- `parseXsd(content: string): ParsedSchema` — parses XML string using browser `DOMParser`, traverses XSD elements, and produces the same `SchemaTreeNode` output
- `parseInferredSchema(content: string, format: 'json' | 'xml'): ParsedSchema` — infers types from sample data, produces `SchemaTreeNode` with `inferred: true` flag
- All parsers produce identical output shape compatible with DynamoDB `SchemaNodes` record fields

**SchemaTreeNode shape:**
```typescript
interface SchemaTreeNode {
  path: string;            // dot-notation path (e.g., "address.street")
  fieldName: string;       // leaf field name (e.g., "street")
  type: string;            // "string" | "number" | "boolean" | "object" | "array" | "enum" | "null" | "any" | "union"
  description?: string;    // from schema description/annotation
  depth: number;           // nesting level (0 = root)
  isArray: boolean;        // whether this node is an array type
  isRequired: boolean;     // whether marked required in parent
  parentPath: string | null; // path of parent node (null for root)
  childCount: number;      // number of direct children
  children: SchemaTreeNode[]; // nested children (for tree rendering)
  enumValues?: string[];   // if type is enum
  inferred?: boolean;      // true if schema was inferred from sample data
  unionTypes?: string[];   // if oneOf/anyOf/xs:choice, the member types
  minOccurs?: number;      // XSD cardinality
  maxOccurs?: number | 'unbounded'; // XSD cardinality
}
```

**Component rendering:**
- Virtualization: only nodes within the visible scroll viewport are rendered as DOM elements
- Lazy expansion: children are rendered only when their parent is expanded (not pre-rendered hidden)
- Expand state is managed locally via `Set<string>` of expanded paths
- Search state is managed locally; previous expand state is preserved and restored on search clear

**State management:**
- All state (expand/collapse, search, selection) is component-local (`useState`)
- Selection is optionally controlled externally via `selectedPath` prop
- No Context or global state needed for this component

### Failure / Edge Behavior

- **Invalid JSON Schema:** Parser throws → component shows error state with message and "Retry" button (retry re-invokes parser)
- **Invalid XSD:** DOMParser returns error document → component shows error state
- **Empty schema:** Schema with no properties/elements → component shows empty state ("No fields found in schema")
- **Circular `$ref`:** Detected during parsing, cycle is broken with a max-depth guard (16 levels). Node at cycle point shows "[Circular Reference]" indicator.
- **Very large schemas (23,000+ fields):** Parsing runs; if > 500ms, loading skeleton shown. Virtualization ensures render performance is constant regardless of total node count.
- **Search with no results:** "No matching fields" message shown in tree area. Search input remains active.
- **Schema with mixed types (oneOf/anyOf):** Shows union indicator with member types listed. Node is not expandable unless members include object types.
- **Missing descriptions:** Tooltip not rendered for nodes without descriptions. No empty tooltip shown.
- **Null/undefined content passed to parser:** Parser returns empty `ParsedSchema` with zero nodes → empty state shown.

---

## Acceptance Examples

### AE-01 — Parse and render a simple JSON Schema

**Given**
- A JSON Schema string with 3 properties: `name` (string, required), `age` (number), `address` (object with `street` and `city`)

**When**
- The schema is passed to `parseJsonSchema()` and the result rendered in `<SchemaTreeView />`

**Then**
- Tree shows 3 top-level nodes: `name`, `age`, `address`
- `name` has a string icon and a required indicator
- `age` has a number icon, no required indicator
- `address` has an object icon with badge "(2 fields)" and is expandable
- Expanding `address` reveals `street` and `city` with string icons
- Each node's `path` matches dot-notation: `"name"`, `"age"`, `"address"`, `"address.street"`, `"address.city"`

### AE-02 — Parse and render an XSD schema

**Given**
- An XSD string defining a `Person` complex type with elements: `firstName` (xs:string, minOccurs=1), `lastName` (xs:string, minOccurs=1), `phones` (xs:sequence of xs:string, maxOccurs=unbounded)

**When**
- The schema is passed to `parseXsd()` and the result rendered in `<SchemaTreeView />`

**Then**
- Tree shows `Person` as root (or top-level elements depending on XSD structure)
- `firstName` and `lastName` show string icons and required indicators (minOccurs=1)
- `phones` shows an array icon
- `SchemaTreeNode.isArray` is `true` for `phones`
- `SchemaTreeNode.isRequired` is `true` for `firstName` and `lastName`

### AE-03 — Search filters tree and highlights matches

**Given**
- A parsed schema with 20+ fields including `firstName`, `lastName`, `billingAddress.street`, `shippingAddress.street`

**When**
- User types "street" in the search input

**Then**
- After debounce (200–300ms), tree shows only `billingAddress` → `street` and `shippingAddress` → `street`
- Ancestor nodes (`billingAddress`, `shippingAddress`) are auto-expanded
- The text "street" is highlighted in both field names
- Non-matching branches are hidden
- A result count (e.g., "2 results") is displayed/announced
- Clearing search restores the full tree with previous expand/collapse state

### AE-04 — Mapping status indicators on target tree

**Given**
- A parsed schema rendered with `variant="target"`
- `mappingStatus` map: `{ "name": "mapped", "age": "unmapped", "address.street": "warning" }`

**When**
- The tree renders

**Then**
- `name` node shows green checkmark icon
- `age` node shows gray empty circle icon
- `address.street` node shows yellow warning icon
- Nodes not in the map show no mapping indicator

### AE-05 — Virtualized rendering of large schema

**Given**
- A parsed schema with 5,000 nodes

**When**
- The tree renders with all nodes expanded

**Then**
- The DOM contains only the nodes visible within the scroll viewport (plus a small overscan buffer)
- Scrolling smoothly reveals more nodes without jank
- Total render time for initial display is under 100ms (after parsing)
- Memory usage is proportional to visible nodes, not total nodes

### AE-06 — Keyboard navigation

**Given**
- A rendered tree with focus on a collapsed object node

**When**
- User presses Right Arrow → Enter → Down Arrow → Down Arrow → Home

**Then**
- Right Arrow expands the node (reveals children)
- Enter selects the now-expanded node (onSelectNode fires)
- Down Arrow moves focus to first child
- Down Arrow moves focus to second child
- Home moves focus to first visible node in tree

### AE-07 — Inferred schema flagging

**Given**
- A sample JSON string `{ "name": "Alice", "scores": [95, 88] }` passed to `parseInferredSchema()`

**When**
- The result is rendered in `<SchemaTreeView />`

**Then**
- `name` is inferred as type "string", `scores` as type "array" (of numbers)
- Each node has `inferred: true`
- The tree displays a visual indicator that the schema was inferred (e.g., warning banner or node-level icon)

### AE-08 — Error state for invalid schema

**Given**
- An invalid JSON string (malformed JSON) passed to `parseJsonSchema()`

**When**
- The parser throws an error

**Then**
- `<SchemaTreeView />` renders the error state: "Failed to parse schema" message with error detail
- A "Retry" action is available
- The error state does not crash the component or parent

### AE-09 — Node selection fires callback

**Given**
- A rendered tree with `onSelectNode` prop provided

**When**
- User clicks on the `address.street` node

**Then**
- The node is visually highlighted (selected state)
- `onSelectNode` is called with the `SchemaTreeNode` object for `address.street`
- `selectedPath` can be used to externally control which node appears selected

### AE-10 — Expand to depth N

**Given**
- A schema with 4 levels of nesting

**When**
- User selects "Expand to depth 2" from toolbar

**Then**
- All nodes at depth 0 and depth 1 are expanded
- Nodes at depth 2+ remain collapsed
- The tree updates immediately without full re-render

---

## Open Questions

_All questions resolved in Rev 2._

### Resolved

- **Q1.** Should the inferred schema parser handle nested objects/arrays recursively? → **Yes, recursive.** Sample data like `{ "address": { "city": "Wichita" } }` must produce a full tree. Top-level-only inference would be useless for real-world schemas.
- **Q2.** For XSD `xs:choice`, should member options be rendered as expandable children or shown inline? → **Inline union indicator for Phase 0** (e.g., `(A | B | C)` with tooltip). Rendering all options as expandable children implies they coexist, which is misleading. Expandable children deferred to schema editing feature.
- **Q3.** What is the threshold for auto-expanding top-level nodes on initial render? → **Always auto-expand depth 0 (show top-level children), never auto-expand deeper.** Simpler, more predictable. The "Expand to depth N" toolbar button covers deliberate deeper expansion.
- **Q4.** Should the virtualization library be `@tanstack/react-virtual` or `react-window`? → **`@tanstack/react-virtual` recommended.** It handles variable-height rows natively and is more actively maintained. Left as recommendation, not hard requirement.
- **Q5.** Should `SchemaTreeNode` be defined in FS-009's feature module or in shared domain types? → **Shared domain types (`ui/src/lib/types/domain.ts`).** It's a domain model consumed by FS-010–012. Parser implementation and tree-rendering-specific types (expanded state, virtual row metadata) stay in the feature module.
---

## Verification Strategy

- **Unit tests** for all three parsers (JSON Schema, XSD, inferred) covering acceptance examples AE-01, AE-02, AE-07, AE-08
- **Unit tests** for search/filter logic (AE-03)
- **Component tests** (React Testing Library) for:
  - Tree rendering and expand/collapse (AE-01, AE-02)
  - Mapping status indicators (AE-04)
  - Selection behavior (AE-09)
  - Keyboard navigation (AE-06)
  - Error/empty/loading states (AE-08)
  - Expand to depth N (AE-10)
- **Performance tests** (Vitest bench or manual profiling) for:
  - Parse time on 23,000-field schema < 3 seconds (AE-05)
  - Search latency on 23,000-field schema < 300ms (AE-03)
  - Virtualization: DOM node count stays bounded regardless of total tree size (AE-05)
- **Accessibility audit**: ARIA roles present, keyboard navigation functional, screen reader announces search results
- **TypeScript**: `tsc --noEmit` passes, zero lint errors
- **Build**: `pnpm build` succeeds

---

## Task Generation Notes

Decompose into the following task sequence:

1. **Types & parser contracts** (T-01) — Define `SchemaTreeNode`, `ParsedSchema`, `SchemaNodeType`, `MappingNodeStatus` in shared domain types (`ui/src/lib/types/domain.ts`). Define parser function signatures and tree-rendering-specific types in the feature module. Foundation for all other tasks. Agent: `ui-task`.
2. **JSON Schema parser** (T-02) — Implement `parseJsonSchema()`. Depends on T-01. Agent: `ui-task`.
3. **XSD parser** (T-03) — Implement `parseXsd()`. Depends on T-01. Agent: `ui-task`.
4. **Inferred schema parser** (T-04) — Implement `parseInferredSchema()`. Depends on T-01. Agent: `ui-task`.
5. **Core tree view component** (T-05) — Build `<SchemaTreeView />` with rendering, expand/collapse, type icons, depth guides, badges, tooltips, ARIA roles, and all states (loading/empty/error/populated). Depends on T-01. Agent: `ui-task`.
6. **Virtualized rendering** (T-06) — Add virtualization and lazy expansion for large schema performance. Depends on T-05. Agent: `ui-task`.
7. **Search/filter** (T-07) — Add search input with debounce, ancestor auto-expand, text highlighting, result count. Depends on T-05. Agent: `ui-task`.
8. **Selection, mapping status, and toolbar** (T-08) — Add node selection, target variant mapping indicators, expand-all/collapse-all/expand-to-depth toolbar. Depends on T-05. Agent: `ui-task`.
9. **Keyboard navigation and accessibility** (T-09) — Add full keyboard nav, focus management, screen reader announcements. Depends on T-05, T-06. Agent: `ui-task`.

T-02, T-03, T-04 can be parallelized (all depend only on T-01).
T-06, T-07, T-08 can be parallelized (all depend only on T-05).
T-09 depends on T-05 and T-06 (keyboard nav must work with virtualized list).

---

## Change Log

- Rev 2 — 2026-05-02
  - Resolved all open questions (Q1–Q5); moved raw answers into Resolved section
  - Q3: Simplified auto-expand to "always expand depth 0, never deeper"
  - Q4: `@tanstack/react-virtual` added as explicit recommendation in Constraints
  - Q5: `SchemaTreeNode` and `ParsedSchema` now defined in shared domain types (`ui/src/lib/types/domain.ts`), not feature module
  - Updated Assumptions with all resolved decisions
  - Updated Relevant Areas to reflect type location split
  - Updated Task Generation Notes (T-01) for type location
- Rev 1 — 2026-05-01
  - Initial draft
