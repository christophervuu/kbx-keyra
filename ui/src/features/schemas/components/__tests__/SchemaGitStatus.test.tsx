import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { GitHubSourceInfo, UploadSourceInfo } from '@/lib/types/domain';

import { SchemaGitStatus } from '../SchemaGitStatus';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GITHUB_SOURCE: GitHubSourceInfo = {
  type: 'github',
  repo: 'my-org/my-repo',
  branch: 'main',
  path: 'schemas/customer.json',
  commitSha: 'abc1234def567',
};

const UPLOAD_SOURCE: UploadSourceInfo = {
  type: 'upload',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SchemaGitStatus', () => {
  it('renders "local schema" message for upload source', () => {
    render(<SchemaGitStatus source={UPLOAD_SOURCE} origin="local" />);
    expect(screen.getByTestId('git-status-local-only')).toBeInTheDocument();
    expect(screen.getByText(/local schema.*not connected/i)).toBeInTheDocument();
  });

  it('renders all fields for a GitHub source', () => {
    render(
      <SchemaGitStatus
        source={GITHUB_SOURCE}
        origin="cdm"
        lastSyncedAt="2026-04-01T12:00:00Z"
      />,
    );
    expect(screen.getByTestId('git-status-repo')).toHaveTextContent('my-org/my-repo');
    expect(screen.getByTestId('git-status-branch')).toHaveTextContent('main');
    expect(screen.getByTestId('git-status-path')).toHaveTextContent('schemas/customer.json');
    // Commit SHA truncated to 7 chars
    expect(screen.getByTestId('git-status-commit')).toHaveTextContent('abc1234');
    expect(screen.getByTestId('git-status-last-synced')).toBeInTheDocument();
  });

  it('shows synced indicator for CDM schema with commitSha', () => {
    render(<SchemaGitStatus source={GITHUB_SOURCE} origin="cdm" />);
    expect(screen.getByTestId('git-status-indicator-synced')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('shows synced indicator for published schema with commitSha', () => {
    render(<SchemaGitStatus source={GITHUB_SOURCE} origin="published" />);
    expect(screen.getByTestId('git-status-indicator-synced')).toBeInTheDocument();
  });

  it('shows not-synced indicator for published schema without commitSha', () => {
    const sourceNoSha: GitHubSourceInfo = { ...GITHUB_SOURCE, commitSha: undefined };
    render(<SchemaGitStatus source={sourceNoSha} origin="published" />);
    expect(screen.getByTestId('git-status-indicator-not-synced')).toBeInTheDocument();
    expect(screen.getByText('Not synced')).toBeInTheDocument();
  });

  it('shows local-changes indicator when hasLocalChanges is true', () => {
    render(<SchemaGitStatus source={GITHUB_SOURCE} origin="cdm" hasLocalChanges />);
    expect(screen.getByTestId('git-status-indicator-local-changes')).toBeInTheDocument();
    expect(screen.getByText('Local changes')).toBeInTheDocument();
  });

  it('shows "—" for commit when commitSha is absent', () => {
    const sourceNoSha: GitHubSourceInfo = { ...GITHUB_SOURCE, commitSha: undefined };
    render(<SchemaGitStatus source={sourceNoSha} origin="published" />);
    expect(screen.getByTestId('git-status-commit')).toHaveTextContent('—');
  });

  it('does not render last-synced row when lastSyncedAt is not provided', () => {
    render(<SchemaGitStatus source={GITHUB_SOURCE} origin="cdm" />);
    expect(screen.queryByTestId('git-status-last-synced')).not.toBeInTheDocument();
  });

  it('has accessible section label', () => {
    render(<SchemaGitStatus source={GITHUB_SOURCE} origin="cdm" />);
    expect(screen.getByRole('region', { name: /repository status/i })).toBeInTheDocument();
  });
});
