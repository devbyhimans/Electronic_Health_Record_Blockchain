# Group 1 Dashboard Discovery — Phase 0

**Status:** Discovery only. No dashboard implementation or shared deployment configuration was changed in this phase.

**Scope:** Group 1 dashboard API, event pipeline, aggregation, and dashboard portal, with the existing Fabric, hospital API, IPFS, lab, and pharmacy services recorded as dependencies. Existing hospital, patient, pharmacy, lab, chaincode, and Fabric network behavior remains outside this phase.

## 1. Repository and environment state

- Branch: `himanshu/group1-realtime-events`, created from `origin/main` after fetching `main`.
- `HEAD`, `origin/main`, and the fetched `main` resolved to `1fd3dc3ef777140a4503bf523b36a500bdb5da8f` before the config commit.
- One requested isolated commit was made: `4b87367 dashboard: add agent configuration`. It contains only `dashboard-portal/src/config/agentConfig.js`.
- The workspace already had unrelated modified and untracked files before the commit. They remain unstaged and uncommitted. The current dashboard's `App.jsx`, `useDashboardSocket.js`, `services/api.js`, and `vite.config.js` are pre-existing modified files; the build below includes those working-tree versions.
- Docker access is unavailable to this session: `docker ps --format ...` returned `permission denied while trying to connect to the Docker API at unix:///var/run/docker.sock`.

## 2. What exists and deployment evidence

| Component | Observed state | Evidence |
|---|---|---|
| Dashboard portal | React/Vite application exists. `start-sequential.sh` has a Vite launch entry on port 5176. | `start-sequential.sh:26`; `dashboard-portal/package.json:1-30` |
| Dashboard API | No `ehr-backend-v3/dashboard-api` source tree was found. No dashboard API service is defined in root Compose. | `rg --files ehr-backend-v3`; `rg -n 'dashboard-api' docker-compose.yaml` |
| Nginx dashboard routes | No `/dashboard/` or `/api/dashboard/` location was found in current Nginx config. | `nginx/nginx.conf` search |
| Dashboard portal base path | Vite config sets host and port 5176 but no `base` option. The app has root and `/dashboard` route trees. | `dashboard-portal/vite.config.js:5-11`; `src/App.jsx:21-49` |
| Hospital APIs | Six service folders exist: peer0, peer1, peer2, extorg, patient, IPFS. Root docs/config list ports 4001-4006. | `docker-compose.yaml`; service package manifests; root `.env.example:30-35` |
| Fabric network | The network config describes `ehrchannel`, HospitalMSP, DiagnosticsMSP and ProviderMSP, with five peers and an orderer. | `README.md` network section; `ehr-network/docker/docker-compose-network.yaml` |
| Lab gateway | Express gateway serves the lab UI and exposes `/api/health`; startup script configures port 8080. | `client/node-gateway/server.js:35,526-535`; `start-sequential.sh:38` |
| Pharmacy backend | Express backend exposes `/health` and `/api/network-status`; implementation of network status invokes Docker CLI commands. | `app/backend/app.js:194,487-520` |
| Digilocker | Specification/readme only; no implementation was found. | `orgs/digilocker/README.md`; repository file inventory |
| Dashboard service runtime | NOT VERIFIED. Docker socket permission prevented container inspection; process listing did not establish a running service. | `docker ps` command output and process-list command output |

The repository’s root README calls the dashboard proposed and describes API port 4010, portal port 5176, and `/dashboard/`. The current `start-sequential.sh` starts only the portal; root Compose and Nginx do not wire either dashboard service. These are distinct facts from config and source inspection, not a live deployment check. See `README.md:143-148,170-185,254-285`, `start-sequential.sh:26`, `docker-compose.yaml`, and `nginx/nginx.conf`.

The current dashboard's `/dashboard` index route redirects to the absolute `/overview`, and its navigation links use root-absolute paths such as `/network`. The Vite config has no `base: '/dashboard/'` setting. Therefore the documented `/dashboard/` base path is not verified and the existing route/link behavior appears inconsistent with serving strictly under that prefix. This is a source-level finding only; Nginx is not configured for the dashboard and no browser smoke test was possible. Evidence: `dashboard-portal/src/App.jsx:35-47`, `src/components/layout/Layout.jsx:6-14`, and `vite.config.js:5-11`.

## 3. Current dashboard pages, routes, and data sources

The app defines routes under both `/` and `/dashboard`. Each has an index redirect and seven page routes plus a parameterized agent detail route (`src/App.jsx:21-49`). No route guard or login route appears in this router.

| Route | Page/component | Current data/API behavior | Current access guard |
|---|---|---|---|
| `/overview` and `/dashboard/overview` | Overview | Uses hard-coded KPI values and randomly generated chart values; no API call. `Overview.jsx:7-17`. | None in current route tree. |
| `/network` and `/dashboard/network` | Network | Renders peer entries from `agentConfig`; no API call. `Network.jsx:1-7`. | None. |
| `/agents` and `/dashboard/agents` | Agents | Renders AI and peer entries from `agentConfig`; no API call. `Agents.jsx:1-7`. | None. |
| `/agents/:agentId` and `/dashboard/agents/:agentId` | AgentDashboard | Calls `fetchApi('/agents/:agentId')`; with current default mock mode, the client returns mock data instead of making a request. `AgentDashboard.jsx:23-40`; `services/api.js:1-7,31-74`. | None in current route tree. |
| `/transactions` and `/dashboard/transactions` | Transactions | Uses generated mock transactions; no API call. `Transactions.jsx:6-13,42-53`. | None. |
| `/security` and `/dashboard/security` | Security | Uses generated mock audit data; no API call. `Security.jsx:6-14`. | None. |
| `/ipfs` and `/dashboard/ipfs` | IPFS | Uses mock files; no API call. `IPFS.jsx:5-13,56`. | None. |
| `/logs` and `/dashboard/logs` | Logs | Generates local mock log events; no API call. `Logs.jsx:4-27`. | None. |

The shared layout opens a WebSocket at `/api/dashboard/ws` only when mock mode is disabled; it displays a fixed initial block value and retries on a fixed 15-second delay in the current hook. There is no SSE connection. `Layout.jsx:16-18,55-66`; `useDashboardSocket.js:3-8,15-39`.

Mock mode is enabled by default and no visible mock-mode banner was found in the app shell or pages. The Overview, Transactions, Security, IPFS, and Logs pages display hard-coded or generated values without a visible mock label; this conflicts with the agreed rule that mock data must never be presented as live. Evidence: `services/api.js:2,31-74`, `pages/Overview.jsx:7-17`, `pages/Transactions.jsx:6-13`, `pages/Security.jsx:6-14`, `pages/IPFS.jsx:5-13`, and `pages/Logs.jsx:4-27`.

## 4. Dashboard API contract status

### Present in current code

- The frontend client uses `BASE_URL = '/api/dashboard'` and defines `fetchApi`. Its default is mock mode unless `VITE_USE_MOCK=false`. `src/services/api.js:1-7`.
- In non-mock mode, the client reads `localStorage['ehr_token']`, attaches it as a Bearer token, and redirects to `/login` on HTTP 401. `src/services/api.js:9-21`.
- The only page call found is `GET /api/dashboard/agents/:agentId`, initiated through the relative endpoint `/agents/:agentId`. In default mock mode this does not reach a service. `AgentDashboard.jsx:30-36`; `services/api.js:4-7`.
- The dashboard API service, event contract, collector, normalizer, store, realtime server, auth adapter, and `/internal/events` ingest endpoint do not exist yet.

### Agreed target routes (not implemented)

| Method/transport | Path | Purpose |
|---|---|---|
| POST | `/internal/events` | Authenticated service-to-service event ingest; do not expose through Nginx. |
| WebSocket | `/api/dashboard/ws` | Authenticated, role-filtered event stream. |
| SSE | `/api/dashboard/stream` | Authenticated, role-filtered stream. |
| GET | `/api/dashboard/overview` | Aggregate dashboard overview. |
| GET | `/api/dashboard/network` | Network summary. |
| GET | `/api/dashboard/transactions` and `/transactions/metrics` | Transaction list and aggregate metrics. |
| GET | `/api/dashboard/agents`, `/agents/:agentId`, `/agents/:agentId/executions`, `/agents/:agentId/metrics` | Agent registry and aggregate metrics/executions. |
| GET | `/api/dashboard/executions/:runId/trace` | Ten-stage execution trace. |
| GET | `/api/dashboard/security/events`, `/ipfs`, `/alerts`, `/events` | Security, IPFS, alerts, and event views. |

These are target contracts from the Group 1 README and proposal, not existing route implementations. The attachment and README list some REST paths differently; the route list above should be finalized in the API requirements before implementation. The agreed WebSocket/SSE and ingest paths are from the user’s Phase 0 answers.

## 5. Existing integration endpoints and role/auth evidence

| Dependency | Relevant observed endpoint or interface | Status/notes |
|---|---|---|
| peer0-api | `GET /health`; `POST /auth/login` (router mounted at `/auth`); service port 4001. | Existing login issues a JWT with `userId`, `role`, `mspId`, `peer`; expiry uses `JWT_EXPIRES_IN`. `peer0-api/src/routes/auth.js:26-54`; app mount and port in `src/app.js`. |
| Other hospital APIs | peer1 4002; peer2 4003; extorg 4004; patient 4005; IPFS service 4006. | Route families mounted in each service `src/app.js`; root `.env.example:30-35`. No dashboard-specific data API exists. |
| Hospital portal token | `ehr_hospital_token` and `ehr_hospital_user` localStorage keys. | `hospital-portal/src/context/AuthContext.jsx:7-23`. Dev server origins differ from dashboard (5173 vs 5176), so their local storage is not shared in development. |
| Dashboard token | Reads `ehr_token`; dashboard has no `/login` route. | `dashboard-portal/src/services/api.js:9-21`; `src/App.jsx:21-49`. The agreed login plan needs to reconcile `ehr_token`, the new dashboard key, and same-origin hospital token acceptance. |
| IPFS service | `GET /health` is public; `/pins` is protected by the service API key middleware. | `ipfs-service/src/app.js:29-53`; `src/routes.js:124-149`. Dashboard should consume health/status only, not expose payloads/CIDs outside approved aggregate views. |
| Lab gateway | `GET /api/health`. | `client/node-gateway/server.js:526-528`. |
| Pharmacy backend | `GET /health`, `GET /api/network-status`. | `app/backend/app.js:193-204,485-520`; `/api/network-status` invokes Docker commands. |

Existing JWT middleware verifies Bearer tokens with `JWT_SECRET` and checks known role labels in some routes. `peer0-api/src/middleware/auth.js:7-40`. Token issuance and auth are service-local code; shared-secret equality across services has not been runtime-verified.

### Proposed role matrix — approval required before implementation

All dashboard responses remain zero-PHI and aggregate-only. This is a proposal for your review, not an implemented policy.

| JWT role/category | Proposed dashboard access |
|---|---|
| `admin` | All aggregate dashboard pages and cross-org aggregate views. |
| `doctor` | Doctor/clinical agent aggregate view only. |
| `nurse` | Nurse agent aggregate view only. |
| `pharmacist` | Pharmacy/dispensing agent aggregate view only. |
| Diagnostics roles (`labtechnician`, `radiologist`, `labsupervisor`, `labadmin` if confirmed) | Lab peer and lab-agent aggregate view only. |
| `patient` | Denied. |
| Unknown/unmapped role | Denied. |

Approval is still needed on whether each professional role sees a peer, an AI agent, or both; whether `admin` may see security events and cross-org data; and which exact diagnostics role labels map to the category above. The existing dashboard currently has no authorization guards.

## 6. Event and observability findings

- A repository-wide search of the hospital, lab, and pharmacy chaincode found no `stub.setEvent()` calls. The hospital backend functionality document also says chaincode events are absent (`ehr-backend-v3/FUNCTIONALITY.md:335`).
- The collector must therefore consume committed block events and derive transaction outcome/event metadata from block data; it must not depend on chaincode events. No collector exists yet.
- The agreed envelope is the README superset plus `schemaVersion`; required/optional fields and the zero-PHI validator remain to be specified in the contracts phase.
- The agreed 10 trace stages are Report received, OCR/Parsing, FHIR conversion, Encrypted + IPFS stored, Record anchored, Agent processing, Governance, Human review, VCAP anchored, and VCAP verified. Statuses are `DONE`, `FAILED`, `SKIPPED`, `PENDING`, `WAITING_HUMAN`; correlation ID aligns AI run ID and VCAP execution ID. Producers not present remain `TODO(dependency: <team>)` and must show Not connected.
- Denied/failed gateway actions and evaluated read queries must be pushed by the owning gateways through the future emitter. Gateway code is frozen pending review of proposed patches.
- Peer Compose sets operation listen addresses and maps operation ports, but the mounted `core.yaml` says `operations.listenAddress: 127.0.0.1:9443` and `metrics.provider: disabled` (`ehr-network/configtx/core.yaml:748-782`). Effective runtime binding is NOT VERIFIED. CPU, memory, and disk metrics are deferred; only health and block-height metrics are in current scope.
- The pharmacy network status endpoint runs Docker CLI operations (`app/backend/app.js:497-520`); no Docker stats integration should be assumed.
- `agentConfig.js` (now commit `4b87367`) defines five peer entries and three AI agents. It contains endpoint strings and metric labels; these are configuration/UI metadata, not live discovery or verified metrics. It lacks the agreed logical `history-agent`, which must be added later with `Not connected` until an emitter exists.

## 7. Proposed topology and infrastructure

| Item | Current/proposed value | Evidence/status |
|---|---|---|
| Fabric channel | `ehrchannel` | Root README and hospital network config. Use as default; configurable topology remains required. |
| MSPs | `HospitalMSP`, `DiagnosticsMSP`, `ProviderMSP` | `ehr-network/docker/docker-compose-network.yaml` and root README. |
| Peers | Three hospital peers, one diagnostics peer, one provider peer | `ehr-network/docker/docker-compose-network.yaml`; actual process state NOT VERIFIED. |
| Orderer | One Raft orderer; operation port configured/mapped as 17050 | Same Compose file; runtime NOT VERIFIED. |
| Dashboard API | 4010, proposed container `h-dashboard-api` | README proposal only; not wired into Compose. |
| Dashboard portal | 5176; proposed container `h-dashboard-portal`; public base `/dashboard/` | `start-sequential.sh:26` confirms local dev port; container/base-path wiring absent. |
| Existing API ports | 4001-4006 | Root `.env.example:30-35` and service-level examples. |
| Existing UI/service ports | Hospital 5173; patient 5174; pharmacy frontend 5175; dashboard 5176; lab gateway 8080; IPFS API 5001 and gateway 8090 | Root README, environment example, startup scripts and Nginx/Compose files; not all runtime-verified. |

No dashboard `.env.example` or dashboard-specific environment variables were found. Existing project examples include `JWT_SECRET`, `JWT_EXPIRES_IN`, `FABRIC_CHANNEL`, `FABRIC_CHAINCODE`, peer address variables, `IPFS_SERVICE_URL`, and `IPFS_SERVICE_KEY`. Their values were not copied into this report. The implementation will need new dashboard variables for port, service key, JWT secret access, config path, and mock/stub flags; exact names must be finalized before Phase 1.

## 8. Dashboard dependency versions and requested baseline

Environment: Node `v22.22.1`, npm `9.2.0`.

Declared ranges in `dashboard-portal/package.json` include React/React DOM `^19.2.8`, React Router `^7.18.4`, Vite `^8.3.0`, Tailwind `^3.4.19`, Recharts `^3.10.1`, and lucide-react `^1.48.0` (`package.json:12-29`). Installed versions from `npm list --depth=0` were React/React DOM `19.3.1`, React Router `7.18.4`, Vite `8.3.4`, Tailwind `3.4.19`, Recharts `3.10.1`, and lucide-react `1.57.0` (plus the listed dev dependencies).

| Command | Result |
|---|---|
| `npm install --no-audit --no-fund` in dashboard-portal | Exit 0; “up to date in 185ms.” The runner printed three `Failed to create stream fd: Operation not permitted` messages. No package manifest/lockfile change appeared in `git status`. |
| `npm run build` in dashboard-portal | Exit 0; Vite 8.3.4 built 2,521 modules in 731ms. Outputs: 21.61 kB CSS and 691.58 kB minified JS. Vite warned that a chunk exceeds 500 kB. |

This baseline used the existing working tree, including pre-existing modified dashboard files; it does **not** prove a clean clone build. The requested build was run only for dashboard-portal. No tests, lint, other app builds, or `npm audit` were run.

## 9. Open implementation dependencies

| Dependency | Owner | Needed before the related integration is live |
|---|---|---|
| JWT claims, token handoff, and role authorization policy | Security / user approval | Approved role matrix; common JWT secret contract; dashboard login decision. |
| Event producer helpers for hospital/lab/pharmacy gateways | Respective API owners / user approval | Review and approve per-file patches before any gateway changes. |
| Optional chaincode `emitEvent` helper | Blockchain/Security | Draft patch only; no chaincode edits or deployment by Group 1. Block listener remains the chosen source. |
| FHIR conversion events | FHIR team | Producer and event payload contract. |
| AI, governance, human-review, VCAP events | AI/Security teams | Producer identifiers, event names, and payloads. |
| IPFS events | Storage/IPFS owner | Approved source for status-only aggregate events. |
| Docker/Nginx/startup integration | User review | Minimal diffs only, shown for approval before applying. |
| SQLite store/aggregation service ownership | Group 1 full scope per updated instruction | Schema, retention, idempotency, and metrics semantics must be agreed before store/API implementation. |

## 10. Required local Docker checks

The session could not access `/var/run/docker.sock`; no containers, Fabric peers/orderer, IPFS node, or Docker-backed service health could be verified. To restore the normal user’s Docker-group access, run:

```bash
id -nG
sudo usermod -aG docker "$USER"
```

Then log out and back in (or run `newgrp docker` in a new terminal), and check:

```bash
docker ps
```

If the daemon is not running, check `sudo systemctl status docker` and start it with `sudo systemctl start docker`. Do not make `/var/run/docker.sock` world-writable with `chmod 666`.

After access works, the not-yet-possible checks are: container/service inventory, live peer/orderer/CAs/IPFS health, effective operations endpoint binding, network block heights, and live pharmacy/lab service responses. No `docker compose up/down`, volume operation, or network mutation was run.

## 11. Phase 0 exit status

The dashboard-specific discovery report and requested portal install/build baseline are complete. The proposed role matrix and the implementation dependencies above require review before Phase 1. No dashboard API, database, collector, UI wiring, gateway patch, chaincode patch, or shared deployment change was implemented in Phase 0.
