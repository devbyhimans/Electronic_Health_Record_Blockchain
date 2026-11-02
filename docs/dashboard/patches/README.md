# Optional producer patch drafts

These files are review material for each service owner. They have not been applied. Each gateway patch adds a non-blocking response-finish hook for evaluated GETs, 401/403 denials, and 5xx failures. It emits only service, status, and a reason code; it never sends request bodies, URL paths, query values, headers, patient references, or auth tokens.

For a gateway owner to try a draft locally, first copy `dashboardEmitter.js` to that service's `src/observability/dashboardEmitter.js`, then apply only that service's `.patch` file in a separate review branch. Both `DASHBOARD_EVENT_API_URL` and `DASHBOARD_SERVICE_KEY` must be configured in that service's own environment for delivery; otherwise the helper returns without changing service behavior. Set `DASHBOARD_EVENT_ORG` explicitly to an approved MSP identifier. Set `DASHBOARD_EVENT_AGENT_ID` only when the event can be safely attributed to that logical agent; otherwise the event remains admin-only. No gateway dependency or startup wiring is required.

The chaincode helper is a prose draft for Blockchain/Security review, not a patch to apply directly. Block collection works without it.
