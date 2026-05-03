import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfigurationPanel } from './ConfigurationPanel';
import { InheritanceIndicator } from './InheritanceIndicator';
import type { MappingConfigOptions } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// InheritanceIndicator Tests
// ---------------------------------------------------------------------------

describe('InheritanceIndicator', () => {
  it('shows "Custom" badge when isCustom is true', () => {
    render(<InheritanceIndicator isCustom={true} onReset={vi.fn()} />);
    expect(screen.getByTestId('inheritance-custom-badge')).toBeInTheDocument();
    expect(screen.getByTestId('inheritance-custom-badge')).toHaveTextContent('Custom');
  });

  it('shows "Using project default" text when isCustom is false', () => {
    render(<InheritanceIndicator isCustom={false} onReset={vi.fn()} />);
    expect(screen.getByTestId('inheritance-default-text')).toBeInTheDocument();
    expect(screen.getByTestId('inheritance-default-text')).toHaveTextContent('Using project default');
  });

  it('shows "Reset to project default" button when isCustom is true', () => {
    render(<InheritanceIndicator isCustom={true} onReset={vi.fn()} />);
    expect(screen.getByTestId('inheritance-reset-button')).toBeInTheDocument();
  });

  it('does not show reset button when isCustom is false', () => {
    render(<InheritanceIndicator isCustom={false} onReset={vi.fn()} />);
    expect(screen.queryByTestId('inheritance-reset-button')).not.toBeInTheDocument();
  });

  it('calls onReset when reset button is clicked', async () => {
    const onReset = vi.fn();
    render(<InheritanceIndicator isCustom={true} onReset={onReset} />);
    await userEvent.click(screen.getByTestId('inheritance-reset-button'));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// ConfigurationPanel Tests
// ---------------------------------------------------------------------------

describe('ConfigurationPanel', () => {
  const defaultProps = {
    configOptions: {} as MappingConfigOptions,
    onUpdateConfig: vi.fn(),
    parsedTargetSchema: null,
  };

  it('renders all 4 section headers', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByText('Unmapped Targets Strategy')).toBeInTheDocument();
    expect(screen.getByText('Null-out Subtrees')).toBeInTheDocument();
    expect(screen.getByText('Constants')).toBeInTheDocument();
    expect(screen.getByText('External Sources')).toBeInTheDocument();
  });

  it('renders "Configuration" panel header', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByText('Configuration')).toBeInTheDocument();
  });

  it('renders all 4 section containers', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByTestId('config-section-unmapped-targets')).toBeInTheDocument();
    expect(screen.getByTestId('config-section-null-subtrees')).toBeInTheDocument();
    expect(screen.getByTestId('config-section-constants')).toBeInTheDocument();
    expect(screen.getByTestId('config-section-external-sources')).toBeInTheDocument();
  });

  it('shows "Using project default" for all sections when configOptions is empty', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    const defaults = screen.getAllByTestId('inheritance-default-text');
    expect(defaults).toHaveLength(4);
  });

  it('shows "Custom" badge for unmappedTargets when it is set', () => {
    render(
      <ConfigurationPanel
        {...defaultProps}
        configOptions={{ unmappedTargets: 'error' }}
      />,
    );
    const badges = screen.getAllByTestId('inheritance-custom-badge');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Custom" badge for constants when constants are defined', () => {
    render(
      <ConfigurationPanel
        {...defaultProps}
        configOptions={{ constants: { KEY: 'val' } }}
      />,
    );
    expect(screen.getAllByTestId('inheritance-custom-badge')).toHaveLength(1);
  });

  it('"Reset to project default" for unmappedTargets calls onUpdateConfig with undefined', async () => {
    const onUpdateConfig = vi.fn();
    render(
      <ConfigurationPanel
        {...defaultProps}
        configOptions={{ unmappedTargets: 'omit' }}
        onUpdateConfig={onUpdateConfig}
      />,
    );
    const resetBtn = screen.getByTestId('inheritance-reset-button');
    await userEvent.click(resetBtn);
    expect(onUpdateConfig).toHaveBeenCalledWith({ unmappedTargets: undefined });
  });

  it('renders placeholder content when section slots are not provided', () => {
    render(<ConfigurationPanel {...defaultProps} />);
    expect(screen.getByTestId('section-placeholder-unmapped-targets')).toBeInTheDocument();
    expect(screen.getByTestId('section-placeholder-null-subtrees')).toBeInTheDocument();
    expect(screen.getByTestId('section-placeholder-constants')).toBeInTheDocument();
    expect(screen.getByTestId('section-placeholder-external-sources')).toBeInTheDocument();
  });

  it('renders custom slot content when provided', () => {
    render(
      <ConfigurationPanel
        {...defaultProps}
        unmappedTargetsContent={<div data-testid="custom-unmapped">Custom content</div>}
      />,
    );
    expect(screen.getByTestId('custom-unmapped')).toBeInTheDocument();
    expect(screen.queryByTestId('section-placeholder-unmapped-targets')).not.toBeInTheDocument();
  });

  it('panel body has overflow-y-auto for scrollability', () => {
    const { container } = render(<ConfigurationPanel {...defaultProps} />);
    const scrollable = container.querySelector('.overflow-y-auto');
    expect(scrollable).toBeInTheDocument();
  });
});
