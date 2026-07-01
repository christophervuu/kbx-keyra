import express from 'express';
import type { NextFunction, Request, Response } from 'express';

import { createAutoMapRouter } from './routes/auto-map';
import { createMappingRouter } from './routes/mappings';
import { createProjectRouter } from './routes/projects';
import { createSchemaRouter } from './routes/schemas';
import { createTestControlRouter } from './routes/test-control';
import { sendError } from './response';
import { InMemoryStore } from './store';

const app = express();
const store = new InMemoryStore();

app.use(express.json({ limit: '2mb' }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  // eslint-disable-next-line no-console -- minimal server request logging for E2E debug visibility
  console.log(`[e2e-mock-server] ${req.method} ${req.path}`);
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send();
    return;
  }

  next();
});

app.use('/test', createTestControlRouter(store));
app.use(createProjectRouter(store));
app.use(createMappingRouter(store));
app.use(createSchemaRouter(store));
app.use(createAutoMapRouter(store));

app.use((_req, res) => {
  const requestId = store.nextRequestId();
  sendError(res, requestId, 'RESOURCE_NOT_FOUND', 'Route not found', 404, false);
});

const port = Number(process.env.MOCK_SERVER_PORT ?? 4100);

const server = app.listen(port, () => {
  // eslint-disable-next-line no-console -- startup visibility for local E2E harness
  console.log(`[e2e-mock-server] listening on http://127.0.0.1:${port}`);
});

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console -- shutdown visibility for local E2E harness
  console.log(`[e2e-mock-server] received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
