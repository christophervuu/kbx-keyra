import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EnvironmentMetadataBar } from './EnvironmentMetadataBar';

import type { ComparisonSideMetadata } from '@/lib/types';


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLIENT_METADATA: ComparisonSideMetadata = {
  executionContext: 'client',
  configVersion: 5,
  engineVersion: '1.0.0',
};

const CLIENT_SAVED_METADATA: ComparisonSideMetadata = {
  executionContext: 'client',
  configVersion: 3,
  engineVersion: '1.0.0',
  savedAt: '2026-01-01T00:00:00Z',
};

const CLIENT_UNSAVED_METADATA: ComparisonSideMetadata = {
  executionContext: 'client',
  configVersion: 7,
  engineVersion: '1.0.0',
  hasUnsavedChanges: true,
};

const SERVER_DEV_METADATA: ComparisonSideMetadata = {
  executionContext: 'server',
  environment: 'DEV',
  configVersion: 2,
  deployedAt: '2026-01-01T00:00:00Z',
  sourceType: 'version',
  sourceNumber: 2,
  artifactId: 'artifact-dev-2',
  artifactHash: 'hash-dev-2',
  engineVersion: '1.0.0',
};

const SERVER_PREPROD_METADATA: ComparisonSideMetadata = {
  executionContext: 'server',
  environment: 'PREPROD',
  configVersion: 1,
  deployedAt: '2026-01-01T00:00:00Z',
  sourceType: 'revision',
  sourceNumber: 1,
  artifactId: 'artifact-preprod-1',
  artifactHash: 'hash-preprod-1',
  engineVersion: '1.0.0',
};

const SERVER_PROD_METADATA: ComparisonSideMetadata = {
  executionContext: 'server',
  environment: 'PROD',
  configVersion: 4,
  deployedAt: '2026-01-01T00:00:00Z',
  sourceType: 'version',
  sourceNumber: 4,
  artifactId: 'artifact-prod-4',
  artifactHash: 'hash-prod-4',
  engineVersion: '1.0.0',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EnvironmentMetadataBar', () => {
  it('renders the metadata bar container', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_METADATA} label="Current" />);
    expect(screen.getByTestId('metadata-bar')).toBeInTheDocument();
  });

  it('client-side: shows "Client-side" context badge', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_METADATA} label="Current" />);
    expect(screen.getByTestId('metadata-context').textContent).toBe('Client-side');
  });

  it('client-side: shows version as "v{configVersion}"', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_METADATA} label="Current" />);
    expect(screen.getByTestId('metadata-version').textContent).toBe('v5');
  });

  it('client-side: does not show deployment timestamp', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_METADATA} label="Current" />);
    expect(screen.queryByTestId('metadata-timestamp')).not.toBeInTheDocument();
  });

  it('client-side: does not show unsaved badge when hasUnsavedChanges is false/absent', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_METADATA} label="Current" />);
    expect(screen.queryByTestId('metadata-unsaved')).not.toBeInTheDocument();
  });

  it('client-side: shows unsaved badge when hasUnsavedChanges is true', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_UNSAVED_METADATA} label="Current" />);
    expect(screen.getByTestId('metadata-unsaved')).toBeInTheDocument();
    expect(screen.getByTestId('metadata-unsaved').textContent).toBe('unsaved');
  });

  it('client-side saved: shows savedAt timestamp', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_SAVED_METADATA} label="Saved" />);
    const timestamp = screen.getByTestId('metadata-timestamp');
    expect(timestamp).toBeInTheDocument();
    expect(timestamp.textContent).toContain('saved');
  });

  it('client-side saved: timestamp has ISO string as title tooltip', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_SAVED_METADATA} label="Saved" />);
    const timestamp = screen.getByTestId('metadata-timestamp');
    expect(timestamp).toHaveAttribute('title', '2026-01-01T00:00:00Z');
  });

  it('server DEV: shows "DEV" context badge', () => {
    render(<EnvironmentMetadataBar metadata={SERVER_DEV_METADATA} label="DEV" />);
    expect(screen.getByTestId('metadata-context').textContent).toBe('DEV');
  });

  it('server PREPROD: shows "PREPROD" context badge', () => {
    render(<EnvironmentMetadataBar metadata={SERVER_PREPROD_METADATA} label="PREPROD" />);
    expect(screen.getByTestId('metadata-context').textContent).toBe('PREPROD');
  });

  it('server PROD: shows "PROD" context badge', () => {
    render(<EnvironmentMetadataBar metadata={SERVER_PROD_METADATA} label="PROD" />);
    expect(screen.getByTestId('metadata-context').textContent).toBe('PROD');
  });

  it('server-side version source: shows "v{sourceNumber}"', () => {
    render(<EnvironmentMetadataBar metadata={SERVER_DEV_METADATA} label="DEV" />);
    expect(screen.getByTestId('metadata-version').textContent).toBe('v2');
  });

  it('server-side revision source: shows "Rev {sourceNumber}"', () => {
    render(<EnvironmentMetadataBar metadata={SERVER_PREPROD_METADATA} label="PREPROD" />);
    expect(screen.getByTestId('metadata-version').textContent).toBe('Rev 1');
  });

  it('server-side: shows deployment timestamp', () => {
    render(<EnvironmentMetadataBar metadata={SERVER_DEV_METADATA} label="DEV" />);
    expect(screen.getByTestId('metadata-timestamp')).toBeInTheDocument();
  });

  it('server-side: deployment timestamp has ISO string as title tooltip', () => {
    render(<EnvironmentMetadataBar metadata={SERVER_DEV_METADATA} label="DEV" />);
    expect(screen.getByTestId('metadata-timestamp')).toHaveAttribute('title', '2026-01-01T00:00:00Z');
  });

  it('shows engine version', () => {
    render(<EnvironmentMetadataBar metadata={CLIENT_METADATA} label="Current" />);
    expect(screen.getByTestId('metadata-engine').textContent).toContain('1.0.0');
  });
});
