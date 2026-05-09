/**
 * Categorized mismatch types for structural JSON diff.
 *
 * FS-035 T-01: replaces the coarse `added | removed | changed` union with
 * six specific categories that tell the user *why* a field mismatched.
 */
export type DiffChangeType =
  | 'missing_field'       // path exists in expected, absent in actual
  | 'extra_field'         // path exists in actual, absent in expected
  | 'value_mismatch'      // same path, same JS type, different value
  | 'type_mismatch'       // same path, different JS types (e.g. string vs number)
  | 'null_mismatch'       // same path, one side is null and the other is not
  | 'structural_mismatch'; // same path, object/array vs primitive (or array vs object)

export interface DiffEntry {
  readonly path: string;
  readonly type: DiffChangeType;
  readonly actual?: unknown;
  readonly expected?: unknown;
  /** JS type label for the actual value — populated for type/null/structural mismatches */
  readonly actualType?: string;
  /** JS type label for the expected value — populated for type/null/structural mismatches */
  readonly expectedType?: string;
}

/**
 * Per-category mismatch counts derived from a DiffResult.
 */
export interface DiffSummary {
  readonly total: number;
  readonly byCategory: Record<DiffChangeType, number>;
}

export interface DiffResult {
  readonly entries: readonly DiffEntry[];
  readonly isEqual: boolean;
  readonly summary: DiffSummary;
}
