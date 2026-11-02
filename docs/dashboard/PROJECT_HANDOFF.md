# Dashboard module handoff

**Current implementation:** Group 1 dashboard API, portal wiring, and optional deployment are present in this branch. The dashboard is read-only with respect to Fabric. This handoff records code/config behavior, not a claim that every optional external producer is connected at runtime.

## Architecture

- API: `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/`, Node 20+, port `4010`, Compose service `h-dashboard-api` under the `dashboard` profile.
- Portal: `orgs/hospital/EHR_hospitalOrg-main/ehr-frontend-v2/dashboard-portal/`, Compose service `h-dashboard-portal`, port `5176`, Nginx path `/dashboard/`.
- Nginx publishes `/api/dashboard/`; `/internal/events` is deliberately not proxied.
- Root `./start.sh` starts dashboard services only when the dashboard API's local ignored `.env` exists. The dashboard does not require changes to chaincode, Fabric network configuration, or peer APIs.
- Dashboard topology defaults to channel `ehrchannel` and organizations `HospitalMSP`, `DiagnosticsMSP`, and `ProviderMSP`, through `config/topology.json`.

## Implemented behavior

- HS256-only JWT verification with required `userId`, `role`, `mspId`, `peer`, and `exp` claims. The dashboard reads only its own environment. `DASHBOARD_JWT_SECRETS` is tried in order, with dashboard-local `JWT_SECRET` fallback. Extorg/lab/provider JWT support is opt-in by adding the matching key to the dashboard's own local secret list.
- Role-to-view policy is loaded from `config/authorization.json`; default is deny. Admin has aggregate views. Doctor, nurse, pharmacist, and approved lab roles are limited to their configured agent/peer scope. Patient, receptionist, and other unapproved roles are denied.
- Envelope schema v1 and registry enforce the zero-PHI event boundary. Raw patient identifiers, names, clinical values, and narrative AI output are rejected. Non-admin event copies omit `patientIdHash`.
- `NdjsonEventStore` is a single-process local operational cache with in-memory indexes, deduplication, restart recovery, rotation, pruning, and partial/corrupt-line handling. It is not tamper-evident and is not the authoritative audit record.
- Fabric observation uses committed block metadata, not chaincode event emission. It requires a separately provisioned dashboard observer identity and TLS configuration. Arguments, read/write sets, and payloads are excluded.
- Bounded GET-only health polling, service-key-protected `POST /internal/events`, authenticated REST aggregation/metrics/traces, short-lived one-time stream tickets, WebSocket, SSE, and a separate labelled mock/demo generator are implemented.
- Portal has login/access-denied views, role-aware navigation, REST data views, agent/traces, real-time connection status, logout, and light/dark theme control. Server-side authorization remains authoritative.

## Dependency status

Not connected by default: AI clinical/history/governance producers, Security/VCAP emitters, FHIR conversion producers, lab and pharmacy event emitters, and gateway denied-action/read-query emitters. The registry and topology show these as not connected or dependency pending. `history-agent` is a logical registry entry only. Optional gateway and chaincode event patches in `docs/dashboard/patches/` are proposals for their owners; they have not been applied.

The Fabric collector can derive transaction metadata from committed blocks once an operator supplies a dashboard-owned observer identity and matching endpoints. CPU, memory, disk, peer block-height/lag, and IPFS storage usage remain deferred. The dashboard has no Docker socket and cannot start/restart services.

## Configuration and operation

1. Copy `dashboard-api/.env.example` to `dashboard-api/.env` locally; keep the file ignored.
2. Set dashboard-owned JWT key(s), service key, data/checkpoint paths, and optional observer settings locally. Do not read/copy other service `.env` files or paste secrets into chat.
3. Start with `./start.sh` or Compose's `dashboard` profile. Verify `http://localhost:4010/health` and `http://localhost/dashboard/`.
4. A healthy HTTP/API container does not prove Fabric collection or other producers are connected. Use the portal status fields and event source metadata.

## Verification record and remaining work

The dashboard portal production bundle rebuilt successfully in the current workspace during the UI refresh. Earlier API tests and clean-clone checks are documented in `docs/dashboard/TESTING.md`; rerun them against the current branch before release. Live committed-block observation still needs an operator-provisioned observer identity and a real Fabric end-to-end check. Producer integration and teammate clean-clone review remain outstanding.

The current top-level project status, supported URLs, pharmacy/lab limitations, and startup semantics are in the root [README](../../README.md). Phase 0 discovery is retained as a historical baseline in [`docs/audit/DASHBOARD_DISCOVERY.md`](../audit/DASHBOARD_DISCOVERY.md).
