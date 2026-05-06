/**
 * BranchValueSelector tests — T-03
 *
 * Covers:
 *  - Renders Static / Field / Build expression kind buttons
 *  - Switching to "Build expression" renders InlinePipelineBuilder
 *  - Switching away from pipeline clears to static
 *  - Else-if button only shown when allowElseIf=true
 *  - Depth cap hides else-if button and shows message
 *  - onBranchChange fires with correct shape for each kind
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BranchValueSelector } from './BranchValueSelector';
import type { BranchValue } from '../lib/expression-builder-state';
import type { ParsedSchema } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SCHEMA: ParsedSchema = {
  format: 'json-schema',
  totalFieldCount: 2,
  parseTimeMs: 1,
  inferred: false,
  nodes: [
    { path: 'status', fieldName: 'status', type: 'string', depth: 0, isArray: false, isRequired: true, parentPath: null, childCount: 0, children: [] },
    { path: 'tier', fieldName: 'tier', type: 'string', depth: 0, isArray: false, isRequired: false, parentPath: null, childCount: 0, children: [] },
  ],
};

const STATIC_BRANCH: BranchValue = { kind: 'static', value: '' };
const SOURCE_BRANCH: BranchValue = { kind: 'source', value: 'status' };
const PIPELINE_BRANCH: BranchValue = {
  kind: 'pipeline',
  state: { mode: 'value', inputType: 'source', sources: [{ path: 'tier' }], transforms: [{ functionName: 'upper', parameters: [] }] },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BranchValueSelector', () => {
  it('renders Static, Field, Build expression buttons', () => {
    render(
      <BranchValueSelector
        branch={STATIC_BRANCH}
        onBranchChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
      />,
    );

    expect(screen.getByTestId('branch-kind-static')).toBeInTheDocument();
    expect(screen.getByTestId('branch-kind-source')).toBeInTheDocument();
    expect(screen.getByTestId('branch-kind-pipeline')).toBeInTheDocument();
  });

  it('does not render Else-if button when allowElseIf is false', () => {
    render(
      <BranchValueSelector
        branch={STATIC_BRANCH}
        onBranchChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
        allowElseIf={false}
      />,
    );

    expect(screen.queryByTestId('branch-kind-elseif')).not.toBeInTheDocument();
  });

  it('renders Else-if button when allowElseIf=true and depth < 5', () => {
    render(
      <BranchValueSelector
        branch={STATIC_BRANCH}
        onBranchChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
        allowElseIf
        elseIfDepth={0}
      />,
    );

    expect(screen.getByTestId('branch-kind-elseif')).toBeInTheDocument();
  });

  it('hides Else-if button and shows depth cap message at depth=5', () => {
    render(
      <BranchValueSelector
        branch={STATIC_BRANCH}
        onBranchChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
        allowElseIf
        elseIfDepth={5}
      />,
    );

    expect(screen.queryByTestId('branch-kind-elseif')).not.toBeInTheDocument();
    expect(screen.getByTestId('branch-depth-cap')).toBeInTheDocument();
  });

  it('clicking "Build expression" calls onBranchChange with kind=pipeline', async () => {
    const onChange = vi.fn();
    render(
      <BranchValueSelector
        branch={STATIC_BRANCH}
        onBranchChange={onChange}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
      />,
    );

    await userEvent.click(screen.getByTestId('branch-kind-pipeline'));

    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as BranchValue;
    expect(arg.kind).toBe('pipeline');
    if (arg.kind === 'pipeline') {
      expect(arg.state.mode).toBe('value');
    }
  });

  it('renders InlinePipelineBuilder when branch kind=pipeline', () => {
    render(
      <BranchValueSelector
        branch={PIPELINE_BRANCH}
        onBranchChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
      />,
    );

    expect(screen.getByTestId('branch-pipeline')).toBeInTheDocument();
  });

  it('clicking "Static" from pipeline calls onBranchChange with kind=static', async () => {
    const onChange = vi.fn();
    render(
      <BranchValueSelector
        branch={PIPELINE_BRANCH}
        onBranchChange={onChange}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
      />,
    );

    await userEvent.click(screen.getByTestId('branch-kind-static'));

    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as BranchValue;
    expect(arg.kind).toBe('static');
  });

  it('clicking "Field" from static calls onBranchChange with kind=source', async () => {
    const onChange = vi.fn();
    render(
      <BranchValueSelector
        branch={STATIC_BRANCH}
        onBranchChange={onChange}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
      />,
    );

    await userEvent.click(screen.getByTestId('branch-kind-source'));

    expect(onChange).toHaveBeenCalledOnce();
    const arg = onChange.mock.calls[0][0] as BranchValue;
    expect(arg.kind).toBe('source');
  });

  it('static input is visible and editable when kind=static', async () => {
    const onChange = vi.fn();
    render(
      <BranchValueSelector
        branch={STATIC_BRANCH}
        onBranchChange={onChange}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
      />,
    );

    const input = screen.getByTestId('branch-static-input');
    expect(input).toBeInTheDocument();
    await userEvent.type(input, 'hello');
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as BranchValue;
    expect(lastCall.kind).toBe('static');
    if (lastCall.kind === 'static') {
      expect(lastCall.value).toContain('hello');
    }
  });

  it('source input is visible when kind=source', () => {
    render(
      <BranchValueSelector
        branch={SOURCE_BRANCH}
        onBranchChange={vi.fn()}
        parsedSourceSchema={MOCK_SCHEMA}
        testIdPrefix="branch"
      />,
    );

    expect(screen.getByTestId('branch-source-input')).toBeInTheDocument();
  });
});
