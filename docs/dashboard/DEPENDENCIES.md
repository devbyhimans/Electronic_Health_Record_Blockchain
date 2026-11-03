# Dashboard dependencies

The core dashboard API/portal and deployment wiring are implemented. Rows marked `not connected` require a real source owner; they are not replaced with synthetic live events.

| Dependency | Owner | Current status | Required interface |
|---|---|---|---|
| Peer0 JWT | Hospital API / Security | Code claim shape is known; runtime key is operator-supplied. | HS256 token with `userId`, `role`, `mspId`, `peer`, `exp`; configure key only in dashboard-owned environment. |
| Extorg JWT | Diagnostics / Provider API / Security | Treated as a separate key by default. | Operator may add extorg key after peer0 key in local `DASHBOARD_JWT_SECRETS`; dashboard reads no other service `.env`. |
| Fabric committed blocks | Blockchain / dashboard operator | Collector implemented; real collection requires a dashboard-owned read-only identity and TLS config. | Committed `ehrchannel` block metadata; no chaincode `setEvent` dependency. |
| Hospital gateway events | Peer0 / peer1 / peer2 owners | Not connected; optional draft patches are in `patches/`. | Approved emitter for denied/failed actions and evaluated reads; safe allow-listed payload only. |
| Extorg/lab gateway events | Diagnostics API owner | Not connected; optional draft patch is in `patches/`. | Approved emitter for denied/failed actions and evaluated reads. |
| Pharmacy events | Pharmacy API owner | Not connected; current backend topology is not aligned with root network. | Real producer only after approved connection/profile and API contract; pharmacy-app roles remain out of scope. |
| FHIR conversion | FHIR team | Not connected. Registry vocabulary is present. | Started/completed/failed events using common envelope; aggregate identifiers only. |
| AI and history agents | Agentic AI team | Not connected. `history-agent` is logical registry metadata only. | Agent lifecycle, fallback, stage, governance, and human-review events. |
| Security / VCAP | Security team | Not connected. | Consent/access, emergency-access, VCAP and audit events without PHI. |
| IPFS health and events | IPFS service owner | HTTP health target is configured; event producers/storage metrics are not connected. | Status and aggregate counts only; never retrieve patient payloads into the dashboard. |
| Event store | Group 1 | Implemented as one-process `EventStore` / `NdjsonEventStore`. | Local append-only NDJSON telemetry cache with in-memory indexes, dedupe, recovery, rotation, pruning. |
| Dashboard auth and streams | Group 1 / Security | Implemented: authenticated REST, short-lived tickets, WS/SSE, replay role filtering. | Ticket is one-time, bound to verified identity, and expires quickly; never log its URL. |
| Portal wiring | Group 1 | Implemented: login, role-aware navigation, REST views, traces, live connection state, theme switch. | API remains the authorization authority. Mock data must stay labelled. |
| Dashboard deployment | Group 1 / Infra | Optional Compose profile, Nginx routes, root `start.sh` opt-in by dashboard `.env` presence. | Do not route `/internal/events`; keep API host binding loopback. |

The current service topology and known integration boundaries are in the root [README](../../README.md). Every unavailable producer must display as not connected. Draft emitter/chaincode patches are not applied code.
