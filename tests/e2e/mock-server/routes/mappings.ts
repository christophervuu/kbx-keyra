import { Router } from 'express';

import type { InMemoryStore } from '../store';
import { sendData, sendError, sendNoContent } from '../response';

export function createMappingRouter(store: InMemoryStore): Router {
  const router = Router();

  router.get('/projects/:projectId/mappings', (req, res) => {
    sendData(res, 200, store.listMappings(req.params.projectId));
  });

  router.get('/mappings/:id', (req, res) => {
    const requestId = store.nextRequestId();
    const mapping = store.getMapping(req.params.id);

    if (!mapping) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Mapping with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 200, mapping);
  });

  router.post('/mappings', (req, res) => {
    const requestId = store.nextRequestId();
    const { projectId, name } = req.body ?? {};

    if (!projectId || !name) {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Missing required mapping fields: projectId, name', 400, false);
      return;
    }

    sendData(res, 201, store.createMapping(req.body));
  });

  router.put('/mappings/:id', (req, res) => {
    const requestId = store.nextRequestId();
    const { name, version, engineVersion, config, rules } = req.body ?? {};

    if (!name || version === undefined || !engineVersion || !config || !rules) {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Invalid mapping config payload for update', 400, false);
      return;
    }

    const updated = store.updateMapping(req.params.id, req.body);
    if (!updated) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Mapping with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 200, updated);
  });

  router.delete('/mappings/:id', (req, res) => {
    const requestId = store.nextRequestId();
    if (!store.deleteMapping(req.params.id)) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Mapping with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendNoContent(res);
  });

  router.post('/mappings/:id/duplicate', (req, res) => {
    const requestId = store.nextRequestId();
    const { name } = req.body ?? {};

    if (!name || typeof name !== 'string') {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Missing required field: name', 400, false);
      return;
    }

    const duplicated = store.duplicateMapping(req.params.id, name);
    if (!duplicated) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Mapping with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 201, duplicated);
  });

  router.get('/mappings/:mappingId/versions', (req, res) => {
    sendData(res, 200, store.listMappingVersions(req.params.mappingId));
  });

  router.get('/mappings/:mappingId/versions/:version', (req, res) => {
    const requestId = store.nextRequestId();
    const version = Number(req.params.version);

    if (!Number.isFinite(version)) {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Version must be a number', 400, false);
      return;
    }

    const entry = store.getMappingVersion(req.params.mappingId, version);
    if (!entry) {
      sendError(
        res,
        requestId,
        'RESOURCE_NOT_FOUND',
        `MappingVersion with id '${req.params.mappingId}@v${version}' not found`,
        404,
        false,
      );
      return;
    }

    sendData(res, 200, entry);
  });

  router.post('/mappings/:mappingId/versions', (req, res) => {
    const requestId = store.nextRequestId();
    const result = store.saveMappingVersion(req.params.mappingId, req.body);

    if (result === 'mapping-not-found') {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Mapping with id '${req.params.mappingId}' not found`, 404, false);
      return;
    }

    sendNoContent(res);
  });

  return router;
}
