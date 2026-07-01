import { Router } from 'express';

import type { InMemoryStore } from '../store';
import { sendData, sendError } from '../response';

function parseVisibleTargetPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function parseSectionPath(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseSuggestionStatusFilter(status: unknown): Set<string> | null {
  if (typeof status !== 'string' || status.trim() === '') {
    return null;
  }

  const items = status
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return items.length > 0 ? new Set(items) : null;
}

export function createAutoMapRouter(store: InMemoryStore): Router {
  const router = Router();

  router.get('/ai/auto-map/capabilities', (_req, res) => {
    sendData(res, 200, {
      capabilities: {
        autoMap: {
          enabled: true,
          executionMode: 'async',
        },
      },
    });
  });

  router.get('/mappings/:mappingId/auto-map-session', (req, res) => {
    const openSession = store.getAutoMapOpenSession(req.params.mappingId);
    sendData(res, 200, openSession);
  });

  router.post('/ai/auto-map/sessions', (req, res) => {
    const requestId = store.nextRequestId();
    const body = (req.body ?? {}) as {
      mappingId?: unknown;
      scope?: {
        sectionPath?: unknown;
        targetPaths?: unknown;
      };
    };

    if (typeof body.mappingId !== 'string' || body.mappingId.trim() === '') {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Missing required field: mappingId', 400, false);
      return;
    }

    const result = store.startAutoMapSession({
      mappingId: body.mappingId,
      sectionPath: parseSectionPath(body.scope?.sectionPath),
      visibleTargetPaths: parseVisibleTargetPaths(body.scope?.targetPaths),
    });

    sendData(res, 202, result);
  });

  router.post('/ai/auto-map/sessions/:sessionId/runs', (req, res) => {
    const requestId = store.nextRequestId();
    const result = store.startAutoMapRunBySession(req.params.sessionId);

    if (!result) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Session with id '${req.params.sessionId}' not found`, 404, false);
      return;
    }

    sendData(res, 202, result);
  });

  router.get('/ai/auto-map/sessions/:sessionId/runs/:runId', (req, res) => {
    const requestId = store.nextRequestId();
    const result = store.getAutoMapRunStatus(req.params.sessionId, req.params.runId);

    if (!result) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Run with id '${req.params.runId}' not found`, 404, false);
      return;
    }

    sendData(res, 200, result);
  });

  router.get('/ai/auto-map/sessions/:sessionId/suggestions', (req, res) => {
    const requestId = store.nextRequestId();
    const payload = store.listAutoMapSuggestions(req.params.sessionId);

    if (!payload) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Session with id '${req.params.sessionId}' not found`, 404, false);
      return;
    }

    const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100;
    const offset = 0;
    const statusFilter = parseSuggestionStatusFilter(req.query.status);
    const filtered = statusFilter
      ? payload.items.filter((item) => statusFilter.has(item.reviewStatus ?? 'pending'))
      : payload.items;
    const pageItems = filtered.slice(offset, offset + limit);

    sendData(res, 200, {
      items: pageItems,
      page: {
        limit,
        nextCursor: null,
        total: filtered.length,
        offset,
      },
    });
  });

  return router;
}
