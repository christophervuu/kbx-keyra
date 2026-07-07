import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SchemaUpgradeStrip } from './SchemaUpgradeStrip';

describe('SchemaUpgradeStrip', () => {
  it('renders pin metadata and canonical status labels', () => {
    render(
      <SchemaUpgradeStrip
        targets={[
          {
            key: 'source',
            role: 'source',
            label: 'Source schema',
            currentPin: {
              schemaId: 'schema-orders',
              schemaVersion: 2,
              schemaVersionId: 'sv-2',
              contentHash: 'hash-2',
            },
            destinationPin: {
              schemaId: 'schema-orders',
              schemaVersion: 3,
              schemaVersionId: 'sv-3',
              contentHash: 'hash-3',
            },
            status: 'Update available',
          },
        ]}
        onReviewUpdate={vi.fn()}
        onToggleSuggestion={vi.fn()}
        onApplyUpgrade={vi.fn()}
        onRefreshPreview={vi.fn()}
      />,
    );

    expect(screen.getByTestId('schema-upgrade-status-source')).toHaveTextContent('Update available');
    expect(screen.getByTestId('schema-upgrade-pin-source')).toHaveTextContent('Pinned: schema-orders · v2');
    expect(screen.getByTestId('schema-upgrade-destination-source')).toHaveTextContent('Latest: schema-orders · v3');
  });

  it('requires suggestion decisions before enabling Apply upgrade', () => {
    const onToggleSuggestion = vi.fn();
    render(
      <SchemaUpgradeStrip
        targets={[
          {
            key: 'source',
            role: 'source',
            label: 'Source schema',
            currentPin: {
              schemaId: 'schema-orders',
              schemaVersion: 2,
              schemaVersionId: 'sv-2',
              contentHash: 'hash-2',
            },
            destinationPin: {
              schemaId: 'schema-orders',
              schemaVersion: 3,
              schemaVersionId: 'sv-3',
              contentHash: 'hash-3',
            },
            status: 'Review required',
            upgradeState: {
              status: 'preview-ready',
              acceptedSuggestionIds: new Set(),
              preview: {
                previewId: 'preview-1',
                mappingId: 'm-1',
                baseMappingRevision: 7,
                role: 'source',
                from: {
                  schemaId: 'schema-orders',
                  schemaVersion: 2,
                  schemaVersionId: 'sv-2',
                  contentHash: 'hash-2',
                },
                to: {
                  schemaId: 'schema-orders',
                  schemaVersion: 3,
                  schemaVersionId: 'sv-3',
                  contentHash: 'hash-3',
                },
                impact: {
                  role: 'source',
                  breakingCount: 1,
                  nonBreakingCount: 2,
                  affectedRules: [],
                },
                diff: {
                  added: [],
                  removed: [],
                  renamed: [],
                  moved: [],
                },
                suggestions: [
                  {
                    suggestionId: 's-1',
                    type: 'rename',
                    fromPath: 'order.total',
                    toPath: 'order.grandTotal',
                  },
                ],
                warnings: [],
              },
            },
          },
        ]}
        onReviewUpdate={vi.fn()}
        onToggleSuggestion={onToggleSuggestion}
        onApplyUpgrade={vi.fn()}
        onRefreshPreview={vi.fn()}
      />,
    );

    expect(screen.getByTestId('schema-upgrade-apply-source')).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleSuggestion).toHaveBeenCalledWith('source', 's-1');
    expect(screen.getByTestId('schema-upgrade-suggestions-required-source')).toBeInTheDocument();
  });

  it('enables Apply upgrade after all suggestions are selected and emits apply callback', () => {
    const onApplyUpgrade = vi.fn();
    render(
      <SchemaUpgradeStrip
        targets={[
          {
            key: 'source',
            role: 'source',
            label: 'Source schema',
            currentPin: {
              schemaId: 'schema-orders',
              schemaVersion: 2,
              schemaVersionId: 'sv-2',
              contentHash: 'hash-2',
            },
            destinationPin: {
              schemaId: 'schema-orders',
              schemaVersion: 3,
              schemaVersionId: 'sv-3',
              contentHash: 'hash-3',
            },
            status: 'Review required',
            upgradeState: {
              status: 'preview-ready',
              acceptedSuggestionIds: new Set(['s-1']),
              preview: {
                previewId: 'preview-1',
                mappingId: 'm-1',
                baseMappingRevision: 7,
                role: 'source',
                from: {
                  schemaId: 'schema-orders',
                  schemaVersion: 2,
                  schemaVersionId: 'sv-2',
                  contentHash: 'hash-2',
                },
                to: {
                  schemaId: 'schema-orders',
                  schemaVersion: 3,
                  schemaVersionId: 'sv-3',
                  contentHash: 'hash-3',
                },
                impact: {
                  role: 'source',
                  breakingCount: 1,
                  nonBreakingCount: 2,
                  affectedRules: [],
                },
                diff: {
                  added: [],
                  removed: [],
                  renamed: [],
                  moved: [],
                },
                suggestions: [
                  {
                    suggestionId: 's-1',
                    type: 'rename',
                    fromPath: 'order.total',
                    toPath: 'order.grandTotal',
                  },
                ],
                warnings: [],
              },
            },
          },
        ]}
        onReviewUpdate={vi.fn()}
        onToggleSuggestion={vi.fn()}
        onApplyUpgrade={onApplyUpgrade}
        onRefreshPreview={vi.fn()}
      />,
    );

    const applyButton = screen.getByTestId('schema-upgrade-apply-source');
    expect(applyButton).not.toBeDisabled();
    fireEvent.click(applyButton);
    expect(onApplyUpgrade).toHaveBeenCalledWith('source');
  });
});
