import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  WorkspaceNoSourceDataCallout,
  WorkspaceSuggestionPreview,
} from './WorkspaceSuggestionPreview';

// ---------------------------------------------------------------------------
// Tests: WorkspaceSuggestionPreview
// ---------------------------------------------------------------------------

describe('WorkspaceSuggestionPreview', () => {
  it('renders no-data callout when sourceData is null', () => {
    render(
      <WorkspaceSuggestionPreview
        currentExpression="source.id"
        suggestedExpression="source.orderId"
        sourceData={null}
      />,
    );
    expect(screen.getByTestId('suggestion-preview-no-data')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-preview')).not.toBeInTheDocument();
  });

  it('renders preview panel when sourceData is provided', () => {
    render(
      <WorkspaceSuggestionPreview
        currentExpression="source.id"
        suggestedExpression="source.orderId"
        sourceData={{ id: 1, orderId: 'ORD-001' }}
      />,
    );
    expect(screen.getByTestId('suggestion-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('suggestion-preview-no-data')).not.toBeInTheDocument();
  });

  it('renders current and suggested output sections', () => {
    render(
      <WorkspaceSuggestionPreview
        currentExpression="source.id"
        suggestedExpression="source.orderId"
        sourceData={{ id: 1, orderId: 'ORD-001' }}
      />,
    );
    expect(screen.getByTestId('preview-current')).toBeInTheDocument();
    expect(screen.getByTestId('preview-suggested')).toBeInTheDocument();
  });

  it('shows "No current rule" when currentExpression is null', () => {
    render(
      <WorkspaceSuggestionPreview
        currentExpression={null}
        suggestedExpression="source.orderId"
        sourceData={{ orderId: 'ORD-001' }}
      />,
    );
    expect(screen.getByText('No current rule')).toBeInTheDocument();
  });

  it('shows "Current output:" and "Suggested output:" labels', () => {
    render(
      <WorkspaceSuggestionPreview
        currentExpression="source.id"
        suggestedExpression="source.orderId"
        sourceData={{ id: 1, orderId: 'ORD-001' }}
      />,
    );
    expect(screen.getByText('Current output:')).toBeInTheDocument();
    expect(screen.getByText('Suggested output:')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tests: WorkspaceNoSourceDataCallout
// ---------------------------------------------------------------------------

describe('WorkspaceNoSourceDataCallout', () => {
  it('renders the callout', () => {
    render(<WorkspaceNoSourceDataCallout />);
    expect(screen.getByTestId('workspace-no-source-data-callout')).toBeInTheDocument();
  });

  it('contains descriptive text about loading source data', () => {
    render(<WorkspaceNoSourceDataCallout />);
    expect(screen.getByText(/Load sample source data/)).toBeInTheDocument();
  });
});
