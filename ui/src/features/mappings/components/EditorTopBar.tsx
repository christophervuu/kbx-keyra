import { Ellipsis, ExternalLink, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import type { Environment } from '@/lib/types/domain';
import { PATHS } from '@/routes/paths';
import type { EditorPanelLayout } from '../lib/editor-preferences';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

export interface HighestDeployStatus {
  environment: Environment;
  deployedVersion: number;
}

export interface EditorTopBarProps {
  projectName: string;
  projectId: string;
  mappingName: string;
  version: number;
  currentRevision?: number;
  currentVersion?: number | null;
  hasDraft?: boolean;
  canSave?: boolean;
  onCreateVersion?: () => void;
  deployStatus: HighestDeployStatus | null;
  saveStatus: SaveStatus;
  unsavedChangeCount: number;
  onViewUnsavedChanges?: () => void;
  onSave: () => void;
  sourceSchemaName: string | null;
  targetSchemaName: string | null;
  onConfigToggle?: () => void;
  onHistoryToggle?: () => void;
  onViewIssues?: () => void;
  issueCount?: number;
  onOpenTestLab?: () => void;
  onOpenRulesView?: () => void;
  onOpenTargetView?: () => void;
  isRulesViewActive?: boolean;
  onOpenDeploymentPage?: () => void;
  onExportMapping?: () => void;
  onImportMapping?: () => void;
  onAutoMap?: () => void;
  isAutoMapLoading?: boolean;
  autoMapPendingCount?: number;
  autoMapSectionPath?: string | null;
  onReturnToAutoMap?: () => void;
  autoMapScopeCount?: number;
  showDeployControls?: boolean;
  sampleSelectorSlot?: ReactNode;
  onToggleBrowseSource?: () => void;
  isBrowseSourceActive?: boolean;
  requiredMappedCount?: number;
  requiredFieldCount?: number;
  warningCount?: number;
  errorCount?: number;
  editorPanelLayout?: EditorPanelLayout;
  onSetEditorPanelLayout?: (layout: EditorPanelLayout) => void;
  onResetEditorPanelLayout?: () => void;
  showEditorLayoutAnnouncement?: boolean;
  onDismissEditorLayoutAnnouncement?: () => void;
}

function saveStatusLabel(status: SaveStatus, unsavedChangeCount: number): string {
  if (status === 'saving') return 'Saving…';
  if (status === 'error') return 'Save failed';
  if (status === 'unsaved' && unsavedChangeCount > 0) {
    return unsavedChangeCount === 1 ? '1 unsaved change' : `${unsavedChangeCount} unsaved changes`;
  }
  return 'Saved';
}

export function EditorTopBar(props: EditorTopBarProps) {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isMoreMenuOpen) return;

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (moreMenuRef.current?.contains(target)) return;
      setIsMoreMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsLayoutMenuOpen(false);
        setIsMoreMenuOpen(false);
      }
    }

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isMoreMenuOpen]);

  useEffect(() => {
    if (!isMoreMenuOpen) {
      setIsLayoutMenuOpen(false);
    }
  }, [isMoreMenuOpen]);

  const projectPath = PATHS.PROJECT_OVERVIEW.replace(':projectId', props.projectId);
  const saveLabel = saveStatusLabel(props.saveStatus, props.unsavedChangeCount);
  const isSaving = props.saveStatus === 'saving';
  const isSaveEnabled = props.canSave ?? props.unsavedChangeCount > 0;
  const canViewChanges = props.unsavedChangeCount > 0 && props.onViewUnsavedChanges !== undefined;

  const sourceName = props.sourceSchemaName ?? 'No source';
  const targetName = props.targetSchemaName ?? 'No target';
  const panelLayout = props.editorPanelLayout ?? 'target-first';

  return (
    <header
      className="bg-slate-950"
      data-testid="editor-top-bar"
    >
      <nav
        className="flex items-center gap-1.5 border-b border-slate-800 px-6 py-2 text-sm"
        data-testid="editor-breadcrumb"
        aria-label="Breadcrumb"
      >
        <Link to="/" className="text-slate-400 transition-colors hover:text-slate-200">
          Home
        </Link>
        <span className="text-slate-600" aria-hidden="true">/</span>
        <span className="text-slate-500" aria-disabled="true">Projects</span>
        <span className="text-slate-600" aria-hidden="true">/</span>
        <Link
          to={projectPath}
          className="text-slate-400 transition-colors hover:text-slate-200"
          data-testid="project-name-link"
        >
          {props.projectName}
        </Link>
        <span className="text-slate-600" aria-hidden="true">/</span>
        <span className="text-slate-300" aria-current="page" data-testid="mapping-name-breadcrumb">
          {props.mappingName}
        </span>
      </nav>

      <div className="px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-100" data-testid="schema-names" title={`${sourceName} → ${targetName}`}>
          {sourceName} → {targetName}
        </h1>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {props.autoMapPendingCount !== undefined && props.autoMapPendingCount > 0 ? (
            <button
              type="button"
              onClick={props.onReturnToAutoMap}
              className="inline-flex items-center rounded border border-amber-600/60 bg-amber-900/25 px-2.5 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-900/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
              data-testid="automap-reentry-pill"
            >
              Auto-Map: {props.autoMapPendingCount} pending
            </button>
          ) : null}

          <button
            type="button"
            onClick={props.onToggleBrowseSource}
            className={[
              'inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500',
              props.isBrowseSourceActive
                ? 'border-blue-500/60 bg-blue-900/40 text-blue-200'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100',
            ].join(' ')}
            data-testid="browse-source-button"
            aria-pressed={props.isBrowseSourceActive === true}
          >
            Browse Inputs
          </button>

          {props.sampleSelectorSlot}

          <button
            type="button"
            onClick={props.onSave}
            disabled={!isSaveEnabled || isSaving}
            className="inline-flex items-center gap-1.5 rounded border border-blue-500/50 bg-blue-700/80 px-2.5 py-1 text-xs font-medium text-blue-100 transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="save-button"
            aria-label="Save mapping"
          >
            <Save size={12} aria-hidden="true" />
            Save
          </button>

          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              data-testid="more-menu-button"
              aria-haspopup="menu"
              aria-expanded={isMoreMenuOpen}
              aria-label="More options"
              onClick={() => setIsMoreMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500"
            >
              <Ellipsis size={14} aria-hidden="true" />
            </button>

            {isMoreMenuOpen && (
              <div
                role="menu"
                data-testid="more-menu-popover"
                className="absolute right-0 z-50 mt-1 w-56 rounded border border-slate-700 bg-slate-900 p-1.5 shadow-xl"
              >
                {props.showEditorLayoutAnnouncement ? (
                  <div
                    className="mb-1.5 rounded border border-blue-700/60 bg-blue-950/40 p-2"
                    data-testid="editor-layout-announcement"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-xs font-semibold text-blue-100">Prefer inputs on the left?</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-blue-200/90">
                      You can now switch between Target-first and Input-first layouts from the editor menu.
                    </p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="editor-layout-announcement-change"
                        onClick={() => setIsLayoutMenuOpen(true)}
                        className="rounded border border-blue-500/60 bg-blue-900/60 px-2 py-1 text-[11px] font-medium text-blue-100 transition-colors hover:bg-blue-800"
                      >
                        Change layout
                      </button>
                      <button
                        type="button"
                        data-testid="editor-layout-announcement-dismiss"
                        onClick={() => props.onDismissEditorLayoutAnnouncement?.()}
                        className="rounded border border-slate-600 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-800"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="relative">
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={isLayoutMenuOpen}
                    data-testid="more-menu-layout"
                    onClick={() => setIsLayoutMenuOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                  >
                    <span>Layout</span>
                    <span aria-hidden="true" className="text-slate-500">▸</span>
                  </button>

                  {isLayoutMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="Layout"
                      data-testid="layout-submenu"
                      className="mt-1 space-y-1 rounded border border-slate-700 bg-slate-950 p-1"
                    >
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={panelLayout === 'target-first'}
                        data-testid="layout-option-target-first"
                        onClick={() => {
                          props.onSetEditorPanelLayout?.('target-first');
                          setIsMoreMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                      >
                        <span className="inline-block w-3 text-center" aria-hidden="true">
                          {panelLayout === 'target-first' ? '✓' : ''}
                        </span>
                        <span>Target first</span>
                      </button>

                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={panelLayout === 'input-first'}
                        data-testid="layout-option-input-first"
                        onClick={() => {
                          props.onSetEditorPanelLayout?.('input-first');
                          setIsMoreMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                      >
                        <span className="inline-block w-3 text-center" aria-hidden="true">
                          {panelLayout === 'input-first' ? '✓' : ''}
                        </span>
                        <span>Input first</span>
                      </button>

                      <div className="my-1 border-t border-slate-800" />

                      <button
                        type="button"
                        role="menuitem"
                        data-testid="layout-reset-default"
                        onClick={() => {
                          props.onResetEditorPanelLayout?.();
                          setIsMoreMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                      >
                        Reset to default
                      </button>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-history"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onHistoryToggle?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Version history
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-test-lab"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onOpenTestLab?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                  Open Test Lab
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-rules-view"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onOpenRulesView?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Open Mapping Rules
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-target-view"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onOpenTargetView?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Open Target Properties
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-deployment"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onOpenDeploymentPage?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                  Open Deployment Page
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-export"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onExportMapping?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Export
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-import"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onImportMapping?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Import
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="more-menu-settings"
                  onClick={() => {
                    setIsMoreMenuOpen(false);
                    props.onConfigToggle?.();
                  }}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800"
                >
                  <SlidersHorizontal size={12} aria-hidden="true" />
                  Mapping settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400" data-testid="editor-summary-row">
        <span className="font-medium text-emerald-400" data-testid="required-mapped-summary">
          {props.requiredMappedCount ?? 0} / {props.requiredFieldCount ?? 0} required fields mapped
        </span>
        <span className="text-slate-600" aria-hidden="true">·</span>
        <span className="font-medium text-amber-400" data-testid="warning-summary">
          {props.warningCount ?? 0} warning{(props.warningCount ?? 0) === 1 ? '' : 's'}
        </span>
        <span className="text-slate-600" aria-hidden="true">·</span>
        <span className="font-medium text-red-400" data-testid="error-summary">
          {props.errorCount ?? 0} error{(props.errorCount ?? 0) === 1 ? '' : 's'}
        </span>
        <span className="text-slate-600" aria-hidden="true">·</span>
        {canViewChanges ? (
          <button
            type="button"
            onClick={props.onViewUnsavedChanges}
            className="text-sm text-blue-400 transition-colors hover:text-blue-300"
            data-testid="save-status"
          >
            {saveLabel}
          </button>
        ) : (
          <span
            className={props.saveStatus === 'saved' ? 'text-slate-400' : 'text-blue-400'}
            role="status"
            aria-live="polite"
            data-testid="save-status"
          >
            {saveLabel}
          </span>
        )}
        </div>

        <span className="sr-only" data-testid="mapping-name">
          {props.mappingName}
        </span>
      </div>
    </header>
  );
}
