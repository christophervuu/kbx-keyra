import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';

import { TestCaseManager } from './TestCaseManager';
import type { TestCaseManagerProps } from './TestCaseManager';
import type { TestCase } from '@/lib/types/domain';

// ---------------------------------------------------------------------------
// localStorage mock
// ---------------------------------------------------------------------------

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAPPING_ID = 'mapping-abc';
const STORAGE_KEY = `keyra:testcases:${MAPPING_ID}`;

function seedTestCases(cases: TestCase[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

function makeSavedCase(overrides: Partial<TestCase> = {}): TestCase {
  return {
    id: 'tc-001',
    name: 'basic test',
    sourceData: '{"x": 1}',
    expectedOutput: '{"y": 2}',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderManager(props: Partial<TestCaseManagerProps> = {}) {
  const defaultProps: TestCaseManagerProps = {
    mappingId: MAPPING_ID,
    sourceDataRaw: '{"x": 1}',
    expectedOutputRaw: null,
    onLoad: vi.fn(),
    ...props,
  };
  render(createElement(TestCaseManager, defaultProps));
  return defaultProps;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TestCaseManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ---- Initial render -----------------------------------------------------

  it('renders without crashing', () => {
    renderManager();
    expect(screen.getByTestId('test-case-manager')).toBeInTheDocument();
  });

  it('shows "No saved test cases" when list is empty', () => {
    renderManager();
    const select = screen.getByTestId('test-case-select') as HTMLSelectElement;
    expect(select.options[0].text).toBe('No saved test cases');
  });

  it('shows prompt option when test cases exist', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    const select = screen.getByTestId('test-case-select') as HTMLSelectElement;
    expect(select.options[0].text).toMatch(/select a test case/i);
  });

  it('lists saved test cases in dropdown', () => {
    seedTestCases([makeSavedCase(), makeSavedCase({ id: 'tc-002', name: 'second test' })]);
    renderManager();
    expect(screen.getByRole('option', { name: 'basic test' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'second test' })).toBeInTheDocument();
  });

  // ---- Load button --------------------------------------------------------

  it('Load button is disabled when no test case selected', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    expect(screen.getByTestId('load-test-case-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('selecting a test case enables the Load button', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    fireEvent.change(screen.getByTestId('test-case-select'), { target: { value: 'tc-001' } });
    expect(screen.getByTestId('load-test-case-button')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('clicking Load calls onLoad with the correct test case', () => {
    const tc = makeSavedCase();
    seedTestCases([tc]);
    const { onLoad } = renderManager();

    fireEvent.change(screen.getByTestId('test-case-select'), { target: { value: 'tc-001' } });
    fireEvent.click(screen.getByTestId('load-test-case-button'));

    expect(onLoad).toHaveBeenCalledWith(expect.objectContaining({ id: 'tc-001', name: 'basic test' }));
  });

  // ---- Delete button ------------------------------------------------------

  it('delete button not shown when no test case selected', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    expect(screen.queryByTestId('delete-test-case-button')).not.toBeInTheDocument();
  });

  it('delete button appears after selecting a test case', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    fireEvent.change(screen.getByTestId('test-case-select'), { target: { value: 'tc-001' } });
    expect(screen.getByTestId('delete-test-case-button')).toBeInTheDocument();
  });

  it('clicking delete removes the test case from the dropdown', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    fireEvent.change(screen.getByTestId('test-case-select'), { target: { value: 'tc-001' } });
    fireEvent.click(screen.getByTestId('delete-test-case-button'));

    expect(screen.queryByRole('option', { name: 'basic test' })).not.toBeInTheDocument();
  });

  it('deleting selected test case deselects it (hides delete button)', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    fireEvent.change(screen.getByTestId('test-case-select'), { target: { value: 'tc-001' } });
    fireEvent.click(screen.getByTestId('delete-test-case-button'));

    expect(screen.queryByTestId('delete-test-case-button')).not.toBeInTheDocument();
  });

  // ---- Save flow ----------------------------------------------------------

  it('Save button is present and not disabled when sourceDataRaw is set', () => {
    renderManager({ sourceDataRaw: '{"x": 1}' });
    expect(screen.getByTestId('save-test-case-button')).toBeInTheDocument();
    expect(screen.getByTestId('save-test-case-button')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('Save button is disabled when sourceDataRaw is null', () => {
    renderManager({ sourceDataRaw: null });
    expect(screen.getByTestId('save-test-case-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('clicking Save shows the inline name input', () => {
    renderManager();
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    expect(screen.getByTestId('save-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('save-confirm-button')).toBeInTheDocument();
    expect(screen.getByTestId('save-cancel-button')).toBeInTheDocument();
  });

  it('Confirm button is disabled while name is empty', () => {
    renderManager();
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    expect(screen.getByTestId('save-confirm-button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('saving with a name persists test case and closes form', () => {
    renderManager({ sourceDataRaw: '{"x": 1}' });
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    fireEvent.change(screen.getByTestId('save-name-input'), { target: { value: 'my test' } });
    fireEvent.click(screen.getByTestId('save-confirm-button'));

    expect(screen.queryByTestId('save-name-input')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'my test' })).toBeInTheDocument();
  });

  it('pressing Enter in the name input confirms the save', () => {
    renderManager({ sourceDataRaw: '{"x": 1}' });
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    fireEvent.change(screen.getByTestId('save-name-input'), { target: { value: 'enter test' } });
    fireEvent.keyDown(screen.getByTestId('save-name-input'), { key: 'Enter' });

    expect(screen.queryByTestId('save-name-input')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'enter test' })).toBeInTheDocument();
  });

  it('pressing Escape cancels the save', () => {
    renderManager();
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    fireEvent.keyDown(screen.getByTestId('save-name-input'), { key: 'Escape' });
    expect(screen.queryByTestId('save-name-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('save-test-case-button')).toBeInTheDocument();
  });

  it('clicking Cancel button closes the save form', () => {
    renderManager();
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    fireEvent.click(screen.getByTestId('save-cancel-button'));
    expect(screen.queryByTestId('save-name-input')).not.toBeInTheDocument();
  });

  it('save includes expectedOutputRaw when provided', () => {
    renderManager({ sourceDataRaw: '{"x": 1}', expectedOutputRaw: '{"y": 2}' });
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    fireEvent.change(screen.getByTestId('save-name-input'), { target: { value: 'with expected' } });
    fireEvent.click(screen.getByTestId('save-confirm-button'));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as TestCase[];
    expect(stored[0].expectedOutput).toBe('{"y": 2}');
  });

  it('quota error shown inline when storage write fails', () => {
    // Force storage to throw a QuotaExceededError
    const origSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
      throw err;
    };

    renderManager({ sourceDataRaw: '{"x": 1}' });
    fireEvent.click(screen.getByTestId('save-test-case-button'));
    fireEvent.change(screen.getByTestId('save-name-input'), { target: { value: 'quota test' } });
    fireEvent.click(screen.getByTestId('save-confirm-button'));

    expect(screen.getByTestId('save-error-message')).toBeInTheDocument();
    expect(screen.getByTestId('save-error-message')).toHaveAttribute('role', 'alert');

    localStorage.setItem = origSetItem;
  });

  // ---- Accessibility ------------------------------------------------------

  it('select has accessible label', () => {
    renderManager();
    expect(screen.getByRole('combobox', { name: 'Saved test cases' })).toBeInTheDocument();
  });

  it('delete button has aria-label', () => {
    seedTestCases([makeSavedCase()]);
    renderManager();
    fireEvent.change(screen.getByTestId('test-case-select'), { target: { value: 'tc-001' } });
    expect(screen.getByRole('button', { name: 'Delete selected test case' })).toBeInTheDocument();
  });
});
