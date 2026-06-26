# FS-100 T-10 Root Cause Evidence

Date: 2026-06-25
Task: `forge/active/FS-100/tasks/T-10.md`

## Evidence Summary

### 1) Exact failing request chain (before fix)

Deployment page initial load (`use-deployment-page`) issued parallel requests:

- `GET /mappings/{mappingId}/revisions`
- `GET /mappings/{mappingId}/versions`
- `GET /mappings/{mappingId}/deployments/current`

Source evidence:

- UI hook request chain: `ui/src/features/deployments/hooks/use-deployment-page.ts`
- HTTP adapter route mapping: `ui/src/lib/api/http-adapter.ts`

Root cause found:

- `template.yaml` did **not** include `/mappings/{mappingId}/revisions` and `/mappings/{mappingId}/revisions/{revision}` routes.
- Because requests were wrapped in `Promise.all`, the first failing request rejected the entire page load path.

This confirms a backend route parity mismatch (not only UI/CORS copy behavior).

### 2) Deploy-context contract gap

- `HttpAdapter.getDeploymentContext()` was explicitly unimplemented (`featureNotEnabled`).
- No deploy-context Lambda route existed in `template.yaml`.

Source evidence:

- `ui/src/lib/api/http-adapter.ts` (pre-fix state)
- `template.yaml` route inventory (pre-fix state)

## Fixes Implemented in T-10

1. Added missing mapping revision routes in `template.yaml`:

- `GET /mappings/{mappingId}/revisions`
- `GET /mappings/{mappingId}/revisions/{revision}`

2. Implemented deploy-context backend route and handler:

- `GET /mappings/{mappingId}/deploy-context`
- handler: `src/lambda/deployment/get-deployment-context.ts`

3. Wired UI HTTP adapter to deploy-context endpoint:

- `ui/src/lib/api/http-adapter.ts`

4. Updated deployment-page load path to require deploy-context as bootstrap check and surface normalized request-id-bearing backend messages.

## CORS/Error Normalization Verification Notes

- Lambda response helpers continue to emit JSON + CORS origin header (`Access-Control-Allow-Origin: *`) for 2xx/4xx/5xx envelopes.
- API Gateway default `DEFAULT_4XX` and `DEFAULT_5XX` gateway responses in `template.yaml` include CORS headers (`origin`, `methods`, `headers`) for gateway-generated failures.
- UI error presentation now includes normalized backend request IDs in load/action error messages when present.

## Acceptance Mapping (T-10)

- Root cause documented before UI completion: ✅ (this artifact)
- Route parity repaired (`revisions` + `deploy-context`): ✅
- CORS behavior covered for Lambda + gateway 4xx/5xx paths: ✅ (template + tests)
- UI shows normalized backend error with request id: ✅
