# Dashboard API

Optional, read-only API foundation for Group 1 observability. It is isolated in this folder and is not wired into the root Compose stack, Nginx, or startup scripts in Phase 1. Running or failing this service does not alter existing services.

## Run locally

Requirements: Node.js 20 or later. From this directory:

```text
npm install --no-audit --no-fund
npm test
npm run lint
npm start
```

The default health URL is `http://localhost:4010/health`. It reports Fabric and store as `NOT_CONNECTED`; those integrations are not implemented in Phase 1. The service can start without JWT configuration so its health endpoint remains available, but protected operations fail closed with 503 until a key is configured.

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

## Phase 1 contracts

- `src/contracts/envelope.js` validates schema version 1. Required fields: `schemaVersion`, `eventId`, `eventType`, `timestamp`, `source`, `org`, `severity`, and `payload`. Optional fields: `peerId`, `txId`, `blockNumber`, and `correlationId`.
- `patientIdHash` is permitted only as `hmac-sha256:<64 hex chars>` in approved event payloads. Patient raw identifiers, names, clinical values, AI narrative, nested objects, and unregistered payload fields are rejected.
- The event registry includes the Group 1 transaction/health/consent types, the agreed FHIR, AI, governance, human-review, VCAP, IPFS, and emergency-access vocabulary. Producers are marked in registry metadata and remain `TODO(dependency: <team>)` until supplied by their owners.
- `src/contracts/responseShapes.js` records target response shapes. In Phase 1 the only HTTP route implemented is `GET /health`; REST aggregation and stream routes arrive in later phases.
- API errors use the existing `{ "success": false, "error": "..." }` shape. Request logs include only method, status, and duration; request headers, query, body, tokens, and event payloads are never logged.

## Container and existing workflow

The Dockerfile uses Node 20 Alpine and installs only exact, approved JavaScript package versions. It is not included in Compose until a reviewed Phase 6 patch. `.github/workflows/docker-build-push.yml` has a static image matrix that does not include dashboard-api; a new `package.json` or Dockerfile matches its path trigger on pushes to `main`/`master`, but the workflow would rebuild only its existing matrix images. The workflow is not modified in Phase 1.

## Implemented in Phase 1

This phase adds configuration loading, structured non-PHI logging, health, JWT verification, role filtering helpers, event contracts, and tests. The collector, event ingest, stream tickets, store, REST aggregation, portal wiring, login UI, deployment integration, and gateway emitter patches are not implemented yet.
