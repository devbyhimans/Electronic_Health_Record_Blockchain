# Dashboard API

Optional read-only observability API for Group 1. It provides event contracts, local storage, committed-block metadata collection, bounded HTTP health polling, authenticated REST aggregation, trace stitching, stream-ticket auth, WebSocket/SSE delivery, and a separately labelled mock generator. It does not write to Fabric and it does not expose its internal ingest endpoint through Nginx.

The API container is `h-dashboard-api` on port `4010`; the dashboard portal is `h-dashboard-portal` on `5176`, published through Nginx at `/dashboard/`. Both use the `dashboard` Compose profile. Root `./start.sh` includes them only if this folder's ignored `.env` file exists.

## Local configuration and security

Copy `.env.example` to this folder's `.env` for local use. The loader reads only this dashboard-owned file plus the process environment. Never copy another service's `.env`, commit a secret, or paste credentials into chat.

- JWT verification is HS256-only and requires `userId`, `role`, `mspId`, `peer`, and `exp` claims. Missing, expired, unsigned, or `alg: none` tokens are rejected.
- `DASHBOARD_JWT_SECRETS` is a comma-separated ordered list. `JWT_SECRET` in the dashboard environment is the fallback when the list is not set. Lab/provider access works only if the operator adds that service's signing key to their own dashboard environment; otherwise the API returns a clear not-enabled response.
- Role access is loaded from `config/authorization.json`, with default deny. `admin` can see aggregate dashboard views. Doctor, nurse, pharmacist, and approved lab roles are restricted to configured agents/peers. Patient and unspecified roles are denied.
- The event validator rejects raw patient identifiers, names, clinical values, and AI narrative. `patientIdHash` can be represented only in its approved hashed form and is omitted for non-admin users.
- Browser tokens are not placed in URLs. Clients request a short-lived, one-use stream ticket and use it to open `/api/dashboard/ws` or `/api/dashboard/stream`. Do not log ticket URLs.

## Event storage and sources

`EventStore` is implemented by `NdjsonEventStore` using Node built-ins. It appends NDJSON, serializes writes within one process, indexes retained records in memory, deduplicates by event ID and `(txId, eventType)`, rebuilds indexes after restart, handles invalid/partial log lines, rotates files, and prunes old archives. It is a disposable telemetry cache, not the Fabric ledger, a tamper-evident audit log, or the authoritative clinical record. Run one API process per data directory.

The Fabric collector reads committed blocks and emits transaction metadata only; it does not rely on chaincode `setEvent` calls and does not collect arguments, read/write sets, or clinical values. It requires observer credentials supplied under the dashboard module's configured credential paths. Health polling is GET-only and bounded. CPU, memory, disk, peer ledger height/lag, and IPFS storage usage are not collected by the current deployment.

The registry includes the agreed event vocabulary. AI, history, governance, FHIR, security, lab, and pharmacy producer integrations remain `not connected` until their owners provide real emitters. `history-agent` is a logical registry entry, not a connected producer. Synthetic events are marked `mock: true` and are generated separately.

## Routes

All public REST routes are under `/api/dashboard` and use authentication and role filtering. The implemented route families include overview, block analytics (`GET /blocks/metrics?window=24h|7d|30d`), network/peers/orderers/channels, transactions and metrics, agents and executions, traces, security events, IPFS, alerts, event queries, and stream-ticket issuance. Block charts use retained Fabric transaction metadata and do not synthesize events; total height requires an active collector. Daily buckets cannot include empty blocks because Fabric block headers do not provide a timestamp. Live transports are `/api/dashboard/ws` and `/api/dashboard/stream`. `POST /internal/events` requires `X-Dashboard-Service-Key` and is intentionally not routed through Nginx.

See [`docs/dashboard/api-requirements.md`](../../../../../docs/dashboard/api-requirements.md), [`docs/dashboard/event-architecture.md`](../../../../../docs/dashboard/event-architecture.md), [`docs/dashboard/realtime-design.md`](../../../../../docs/dashboard/realtime-design.md), and [`docs/dashboard/PROJECT_HANDOFF.md`](../../../../../docs/dashboard/PROJECT_HANDOFF.md).

## Run and verify

Node.js 20 or newer:

```bash
npm ci
npm test
npm run lint
npm start
```

`npm run demo` starts an isolated local demo with synthetic data and a separate data directory. It is not a real Fabric integration. For the full workspace use `./start.sh` from the repository root. The health route is `http://localhost:4010/health` when the API is running.
