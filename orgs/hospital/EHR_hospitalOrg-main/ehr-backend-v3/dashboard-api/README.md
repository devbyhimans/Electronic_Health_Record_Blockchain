# Dashboard API

Optional, read-only API foundation for Group 1 observability. It is isolated in this folder and is not wired into the root Compose stack, Nginx, or startup scripts. Running or failing this service does not alter existing services.

## Run locally

Requirements: Node.js 20 or later. From this directory:

```text
npm install --no-audit --no-fund
npm test
npm run lint
npm start
```

The default health URL is `http://localhost:4010/health`. Fabric remains `NOT_CONNECTED`; the local EventStore starts with the API and is reported as `CONNECTED`. Event ingest and query routes are not implemented yet. The service can start without JWT configuration so its health endpoint remains available, but protected operations fail closed with 503 until a key is configured.

Copy `.env.example` to `.env` for local settings. The loader reads only this dashboard-api `.env` file, then uses process environment values in preference to file values. It does not read any other service's `.env`. Configuration file paths must be relative to the repository root.

## JWT verification

- `DASHBOARD_JWT_SECRETS` is an optional comma-separated list tried in order. The first key is the peer0-api key; add the extorg-api key as the second item to enable approved diagnostics-role JWTs. If the list is unset or empty, the API falls back to the dashboard process's `JWT_SECRET`.
- Never copy another service's secret into this repository or chat. The operator places the required key in their own local environment. The sample `.env.example` contains placeholders only.
- Tokens are verified with HS256 only. Unsigned tokens, `alg: none`, expired tokens, and tokens missing any of `userId`, `role`, `mspId`, `peer`, or a valid `exp` are rejected. Token strings and claim values are never logged.
- An extorg-role token without a configured extorg verification key receives an explicit “Lab/provider login is not enabled” 401 response. A valid signature does not override the authorization matrix.
- No token is accepted from a URL or query parameter. The planned WebSocket/SSE stream ticket contract is documented in `src/contracts/responseShapes.js`; tickets are not implemented until the realtime phase.
- `DASHBOARD_AUTH_STUB` is `false` by default. Phase 1 has no stub-auth path; setting it to `true` is rejected rather than granting access.

## Role authorization

The source of truth is `config/authorization.json`; authorization code reads the mapping from that file rather than embedding routes-to-roles in handlers. Missing/unknown roles deny by default. Configuration changes take effect after a service restart.

| Exact JWT role | Allowed views |
|---|---|
| `admin` | All aggregate views, alerts, traces, and agent pages. Patient references are HMAC hashes only. |
| `doctor` | Doctor peer, clinical/history/governance agents, and their traces/events. |
| `nurse` | Nurse logical agent and assigned peer health only. |
| `pharmacist` | Pharmacy logical agent and assigned peer health only. |
| `labtechnician`, `labsupervisor`, `labadmin`, `radiologist` | Lab agent and diagnostics peer health only. |
| `patient`, `receptionist`, `patientService`, `medrecordofficer`, `labreceptionist`, `insuranceofficer`, `claimsauditor`, `billingofficer`, `provideradmin`, missing/unknown roles | Denied. |

`patientService` is a Fabric identity in the patient API, not an observed JWT role. `provideradmin` is an observed JWT role but is not in the approved allowlist, so it is denied. Pharmacy-app roles such as manager, inventory, and billing are not supported.

The same authorization helpers are intended for REST, WebSocket, SSE, and replay paths. Non-admin events must carry an allowed `payload.agentId`; only peer health can be filtered by physical `peerId` alone. A shared nurse/pharmacy peer therefore cannot expose one role's transactions to the other. Events without enough ownership metadata are admin-only. Non-admin event responses remove `patientIdHash`; the zero-PHI envelope validator rejects raw patient IDs, names, clinical values, and AI narrative fields for every role.

The peer0-api and extorg-api source code signs the same `userId`, `role`, `mspId`, and `peer` claims using `JWT_SECRET`. Runtime values are not read. Extorg tokens are accepted only when the operator supplies the extorg key as a later entry in `DASHBOARD_JWT_SECRETS`.

## Phase 2 EventStore

The `EventStore` interface is implemented by `NdjsonEventStore` using Node's built-in filesystem modules only. It validates event envelopes before persistence, serializes concurrent writes in one API process, appends one JSON event per line, and synchronizes each appended record before reporting success. In-memory indexes support lookup by event ID, transaction ID, event type, organization, and agent.

- `DASHBOARD_DATA_DIR` is repository-relative and defaults to `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/data`. The configured directory must be named `data` under `dashboard-api`; it is Git-ignored. The store never reads or writes ledger, IPFS, or other service data.
- `DASHBOARD_STORE_MAX_FILE_BYTES` defaults to 10 MiB. When a current log would exceed the limit, it is renamed to a numbered archive. `DASHBOARD_STORE_MAX_FILES` defaults to 5 archived files; older archives are pruned when rotation occurs. The current log is retained in addition to those archives.
- Duplicates are suppressed by `eventId` and by `(txId, eventType)`, preserving separate transaction lifecycle event types for one Fabric transaction. Dedupe history is limited to events still retained after pruning.
- Startup rebuilds indexes from archived logs followed by the current log. Invalid complete lines are skipped; an incomplete final line in the current log is truncated before future appends. Counts are visible only through internal `getStats()` and no payloads are logged.
- The store is a disposable, rebuildable observability cache, not the authoritative medical or compliance audit record. Filesystem edits are not tamper-evident. Run only one dashboard-api process against a data directory; multi-process writers and shared network filesystems are not supported.
- Tests measure a 1,000-event batch and indexed query. Timings depend on the host and filesystem; the test reports its observed values.

Configuration rejects absolute or repository-escaping data paths. The sample path and values are placeholders, not machine-specific settings.

## Phase 1 contracts

- `src/contracts/envelope.js` validates schema version 1. Required fields: `schemaVersion`, `eventId`, `eventType`, `timestamp`, `source`, `org`, `severity`, and `payload`. Optional fields: `peerId`, `txId`, `blockNumber`, and `correlationId`.
- `patientIdHash` is permitted only as `hmac-sha256:<64 hex chars>` in approved event payloads. Patient raw identifiers, names, clinical values, AI narrative, nested objects, and unregistered payload fields are rejected.
- The event registry includes the Group 1 transaction/health/consent types, the agreed FHIR, AI, governance, human-review, VCAP, IPFS, and emergency-access vocabulary. Producers are marked in registry metadata and remain `TODO(dependency: <team>)` until supplied by their owners.
- `src/contracts/responseShapes.js` records target response shapes. In Phase 1 the only HTTP route implemented is `GET /health`; REST aggregation and stream routes arrive in later phases.
- API errors use the existing `{ "success": false, "error": "..." }` shape. Request logs include only method, status, and duration; request headers, query, body, tokens, and event payloads are never logged.

## Container and existing workflow

The Dockerfile uses Node 20 Alpine and installs only exact, approved JavaScript package versions. It is not included in Compose until a reviewed Phase 6 patch. `.github/workflows/docker-build-push.yml` has a static image matrix that does not include dashboard-api; a new `package.json` or Dockerfile matches its path trigger on pushes to `main`/`master`, but the workflow would rebuild only its existing matrix images. The workflow is not modified in Phase 1.

## Implemented in Phase 1

Phases 1 and 2 add configuration loading, structured non-PHI logging, health, JWT verification, role filtering helpers, event contracts, and the local EventStore with tests. The collector, event ingest, stream tickets, REST aggregation, portal wiring, login UI, deployment integration, and gateway emitter patches are not implemented yet.
