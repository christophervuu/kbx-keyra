import { Router } from 'express';

import type { InMemoryStore } from '../store';
import { sendData, sendError, sendNoContent } from '../response';

export function createSchemaRouter(store: InMemoryStore): Router {
  const router = Router();

  router.get('/schemas', (_req, res) => {
    sendData(res, 200, store.listSchemas());
  });

  router.get('/schemas/:id', (req, res) => {
    const requestId = store.nextRequestId();
    const schema = store.getSchema(req.params.id);

    if (!schema) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Schema with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 200, schema);
  });

  router.post('/schemas', (req, res) => {
    const requestId = store.nextRequestId();
    const { name, format, origin, content } = req.body ?? {};

    if (!name || !format || !origin || content === undefined) {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Missing required schema fields: name, format, origin, content', 400, false);
      return;
    }

    sendData(res, 201, store.createSchema(req.body));
  });

  router.put('/schemas/:id', (req, res) => {
    const requestId = store.nextRequestId();
    const updated = store.updateSchema(req.params.id, req.body ?? {});

    if (!updated) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Schema with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 200, updated);
  });

  router.delete('/schemas/:id', (req, res) => {
    const requestId = store.nextRequestId();

    if (!store.deleteSchema(req.params.id)) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Schema with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendNoContent(res);
  });

  router.post('/schemas/:id/query', (req, res) => {
    const requestId = store.nextRequestId();
    const query = typeof req.body?.query === 'string' ? req.body.query : '';

    if (!query.trim()) {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Missing required field: query', 400, false);
      return;
    }

    const results = store.querySchema(req.params.id, query);
    if (results === null) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Schema with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 200, results);
  });

  return router;
}
