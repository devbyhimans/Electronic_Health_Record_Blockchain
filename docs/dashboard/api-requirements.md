# Dashboard API requirements and Phase 4 contract

## Portal input alignment

The existing `dashboard-portal` has one REST call in `src/components/AgentDashboard.jsx`: `GET /api/dashboard/agents/:agentId` via `src/services/api.js`. The API helper expects a direct JSON object. `AgentDashboard` renders flat `health`, `metrics`, `chartData`, `events`, and `aiProps` fields. Its Overview, Network, Transactions, Security, IPFS, Logs, and Agents listing pages use local display data and currently make no API calls.

Phase 4 keeps the approved response wrapper `{ "success": true, "data": ... }`. For agent details the canonical shape is `{ agent, metrics, executions: { items, status }, events: { items, status } }`; the current portal expects the fields at the response root and has additional legacy metric names (`runs`, `averageLatency`, `fallbackRate`) plus chart samples. It also supplies peer IDs as route keys, so the API supports configured peers at `/agents/:peerId` as well as logical agents. Phase 5 must unwrap `data`, map supported metrics/status values, and remove unsupported chart or fabricated fixture rows. Portal files are deliberately unchanged in Phase 4.

The portal's current development helper uses the key `ehr_token` and redirects 401s to `/login`. The approved dashboard login flow and keys are `ehr_dashboard_token` / `ehr_dashboard_user`; a 401 must render the dashboard login page. This is a Phase 5 wiring gap.

## Response conventions

- Success: `{ "success": true, "data": ... }`.
- Error: `{ "success": false, "error": "..." }`.
- Every derived or monitored value carries a source status where relevant: `{ "state": "OK" | "NO_DATA" | "NOT_CONNECTED", "reason": string | null, "since": UTC timestamp | null }`.
- Unavailable counts/rates/latencies/heights are `null`, never `0`. Counts are zero only when a connected source actually observed zero matching events.
- Lists use `{ items, page: { limit, hasMore, nextCursor }, status }`; page limits are 1–100. Cursors are opaque base64url timestamp/event ID pairs. Sort is `asc` or `desc`.
- Time filters accept either ISO `from`/`to` or one `window` preset (`1m`, `5m`, `1h`, `24h`). Combining them is rejected.
- A `mock: true` marker remains on every demo event. It is not presented as live Fabric or producer activity.
- Aggregates and heartbeat-derived status include `mock: true` when they depend on mock events, so the portal can label the demo state explicitly.

## Routes

All REST routes below are authenticated under `/api/dashboard`; authorization is default-deny and uses `config/authorization.json`. The stream-ticket route is retained from Phase 3. `/internal/events` is not part of this public API and must not be exposed through Nginx.

| Route | Access | Phase 4 data |
|---|---|---|
| `GET /overview` | Admin | Network, transaction summary, agents, security counts, IPFS, persisted active alerts |
| `GET /network`, `/peers`, `/orderers`, `/channels` | Admin | Configured topology plus collector-observed channel/chaincode and health-poller state; demo-only health observations are marked `mock: true` |
| `GET /transactions` | Admin | Paginated metadata events; filters include time, status, org, chaincode, function, severity, source, and sort |
| `GET /transactions/metrics?window=...` | Admin | Outcome counts/rates, MVCC, endorsement, transaction rate, honest latency values |
| `GET /agents` | Admin and allowed agent/peer roles | Only targets in the caller's role map |
| `GET /agents/:agentId` | Admin and that agent/peer scope | Status, metrics, executions, metadata-only events |
| `GET /agents/:agentId/executions`, `/metrics` | Admin and that target scope | Paginated stitched executions and per-agent values |
| `GET /executions/:runId`, `/trace` | Admin or a caller with matching owned events | Stitched trace using `correlationId` (= AI `runId` = VCAP execution ID) |
| `GET /security`, `/security/events` | Admin | Aggregate security counts and safe security events |
| `GET /ipfs` | Admin | Health-poller status and event-derived upload/failure counts; storage use is deferred |
| `GET /alerts` | Admin | Persisted active alerts, including recovery from alert events |
| `POST /alerts/:alertId/acknowledge` | Admin | Optional audit event; not found when the alert engine has no active matching alert |
| `GET /logs/events` | Admin | Paginated, filtered safe event metadata |
| `POST /stream-ticket` | Any authenticated role in the matrix | One-time, short-lived ticket for the approved WS/SSE endpoints |

## Role map

| Role | Dashboard targets |
|---|---|
| `admin` | All pages, peers, agents, traces, and aggregate events |
| `doctor` | `peer1.hospital`; `clinical-agent`, `history-agent`, `governance-agent`; matching traces |
| `nurse` | `peer2.hospital` only |
| `pharmacist` | `peer2.hospital`, `pharmacy-agent` |
| `labtechnician`, `labsupervisor`, `labadmin`, `radiologist` | `peer0.diagnostic`, `lab-agent` |
| All other, unknown, or missing roles | Denied |

Network, Transactions, Security, IPFS, Logs, and Alerts are admin-only. Scoped event queries apply role/org/agent/peer indexes before controller shaping; WebSocket/SSE replay and REST use the same policy. Non-admin event responses omit `patientIdHash` entirely. Patient hash visibility for admin does not permit raw patient identifiers or clinical content.

## Metric and status semantics

- `txPerMinute` uses observed transaction outcome events over the selected window. Success means `TRANSACTION_COMMITTED`; failure includes `TRANSACTION_FAILED`, `MVCC_CONFLICT`, and `ENDORSEMENT_FAILED`. No outcome events yields `null` values with `NO_DATA`.
- Latency is populated only from an explicit safe `durationMs` or an execution's observed start/end timestamps. The Fabric collector does not infer transaction latency from block time. Without producer durations, average and p95 are `null` with a reason.
- Agent requests count `API_ACTION_EVALUATED`; executions and outcome rates use agent execution events. Model/version/VCAP and last heartbeat appear only when a producer supplied them.
- Peer/orderer status comes from configured health-poller targets. Peer block height is `null` because the current allowed health source does not expose a peer ledger height. Ledger lag is `NOT_AVAILABLE` without comparable real heights. CPU, memory, disk, and IPFS storage use are `DEFERRED`.
- History/governance and other missing producers remain `NOT_CONNECTED` with `TODO(dependency: <team>)`; the API does not synthesize live activity.
- Trace stages are ordered by the ten-stage contract. Latest timestamp wins for duplicate stage updates; unknown stage names are preserved and flagged. A pending run whose agent is offline is `UNKNOWN`.

## Security and operational behavior

The JSON body limit, ingest validation, API/ingest rate limits, security headers, exact-origin CORS allow-list, JWT HS256 verification, and response error wrapper are enforced in the API. With an empty `DASHBOARD_CORS_ALLOWED_ORIGINS`, no cross-origin browser permission is emitted; same-origin requests work normally. Request logs contain method, response status, and duration only. They omit URL, query, headers, body, token, and ticket values.

The Fabric normalizer emits transaction ID, chaincode, function, creator MSP, validation code, timestamp, channel, and block number only. Transaction arguments, response payloads, and read/write sets are not event fields. The event envelope validates a strict field allow-list before store append. The API returns a safe metadata envelope rather than block or transaction protobufs.
