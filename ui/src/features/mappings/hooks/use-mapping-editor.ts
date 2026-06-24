import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAiValidation } from './use-ai-validation';
import type { AiValidationState } from './use-ai-validation';
import { useEngineValidation } from './use-engine-validation';
import type { EngineValidationState } from './use-engine-validation';
import type { SaveStatus } from '../components/EditorTopBar';
import type { UnsavedChangeSummary } from '../types';

import { parseInferredSchema, parseJsonSchema, parseXsd, treeToJsonSchema } from '@/features/schemas';
import { useAdapter } from '@/lib/api';
import type { MappingConfig, MappingConfigOptions, MappingRule, MappingVersionEntry, ParsedSchema, SchemaDetail } from '@/lib/types/domain';
import type { ValidationSampleDataInput } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Draft types
// ---------------------------------------------------------------------------

/**
 * State of any autosaved local draft found in localStorage on editor load.
 *
 * - `none` — no draft was found (or it was already accepted/discarded)
 * - `same-revision` — draft was saved against the same revision the server currently has;
 *   prompt "Restore draft" / "Discard draft"
 * - `stale-revision` — draft was saved against an older revision; server has newer changes;
 *   prompt with context per FS-063 Q5
 */
export type DraftRestoreState =
  | { status: 'none' }
  | { status: 'same-revision'; draft: MappingConfig }
  | { status: 'stale-revision'; draft: MappingConfig; serverRevision: number };

/** Shape stored in localStorage under `keyra:draft:{mappingId}` */
interface StoredDraft {
  config: MappingConfig;
  baseRevision: number;
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorLoadState = 'loading' | 'loaded' | 'error';

export interface MappingEditorActions {
  /** Add a new rule at the end */
  addRule: (rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
  /** Update an existing rule at index */
  updateRule: (index: number, rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
  /** Update an existing rule by target path (or append if missing). */
  updateRuleByTarget: (targetPath: string, patch: Partial<MappingRule>) => void;
  /** Delete a rule by index */
  deleteRule: (index: number) => void;
  /** Delete the rule for a given target path (T-08) */
  deleteRuleByTarget: (targetPath: string) => void;
  /** Reorder a rule from one index to another */
  reorderRules: (fromIndex: number, toIndex: number) => void;
  /** Delete multiple rules by indices (in descending order) */
  bulkDelete: (indices: number[]) => void;
  /** Duplicate rules at indices (append copies at end) */
  bulkDuplicate: (indices: number[]) => void;
  /** Paste rules from clipboard (append at end) */
  pasteRules: (rules: Array<Pick<MappingRule, 'target' | 'type' | 'expression' | 'description'>>) => void;
  /** Merge partial config options into local state */
  updateConfig: (partial: Partial<MappingConfigOptions>) => void;
  /** Restore a previous version config — replaces working state and immediately saves */
  restore: (restoreConfig: MappingConfig) => void;

  // -------------------------------------------------------------------------
  // FS-039 draft rules API
  // -------------------------------------------------------------------------

  /**
   * Store a draft expression for a target field.
   * Does NOT write to saved rules — call save() to commit all drafts.
   * An empty string expression means "delete this rule on save".
   */
  updateDraft: (targetPath: string, expression: string) => void;

  /**
   * Called on field navigation to persist the current draft for a field.
   * Equivalent to updateDraft — provided as a semantic alias for call sites
   * that want to express "I'm navigating away from this field".
   */
  commitDraft: (targetPath: string, expression: string) => void;

  /**
   * Remove the draft entry for a target field, reverting it to its saved state.
   * If no draft exists, this is a no-op.
   */
  revertDraft: (targetPath: string) => void;

  /**
   * Clear all draft entries, reverting all fields to their saved state.
   */
  revertAllDrafts: () => void;

  /**
   * Returns the draft expression for a target field, or null if no draft exists.
   */
  getDraftExpression: (targetPath: string) => string | null;

  /**
   * Returns a list of fields with unsaved draft changes, including the change type.
   */
  getUnsavedChangeSummary: () => UnsavedChangeSummary[];

  /**
   * Apply a rule expression to the in-memory working session.
   *
   * @deprecated Use updateDraft() instead. Kept as a thin wrapper for backward
   *   compatibility during the FS-039 migration. Will be removed when T-05 completes.
   *
   * Upserts the draft for `targetPath` and fires the `onRuleApplied` callback
   * (used by auto-preview in T-05). Does NOT call `adapter.updateMapping()`.
   */
  applyRule: (targetPath: string, expression: string) => void;

  /** Persist current state to adapter. Returns noChange=true when nothing was saved. */
  save: () => Promise<{ noChange: boolean } | undefined>;
  /**
   * Create a new version milestone from the latest revision.
   * If there are unsaved changes, saves first (implicit revision), then creates the version.
   * Shows success toast "Version {N} created from Revision {R}".
   */
  createVersion: () => Promise<void>;
  /**
   * Accept the local draft found on load: replace editor state with the draft content.
   * Clears the draft restore prompt. Does not auto-save.
   */
  acceptDraftRestore: () => void;
  /**
   * Discard the local draft found on load: remove it from localStorage and clear the prompt.
   */
  discardDraftRestore: () => void;
  /** Retry a failed load */
  retry: () => void;
  /**
   * Returns whether the editor can navigate away without data loss.
   * `reason` is null when navigation is safe.
   */
  canNavigateAway: () => { allowed: boolean; reason: 'unsaved' | null };

  /** Toggle external save blocking (e.g., unresolved incomplete Smart Builder drafts). */
  setSaveBlocked: (blocked: boolean) => void;
  /** Trigger AI validation for the current mapping (manual-only). */
  runAiValidation: (options?: { sampleData?: ValidationSampleDataInput }) => void;
  /** Retry the last AI validation request for the current mapping. */
  retryAiValidation: () => void;
  /** Reset AI validation state for the current mapping. */
  resetAiValidation: () => void;
}

export interface UseMappingEditorResult {
  /** Whether data is loading, loaded, or failed */
  loadState: EditorLoadState;
  /** Error message when loadState is 'error' */
  loadError: string | null;

  /** Mapping display name */
  mappingName: string;
  /** Current version number */
  version: number;
  /** Source schema display name */
  sourceSchemaName: string | null;
  /** Target schema display name */
  targetSchemaName: string | null;

  /** Current rules array (local, mutable) */
  rules: readonly MappingRule[];

  /** Current config options (local, mutable — potentially unsaved) */
  configOptions: MappingConfigOptions;

  /**
   * Current mapping config with live (potentially unsaved) rules applied.
   * Suitable for passing to engine execution or validation hooks.
   * Null while the mapping is still loading.
   */
  config: MappingConfig | null;

  /** Raw source schema detail (content + metadata). Null until loaded. */
  sourceSchemaDetail: SchemaDetail | null;
  /** Raw target schema detail (content + metadata). Null until loaded. */
  targetSchemaDetail: SchemaDetail | null;

  /** Parsed source schema for UI tree display */
  parsedSourceSchema: ParsedSchema | null;
  /** Parsed enrichment schemas keyed by enrichment alias for input browsing/building. */
  enrichmentInputSchemas: readonly { alias: string; parsedSchema: ParsedSchema | null }[];
  /** Parsed target schema for UI tree display */
  parsedTargetSchema: ParsedSchema | null;
  /** Whether both schemas were loaded successfully (for validation) */
  schemasLoaded: boolean;

  /** Current save status for EditorTopBar */
  saveStatus: SaveStatus;
  /** Whether there are unsaved changes (rules differ from last save, or draftRules non-empty) */
  hasUnsavedChanges: boolean;
  /**
   * Whether saving would create a new revision (i.e. there are changes to persist).
   * False when the editor state matches the last saved revision — Save button should be disabled.
   */
  canSave: boolean;
  /**
   * The current server revision number for this mapping.
   * Updated after each successful save.
   */
  currentRevision: number;
  /**
   * The latest version (milestone) number for this mapping, or null if no version has been created.
   * Updated after a successful createVersion() call.
   */
  currentVersion: number | null;
  /**
   * Whether there is a local autosaved draft in localStorage for this mapping.
   * True from when autosave writes a draft until the draft is cleared (on save or discard).
   */
  hasDraft: boolean;
  /**
   * State of any local draft found in localStorage when the editor loaded.
   * Use this to render a restore/discard prompt.
   */
  draftRestoreState: DraftRestoreState;
  /**
   * Number of fields with draft changes that differ from their saved state.
   * Resets to 0 on successful save.
   */
  unsavedChangeCount: number;
  /**
   * @deprecated Use unsavedChangeCount instead.
   * Kept for backward compatibility during FS-039 migration.
   */
  unsavedRuleCount: number;
  /** Save error message (if save failed) */
  saveError: string | null;

  /** Validation state from engine */
  validation: EngineValidationState;

  /** AI validation lifecycle/report state (advisory, independent from engine validation). */
  aiValidation: AiValidationState;

  /**
   * The current draft rules map (read-only snapshot).
   * Keys are target paths, values are draft DSL expressions.
   * An empty string value means "delete this rule on save".
   */
  draftRules: ReadonlyMap<string, string>;

  /** Actions to mutate editor state */
  actions: MappingEditorActions;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simple deep equality for rule arrays using JSON serialization.
 * Acceptable for Phase 0 with up to ~500 rules.
 */
function rulesEqual(a: readonly MappingRule[], b: readonly MappingRule[]): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Simple deep equality for config options using JSON serialization.
 * Acceptable for Phase 0 with small config objects.
 */
function configOptionsEqual(a: MappingConfigOptions, b: MappingConfigOptions): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Move an element within an array from one index to another.
 * Returns a new array. (avoids importing dnd-kit in this hook)
 */
function moveItem<T>(array: readonly T[], from: number, to: number): T[] {
  const result = [...array];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

/**
 * Try parsing a schema's content into a ParsedSchema for tree display.
 * Returns null if parsing fails (graceful degradation per AE-10).
 */
function tryParseSchema(schema: SchemaDetail): ParsedSchema | null {
  try {
    if (schema.metadata.inferred) {
      const contentStr =
        typeof schema.content === 'string' ? schema.content : JSON.stringify(schema.content);
      const inferredFormat = schema.metadata.format === 'xsd' ? 'xml' : 'json';
      return parseInferredSchema(contentStr, inferredFormat);
    }

    if (schema.metadata.format === 'json-schema') {
      return parseJsonSchema(schema.content);
    }
    if (schema.metadata.format === 'xsd') {
      return parseXsd(schema.content as string);
    }
    return null;
  } catch {
    return null;
  }
}

function collectJsonSchemaTypes(
  schema: unknown,
  pathPrefix: string,
  map: Map<string, MappingRule['type']>,
): void {
  if (!schema || typeof schema !== 'object') return;
  const node = schema as Record<string, unknown>;
  const properties = node.properties;
  if (!properties || typeof properties !== 'object') return;

  for (const [field, child] of Object.entries(properties as Record<string, unknown>)) {
    const path = pathPrefix ? `${pathPrefix}.${field}` : field;
    if (child && typeof child === 'object') {
      const childNode = child as Record<string, unknown>;
      const rawType = typeof childNode.type === 'string' ? childNode.type : null;
      const normalizedType: MappingRule['type'] =
        rawType === 'integer'
          ? 'number'
          : rawType === 'string'
            || rawType === 'number'
            || rawType === 'boolean'
            || rawType === 'object'
            || rawType === 'array'
            || rawType === 'null'
            || rawType === 'any'
              ? rawType
              : 'string';
      map.set(path, normalizedType);
      collectJsonSchemaTypes(child, path, map);
    }
  }
}

function normalizeSchemaNodeType(type: string | null): MappingRule['type'] {
  if (type === 'integer') return 'number';
  if (
    type === 'string'
    || type === 'number'
    || type === 'boolean'
    || type === 'object'
    || type === 'array'
    || type === 'null'
    || type === 'any'
  ) {
    return type;
  }
  return 'string';
}

function buildTargetTypeByPathFromSchema(
  parsedTargetSchema: ParsedSchema | null,
  targetSchema: SchemaDetail | null,
): ReadonlyMap<string, MappingRule['type']> {
  const map = new Map<string, MappingRule['type']>();

  for (const node of parsedTargetSchema?.nodes ?? []) {
    map.set(node.path, normalizeSchemaNodeType(node.type));
  }

  if (targetSchema?.metadata.format === 'json-schema') {
    collectJsonSchemaTypes(targetSchema.content, '', map);
  }

  return map;
}

function normalizeRuleTypesByTargetSchema(
  rules: readonly MappingRule[],
  targetTypeByPath: ReadonlyMap<string, MappingRule['type']>,
): readonly MappingRule[] {
  let changed = false;
  const normalized = rules.map((rule) => {
    const targetType = targetTypeByPath.get(rule.target);
    if (!targetType || rule.type === targetType) return rule;
    changed = true;
    return {
      ...rule,
      type: targetType,
    };
  });

  return changed ? normalized : rules;
}

/**
 * Converts schema detail content to an engine-compatible schema payload for
 * validation. Inferred schemas store sample payload text as content; for engine
 * validation we must validate against the parsed inferred tree reconstructed as
 * JSON Schema.
 */
function getValidationSchemaContent(
  schema: SchemaDetail | null,
  parsedSchema: ParsedSchema | null,
): unknown | null {
  if (schema === null) {
    return null;
  }

  if (schema.metadata.inferred === true) {
    if (parsedSchema === null) {
      return null;
    }

    return treeToJsonSchema(parsedSchema.nodes);
  }

  return schema.content;
}

/**
 * Merges draftRules into a saved rules array.
 *
 * For each draft entry:
 *   - Empty expression → delete the rule for that target path
 *   - Non-empty expression → upsert (update existing or append new)
 *
 * Returns a new rules array with all drafts applied.
 */
function mergeDraftsIntoRules(
  savedRules: readonly MappingRule[],
  draftRules: ReadonlyMap<string, string>,
  targetTypeByPath?: ReadonlyMap<string, MappingRule['type']>,
): MappingRule[] {
  // Start with a mutable copy of saved rules
  let result: MappingRule[] = [...savedRules];

  for (const [targetPath, expression] of draftRules) {
    if (expression === '') {
      // Empty expression = delete this rule
      result = result.filter((r) => r.target !== targetPath);
    } else {
      const idx = result.findIndex((r) => r.target === targetPath);
      if (idx >= 0) {
        // Update existing rule
        result[idx] = { ...result[idx]!, expression };
      } else {
        // Append new rule
        result.push({
          target: targetPath,
          type: targetTypeByPath?.get(targetPath) ?? 'string',
          expression,
        });
      }
    }
  }

  return result;
}

/**
 * Determines whether a draft entry differs from the saved state.
 *
 * A draft entry is "changed" if:
 *   - The expression differs from the saved rule's expression, OR
 *   - There is no saved rule for this target (it's a new addition), OR
 *   - The expression is empty (it's a deletion of an existing rule)
 */
function isDraftChanged(
  targetPath: string,
  draftExpression: string,
  savedRules: readonly MappingRule[],
): boolean {
  const savedRule = savedRules.find((r) => r.target === targetPath);
  if (savedRule === undefined) {
    // New rule — changed if expression is non-empty
    return draftExpression !== '';
  }
  // Existing rule — changed if expression differs
  return savedRule.expression !== draftExpression;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates loading, editing, and saving a MappingConfig.
 *
 * Responsibilities:
 * - Load mapping config and schemas from the API adapter on mount
 * - Maintain local rules state that can be mutated without immediate saves
 * - Maintain draftRules map for per-field in-session draft accumulation (FS-039)
 * - Track unsaved changes by comparing current rules/drafts to last-saved snapshot
 * - Save with version increment — merges draftRules into saved rules on save
 * - Wire engine validation with loaded schemas
 * - Handle Ctrl+S / Cmd+S keyboard shortcut
 * - Handle beforeunload warning for unsaved changes
 *
 * @param mappingId - The mapping to load and edit
 * @param onRuleApplied - Optional callback fired after each successful applyRule call
 *   (used by the inline preview strip in T-05 for auto-run behavior)
 */
export function useMappingEditor(
  mappingId: string,
  onRuleApplied?: () => void,
): UseMappingEditorResult {
  const adapter = useAdapter();
  const {
    state: aiValidationState,
    run: runAiValidationInternal,
    retry: retryAiValidationInternal,
    reset: resetAiValidationInternal,
  } = useAiValidation();

  // Load states
  const [loadState, setLoadState] = useState<EditorLoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Loaded data
  const [config, setConfig] = useState<MappingConfig | null>(null);
  const [sourceSchema, setSourceSchema] = useState<SchemaDetail | null>(null);
  const [targetSchema, setTargetSchema] = useState<SchemaDetail | null>(null);
  const [enrichmentSchemasByAlias, setEnrichmentSchemasByAlias] = useState<Record<string, SchemaDetail | null>>({});

  // Local editing state
  const [rules, setRules] = useState<readonly MappingRule[]>([]);
  const [lastSavedRules, setLastSavedRules] = useState<readonly MappingRule[]>([]);
  const [configOptions, setConfigOptions] = useState<MappingConfigOptions>({});
  const [lastSavedConfigOptions, setLastSavedConfigOptions] = useState<MappingConfigOptions>({});
  const [version, setVersion] = useState(1);

  // FS-039 draft rules map — per-field in-session draft accumulator
  // Keys: target paths, Values: draft DSL expressions (empty = delete on save)
  const [draftRules, setDraftRules] = useState<Map<string, string>>(new Map());

  // FS-063 revision / version tracking
  const [currentRevision, setCurrentRevision] = useState(0);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestoreState, setDraftRestoreState] = useState<DraftRestoreState>({ status: 'none' });

  // localStorage key helpers
  const draftKey = `keyra:draft:${mappingId}`;

  // Save state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaveBlocked, setIsSaveBlocked] = useState(false);

  // Keep onRuleApplied callback in a ref so applyRule doesn't need it as a dep
  const onRuleAppliedRef = useRef<(() => void) | undefined>(onRuleApplied);
  useEffect(() => {
    onRuleAppliedRef.current = onRuleApplied;
  });

  // Ref to prevent concurrent saves
  const saveInProgressRef = useRef(false);
  const mountedRef = useRef(true);

  // ---------------------------------------------------------------------------
  // Load mapping config and schemas on mount
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoadState('loading');
    setLoadError(null);

    try {
      const mappingConfig = await adapter.getMapping(mappingId);

      if (!mountedRef.current) return;

      // Check for a local autosaved draft (FS-063 Q4/Q5)
      try {
        const storedDraftRaw = localStorage.getItem(`keyra:draft:${mappingId}`);
        if (storedDraftRaw) {
          const stored = JSON.parse(storedDraftRaw) as StoredDraft;
          setHasDraft(true);
          if (stored.baseRevision >= mappingConfig.version) {
            setDraftRestoreState({ status: 'same-revision', draft: stored.config });
          } else {
            setDraftRestoreState({
              status: 'stale-revision',
              draft: stored.config,
              serverRevision: mappingConfig.version,
            });
          }
        } else {
          setHasDraft(false);
          setDraftRestoreState({ status: 'none' });
        }
      } catch {
        // If draft parsing fails, ignore silently
        setHasDraft(false);
        setDraftRestoreState({ status: 'none' });
      }

      // Load schemas in parallel (graceful failure per AE-10)
      // Explicitly skip getSchema() when schemaRef is undefined (schema-optional mappings)
      const schemaPromises = [
        mappingConfig.sourceSchemaRef
          ? adapter.getSchema(mappingConfig.sourceSchemaRef.schemaId)
          : Promise.reject('no source schema'),
        mappingConfig.targetSchemaRef
          ? adapter.getSchema(mappingConfig.targetSchemaRef.schemaId)
          : Promise.reject('no target schema'),
      ];
      const [sourceResult, targetResult] = await Promise.allSettled(schemaPromises);

      if (!mountedRef.current) return;

      const resolvedSourceSchema = sourceResult.status === 'fulfilled'
        ? sourceResult.value
        : null;
      const resolvedTargetSchema = targetResult.status === 'fulfilled'
        ? targetResult.value
        : null;
      const normalizedRules = normalizeRuleTypesByTargetSchema(
        mappingConfig.rules,
        buildTargetTypeByPathFromSchema(
          resolvedTargetSchema ? tryParseSchema(resolvedTargetSchema) : null,
          resolvedTargetSchema,
        ),
      );
      const normalizedConfig: MappingConfig = normalizedRules === mappingConfig.rules
        ? mappingConfig
        : {
          ...mappingConfig,
          rules: normalizedRules,
        };

      setConfig(normalizedConfig);
      setRules(normalizedRules);
      setLastSavedRules(normalizedRules);
      setConfigOptions(normalizedConfig.config);
      setLastSavedConfigOptions(normalizedConfig.config);
      setVersion(normalizedConfig.version);
      setCurrentRevision(normalizedConfig.version);
      // Clear any stale drafts on reload
      setDraftRules(new Map());
      setEnrichmentSchemasByAlias({});

      setSourceSchema(resolvedSourceSchema);
      setTargetSchema(resolvedTargetSchema);

      // Load enrichment schemas for alias-scoped input browsing (best-effort).
      const enrichmentDefs = mappingConfig.enrichmentSources ?? [];
      const enrichmentSchemaPromises = enrichmentDefs
        .filter((entry) => typeof entry.schemaId === 'string' && entry.schemaId.trim().length > 0)
        .map(async (entry) => {
          const schema = await adapter.getSchema(entry.schemaId!);
          return { alias: entry.alias, schema };
        });

      if (enrichmentSchemaPromises.length > 0) {
        const enrichmentResults = await Promise.allSettled(enrichmentSchemaPromises);
        if (!mountedRef.current) return;

        const next: Record<string, SchemaDetail | null> = {};
        for (const entry of enrichmentDefs) {
          next[entry.alias] = null;
        }
        for (const result of enrichmentResults) {
          if (result.status === 'fulfilled') {
            next[result.value.alias] = result.value.schema;
          }
        }
        setEnrichmentSchemasByAlias(next);
      }

      setLoadState('loaded');
    } catch (err) {
      if (!mountedRef.current) return;
      setLoadState('error');
      setLoadError(err instanceof Error ? err.message : 'Failed to load mapping');
    }
  }, [adapter, mappingId]);

  useEffect(() => {
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadData intentionally kicks off async request lifecycle on mount
    void loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Parsed schemas for UI tree display (memoized)
  // ---------------------------------------------------------------------------

  const parsedSourceSchema = useMemo<ParsedSchema | null>(() => {
    if (!sourceSchema) return null;
    return tryParseSchema(sourceSchema);
  }, [sourceSchema]);

  const parsedTargetSchema = useMemo<ParsedSchema | null>(() => {
    if (!targetSchema) return null;
    return tryParseSchema(targetSchema);
  }, [targetSchema]);

  const targetTypeByPath = useMemo<ReadonlyMap<string, MappingRule['type']>>(() => {
    return buildTargetTypeByPathFromSchema(parsedTargetSchema, targetSchema);
  }, [parsedTargetSchema, targetSchema]);

  const enrichmentInputSchemas = useMemo(() => {
    if (config === null) return [] as { alias: string; parsedSchema: ParsedSchema | null }[];

    const canonical = config.enrichmentSources ?? [];
    const compatibilityAliases = config.config.externalSources ?? [];
    const aliasOrder = [...new Set([
      ...canonical.map((entry) => entry.alias),
      ...compatibilityAliases,
    ])];

    return aliasOrder.map((alias) => {
      const detail = enrichmentSchemasByAlias[alias] ?? null;
      return {
        alias,
        parsedSchema: detail ? tryParseSchema(detail) : null,
      };
    });
  }, [config, enrichmentSchemasByAlias]);

  const schemasLoaded = sourceSchema !== null && targetSchema !== null;

  // ---------------------------------------------------------------------------
  // Engine validation (raw schema content for engine, not ParsedSchema)
  // ---------------------------------------------------------------------------

  // Build a config object with current rules and config options for validation.
  // When draftRules are present, merge them into the rules for live validation.
  const validationConfig = useMemo<MappingConfig | null>(() => {
    if (!config) return null;
    const effectiveRules = draftRules.size > 0
      ? mergeDraftsIntoRules(rules, draftRules, targetTypeByPath)
      : rules;
    return { ...config, rules: effectiveRules, config: configOptions };
  }, [config, rules, draftRules, configOptions, targetTypeByPath]);

  const sourceSchemaContent = useMemo(
    () => getValidationSchemaContent(sourceSchema, parsedSourceSchema),
    [sourceSchema, parsedSourceSchema],
  );
  const targetSchemaContent = useMemo(
    () => getValidationSchemaContent(targetSchema, parsedTargetSchema),
    [targetSchema, parsedTargetSchema],
  );

  const validation = useEngineValidation(
    validationConfig,
    sourceSchemaContent,
    targetSchemaContent,
  );

  // ---------------------------------------------------------------------------
  // Unsaved changes detection
  // ---------------------------------------------------------------------------

  /**
   * Count of draft entries that differ from their saved state.
   * A draft entry is "changed" if it differs from the saved rule expression,
   * or if it's a new addition (no saved rule), or if it's a deletion (empty expr).
   */
  const unsavedChangeCount = useMemo(() => {
    let count = 0;
    for (const [targetPath, expression] of draftRules) {
      if (isDraftChanged(targetPath, expression, lastSavedRules)) {
        count++;
      }
    }
    return count;
  }, [draftRules, lastSavedRules]);

  const hasUnsavedChanges = useMemo(() => {
    // Draft rules that differ from saved state
    if (unsavedChangeCount > 0) return true;
    // Direct rule mutations (addRule, updateRule, deleteRule, etc.)
    if (!rulesEqual(rules, lastSavedRules)) return true;
    // Config option changes
    if (!configOptionsEqual(configOptions, lastSavedConfigOptions)) return true;
    return false;
  }, [unsavedChangeCount, rules, lastSavedRules, configOptions, lastSavedConfigOptions]);

  // ---------------------------------------------------------------------------
  // Autosave draft to localStorage (FS-063 AE-06)
  // Debounce 5 s after any change; clears on successful save.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (loadState !== 'loaded' || !hasUnsavedChanges || !config) return;

    const timer = setTimeout(() => {
      const effectiveRules =
        draftRules.size > 0 ? mergeDraftsIntoRules(rules, draftRules, targetTypeByPath) : [...rules];
      const draftConfig: MappingConfig = { ...config, rules: effectiveRules, config: configOptions };
      const stored: StoredDraft = {
        config: draftConfig,
        baseRevision: currentRevision,
        savedAt: new Date().toISOString(),
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(stored));
        setHasDraft(true);
      } catch {
        // localStorage full or unavailable — ignore silently
      }
    }, 5000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally exclude config from dep list; trigger on rule/option changes
  }, [rules, draftRules, configOptions, hasUnsavedChanges, loadState, currentRevision, draftKey, targetTypeByPath]);

  // ---------------------------------------------------------------------------
  // Save status derivation
  // ---------------------------------------------------------------------------

  const saveStatus = useMemo<SaveStatus>(() => {
    if (saveState === 'saving') return 'saving';
    if (saveState === 'error') return 'error';
    if (hasUnsavedChanges) return 'unsaved';
    return 'saved';
  }, [saveState, hasUnsavedChanges]);

  // ---------------------------------------------------------------------------
  // beforeunload handler
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Modern browsers ignore the return value but still show the dialog
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // ---------------------------------------------------------------------------
  // Ctrl+S / Cmd+S keyboard shortcut
  // ---------------------------------------------------------------------------

  const saveRef = useRef<() => void>(() => {});

  const save = useCallback(async (): Promise<{ noChange: boolean } | undefined> => {
    if (!config || saveInProgressRef.current || !hasUnsavedChanges || isSaveBlocked) return undefined;

    saveInProgressRef.current = true;
    setSaveState('saving');
    setSaveError(null);

    // Snapshot before optimistic application so failed saves can rollback.
    const snapshot = {
      config,
      rules,
      version,
      currentRevision,
      draftRules,
    };

    // Merge draftRules into the current rules array before saving
    const mergedRules = draftRules.size > 0
      ? mergeDraftsIntoRules(rules, draftRules, targetTypeByPath)
      : [...rules];

    const updatedConfig: MappingConfig = {
      ...config,
      // Backend expects expectedRevision to be the current persisted revision.
      // Version/currentRevision are advanced only after a successful save response.
      version: currentRevision,
      rules: mergedRules,
      config: configOptions,
    };

    // Optimistically reflect the pending save immediately.
    setConfig(updatedConfig);
    setRules(mergedRules);

    try {
      const saveResult = await adapter.saveMapping(mappingId, updatedConfig);
      if (!mountedRef.current) return undefined;

      const finalRevision = saveResult.revision;
      const persistedConfig: MappingConfig = {
        ...updatedConfig,
        version: finalRevision,
      };

      setConfig(persistedConfig);
      setCurrentRevision(finalRevision);
      setVersion(finalRevision);
      setLastSavedRules(mergedRules);
      setLastSavedConfigOptions(configOptions);
      setSaveState('saved');
      // Clear all drafts — they've been committed to saved rules
      setDraftRules(new Map());
      // Clear localStorage draft
      try {
        localStorage.removeItem(draftKey);
        setHasDraft(false);
      } catch {
        // ignore
      }

      if (!saveResult.noChange) {
        // Fire-and-forget version snapshot (backward compat — AE-01)
        const versionEntry: MappingVersionEntry = {
          version: finalRevision,
          savedAt: new Date().toISOString(),
          savedBy: 'You',
          ruleCount: persistedConfig.rules.length,
          config: persistedConfig,
        };
        adapter.saveMappingVersion(mappingId, versionEntry).catch((err) => {
          console.warn('Failed to save version history entry:', err);
        });
      }

      return { noChange: saveResult.noChange };
    } catch (err) {
      if (!mountedRef.current) return undefined;

      // Rollback optimistic state to exact pre-save snapshot.
      setConfig(snapshot.config);
      setRules(snapshot.rules);
      setVersion(snapshot.version);
      setCurrentRevision(snapshot.currentRevision);
      // Preserve in-session draft work on failure.
      setDraftRules(snapshot.draftRules);

      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');

      return undefined;
    } finally {
      saveInProgressRef.current = false;
    }
  }, [config, version, currentRevision, rules, draftRules, configOptions, hasUnsavedChanges, isSaveBlocked, adapter, mappingId, draftKey, targetTypeByPath]);

  // Keep ref up to date for keyboard handler
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // createVersion (FS-063 AE-03, AE-04)
  // ---------------------------------------------------------------------------

  const createVersion = useCallback(async (): Promise<void> => {
    if (!config) return;

    // Implicit save if unsaved changes exist (AE-04)
    if (hasUnsavedChanges) {
      const saveResult = await save();
      if (!mountedRef.current) return;
      // If save didn't return a result (i.e. it failed or was a no-op with no changes), abort
      if (saveResult === undefined) return;
    }

    try {
      const versionResult = await adapter.createVersion(mappingId);
      if (!mountedRef.current) return;
      setCurrentVersion(versionResult.version);
    } catch (err) {
      if (!mountedRef.current) return;
      console.warn('Failed to create version:', err);
    }
  }, [config, hasUnsavedChanges, save, adapter, mappingId]);

  // ---------------------------------------------------------------------------
  // Draft restore actions (FS-063 Q4/Q5)
  // ---------------------------------------------------------------------------

  const acceptDraftRestore = useCallback(() => {
    if (draftRestoreState.status === 'none') return;
    const { draft } = draftRestoreState;
    setRules(draft.rules);
    setConfigOptions(draft.config ?? {});
    setDraftRestoreState({ status: 'none' });
    setSaveState('idle');
  }, [draftRestoreState]);

  const discardDraftRestore = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
      setHasDraft(false);
    } catch {
      // ignore
    }
    setDraftRestoreState({ status: 'none' });
  }, [draftKey]);

  // ---------------------------------------------------------------------------
  // Actions — rule mutations
  // ---------------------------------------------------------------------------

  const addRule = useCallback((rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => {
    const newRule: MappingRule = {
      target: rule.target,
      type: 'string', // Default type for new rules in Phase 0
      expression: rule.expression,
      description: rule.description,
    };
    setRules((prev) => [...prev, newRule]);
    // Reset save state if it was 'saved' or 'error'
    setSaveState('idle');
  }, []);

  const updateRule = useCallback(
    (index: number, rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => {
      setRules((prev) => {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          target: rule.target,
          expression: rule.expression,
          description: rule.description,
        };
        return updated;
      });
      setSaveState('idle');
    },
    [],
  );

  const updateRuleByTarget = useCallback((targetPath: string, patch: Partial<MappingRule>) => {
    setRules((prev) => {
      const existingIndex = prev.findIndex((rule) => rule.target === targetPath);
      if (existingIndex >= 0) {
        const next = [...prev];
        const current = next[existingIndex]!;
        next[existingIndex] = {
          ...current,
          ...patch,
          target: targetPath,
        };
        return next;
      }

      const appended: MappingRule = {
        target: targetPath,
        type: patch.type ?? 'string',
        expression: patch.expression ?? '',
        description: patch.description,
        ...(patch.valueTableRef ? { valueTableRef: patch.valueTableRef } : {}),
        ...(patch.noMatchBehavior ? { noMatchBehavior: patch.noMatchBehavior } : {}),
      };
      return [...prev, appended];
    });
    setSaveState('idle');
  }, []);

  const deleteRule = useCallback((index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
    setSaveState('idle');
  }, []);

  const deleteRuleByTarget = useCallback((targetPath: string) => {
    setRules((prev) => prev.filter((r) => r.target !== targetPath));
    setSaveState('idle');
  }, []);

  const reorderRules = useCallback((fromIndex: number, toIndex: number) => {
    setRules((prev) => moveItem(prev, fromIndex, toIndex));
    setSaveState('idle');
  }, []);

  const bulkDelete = useCallback((indices: number[]) => {
    const indexSet = new Set(indices);
    setRules((prev) => prev.filter((_, i) => !indexSet.has(i)));
    setSaveState('idle');
  }, []);

  const bulkDuplicate = useCallback((indices: number[]) => {
    setRules((prev) => {
      const copies = indices.map((i) => ({ ...prev[i] }));
      return [...prev, ...copies];
    });
    setSaveState('idle');
  }, []);

  const pasteRules = useCallback(
    (pasted: Array<Pick<MappingRule, 'target' | 'type' | 'expression' | 'description'>>) => {
      const newRules: MappingRule[] = pasted.map((r) => ({
        target: r.target,
        type: r.type ?? 'string',
        expression: r.expression,
        description: r.description,
      }));
      setRules((prev) => [...prev, ...newRules]);
      setSaveState('idle');
    },
    [],
  );

  const updateConfig = useCallback((partial: Partial<MappingConfigOptions>) => {
    setConfigOptions((prev) => ({ ...prev, ...partial }));
    setSaveState('idle');
  }, []);

  const restore = useCallback(async (restoreConfig: MappingConfig) => {
    if (!config || saveInProgressRef.current) return;

    saveInProgressRef.current = true;
    setSaveState('saving');
    setSaveError(null);

    const newVersion = version + 1;
    const fullConfig: MappingConfig = {
      ...restoreConfig,
      id: config.id,
      projectId: config.projectId,
      version: newVersion,
    };

    try {
      await adapter.updateMapping(mappingId, fullConfig);
      if (!mountedRef.current) return;

      setConfig(fullConfig);
      setRules(fullConfig.rules);
      setLastSavedRules(fullConfig.rules);
      setConfigOptions(fullConfig.config);
      setLastSavedConfigOptions(fullConfig.config);
      setVersion(newVersion);
      setCurrentRevision(newVersion);
      setSaveState('saved');
      // Clear drafts — restore replaces all state
      setDraftRules(new Map());
      try {
        localStorage.removeItem(draftKey);
        setHasDraft(false);
      } catch {
        // ignore
      }

      // Fire-and-forget version snapshot
      const versionEntry: MappingVersionEntry = {
        version: newVersion,
        savedAt: new Date().toISOString(),
        savedBy: 'You',
        ruleCount: fullConfig.rules.length,
        config: fullConfig,
      };
      adapter.saveMappingVersion(mappingId, versionEntry).catch((err) => {
        console.warn('Failed to save version history entry:', err);
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setSaveError(err instanceof Error ? err.message : 'Restore failed');
      setSaveState('error');
    } finally {
      saveInProgressRef.current = false;
    }
  }, [config, version, adapter, mappingId, draftKey]);

  const retry = useCallback(() => {
    void loadData();
  }, [loadData]);

  const setSaveBlocked = useCallback((blocked: boolean) => {
    setIsSaveBlocked(blocked);
  }, []);

  const runAiValidation = useCallback(
    (options?: { sampleData?: ValidationSampleDataInput }) => {
      runAiValidationInternal({
        mappingId,
        sampleData: options?.sampleData,
      });
    },
    [mappingId, runAiValidationInternal],
  );

  const retryAiValidation = useCallback(() => {
    retryAiValidationInternal();
  }, [retryAiValidationInternal]);

  const resetAiValidation = useCallback(() => {
    resetAiValidationInternal();
  }, [resetAiValidationInternal]);

  useEffect(() => {
    resetAiValidationInternal();
  }, [mappingId, resetAiValidationInternal]);

  // ---------------------------------------------------------------------------
  // Actions — FS-039 draft rules API
  // ---------------------------------------------------------------------------

  /**
   * Store a draft expression for a target field.
   * An empty string means "delete this rule on save".
   */
  const updateDraft = useCallback((targetPath: string, expression: string) => {
    setDraftRules((prev) => {
      const next = new Map(prev);
      next.set(targetPath, expression);
      return next;
    });
    setSaveState('idle');
  }, []);

  /**
   * Semantic alias for updateDraft — called on field navigation.
   */
  const commitDraft = useCallback((targetPath: string, expression: string) => {
    updateDraft(targetPath, expression);
  }, [updateDraft]);

  /**
   * Remove the draft entry for a target field, reverting to saved state.
   */
  const revertDraft = useCallback((targetPath: string) => {
    setDraftRules((prev) => {
      if (!prev.has(targetPath)) return prev;
      const next = new Map(prev);
      next.delete(targetPath);
      return next;
    });
  }, []);

  /**
   * Clear all draft entries, reverting all fields to their saved state.
   */
  const revertAllDrafts = useCallback(() => {
    setDraftRules(new Map());
  }, []);

  /**
   * Returns the draft expression for a target field, or null if no draft exists.
   */
  const getDraftExpression = useCallback(
    (targetPath: string): string | null => {
      return draftRules.get(targetPath) ?? null;
    },
    [draftRules],
  );

  /**
   * Returns a list of fields with unsaved draft changes.
   */
  const getUnsavedChangeSummary = useCallback((): UnsavedChangeSummary[] => {
    const summary: UnsavedChangeSummary[] = [];
    for (const [targetPath, draftExpression] of draftRules) {
      if (!isDraftChanged(targetPath, draftExpression, lastSavedRules)) continue;
      const savedRule = lastSavedRules.find((r) => r.target === targetPath);
      let changeType: UnsavedChangeSummary['changeType'];
      if (savedRule === undefined) {
        changeType = 'added';
      } else if (draftExpression === '') {
        changeType = 'removed';
      } else {
        changeType = 'modified';
      }
      summary.push({
        targetPath,
        changeType,
        savedExpression: savedRule?.expression ?? null,
        draftExpression,
      });
    }
    return summary;
  }, [draftRules, lastSavedRules]);

  // ---------------------------------------------------------------------------
  // applyRule — deprecated wrapper around updateDraft (backward compat)
  // ---------------------------------------------------------------------------

  /**
   * @deprecated Use updateDraft() instead.
   *
   * Upserts the draft for `targetPath` and fires the `onRuleApplied` callback.
   * Skips if the draft expression is unchanged from the current draft.
   */
  const applyRule = useCallback(
    (targetPath: string, expression: string) => {
      // Skip if draft is already set to this expression
      const currentDraft = draftRules.get(targetPath);
      if (currentDraft === expression) return;

      // Also skip if no draft exists and the saved rule already has this expression
      if (currentDraft === undefined) {
        const savedRule = lastSavedRules.find((r) => r.target === targetPath);
        if (savedRule?.expression === expression) return;
      }

      updateDraft(targetPath, expression);
      // Fire auto-preview callback (T-05)
      onRuleAppliedRef.current?.();
    },
    [draftRules, lastSavedRules, updateDraft],
  );

  // ---------------------------------------------------------------------------
  // canNavigateAway — used by route-level blocker
  // ---------------------------------------------------------------------------

  const canNavigateAway = useCallback((): { allowed: boolean; reason: 'unsaved' | null } => {
    if (hasUnsavedChanges) {
      return { allowed: false, reason: 'unsaved' };
    }
    return { allowed: true, reason: null };
  }, [hasUnsavedChanges]);

  // ---------------------------------------------------------------------------
  // Build actions object (stable reference)
  // ---------------------------------------------------------------------------

  const actions = useMemo<MappingEditorActions>(
    () => ({
      addRule,
      updateRule,
      updateRuleByTarget,
      deleteRule,
      deleteRuleByTarget,
      reorderRules,
      bulkDelete,
      bulkDuplicate,
      pasteRules,
      updateConfig,
      restore,
      updateDraft,
      commitDraft,
      revertDraft,
      revertAllDrafts,
      getDraftExpression,
      getUnsavedChangeSummary,
      applyRule,
      save,
      createVersion,
      acceptDraftRestore,
      discardDraftRestore,
      retry,
      canNavigateAway,
      setSaveBlocked,
      runAiValidation,
      retryAiValidation,
      resetAiValidation,
    }),
    [
      addRule, updateRule, updateRuleByTarget, deleteRule, deleteRuleByTarget, reorderRules,
      bulkDelete, bulkDuplicate, pasteRules, updateConfig, restore,
      updateDraft, commitDraft, revertDraft, revertAllDrafts, getDraftExpression,
      getUnsavedChangeSummary, applyRule, save, createVersion, acceptDraftRestore,
      discardDraftRestore, retry, canNavigateAway,
      setSaveBlocked, runAiValidation, retryAiValidation, resetAiValidation,
    ],
  );

  // ---------------------------------------------------------------------------
  // Metadata helpers
  // ---------------------------------------------------------------------------

  const mappingName = config?.name ?? 'Untitled Mapping';
  const sourceSchemaName = sourceSchema?.metadata?.name ?? null;
  const targetSchemaName = targetSchema?.metadata?.name ?? null;

  return {
    loadState,
    loadError,
    mappingName,
    version,
    currentRevision,
    currentVersion,
    sourceSchemaName,
    targetSchemaName,
    rules,
    savedRules: lastSavedRules,
    configOptions,
    config: validationConfig,
    sourceSchemaDetail: sourceSchema,
    targetSchemaDetail: targetSchema,
    parsedSourceSchema,
    enrichmentInputSchemas,
    parsedTargetSchema,
    schemasLoaded,
    saveStatus,
    hasUnsavedChanges,
    canSave: hasUnsavedChanges && !isSaveBlocked,
    hasDraft,
    draftRestoreState,
    unsavedChangeCount,
    unsavedRuleCount: unsavedChangeCount, // deprecated alias
    saveError,
    validation,
    aiValidation: aiValidationState,
    draftRules,
    actions,
  };
}
