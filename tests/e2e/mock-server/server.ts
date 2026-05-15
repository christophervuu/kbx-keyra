import express from 'express';

const app = express();

app.use(express.json());

// T-01 infrastructure readiness endpoint. T-02 expands server behavior.
app.get('/test/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

const port = Number(process.env.MOCK_SERVER_PORT ?? 4100);

app.listen(port, () => {
  // eslint-disable-next-line no-console -- startup visibility for local E2E harness
  console.log(`[e2e-mock-server] listening on http://127.0.0.1:${port}`);
});
