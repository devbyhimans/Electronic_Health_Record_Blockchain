# Dashboard verification guide

Run from `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/` with Node.js 20 or newer:

```sh
npm ci
npm test
npm run lint
```

Portal build:

```sh
cd ../../ehr-frontend-v2/dashboard-portal
npm ci
npm run build
```

## Test scope

The API's Node test suite covers JWT algorithm/claim failures, configured versus unconfigured keys, authorization matrix rows, zero-PHI envelope validation, EventStore deduplication/recovery/rotation and query behavior, health polling, committed-block normalization from fixtures, role-filtered REST/trace/alert behavior, stream ticket and WebSocket/SSE behavior, and synthetic mock labeling. Tests use synthetic fixtures and do not establish connection to a real Fabric network.

`npm run demo` starts an isolated API instance with a unique ignored data directory, disables live Fabric, sends explicitly labelled synthetic events, and exercises HTTP/stream routes. It is a demo only; it must not be presented as live data. `npm run mock:events` sends a labelled mock batch to a configured running API.

## Latest recorded checks

- Dashboard portal: production bundle rebuilt successfully on 2026-11-03 with Vite 8.3.4; the current Compose command builds and serves under `/dashboard/`.
- Hospital receptionist login path: after correcting Vite proxy targets to Docker service names, the API returned HTTP 200 through the hospital portal's proxy. Do not put test passwords or tokens in this file.
- Earlier local builds for the source-backed pharmacy UIs and other portals passed during the workspace UI update. This is not a clean-clone or full-stack release certification.
- The pharmacy API/ledger integration remains unavailable under its current legacy Fabric connection profile. Pharmacy UI health must not be reported as ledger connectivity.

Re-run the commands above after code changes. For live Fabric verification, a team operator must provide a dashboard-owned observer identity and run checks against the intended local network. Do not paste credentials or patient data into chat.
