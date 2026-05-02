import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InlineEditableTagsProps {
  tags: readonly string[];
  onSave: (tags: string[]) => void;
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders tags as pill badges. Clicking any pill or the "Add tag" button
 * opens an input. Typing a comma or pressing Enter adds a tag. Backspace
 * on empty input removes the last tag. Blur saves the current state.
 */
export function InlineEditableTags({
  tags,
  onSave,
  placeholder = 'Add tag…',
}: InlineEditableTagsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([...tags]);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when tags change externally
  useEffect(() => {
    if (!isEditing) setDraft([...tags]);
  }, [tags, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function openEdit() {
    setDraft([...tags]);
    setInputValue('');
    setIsEditing(true);
  }

  function addPendingInput() {
    const value = inputValue.trim();
    if (value && !draft.includes(value)) {
      setDraft((prev) => [...prev, value]);
    }
    setInputValue('');
  }

  function removeTag(tag: string) {
    setDraft((prev) => prev.filter((t) => t !== tag));
  }

  async function commit() {
    addPendingInput();
    setIsEditing(false);
    // Use the draft at the time of commit (addPendingInput is synchronous via batch)
    const finalTags = inputValue.trim()
      ? [...draft, inputValue.trim()].filter(
          (t, i, arr) => arr.indexOf(t) === i,
        )
      : draft;

    const changed =
      finalTags.length !== tags.length ||
      finalTags.some((t, i) => t !== tags[i]);

    if (!changed) return;
    setIsSaving(true);
    try {
      await onSave(finalTags);
    } finally {
      setIsSaving(false);
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addPendingInput();
    } else if (e.key === 'Backspace' && inputValue === '') {
      setDraft((prev) => prev.slice(0, -1));
    } else if (e.key === 'Escape') {
      setDraft([...tags]);
      setInputValue('');
      setIsEditing(false);
    }
  }

  // ---- Edit mode ----
  if (isEditing) {
    return (
      <div
        className="flex flex-wrap items-center gap-1.5 rounded border border-blue-500 bg-slate-800 px-2 py-1.5"
        role="group"
        aria-label="Edit tags"
      >
        {draft.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded bg-slate-600 px-2 py-0.5 text-xs text-slate-200"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => removeTag(tag)}
              className="text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
            >
              <X size={10} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={() => void commit()}
          placeholder={placeholder}
          aria-label="Tag input"
          className="min-w-[6rem] flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
        />
      </div>
    );
  }

  // ---- Display mode ----
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {draft.map((tag) => (
        <span
          key={tag}
          className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300"
        >
          {tag}
        </span>
      ))}
      <button
        type="button"
        onClick={openEdit}
        aria-label="Edit tags"
        className={
          'rounded px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ' +
          (draft.length === 0
            ? 'italic text-slate-500 hover:text-slate-300'
            : 'text-slate-500 hover:text-slate-300') +
          (isSaving ? ' opacity-60' : '')
        }
      >
        {draft.length === 0 ? placeholder : '+ Add tag'}
      </button>
    </div>
  );
}
