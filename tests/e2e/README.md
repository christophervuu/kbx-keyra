# E2E Adapter Parity

This workspace contains the Playwright parity suite used by FS-060.

## Local commands

- Run full dual-mode parity gate (same behavior as CI):

```bash
pnpm test:e2e:parity
```

- Run one mode only:

```bash
pnpm test:e2e:local
pnpm test:e2e:backend
```

## CI gate

GitHub Actions workflow: `.github/workflows/e2e-parity.yml`

The gate runs on pull requests that touch parity-relevant paths:

- `ui/src/lib/api/**`
- `src/lambda/**`
- `src/lib/persistence/**`
- `tests/e2e/**`
- `ui/src/main.tsx`
- `ui/src/lib/api/bootstrap.ts`

CI installs Chromium and executes the parity script. The Playwright `webServer`
configuration manages Vite + mock-server lifecycle automatically. If either
`localStorage` or `httpBackend` project fails, the gate fails.

On failure, screenshots/traces/report artifacts are uploaded from:

- `tests/e2e/test-results`
- `tests/e2e/playwright-report`
