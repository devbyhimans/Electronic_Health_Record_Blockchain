# Dashboard realtime design (Phase 3)

## Routes and authentication

| Route | Purpose | Authentication |
|---|---|---|
| `POST /api/dashboard/stream-ticket` | Issue a stream credential after JWT validation | `Authorization: Bearer <JWT>` |
| `GET /api/dashboard/ws?ticket=…` | WebSocket live updates and optional replay | One-use ticket, maximum 30 seconds |
| `GET /api/dashboard/stream?ticket=…` | Server-Sent Events live updates and optional replay | One-use ticket, maximum 30 seconds |
| `POST /internal/events` | Authenticated producer batch ingest | `X-Dashboard-Service-Key`; disabled without configured key |

Tickets are random, stored as SHA-256 digests, single-use, and bound to the verified user, role, MSP, peer, and token expiry. The dashboard never logs token or ticket values, query strings, payloads, or headers. The API logger records only HTTP method, status, and elapsed time. Reverse-proxy logs must redact ticket query parameters before deployment (`TODO(dependency: Infra)`). `/internal/events` is not routed through Nginx.

On token expiry the open stream closes; the client must authenticate again and request a new ticket. Reconnects and replay use the same current role policy as new events. Every REST, WS, SSE, and replay event is filtered using the configured role mapping; patient reference hashes are omitted from non-admin event copies.

## Replay

Clients may supply `lastEventId` to replay later retained events, or `since` to replay from a timestamp. EventStore retention bounds replay. If a requested cursor is no longer retained, the server sends a `replay-gap` notice with instructions to reconnect from a timestamp. During replay, incoming live events queue up to the configured replay limit; the server deduplicates the overlap before switching to live delivery.

## Heartbeats and limits

- WebSocket ping/pong and SSE comment heartbeats use the configured `DASHBOARD_STREAM_HEARTBEAT_MS` interval.
- `DASHBOARD_STREAM_MAX_CLIENTS` bounds combined SSE and WebSocket connections.
- `DASHBOARD_STREAM_MAX_BUFFER_BYTES` bounds each socket buffer; slow WS clients close with code 1013 and a `lastEventId` resume hint. Slow SSE clients receive a `stream-close` event where writable capacity permits.
- Replay and the temporary replay/live queue are bounded by `DASHBOARD_STREAM_REPLAY_LIMIT`.
- No additional network port is opened; both stream protocols share dashboard-api's HTTP listener on port 4010 by default.

## Browser use

The browser posts the JWT in an Authorization header to obtain a ticket, then passes only that short-lived ticket in the WS/SSE URL because those browser APIs cannot set the header. The existing UI integration remains a later phase. Local tokens are stored under the dashboard's own storage keys; same-origin hospital-token acceptance remains server-side and read-only.
