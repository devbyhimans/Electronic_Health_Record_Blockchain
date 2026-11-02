# Group 1 Dashboard Dependencies

| Dependency | Owner | Current status | Required interface |
|---|---|---|---|
| Peer0 JWT | Hospital API/Security | Source code uses `JWT_SECRET` and claims `userId`, `role`, `mspId`, `peer`; runtime key is supplied only by the operator. | HS256 token accepted when the peer0 key is configured in the dashboard environment. |
| Extorg JWT | Diagnostics/Provider API/Security | Source code uses the same variable name and claim keys, but keys are treated as distinct by default. | Operator may add extorg key after peer0 key in local `DASHBOARD_JWT_SECRETS`; no service `.env` is read. |
| Fabric committed blocks | Blockchain team | Implemented as an optional block-event collector using the gateway library major already used by the gateways. No `stub.setEvent()` dependency. | `ehrchannel` committed block metadata; observer identity and TLS files supplied only through dashboard-owned env. |
| Hospital gateway push events | Peer0/peer1/peer2 owners | Not connected; emitter and draft patches are in `patches/`. | Optional emitter for denied/failed actions and evaluated reads; patches are proposals and are not applied. |
| Extorg/lab gateway events | Diagnostics API owner | Not connected; emitter and draft patch are in `patches/`. | Optional emitter for denied/failed actions and evaluated reads; patch is a proposal and is not applied. |
| Pharmacy API events | Pharmacy API owner | Not connected. | Optional event producer; pharmacy-app roles remain out of scope. |
| FHIR conversion | FHIR team | Proposal defines `FHIR_CONVERSION_STARTED`, `FHIR_CONVERSION_COMPLETED`, and `FHIR_CONVERSION_FAILED`; implementation status not verified here. | Common event envelope; aggregate identifiers only. |
| AI and history agents | Agentic AI team | Not connected; history agent is present as a logical config entry only. | Agent lifecycle, fallback, stage, governance, and human-review events. |
| Security/VCAP | Security team | Not connected. | Consent/access, emergency-access, VCAP and audit events without PHI. |
| IPFS health | IPFS service owner | Existing `/health` is public; runtime not verified. | Status and aggregate counts only; no payload retrieval. |
| Persistent event store | Group 1 | Implemented in Phase 2 as `EventStore` / `NdjsonEventStore`, Node built-ins only. | Single-process append-only NDJSON cache with in-memory indexes, retention, and restart recovery. |
| Dashboard auth/stream clients | Security / dashboard | Implemented ticket endpoint, REST role filters, and role-filtered WS/SSE. | Stream ticket lifetime is 30 seconds max, one-time, and bound to the verified user/role; deployment access logs must redact ticket query parameters. |
| Dashboard portal API wiring | Group 1 | Phase 5 wired login, REST data pages, agent traces, and ticket-authenticated WebSocket in the local worktree. Server role policy remains authoritative. | Clean-clone build/lint and role-aware browser verification remain pending; portal role-view config is currently a mirror of API policy. |
| Demo producer | Group 1 | `npm run demo` sends labelled events and exercises local HTTP routes for the role matrix. | Mock is accepted only with `DASHBOARD_ALLOW_MOCK=true` and always carries `mock: true`. |
| Dashboard deployment | Group 1 / Phase 6 | Local Compose profile, Nginx routes, dashboard container config, and `ENABLE_DASHBOARD=true` startup opt-in are implemented. | Docker validation remains pending. Keep the dashboard profile/flag disabled by default. Do not expose `/internal/events` through Nginx. |

Every unavailable producer must remain marked `TODO(dependency: <team>)` and display as not connected. Mock fixtures are separate from live events and must be visibly labelled.
