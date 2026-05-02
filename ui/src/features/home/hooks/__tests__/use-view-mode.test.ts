import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { useViewMode } from '../use-view-mode';

describe('useViewMode', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to grid when localStorage is empty', () => {
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe('grid');
  });

  it('reads "grid" from localStorage on mount', () => {
    localStorage.setItem('keyra:dashboard:viewMode', 'grid');
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe('grid');
  });

  it('reads "table" from localStorage on mount', () => {
    localStorage.setItem('keyra:dashboard:viewMode', 'table');
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe('table');
  });

  it('defaults to grid when localStorage value is invalid', () => {
    localStorage.setItem('keyra:dashboard:viewMode', 'invalid');
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe('grid');
  });

  it('setViewMode updates state to table', () => {
    const { result } = renderHook(() => useViewMode());
    act(() => result.current.setViewMode('table'));
    expect(result.current.viewMode).toBe('table');
  });

  it('setViewMode persists to localStorage', () => {
    const { result } = renderHook(() => useViewMode());
    act(() => result.current.setViewMode('table'));
    expect(localStorage.getItem('keyra:dashboard:viewMode')).toBe('table');
  });

  it('setViewMode can switch back to grid', () => {
    localStorage.setItem('keyra:dashboard:viewMode', 'table');
    const { result } = renderHook(() => useViewMode());
    act(() => result.current.setViewMode('grid'));
    expect(result.current.viewMode).toBe('grid');
    expect(localStorage.getItem('keyra:dashboard:viewMode')).toBe('grid');
  });
});
