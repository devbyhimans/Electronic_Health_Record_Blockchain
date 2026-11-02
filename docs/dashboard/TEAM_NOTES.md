# Group 1 Dashboard — Team Notes

## Phase 1 update

Added an isolated `ehr-backend-v3/dashboard-api` foundation. It includes an Express health service, exact-version JWT verification, a file-based default-deny role matrix, topology configuration, event envelope validation, a proposal-derived event registry, response-shape contracts, and Node built-in tests. It does not connect to Fabric, a database, or other services yet.

The separate Phase 0 commits are `4b87367` (dashboard agent configuration) and `d8b03fa` (dashboard discovery report). Phase 1 adds new files only; no existing gateway, portal, chaincode, Fabric config, Compose, Nginx, or startup files were changed.

## How teammates can run it

From `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api`:

```text
npm install --no-audit --no-fund
npm test
npm run lint
npm start
```

Check `http://localhost:4010/health`. It intentionally reports Fabric and store as `NOT_CONNECTED` until later phases implement those integrations. No startup or Compose script invokes the dashboard in Phase 1.

## How to turn it off

Do not run `npm start`; no existing service depends on dashboard-api. It is not registered with root Compose, Nginx, or startup scripts.

## JWT and lab/provider login

The API uses `DASHBOARD_JWT_SECRETS` in configured order; entry 0 is the peer0-api key, and the extorg-api key is an opt-in later entry. If the list is empty/unset, verification falls back to `JWT_SECRET` from the dashboard's own environment. To enable approved lab/provider roles, an operator adds the extorg-api `JWT_SECRET` value to their own local `DASHBOARD_JWT_SECRETS` list. Do not read/copy another service's `.env`, and never put secret values in Git or chat. Teammates who do not add the extorg key continue using peer0 tokens as before; no existing service behavior or secrets change. Lab/provider tokens return a clear unavailable message on deployments without that optional key.

JWT verification pins HS256 and requires `userId`, `role`, `mspId`, `peer`, and `exp`. Unsigned tokens and query-string tokens are not accepted. No token/ticket is logged. The local auth stub is off and not implemented.

## Role and data boundaries

The role matrix lives in `dashboard-api/config/authorization.json`. Unknown roles deny. Admin receives aggregate pages; doctor, nurse, pharmacist, and approved diagnostics roles receive only their configured agent/peer scope. Patient references are HMAC hashes and are removed from non-admin event responses. Raw patient identifiers, names, clinical values, and AI summary text are rejected by the event validator. Events without explicit logical ownership metadata remain unavailable to non-admin roles.

## Known limitations and dependencies

- Fabric block collector and ownership tagging are not implemented; block-derived events lacking `agentId` are admin-only.
- No database, REST aggregation, stream ticket, WebSocket/SSE, login UI, or gateway emitter integration exists yet.
- `history-agent`, governance, FHIR, Security/VCAP, and AI producer integrations remain marked not connected/dependency pending.
- Docker, Nginx, and start/stop/setup integration require a separate minimal diff and approval in Phase 6.
- The existing Docker image workflow has a static matrix without dashboard-api; it will not build this image unless the workflow matrix is updated after review.

## Contact

Group 1 dashboard track owner: Himanshu. Cross-team integration owners are listed in `docs/dashboard/DEPENDENCIES.md` as that inventory is completed.
