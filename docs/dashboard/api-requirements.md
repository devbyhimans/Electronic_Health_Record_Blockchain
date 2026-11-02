# Dashboard API contract and portal alignment

This document records the implemented API surface. The API is optional and read-only against Fabric. The portal calls these routes through `/api/dashboard`; errors use `{ "success": false, "error": "..." }`, and successful responses use `{ "success": true, "data": ... }`.

## Role policy

The server loads `dashboard-api/config/authorization.json`; default is deny. This configuration is the source of truth and must be changed/restarted to update policy. The portal navigation mirrors it for usability only.

| Exact role | Allowed scope |
|---|---|
| `admin` | All aggregate dashboard pages, traces, agents, and configured peers. Patient reference hash may be visible; raw identifiers and clinical content are never allowed. |
| `doctor` | `peer1.hospital`, `clinical-agent`, `history-agent`, `governance-agent`, owned traces/events. |
| `nurse` | `peer2.hospital` nurse scope; events require logical ownership metadata. |
| `pharmacist` | `peer2.hospital`, `pharmacy-agent`, owned events only. |
| `labtechnician`, `labsupervisor`, `labadmin`, `radiologist` | `peer0.diagnostic`, `lab-agent`, owned events only. |
| Other/missing/unknown role | Denied. This includes patient, receptionist, `patientService`, medical records, lab receptionist, provider/billing roles, and pharmacy app roles. |

Global Network, Transactions, Security, IPFS, Logs, Alerts, and global trace views are admin-only. Authorization is checked on REST, WebSocket, SSE, reconnect, and replay. Non-admin event responses omit `patientIdHash` and are filtered by configured agent/peer/org ownership.

## Routes

All REST paths below are prefixed `/api/dashboard` and require a valid JWT for an allowed role unless otherwise stated.

| Method/path | Scope | Purpose |
|---|---|---|
| `GET /overview` | Admin | Network, transaction, agent, security, IPFS, and active-alert aggregates. |
| `GET /blocks/metrics?window=24h\|7d\|30d` | Admin | Real Fabric block height, transactions in the latest observed transaction-bearing block, and UTC hourly/daily counts from retained committed-block events. Daily history excludes empty blocks because Fabric block headers do not carry a ledger timestamp. |
| `GET /network`, `/peers`, `/orderers`, `/channels` | Admin | Configured topology and observed health/block collection state. Configuration is distinct from live status. |
| `GET /transactions`, `GET /transactions/metrics` | Admin | Paginated metadata events and event-derived outcome metrics. |
| `GET /agents` | Admin or scoped user | Only the caller's allowed agent/peer targets. |
| `GET /agents/:agentId` | Admin or matching scope | Agent/peer status, observed metrics, executions, safe events. |
| `GET /agents/:agentId/executions`, `/metrics` | Admin or matching scope | Paginated traces and event-derived metrics. |
| `GET /executions/:runId`, `/executions/:runId/trace` | Admin or owner with matching events | Stitched trace using `correlationId` (same logical ID as AI run ID / VCAP execution ID). |
| `GET /security`, `/security/events` | Admin | Aggregate security status and safe security events. |
| `GET /ipfs` | Admin | Health status and event-derived counts; storage usage is deferred. |
| `GET /alerts` | Admin | Persisted active alert summaries. |
| `POST /alerts/:alertId/acknowledge` | Admin | Acknowledge an active alert and record the alert event. |
| `GET /logs/events` | Admin | Paginated safe event metadata. |
| `POST /stream-ticket` | Allowed authenticated role | Issue a short-lived one-use ticket for a browser stream. |
| `GET /ws?ticket=…`, `GET /stream?ticket=…` | Ticket | WebSocket or SSE delivery with the same role filtering applied to replay/live events. |

`POST /internal/events` is a separate service-to-service endpoint protected by `X-Dashboard-Service-Key`. It is not routed through Nginx. It validates envelopes, applies limits, deduplicates, and rejects prohibited PHI. Mock events require explicit server configuration and keep `mock: true`.

## Status and metric semantics

- Configured topology does not imply a connected peer, orderer, agent, or organization.
- Missing data is represented as `null` with `NO_DATA`, `NOT_CONNECTED`, `NOT_CONFIGURED`, or `DEFERRED`, not as a fabricated zero.
- Peer block height/ledger lag, CPU, memory, disk, and IPFS storage use remain unavailable/deferred without an approved real source.
- Fabric collection uses committed block metadata; it does not infer latency from block time and does not include arguments, response payloads, or read/write sets.
- Health polling is bounded and GET-only; response bodies are discarded. An HTTP response proves only that endpoint responded, not that its backing Fabric action succeeded.
- All demo events carry `mock: true`; mock metrics remain labelled.

## Security behavior

JWT uses HS256 only and requires `userId`, `role`, `mspId`, `peer`, and `exp`. `DASHBOARD_JWT_SECRETS` is an ordered list from the dashboard's environment, with dashboard-local `JWT_SECRET` fallback. Lab/provider keys must be configured separately by the local operator. Token and ticket values are not logged. Browser stream auth uses a one-time ticket because WebSocket/EventSource cannot set an Authorization header.

The event envelope schema v1 rejects raw patient identifiers, names, clinical values, AI narrative, and unsupported nested fields. The NDJSON store is a disposable single-process operational cache, not the authoritative Fabric ledger or a tamper-evident compliance record.
