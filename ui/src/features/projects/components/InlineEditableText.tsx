import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InlineEditableTextProps {
  /** Current value */
  value: string;
  /** Called with the new value when the user commits (Enter or blur) */
  onSave: (value: string) => void;
  /** Placeholder shown when value is empty */
  placeholder?: string;
  /** Rendered element when in display mode */
  as?: 'h1' | 'h2' | 'h3' | 'p';
  /** Use textarea instead of input */
  multiline?: boolean;
  /** Additional class names for the display element */
  className?: string;
  /** aria-label forwarded to the input */
  ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Toggles between a display element and a text input/textarea on click.
 * Saves on Enter (single-line) or blur.
 */
export function InlineEditableText({
  value,
  onSave,
  placeholder = 'Click to edit…',
  as: Tag = 'p',
  multiline = false,
  className = '',
  ariaLabel,
}: InlineEditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Sync draft when value changes externally
  useEffect(() => {
    if (!isEditing) setDraft(value);
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      // Place cursor at end
      const el = inputRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
  }, [isEditing]);

  function handleDisplayClick() {
    setDraft(value);
    setIsEditing(true);
  }

  async function commit() {
    const trimmed = draft.trim();
    setIsEditing(false);
    if (trimmed === value) return;
    setIsSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setIsSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      void commit();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setIsEditing(false);
    }
  }

  function handleBlur() {
    void commit();
  }

  // ---- Edit mode ----
  if (isEditing) {
    const sharedProps = {
      ref: inputRef,
      value: draft,
      'aria-label': ariaLabel,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: handleBlur,
      onKeyDown: handleKeyDown,
      className:
        'w-full rounded border border-blue-500 bg-slate-800 px-2 py-1 text-slate-100 ' +
        'focus:outline-none focus:ring-2 focus:ring-blue-500',
    };

    if (multiline) {
      return (
        <textarea
          {...sharedProps}
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          rows={3}
          className={sharedProps.className + ' resize-none'}
        />
      );
    }

    return (
      <input
        {...sharedProps}
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
      />
    );
  }

  // ---- Display mode ----
  const hasValue = value.trim().length > 0;
  const displayText = hasValue ? value : placeholder;
  const displayClass =
    `cursor-pointer rounded px-1 -mx-1 hover:underline hover:decoration-dotted ` +
    `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ` +
    (hasValue ? 'text-slate-100' : 'italic text-slate-500') +
    (isSaving ? ' opacity-60' : '') +
    (className ? ` ${className}` : '');

  return (
    <Tag
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? `Edit ${displayText}`}
      onClick={handleDisplayClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleDisplayClick();
        }
      }}
      className={displayClass}
    >
      {displayText}
      {isSaving && (
        <span className="ml-2 text-xs text-slate-500" aria-live="polite">
          Saving…
        </span>
      )}
    </Tag>
  );
}
