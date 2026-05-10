import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useEngineValidation } from './use-engine-validation';
import type { EngineValidationState } from './use-engine-validation';

import { useAdapter } from '@/lib/api';
import type { MappingConfig, MappingConfigOptions, MappingRule, MappingVersionEntry, ParsedSchema, SchemaDetail } from '@/lib/types/domain';
import type { SaveStatus } from '../components/EditorTopBar';
import { parseInferredSchema, parseJsonSchema, parseXsd } from '@/features/schemas';
import type { UnsavedChangeSummary } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EditorLoadState = 'loading' | 'loaded' | 'error';

export interface MappingEditorActions {
  /** Add a new rule at the end */
  addRule: (rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
  /** Update an existing rule at index */
  updateRule: (index: number, rule: Pick<MappingRule, 'target' | 'expression' | 'description'>) => void;
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

  /** Persist current state to adapter */
  save: () => void;
  /** Retry a failed load */
  retry: () => void;
  /**
   * Returns whether the editor can navigate away without data loss.
   * `reason` is null when navigation is safe.
   */
  canNavigateAway: () => { allowed: boolean; reason: 'unsaved' | null };
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
  /** Parsed target schema for UI tree display */
  parsedTargetSchema: ParsedSchema | null;
  /** Whether both schemas were loaded successfully (for validation) */
  schemasLoaded: boolean;

  /** Current save status for EditorTopBar */
  saveStatus: SaveStatus;
  /** Whether there are unsaved changes (rules differ from last save, or draftRules non-empty) */
  hasUnsavedChanges: boolean;
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
        result.push({ target: targetPath, type: 'string', expression });
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
export function useMappingEditor(mappingId: string, onRuleApplied?: () => void): UseMappingEditorResult {
  const adapter = useAdapter();

  // Load states
  const [loadState, setLoadState] = useState<EditorLoadState>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  // Loaded data
  const [config, setConfig] = useState<MappingConfig | null>(null);
  const [sourceSchema, setSourceSchema] = useState<SchemaDetail | null>(null);
  const [targetSchema, setTargetSchema] = useState<SchemaDetail | null>(null);

  // Local editing state
  const [rules, setRules] = useState<readonly MappingRule[]>([]);
  const [lastSavedRules, setLastSavedRules] = useState<readonly MappingRule[]>([]);
  const [configOptions, setConfigOptions] = useState<MappingConfigOptions>({});
  const [lastSavedConfigOptions, setLastSavedConfigOptions] = useState<MappingConfigOptions>({});
  const [version, setVersion] = useState(1);

  // FS-039 draft rules map — per-field in-session draft accumulator
  // Keys: target paths, Values: draft DSL expressions (empty = delete on save)
  const [draftRules, setDraftRules] = useState<Map<string, string>>(new Map());

  // Save state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

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

      setConfig(mappingConfig);
      setRules(mappingConfig.rules);
      setLastSavedRules(mappingConfig.rules);
      setConfigOptions(mappingConfig.config);
      setLastSavedConfigOptions(mappingConfig.config);
      setVersion(mappingConfig.version);
      // Clear any stale drafts on reload
      setDraftRules(new Map());

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

      if (sourceResult.status === 'fulfilled') {
        setSourceSchema(sourceResult.value);
      }
      if (targetResult.status === 'fulfilled') {
        setTargetSchema(targetResult.value);
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

  const schemasLoaded = sourceSchema !== null && targetSchema !== null;

  // ---------------------------------------------------------------------------
  // Engine validation (raw schema content for engine, not ParsedSchema)
  // ---------------------------------------------------------------------------

  // Build a config object with current rules and config options for validation.
  // When draftRules are present, merge them into the rules for live validation.
  const validationConfig = useMemo<MappingConfig | null>(() => {
    if (!config) return null;
    const effectiveRules = draftRules.size > 0
      ? mergeDraftsIntoRules(rules, draftRules)
      : rules;
    return { ...config, rules: effectiveRules, config: configOptions };
  }, [config, rules, draftRules, configOptions]);

  const sourceSchemaContent = sourceSchema?.content ?? null;
  const targetSchemaContent = targetSchema?.content ?? null;

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

  const save = useCallback(async () => {
    if (!config || saveInProgressRef.current || !hasUnsavedChanges) return;

    saveInProgressRef.current = true;
    setSaveState('saving');
    setSaveError(null);

    const newVersion = version + 1;

    // Merge draftRules into the current rules array before saving
    const mergedRules = draftRules.size > 0
      ? mergeDraftsIntoRules(rules, draftRules)
      : [...rules];

    const updatedConfig: MappingConfig = {
      ...config,
      version: newVersion,
      rules: mergedRules,
      config: configOptions,
    };

    try {
      await adapter.updateMapping(mappingId, updatedConfig);
      if (!mountedRef.current) return;

      setConfig(updatedConfig);
      setRules(mergedRules);
      setLastSavedRules(mergedRules);
      setLastSavedConfigOptions(configOptions);
      setVersion(newVersion);
      setSaveState('saved');
      // Clear all drafts — they've been committed to saved rules
      setDraftRules(new Map());

      // Fire-and-forget version snapshot (AE-01)
      const versionEntry: MappingVersionEntry = {
        version: newVersion,
        savedAt: new Date().toISOString(),
        savedBy: 'You',
        ruleCount: updatedConfig.rules.length,
        config: updatedConfig,
      };
      adapter.saveMappingVersion(mappingId, versionEntry).catch((err) => {
        console.warn('Failed to save version history entry:', err);
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');
    } finally {
      saveInProgressRef.current = false;
    }
  }, [config, version, rules, draftRules, configOptions, hasUnsavedChanges, adapter, mappingId]);

  // Keep ref up to date for keyboard handler
  saveRef.current = save;

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
      setSaveState('saved');
      // Clear drafts — restore replaces all state
      setDraftRules(new Map());

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
  }, [config, version, adapter, mappingId]);

  const retry = useCallback(() => {
    void loadData();
  }, [loadData]);

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
      retry,
      canNavigateAway,
    }),
    [
      addRule, updateRule, deleteRule, deleteRuleByTarget, reorderRules,
      bulkDelete, bulkDuplicate, pasteRules, updateConfig, restore,
      updateDraft, commitDraft, revertDraft, revertAllDrafts, getDraftExpression,
      getUnsavedChangeSummary, applyRule, save, retry, canNavigateAway,
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
    sourceSchemaName,
    targetSchemaName,
    rules,
    savedRules: lastSavedRules,
    configOptions,
    config: validationConfig,
    sourceSchemaDetail: sourceSchema,
    targetSchemaDetail: targetSchema,
    parsedSourceSchema,
    parsedTargetSchema,
    schemasLoaded,
    saveStatus,
    hasUnsavedChanges,
    unsavedChangeCount,
    unsavedRuleCount: unsavedChangeCount, // deprecated alias
    saveError,
    validation,
    draftRules,
    actions,
  };
}
