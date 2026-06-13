import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  SchemaSyncStatusBadge,
  getSchemaOriginLabel,
  normalizeSchemaSyncStatusForDisplay,
} from '../SchemaPresentationPrimitives';

describe('SchemaPresentationPrimitives', () => {
  it('returns canonical CDM origin label', () => {
    expect(getSchemaOriginLabel('cdm')).toBe('CDM');
  });

  it('returns canonical uploaded origin label for uploaded and legacy aliases', () => {
    expect(getSchemaOriginLabel('uploaded')).toBe('Uploaded');
    expect(getSchemaOriginLabel('published')).toBe('Uploaded');
    expect(getSchemaOriginLabel('local')).toBe('Uploaded');
  });

  it('returns inferred origin label', () => {
    expect(getSchemaOriginLabel('inferred')).toBe('Inferred');
  });

  it('normalizes legacy status values to sync-failed', () => {
    expect(normalizeSchemaSyncStatusForDisplay('not-synced')).toBe('sync-failed');
    expect(normalizeSchemaSyncStatusForDisplay('local-changes')).toBe('sync-failed');
  });

  it('renders synced badge with canonical symbol+label', () => {
    render(<SchemaSyncStatusBadge status="synced" dataTestIdPrefix="probe-status" />);
    expect(screen.getByTestId('probe-status-synced')).toHaveTextContent('✓');
    expect(screen.getByTestId('probe-status-synced')).toHaveTextContent('Synced');
  });

  it('renders update-available badge with canonical symbol+label', () => {
    render(<SchemaSyncStatusBadge status="update-available" dataTestIdPrefix="probe-status" />);
    expect(screen.getByTestId('probe-status-update-available')).toHaveTextContent('⚠');
    expect(screen.getByTestId('probe-status-update-available')).toHaveTextContent('Update available');
  });

  it('maps legacy input to sync-failed badge output', () => {
    render(<SchemaSyncStatusBadge status="not-synced" dataTestIdPrefix="probe-status" />);
    expect(screen.getByTestId('probe-status-sync-failed')).toHaveTextContent('⚠');
    expect(screen.getByTestId('probe-status-sync-failed')).toHaveTextContent('Sync failed');
  });
});
