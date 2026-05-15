import { Router } from 'express';

import type { InMemoryStore } from '../store';
import type { SeedPayload } from '../types';
import { sendData } from '../response';

export function createTestControlRouter(store: InMemoryStore): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    sendData(res, 200, { ok: true });
  });

  router.post('/reset', (_req, res) => {
    store.reset();
    sendData(res, 200, { ok: true });
  });

  router.post('/seed', (req, res) => {
    const payload = (req.body ?? {}) as SeedPayload;
    store.seed(payload);
    sendData(res, 200, {
      ok: true,
      counts: {
        projects: store.listProjects().length,
        mappings: payload.mappings?.length ?? 0,
        schemas: store.listSchemas().length,
      },
    });
  });

  return router;
}
