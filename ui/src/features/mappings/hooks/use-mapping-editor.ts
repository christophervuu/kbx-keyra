import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useEngineValidation } from './use-engine-validation';
import type { EngineValidationState } from './use-engine-validation';

import { useAdapter } from '@/lib/api';
import type { MappingConfig, MappingRule, ParsedSchema, SchemaDetail } from '@/lib/types/domain';
import type { SaveStatus } from '../components/EditorTopBar';
import { parseJsonSchema, parseXsd } from '@/features/schemas';

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
  /** Reorder a rule from one index to another */
  reorderRules: (fromIndex: number, toIndex: number) => void;
  /** Delete multiple rules by indices (in descending order) */
  bulkDelete: (indices: number[]) => void;
  /** Duplicate rules at indices (append copies at end) */
  bulkDuplicate: (indices: number[]) => void;
  /** Paste rules from clipboard (append at end) */
  pasteRules: (rules: Array<Pick<MappingRule, 'target' | 'type' | 'expression' | 'description'>>) => void;
  /** Persist current state to adapter */
  save: () => void;
  /** Retry a failed load */
  retry: () => void;
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

  /** Parsed source schema for UI tree display */
  parsedSourceSchema: ParsedSchema | null;
  /** Parsed target schema for UI tree display */
  parsedTargetSchema: ParsedSchema | null;
  /** Whether both schemas were loaded successfully (for validation) */
  schemasLoaded: boolean;

  /** Current save status for EditorTopBar */
  saveStatus: SaveStatus;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Save error message (if save failed) */
  saveError: string | null;

  /** Validation state from engine */
  validation: EngineValidationState;

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Orchestrates loading, editing, and saving a MappingConfig.
 *
 * Responsibilities:
 * - Load mapping config and schemas from the API adapter on mount
 * - Maintain local rules state that can be mutated without immediate saves
 * - Track unsaved changes by comparing current rules to last-saved snapshot
 * - Save with version increment
 * - Wire engine validation with loaded schemas
 * - Handle Ctrl+S / Cmd+S keyboard shortcut
 * - Handle beforeunload warning for unsaved changes
 */
export function useMappingEditor(mappingId: string): UseMappingEditorResult {
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
  const [version, setVersion] = useState(1);

  // Save state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

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
      setVersion(mappingConfig.version);

      // Load schemas in parallel (graceful failure per AE-10)
      const [sourceResult, targetResult] = await Promise.allSettled([
        adapter.getSchema(mappingConfig.sourceSchemaRef.schemaId),
        adapter.getSchema(mappingConfig.targetSchemaRef.schemaId),
      ]);

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

  // Build a config object with current rules for validation
  const validationConfig = useMemo<MappingConfig | null>(() => {
    if (!config) return null;
    return { ...config, rules };
  }, [config, rules]);

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

  const hasUnsavedChanges = useMemo(() => {
    return !rulesEqual(rules, lastSavedRules);
  }, [rules, lastSavedRules]);

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
    const updatedConfig: MappingConfig = {
      ...config,
      version: newVersion,
      rules,
    };

    try {
      await adapter.updateMapping(mappingId, updatedConfig);
      if (!mountedRef.current) return;

      setConfig(updatedConfig);
      setLastSavedRules(rules);
      setVersion(newVersion);
      setSaveState('saved');
    } catch (err) {
      if (!mountedRef.current) return;
      setSaveError(err instanceof Error ? err.message : 'Save failed');
      setSaveState('error');
    } finally {
      saveInProgressRef.current = false;
    }
  }, [config, version, rules, hasUnsavedChanges, adapter, mappingId]);

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
  // Actions
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

  const retry = useCallback(() => {
    void loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Build actions object (stable reference)
  // ---------------------------------------------------------------------------

  const actions = useMemo<MappingEditorActions>(
    () => ({
      addRule,
      updateRule,
      deleteRule,
      reorderRules,
      bulkDelete,
      bulkDuplicate,
      pasteRules,
      save,
      retry,
    }),
    [addRule, updateRule, deleteRule, reorderRules, bulkDelete, bulkDuplicate, pasteRules, save, retry],
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
    parsedSourceSchema,
    parsedTargetSchema,
    schemasLoaded,
    saveStatus,
    hasUnsavedChanges,
    saveError,
    validation,
    actions,
  };
}
