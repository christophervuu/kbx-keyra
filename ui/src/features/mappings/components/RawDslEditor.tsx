import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { findMatchingBracket, tokenizeDsl } from '../lib/dsl-tokenizer';
import type { DslToken, DslTokenType } from '../lib/dsl-tokenizer';
import type { ErrorDecoration } from '../hooks/use-dsl-validation';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import { ErrorTooltip } from './ErrorTooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawDslEditorRef {
  /** Insert text at the current cursor position and move cursor after inserted text */
  insertText: (text: string) => void;
  /** Focus the textarea */
  focus: () => void;
}

/**
 * Minimal autocomplete state interface consumed by RawDslEditor.
 * Satisfied by the return value of `useDslAutocomplete()`.
 */
export interface AutocompleteState {
  readonly isOpen: boolean;
  readonly suggestions: import('@/lib/data/dsl-functions').AutocompleteItem[];
  readonly selectedIndex: number;
  /** Explicitly open the dropdown (called on Ctrl+Space) */
  readonly open: () => void;
  /** Close the dropdown */
  readonly close: () => void;
  /** Move selection to next item */
  readonly selectNext: () => void;
  /** Move selection to previous item */
  readonly selectPrev: () => void;
  /**
   * Confirm the currently selected item.
   * Returns the range+text to insert, or null if nothing to confirm.
   */
  readonly confirm: () => { insertText: string; insertStart: number; insertEnd: number } | null;
}

export interface RawDslEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCursorChange?: (position: number) => void;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly className?: string;
  /**
   * Optional autocomplete state produced by `useDslAutocomplete()`.
   * When provided, the editor will show the autocomplete dropdown and
   * wire keyboard shortcuts (Ctrl+Space, ArrowUp/Down, Enter/Tab, Escape).
   */
  readonly autocomplete?: AutocompleteState;
  /**
   * Optional error decorations produced by `useDslValidation()`.
   * When provided, error ranges are shown with wavy underlines and a tooltip
   * when the cursor is inside the error range.
   */
  readonly errorDecorations?: readonly ErrorDecoration[];
}

// ---------------------------------------------------------------------------
// Token → Tailwind class mapping
// ---------------------------------------------------------------------------

const TOKEN_CLASS: Record<DslTokenType, string> = {
  'function-name': 'text-blue-400',
  'string-literal': 'text-green-400',
  'number-literal': 'text-orange-400',
  'boolean-literal': 'text-purple-400',
  'null-literal': 'text-gray-400',
  punctuation: 'text-slate-300',
  comma: 'text-slate-400',
  brace: 'text-yellow-300',
  colon: 'text-yellow-300',
  whitespace: '',
  unknown: 'text-red-400',
};

// Highlighted (matched bracket) extra classes
const BRACKET_MATCH_CLASS = 'bg-slate-700 rounded';

// ---------------------------------------------------------------------------
// Overlay rendering — syntax highlighting
// ---------------------------------------------------------------------------

function renderOverlay(tokens: DslToken[], matchedPositions: Set<number>): React.ReactNode[] {
  return tokens.map((token) => {
    const isMatched =
      (token.type === 'punctuation') &&
      (matchedPositions.has(token.start));

    const className = [
      TOKEN_CLASS[token.type],
      isMatched ? BRACKET_MATCH_CLASS : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span key={token.start} className={className || undefined}>
        {token.text}
      </span>
    );
  });
}

// ---------------------------------------------------------------------------
// Error decoration overlay rendering
// ---------------------------------------------------------------------------

function decorationClass(severity: ErrorDecoration['severity']): string {
  switch (severity) {
    case 'error':   return 'underline decoration-wavy decoration-red-500';
    case 'warning': return 'underline decoration-wavy decoration-yellow-500';
    case 'info':    return 'underline decoration-dotted decoration-blue-400';
  }
}

/**
 * Renders text split into segments: plain segments and decorated (underlined) segments.
 * The base text color is transparent so only underline decorations are visible.
 */
function renderErrorDecorationLayer(
  text: string,
  decorations: readonly ErrorDecoration[],
): React.ReactNode {
  if (decorations.length === 0) {
    return <>{text}{'\n'}</>;
  }

  // Sort by start position; handle overlapping by clamping
  const sorted = [...decorations].sort((a, b) => a.start - b.start);
  const segments: React.ReactNode[] = [];
  let pos = 0;

  for (const dec of sorted) {
    const start = Math.max(pos, Math.max(0, dec.start));
    const end = Math.min(text.length, dec.end);
    if (start >= end) continue;

    // Plain segment before decoration
    if (start > pos) {
      segments.push(<span key={`plain-${pos}`}>{text.slice(pos, start)}</span>);
    }

    // Decorated segment
    segments.push(
      <span key={`dec-${dec.start}-${dec.code}`} className={decorationClass(dec.severity)}>
        {text.slice(start, end)}
      </span>,
    );

    pos = end;
  }

  // Trailing plain segment
  if (pos < text.length) {
    segments.push(<span key={`plain-tail-${pos}`}>{text.slice(pos)}</span>);
  }

  return <>{segments}{'\n'}</>;
}

// ---------------------------------------------------------------------------
// Caret position utility
// ---------------------------------------------------------------------------

/**
 * Estimates the pixel position of the caret inside a textarea in viewport coordinates.
 * Uses a mirror div with identical typography to measure text dimensions up to the cursor.
 */
function getCaretViewportPosition(
  textarea: HTMLTextAreaElement,
  cursorPos: number,
): { top: number; left: number } {
  const mirror = document.createElement('div');

  const style = window.getComputedStyle(textarea);
  const props: Array<keyof CSSStyleDeclaration> = [
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
    'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'whiteSpace', 'wordBreak', 'tabSize',
  ];
  for (const prop of props) {
    (mirror.style as Record<string, unknown>)[prop as string] = style[prop];
  }

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'hidden';
  mirror.style.width = `${textarea.offsetWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.whiteSpace = 'pre';

  const textBefore = textarea.value.slice(0, cursorPos);
  mirror.textContent = textBefore;

  const caretSpan = document.createElement('span');
  caretSpan.textContent = '\u200b'; // zero-width space
  mirror.appendChild(caretSpan);

  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const spanRect = caretSpan.getBoundingClientRect();

  document.body.removeChild(mirror);

  const taRect = textarea.getBoundingClientRect();
  const scrollLeft = textarea.scrollLeft;
  const scrollTop = textarea.scrollTop;
  const lineHeightPx = parseFloat(style.lineHeight) || 20;

  return {
    top: taRect.top + (spanRect.top - mirrorRect.top) + lineHeightPx - scrollTop,
    left: taRect.left + (spanRect.left - mirrorRect.left) - scrollLeft,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Raw DSL expression editor using the textarea + synchronized overlay pattern.
 *
 * Architecture:
 * - A `<textarea>` handles all native text input, undo/redo, selection, IME.
 * - A syntax-highlight overlay div renders colored token spans (pointer-events: none).
 * - An error-decoration overlay div renders wavy underlines for diagnostics (pointer-events: none).
 * - The textarea has `color: transparent`; caret color is visible via `caretColor`.
 * - Both overlay divs scroll in sync with the textarea.
 *
 * Error tooltip:
 * - Shown when the cursor is inside an error-decorated character range.
 * - Positioned below the editor area (relative to container).
 *
 * Autocomplete:
 * - When `autocomplete` prop is provided, keyboard shortcuts are wired and the
 *   `AutocompleteDropdown` is rendered at the estimated caret position.
 *
 * Imperative ref:
 * - `insertText(text)` — inserts at cursor, moves cursor after inserted text.
 * - `focus()` — focuses the textarea.
 */
export const RawDslEditor = forwardRef<RawDslEditorRef, RawDslEditorProps>(
  function RawDslEditor(
    {
      value,
      onChange,
      onCursorChange,
      placeholder,
      readOnly = false,
      className,
      autocomplete,
      errorDecorations = [],
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const errorOverlayRef = useRef<HTMLDivElement>(null);

    const [cursorPos, setCursorPos] = useState(0);
    const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number }>({
      top: 0,
      left: 0,
    });

    // Computed once per render
    const tokens = tokenizeDsl(value);

    // Bracket matching positions
    const matchedPositions = new Set<number>();
    const bracketMatch = findMatchingBracket(value, cursorPos);
    if (bracketMatch !== null) {
      matchedPositions.add(bracketMatch[0]);
      matchedPositions.add(bracketMatch[1]);
    }

    // Find the first error decoration that contains the cursor
    const activeDecoration =
      errorDecorations.find((d) => cursorPos >= d.start && cursorPos <= d.end) ?? null;

    // -----------------------------------------------------------------------
    // Imperative handle
    // -----------------------------------------------------------------------
    useImperativeHandle(ref, () => ({
      insertText(text: string) {
        const ta = textareaRef.current;
        if (ta === null) return;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        const newValue = value.slice(0, start) + text + value.slice(end);
        onChange(newValue);
        const newCursor = start + text.length;
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newCursor;
            textareaRef.current.selectionEnd = newCursor;
            textareaRef.current.focus();
          }
        });
      },
      focus() {
        textareaRef.current?.focus();
      },
    }));

    // -----------------------------------------------------------------------
    // Autocomplete: insert the confirmed suggestion
    // -----------------------------------------------------------------------
    const insertAutocompleteSelection = useCallback(() => {
      if (autocomplete === undefined) return false;
      const result = autocomplete.confirm();
      if (result === null) return false;

      const ta = textareaRef.current;
      if (ta === null) return false;

      const { insertText, insertStart, insertEnd } = result;
      const newValue = value.slice(0, insertStart) + insertText + value.slice(insertEnd);
      onChange(newValue);

      let newCursor = insertStart + insertText.length;
      if (insertText.endsWith('()')) {
        newCursor = insertStart + insertText.length - 1;
      }

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = newCursor;
          textareaRef.current.selectionEnd = newCursor;
          textareaRef.current.focus();
        }
      });
      return true;
    }, [autocomplete, value, onChange]);

    // -----------------------------------------------------------------------
    // Sync scroll position from textarea → overlays
    // -----------------------------------------------------------------------
    const syncScroll = useCallback(() => {
      const ta = textareaRef.current;
      const ov = overlayRef.current;
      const ev = errorOverlayRef.current;
      if (ta === null) return;
      if (ov !== null) {
        ov.scrollTop = ta.scrollTop;
        ov.scrollLeft = ta.scrollLeft;
      }
      if (ev !== null) {
        ev.scrollTop = ta.scrollTop;
        ev.scrollLeft = ta.scrollLeft;
      }
    }, []);

    // -----------------------------------------------------------------------
    // Cursor position tracking
    // -----------------------------------------------------------------------
    const updateCursor = useCallback(() => {
      const ta = textareaRef.current;
      if (ta === null) return;
      const pos = ta.selectionStart ?? 0;
      setCursorPos(pos);
      onCursorChange?.(pos);

      if (autocomplete !== undefined) {
        try {
          const coords = getCaretViewportPosition(ta, pos);
          setDropdownPosition(coords);
        } catch {
          // Ignore positioning errors
        }
      }
    }, [onCursorChange, autocomplete]);

    useEffect(() => {
      syncScroll();
    }, [value, syncScroll]);

    // -----------------------------------------------------------------------
    // Event handlers
    // -----------------------------------------------------------------------
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
      },
      [onChange],
    );

    const handleSelect = useCallback(
      (_e: React.SyntheticEvent<HTMLTextAreaElement>) => {
        updateCursor();
      },
      [updateCursor],
    );

    const handleKeyUp = useCallback(
      (_e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        updateCursor();
      },
      [updateCursor],
    );

    const handleMouseUp = useCallback(
      (_e: React.MouseEvent<HTMLTextAreaElement>) => {
        updateCursor();
      },
      [updateCursor],
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (autocomplete !== undefined) {
          if (e.ctrlKey && e.key === ' ') {
            e.preventDefault();
            autocomplete.open();
            return;
          }

          if (autocomplete.isOpen) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              autocomplete.selectNext();
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              autocomplete.selectPrev();
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insertAutocompleteSelection();
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              autocomplete.close();
              return;
            }
          }
        }

        if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          // TODO T-11: apply expression
        }
      },
      [autocomplete, insertAutocompleteSelection],
    );

    // -----------------------------------------------------------------------
    // Shared typography + layout styles
    // -----------------------------------------------------------------------
    const sharedStyles: React.CSSProperties = {
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: '13px',
      lineHeight: '1.6',
      padding: '10px 12px',
      margin: 0,
      border: 'none',
      outline: 'none',
      resize: 'none',
      width: '100%',
      height: '100%',
      overflowX: 'auto',
      overflowY: 'auto',
      whiteSpace: 'pre',
      wordBreak: 'normal',
      tabSize: 2,
      letterSpacing: 'normal',
      boxSizing: 'border-box',
    };

    return (
      <div
        className={[
          'relative bg-zinc-900 rounded-md border border-zinc-700 overflow-hidden',
          'min-h-[120px] max-h-[50vh]',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ height: '200px', resize: 'vertical' }}
      >
        {/* Syntax highlight overlay — colored token spans */}
        <div
          ref={overlayRef}
          aria-hidden="true"
          style={{
            ...sharedStyles,
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            color: 'transparent',
            zIndex: 1,
          }}
        >
          {value === '' ? null : renderOverlay(tokens, matchedPositions)}
          {'\n'}
        </div>

        {/* Error decoration overlay — wavy underlines for diagnostics */}
        <div
          ref={errorOverlayRef}
          aria-hidden="true"
          data-testid="error-decoration-overlay"
          style={{
            ...sharedStyles,
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
            color: 'transparent',
            zIndex: 2,
          }}
        >
          {value === ''
            ? null
            : renderErrorDecorationLayer(value, errorDecorations)}
        </div>

        {/* Textarea — handles all input */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onSelect={handleSelect}
          onKeyUp={handleKeyUp}
          onKeyDown={handleKeyDown}
          onMouseUp={handleMouseUp}
          onScroll={syncScroll}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="DSL expression editor"
          aria-multiline="true"
          aria-autocomplete={autocomplete !== undefined ? 'list' : undefined}
          aria-expanded={autocomplete !== undefined ? autocomplete.isOpen : undefined}
          aria-invalid={errorDecorations.some((d) => d.severity === 'error') || undefined}
          style={{
            ...sharedStyles,
            position: 'absolute',
            top: 0,
            left: 0,
            color: 'transparent',
            caretColor: '#e2e8f0',
            background: 'transparent',
            zIndex: 3,
            overflowX: 'auto',
            overflowY: 'auto',
          }}
        />

        {/* Error tooltip — shown when cursor is inside an error range */}
        {activeDecoration !== null && (
          <ErrorTooltip
            code={activeDecoration.code}
            message={activeDecoration.message}
            severity={activeDecoration.severity}
            position={{ top: 208, left: 0 }}
          />
        )}

        {/* Autocomplete dropdown (portal-rendered) */}
        {autocomplete !== undefined && autocomplete.isOpen && (
          <AutocompleteDropdown
            suggestions={autocomplete.suggestions}
            selectedIndex={autocomplete.selectedIndex}
            onSelect={(_item, _index) => {
              insertAutocompleteSelection();
            }}
            onClose={autocomplete.close}
            position={dropdownPosition}
          />
        )}
      </div>
    );
  },
);
