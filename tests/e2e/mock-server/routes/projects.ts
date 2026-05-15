import { Router } from 'express';

import type { InMemoryStore } from '../store';
import { sendData, sendError, sendNoContent } from '../response';

export function createProjectRouter(store: InMemoryStore): Router {
  const router = Router();

  router.get('/projects', (_req, res) => {
    sendData(res, 200, store.listProjects());
  });

  router.get('/projects/:id', (req, res) => {
    const requestId = store.nextRequestId();
    const project = store.getProject(req.params.id);
    if (!project) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Project with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 200, project);
  });

  router.post('/projects', (req, res) => {
    const requestId = store.nextRequestId();
    const { name, description, slug } = req.body ?? {};

    if (!name || !description || !slug) {
      sendError(res, requestId, 'VALIDATION_ERROR', 'Missing required project fields: name, description, slug', 400, false);
      return;
    }

    sendData(res, 201, store.createProject(req.body));
  });

  router.put('/projects/:id', (req, res) => {
    const requestId = store.nextRequestId();
    const updated = store.updateProject(req.params.id, req.body ?? {});

    if (!updated) {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Project with id '${req.params.id}' not found`, 404, false);
      return;
    }

    sendData(res, 200, updated);
  });

  router.delete('/projects/:id', (req, res) => {
    const requestId = store.nextRequestId();
    const result = store.deleteProject(req.params.id);

    if (result === 'not-found') {
      sendError(res, requestId, 'RESOURCE_NOT_FOUND', `Project with id '${req.params.id}' not found`, 404, false);
      return;
    }

    if (result === 'conflict') {
      sendError(res, requestId, 'CONFLICT', 'Project cannot be deleted while mappings exist', 409, false);
      return;
    }

    sendNoContent(res);
  });

  return router;
}
