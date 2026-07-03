import { queryKeys } from './query-keys';

/**
 * Targeted invalidation helpers by family/list/detail granularity.
 * Use these helpers instead of page-local ad hoc key arrays.
 */
export const queryInvalidationKeys = {
  projects: {
    family: queryKeys.projects.family,
    list: queryKeys.projects.lists,
    detail: queryKeys.projects.detail,
  },
  mappings: {
    family: queryKeys.mappings.family,
    list: queryKeys.mappings.lists,
    detail: queryKeys.mappings.detail,
    versions: queryKeys.mappings.versions,
  },
  schemas: {
    family: queryKeys.schemas.family,
    list: queryKeys.schemas.lists,
    detail: queryKeys.schemas.detail,
    usageList: queryKeys.schemas.usages,
    usage: queryKeys.schemas.usage,
  },
  deployments: {
    family: queryKeys.deployments.family,
    summaryList: queryKeys.deployments.summaries,
    contextList: queryKeys.deployments.contexts,
    historyList: queryKeys.deployments.histories,
    context: queryKeys.deployments.context,
    history: queryKeys.deployments.history,
  },
  settings: {
    family: queryKeys.settings.family,
    global: queryKeys.settings.global,
    project: queryKeys.settings.project,
  },
  valueTables: {
    family: queryKeys.valueTables.family,
    list: queryKeys.valueTables.lists,
    detail: queryKeys.valueTables.detail,
    revision: queryKeys.valueTables.revision,
    usage: queryKeys.valueTables.usage,
  },
} as const;
