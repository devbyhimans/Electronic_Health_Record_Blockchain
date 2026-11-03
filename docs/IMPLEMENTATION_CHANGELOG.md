# EHR Project Implementation Record

This document records the dashboard, portal, documentation, and reliability work completed on `himanshu/group1-realtime-events` through commit `a46bdfd`. It separates features present in code from integrations that still need credentials, external team work, or live environment validation.

## 1. Branch and implementation timeline

The current branch is based on `main` commit `1fd3dc3`. The dashboard work was delivered incrementally:

| Commit | Work |
|---|---|
| `4b87367` | Added the dashboard agent configuration required by the portal. |
| `d8b03fa` | Recorded the Phase 0 discovery and project inventory. |
| `1eaa826` | Added the Phase 1 API foundation: contracts, authorization policy, topology configuration, and JWT verification. |
| `f0ebaa8` | Added the Phase 2 append-only NDJSON event store. |
| `cfc584d` | Added the Phase 3 real-time event layer and committed-block collector foundation. |
| `eaf5947` | Added the Phase 4 aggregation API, trace stitching, alerting, and dashboard data routes. |
| `31c667b` | Unified the EHR portal appearance and improved the root service startup workflow. |
| `a46bdfd` | Updated project documentation and portal UI, fixed pharmacy form/build issues, added the patient portal shell, and added Fabric block analytics. |

## 2. Dashboard API foundation and access control

### Implemented

- Optional `dashboard-api` service on port `4010` and dashboard portal on port `5176`, served under `/dashboard/`.
- HS256-only JWT verification with required claims and configurable secrets from the dashboard process environment. `DASHBOARD_JWT_SECRETS` is tried in order; `JWT_SECRET` is the dashboard-local fallback.
- Config-file role policy at `dashboard-api/config/authorization.json`, with default deny. Admins can access global aggregate pages; supported non-admin roles are limited to their configured peer/agent/org scopes. Patient and unknown roles are denied.
- Authenticated one-time stream tickets, WebSocket and SSE streams, event replay filtering, REST authorization, and reconnect checks.
- Service-key-protected `POST /internal/events`; it is not routed through Nginx.
- Error and success response contracts, request rate limits, security headers, and no-store API responses.

### Safety behavior

- The event envelope rejects raw patient identifiers, names, clinical values, and other prohibited PHI-like fields.
- Non-admin dashboard responses omit `patientIdHash` and filter events to authorized ownership scopes.
- Tokens and stream tickets are not logged or placed in URLs by the dashboard authentication flow.
- Dashboard event collection is read-only with respect to Fabric; it does not submit transactions or depend on chaincode `setEvent()` calls.

## 3. Event store, collection, and real-time delivery

### Event store

- EventStore interface backed by a pure-JavaScript NDJSON append-only log.
- In-memory indexes for event type, organization, source, transaction, agent, peer, and correlation lookups.
- Dedupe by event ID and transaction/event identity; restart recovery; serialized concurrent append operations; rotation and pruning.
- Corrupt and partial trailing records are handled during recovery without exposing discarded record contents.
- Configurable data location and storage limits. Runtime data is not intended to be committed.

### Fabric collector

- Collector reads committed blocks and extracts only safe metadata such as transaction ID, chaincode/function names, creator MSP, validation result, timestamp, and block number.
- It intentionally drops transaction arguments, chaincode response payloads, and read/write sets.
- The collector uses the Fabric Gateway client, a configured channel and peer, and dedicated observer identity/TLS files.
- Backfill is configurable; the default is 200 blocks. Checkpoints preserve collector progress across restarts.

### Real-time delivery

- `GET /api/dashboard/ws` and `GET /api/dashboard/stream` use short-lived single-use stream tickets.
- WebSocket/SSE event delivery and replay apply the same authorization filters as REST.
- Slow WebSocket clients are closed with a resumable backpressure status.
- Mock generator and demo mode are separate from live collection; mock events carry `mock: true`.

## 4. Aggregation API and dashboard analytics

- Implemented overview, network, peers/orderers/channels, transactions, security, IPFS, alerts, logs, agent, execution, and trace routes.
- Aggregations derive counts and status from stored events and configured health probes; unknown metrics remain null/unavailable rather than being fabricated.
- Trace stitching uses the shared correlation/run identifier and handles late, duplicate, missing, failed, skipped, pending, and waiting-human stages.
- Alert evaluation includes de-duplication, minimum duration, resolution hysteresis, and persisted alert state.

### Fabric blocks and transactions

Added admin-only `GET /api/dashboard/blocks/metrics?window=24h|7d|30d` and dashboard charts for:

- Total ledger block count from the collector's last processed Fabric block number.
- Transaction count in the latest transaction-bearing observed block.
- Retained transaction totals and transaction-bearing block counts for the selected window.
- Hourly series for 24 hours and daily UTC series for 7 or 30 days.

The series uses actual transaction event timestamps and block numbers retained from Fabric. The UI shows an empty/unavailable state when those events are missing. Fabric block headers do not carry a ledger timestamp, so empty blocks cannot be assigned to a day in this chart; the UI documents this limitation. Empty blocks are included in total ledger height once the collector has a live checkpoint, but are not included in daily transaction-bearing block series.

## 5. UI and design system changes

- Dashboard now uses a spacious clinical blue palette, top navigation pills, role-filtered navigation, responsive layout, live connection indicator, and updated overview cards.
- Block analytics include responsive chart windows, counts, tooltips, UTC labels, coverage text, and explicit no-data handling.
- Hospital and patient portals share the light/dark theme tokens and consistent card, form, table, and navigation styling.
- Pharmacy main, manager, employee, inventory, and billing portals share the blue clinical surface and control styling while preserving their routes and current API wiring.
- Lab console aligns with the shared blue palette; the mode switch sits in the header controls rather than floating over content.
- Theme controls were moved into persistent page headers/sidebars or existing navigation bars to avoid overlap.
- No sample clinical values or fake patient records were added to the new dashboard analytics.

## 6. Pharmacy patient portal

- Added the missing React entry point, app, theme toggle, styles, and Vite proxy configuration under `app/patient/src/`.
- Added the patient service to the root `start.sh` pharmacy startup group. Compose and Nginx already had a patient portal service/route.
- The portal is intentionally a status-only shell. The current pharmacy API exposes patient record routes without a verified patient-authenticated session mechanism; using those routes for a patient login would risk exposing PHI.
- It checks pharmacy API health only, shows that patient record access is unavailable, and does not make patient-record or clinical-data requests.
- Real patient features require backend support for verified identity, patient-scoped authorization, and consent/access enforcement.

## 7. Bugs and build issues corrected

- Pharmacy record creation previously treated network failures and unsuccessful HTTP responses as success, closing the form. It now checks response status, displays an error, and only calls the success handler after a successful response.
- Pharmacy record creation previously submitted a constant age of 30. It now derives age from the supplied date of birth and rejects invalid/future dates.
- Pharmacy dashboard frontend lint findings were corrected: unused bindings, `fetchRecords` effect ordering/state update issue, unused config variable, missing Node `process` import in Vite config, and an empty storage-error handler.
- Four pharmacy staff portal Vite configs disable CSS minification because the local installed Vite dependency tree lacks both the Lightning CSS native binary and esbuild minifier. Production builds pass with unminified CSS; this is a deployment-size/tooling tradeoff, not a functional UI issue.
- Lab theme button overlap was fixed by reserving a separate control-grid cell at desktop sizes and stacking controls on narrow screens.
- Dashboard services were rebuilt/recreated after the block analytics change; the earlier running containers were serving stale code.

## 8. Verification performed

- Dashboard API Node test suite: **75 tests passed** after block analytics was added. Includes auth/role matrix, PHI-safe event handling, collector fixtures, REST/WebSocket/SSE, storage recovery/concurrency/rotation, aggregation, and block metrics.
- Dashboard portal production build passed, with the existing large JavaScript chunk warning.
- Hospital portal, patient portal, and dashboard portal production builds passed during UI work.
- Pharmacy main frontend ESLint and production build passed after form/lint fixes.
- Pharmacy manager, employee, inventory, billing, and new patient portal production builds passed. Staff/patient builds use `cssMinify: false` due missing native minifier dependencies.
- `docker compose config --quiet`, `bash -n start.sh`, JavaScript syntax checks, and `git diff --check` passed.
- Live dashboard containers were inspected and recreated. The portal bundle and API container were verified to contain the new analytics implementation.

## 9. Current limitations and remaining work

### Required for real block data

The dashboard health endpoint currently reports `collector.status: NOT_CONNECTED` and `lastProcessedBlock: null`. The dashboard observer `.env` lacks Fabric endpoint and certificate paths, and its `credentials/` directory is empty. Therefore the block chart is implemented but the live block values remain unavailable.

The Blockchain/Security owner must provision a dedicated HospitalMSP observer identity with appropriate read-only operational permissions and arrange local enrollment/TLS files. Place the files in `dashboard-api/credentials/`, set the dashboard-local Fabric environment values, then rebuild/restart `h-dashboard-api`. Do not copy another service's wallet or commit credential files. Never send keys or certificates in chat.

### Other integration dependencies

- AI, history, governance, FHIR, Security/VCAP, lab, pharmacy, and gateway event producers remain disconnected unless their owners provide real emitters.
- `history-agent` remains a registry entry only.
- Pharmacy backend Fabric profile remains tied to legacy `Org1MSP`/`mychannel` assumptions and does not match the current `ehrchannel`/MSP topology.
- Patient pharmacy account authentication and patient-scoped record APIs remain unimplemented; the patient UI must stay status-only until they exist.
- CPU/memory/disk, peer operations endpoint metrics, and IPFS storage usage remain deferred.
- A team member should perform a clean-clone verification before release/PR completion.

## 10. Deployment and repository state

- Feature branch: `himanshu/group1-realtime-events`.
- Latest documented implementation commit: `a46bdfd`.
- Shared project startup remains `./start.sh`; stop with `./stop.sh`.

## 11. Real-time ledger observability, UI inspector, and CLI polish

### Block telemetry and cryptography
- Implemented ASN.1 SHA-256 block header hashing (`calculateBlockHash`), producing exact cryptographic verification where block $N$'s `previousHash` equals block $N-1$'s `blockHash`.
- Added extraction of node endpoint (`peer0.hospital.example.com (peer0.hospital.example.com:7051)`), previous hash, data hash, transaction IDs, and block timestamp.
- Added `'all'` window (`Infinity` duration) to block metrics, merging collector backfill into `byBlock` series so all historical ledger blocks and transactions are counted and bucketed accurately.
- Verified test suite passes: 76 unit tests pass (`npm test`).

### Frontend UI and interactive inspector
- Added `<option value="all">All time</option>` to Overview history dropdown.
- Fixed horizontal scroll container tooltip clipping (`overflow-x: auto`) by rendering a floating tooltip at page root using `position: fixed` calculated from viewport bounding rects.
- Added an interactive **Block Inspector Panel** directly below the block stream card: defaults to latest block on load, updates on block card selection with blue ring indicator, and provides 1-click clipboard copy buttons for block hash, node address, previous hash, data hash, and individual transaction IDs.
- Dark mode and light mode styled consistently across all newly added UI elements.

### Service startup, gateway reliability, and routing
- Polished `./start.sh` with a compact 65-column aligned service status table, clear separation of browser web portals from headless REST health endpoints, default login credentials, and fast startup without forced rebuilds.
- Reordered Nginx startup to step `[6/6]` with an automatic reload/restart to flush stale Docker DNS cache and prevent `502 Bad Gateway`.
- Enhanced `stop.sh` with clean three-stage shutdown (apps, Fabric nodes, CAs) preserving persistent volumes.
- Added redirect on `dashboard-api` root (`/`, `/dashboard`, `/dashboard/`) pointing to `http://localhost/dashboard/` for seamless browser navigation.
