# Group 1 Dashboard — Team Notes

## Phase 1 update

Added an isolated `ehr-backend-v3/dashboard-api` foundation. It includes an Express health service, exact-version JWT verification, a file-based default-deny role matrix, topology configuration, event envelope validation, a proposal-derived event registry, response-shape contracts, and Node built-in tests. It does not connect to Fabric, a database, or other services yet.

The separate Phase 0 commits are `4b87367` (dashboard agent configuration) and `d8b03fa` (dashboard discovery report). Phase 1 adds new files only; no existing gateway, portal, chaincode, Fabric config, Compose, Nginx, or startup files were changed.

## Phase 2 update

Added the `EventStore` interface and a pure-JavaScript `NdjsonEventStore` implementation using Node built-ins only. The API opens it on startup, validates event envelopes before appending, rebuilds in-memory indexes on restart, rotates and prunes old logs, and reports store availability in `/health`. No event ingest or query route is wired yet.

The default runtime location is `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/data`, ignored by Git. `DASHBOARD_DATA_DIR` can select another repository-relative `data` folder under `dashboard-api`. Rotation defaults to 10 MiB current files and five retained archives, configurable with `DASHBOARD_STORE_MAX_FILE_BYTES` and `DASHBOARD_STORE_MAX_FILES`. The current log is additional to archived files.

Concurrent writes within the API process are serialized. Dedupe uses `eventId` and `(txId, eventType)` so one transaction can still emit distinct lifecycle events. Startup skips corrupted complete lines and truncates an incomplete final current-log line. Retention removes old events from indexes, so dedupe applies to the retained window. Keep one API process per data directory. This store is a disposable observability cache, not a tamper-evident or authoritative compliance audit log.

## How teammates can run it

From `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api`:

```text
npm install --no-audit --no-fund
npm test
npm run lint
npm start
```

Check `http://localhost:4010/health`. It reports Fabric as `NOT_CONNECTED` and the local store as `CONNECTED`; Fabric collection and ingest routes are still unimplemented. No startup or Compose script invokes the dashboard.

## How to turn it off

Do not run `npm start`; no existing service depends on dashboard-api. It is not registered with root Compose, Nginx, or startup scripts.

## JWT and lab/provider login

The API uses `DASHBOARD_JWT_SECRETS` in configured order; entry 0 is the peer0-api key, and the extorg-api key is an opt-in later entry. If the list is empty/unset, verification falls back to `JWT_SECRET` from the dashboard's own environment. To enable approved lab/provider roles, an operator adds the extorg-api `JWT_SECRET` value to their own local `DASHBOARD_JWT_SECRETS` list. Do not read/copy another service's `.env`, and never put secret values in Git or chat. Teammates who do not add the extorg key continue using peer0 tokens as before; no existing service behavior or secrets change. Lab/provider tokens return a clear unavailable message on deployments without that optional key.

JWT verification pins HS256 and requires `userId`, `role`, `mspId`, `peer`, and `exp`. Unsigned tokens and query-string tokens are not accepted. No token/ticket is logged. The local auth stub is off and not implemented.

## Role and data boundaries

The role matrix lives in `dashboard-api/config/authorization.json`. Unknown roles deny. Admin receives aggregate pages; doctor, nurse, pharmacist, and approved diagnostics roles receive only their configured agent/peer scope. Patient references are HMAC hashes and are removed from non-admin event responses. Raw patient identifiers, names, clinical values, and AI summary text are rejected by the event validator. Events without explicit logical ownership metadata remain unavailable to non-admin roles.

## Known limitations and dependencies

- Fabric block collector and ownership tagging are not implemented; block-derived events lacking `agentId` are admin-only.
- REST aggregation, stream tickets, WebSocket/SSE, login UI, Fabric collection, and gateway emitter integration do not exist yet. The local EventStore is not exposed through a route.
- The bounded NDJSON store prunes older data and is not tamper-evident; it must not be treated as the authoritative audit record. Cross-process writers are unsupported.
- `history-agent`, governance, FHIR, Security/VCAP, and AI producer integrations remain marked not connected/dependency pending.
- Docker, Nginx, and start/stop/setup integration require a separate minimal diff and approval in Phase 6.
- The existing Docker image workflow has a static matrix without dashboard-api; it will not build this image unless the workflow matrix is updated after review.

## Contact

Group 1 dashboard track owner: Himanshu. Cross-team integration owners are listed in `docs/dashboard/DEPENDENCIES.md` as that inventory is completed.
# Dashboard API team notes

## Phase 3: collector, health polling, and realtime

- Fabric collection is optional. It reads only committed block events and records transaction metadata (tx id, channel, chaincode/function, creator MSP, validation code, block number, timestamp). It never stores invocation arguments, read/write sets, or transaction payloads.
- The collector requires a dashboard-owned read-only client identity and TLS material under `dashboard-api/credentials/`. It does not inspect gateway wallets or other services' environment files. See `DASHBOARD_OBSERVER_IDENTITY.md`; those enrollment steps are a draft for an operator to run.
- The collector starts at the configured recent backfill window when there is no usable checkpoint, then resumes at checkpoint + 1. Replayed Fabric blocks are deduplicated by the event store.
- Health polling performs bounded HTTP GET requests only. Peer operations endpoints stay unconfigured until an operator supplies URLs. The pharmacy `/api/network-status` endpoint is also polled by GET; the dashboard discards its response body and does not invoke Docker itself.
- WS and SSE share the dashboard API process. Authenticated clients obtain a short-lived, single-use ticket, and streams apply the configured role policy to live and replayed events.
- The ticket must travel in the stream URL because browser WebSocket/EventSource clients cannot set Authorization headers. API request logs omit URL/query values. Before deployment, the Infra owner must ensure reverse-proxy access logs redact the `ticket` query parameter (`TODO(dependency: Infra)`); never log request targets containing stream tickets.
- The demo generator is separate from live producers. Mock events carry `mock: true`, and ingest rejects them unless `DASHBOARD_ALLOW_MOCK=true`.

## Enabling lab/provider token access

Lab/provider tokens remain disabled unless the dashboard operator adds the `extorg-api` `JWT_SECRET` value to `DASHBOARD_JWT_SECRETS` in the dashboard's own local environment. Never paste that value into chat, commit it, or copy it into a shared `.env.example`; use a local secret manager or untracked dashboard `.env`. Teammates who do not configure it continue using the normal hospital token key; their setup and tokens are unaffected.

## Runtime limitations

- The default collector identity is not provisioned by this module. Fabric status remains `NOT_CONNECTED` until the operator enrolls the dashboard observer and supplies endpoint/certificate paths.
- The dashboard has no Docker socket, Fabric network management, or restart permissions.
- Stream event replay is limited to the retained window. A `replay-gap` message signals that the requested cursor is no longer retained.
- The NDJSON store is single-process local storage. It is not a tamper-evident audit ledger; do not treat it as proof of non-repudiation.
