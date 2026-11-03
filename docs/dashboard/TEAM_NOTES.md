# Group 1 dashboard team notes

## Current implementation

The dashboard API, portal integration, and optional Compose/Nginx wiring are in the repository. Root `./start.sh` starts `h-dashboard-api` and `h-dashboard-portal` only when `dashboard-api/.env` exists. The dashboard is read-only against Fabric. It does not manage Docker or alter the Fabric network.

API port: `4010` (host-bound to loopback by Compose). Portal: `5176`, served through Nginx at `/dashboard/`. Public dashboard API prefix: `/api/dashboard/`. Internal ingest route `POST /internal/events` is not exposed by Nginx.

## Authentication and role policy

- The portal calls the hospital peer0 login route and stores its own `ehr_dashboard_token` and `ehr_dashboard_user` keys. On 401 it returns to its dashboard login screen.
- API verifies HS256 only with required claims `userId`, `role`, `mspId`, `peer`, and `exp`.
- Keys come only from the dashboard's own environment: `DASHBOARD_JWT_SECRETS` (ordered list), falling back to dashboard-local `JWT_SECRET`.
- Extorg/lab/provider token keys are optional. Add the appropriate value to the operator's local dashboard secret list to enable those tokens. Do not read/copy another service's `.env`, place keys in Git, or paste secrets in chat.
- `config/authorization.json` is the server-side source of truth, default deny. Admin has aggregate views. Doctor is limited to clinical/history/governance agents and peer1; nurse to the nurse logical scope/peer2; pharmacist to pharmacy agent/peer2; approved lab roles to lab agent/diagnostics peer. Patient and other unlisted roles are denied.
- Non-admin REST, WebSocket, SSE, and replay results apply the same filtering; patient reference hashes are omitted. UI role configuration only mirrors the server policy.

## Event integrity and data status

Events use schema v1 and a strict registry. The validator rejects raw patient IDs, names, clinical values, and AI narrative. The collector reads committed Fabric block metadata and never depends on `setEvent` calls. It excludes transaction arguments, read/write sets, and payload values.

`EventStore` is append-only NDJSON with in-memory indexes, dedupe, restart recovery, rotation, and pruning. It is a rebuildable telemetry cache, not the authoritative ledger or a tamper-evident audit store. Keep one API process per data directory.

Actual data sources must remain clearly distinct from mock/demo events. Synthetic events are marked `mock: true` and are generated separately. Unavailable agents and producers show not connected. The history agent is a registry entry without a live emitter.

## Dependencies still owned by other teams

Gateway emitters for failed/denied actions and evaluated reads, lab/pharmacy producers, AI/history/governance, FHIR conversion, Security/VCAP, and other producer integrations are not connected by default. Optional patch drafts in `docs/dashboard/patches/` require the owning team's review. No chaincode patch is deployed by this module.

A dashboard-owned read-only observer identity is required for real Fabric block collection. CPU/memory/disk/IPFS storage metrics are deferred. Docker socket access is intentionally not part of the dashboard.

## Run and inspect

From the repository root:

```bash
./start.sh
docker compose --profile dashboard ps
docker compose logs --tail=100 h-dashboard-api h-dashboard-portal
```

Use `./stop.sh` to stop services without deleting volumes. For API tests/demo commands and historical verification notes see [`TESTING.md`](TESTING.md). Never use mock mode to represent real service activity.
