# Group 1 Dashboard Dependencies

| Dependency | Owner | Current status | Required interface |
|---|---|---|---|
| Peer0 JWT | Hospital API/Security | Source code uses `JWT_SECRET` and claims `userId`, `role`, `mspId`, `peer`; runtime key is supplied only by the operator. | HS256 token accepted when the peer0 key is configured in the dashboard environment. |
| Extorg JWT | Diagnostics/Provider API/Security | Source code uses the same variable name and claim keys, but keys are treated as distinct by default. | Operator may add extorg key after peer0 key in local `DASHBOARD_JWT_SECRETS`; no service `.env` is read. |
| Fabric committed blocks | Blockchain team | No `stub.setEvent()` calls found; collector will derive transaction metadata from committed blocks. | `ehrchannel` block metadata; no transaction args/read-write values. |
| Hospital gateway push events | Peer0/peer1/peer2 owners | Not connected. | Optional emitter for denied/failed actions and evaluated reads; per-file patches require approval. |
| Extorg/lab gateway events | Diagnostics API owner | Not connected. | Optional emitter for lab/security events; patch requires approval. |
| Pharmacy API events | Pharmacy API owner | Not connected. | Optional event producer; pharmacy-app roles remain out of scope. |
| FHIR conversion | FHIR team | Proposal defines `FHIR_CONVERSION_STARTED`, `FHIR_CONVERSION_COMPLETED`, and `FHIR_CONVERSION_FAILED`; implementation status not verified here. | Common event envelope; aggregate identifiers only. |
| AI and history agents | Agentic AI team | Not connected; history agent is present as a logical config entry only. | Agent lifecycle, fallback, stage, governance, and human-review events. |
| Security/VCAP | Security team | Not connected. | Consent/access, emergency-access, VCAP and audit events without PHI. |
| IPFS health | IPFS service owner | Existing `/health` is public; runtime not verified. | Status and aggregate counts only; no payload retrieval. |
| Persistent event store | Group 1 / Phase 2 | Not implemented. | Disposable, rebuildable cache; library requires separate approval. |
| Dashboard deployment | Group 1 / Phase 6 | Shared files unchanged. | Optional Compose profile, Nginx routes and startup wiring as reviewed diffs. |

Every unavailable producer must remain marked `TODO(dependency: <team>)` and display as not connected. Mock fixtures are separate from live events and must be visibly labelled.
