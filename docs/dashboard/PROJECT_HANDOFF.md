# Group 1 Dashboard — Project Handoff

**Last updated:** 2026-11-03
**Owner:** Himanshu (Group 1, real-time event architecture)
**Branch:** `himanshu/group1-realtime-events`
**Current phase:** Phase 6 wiring is implemented locally; Phase 7 integration verification, tests/demo, and final documentation remain.

This document is the current status handoff for the Group 1 dashboard module. It records committed work, local uncommitted work, operator setup, known failures, scope boundaries, and the remaining work. `docs/audit/DASHBOARD_DISCOVERY.md` remains the detailed Phase 0 inventory. The phase-specific contracts and dependency notes linked below remain authoritative for their technical details; this handoff summarizes their current status.

## 1. Executive summary

Group 1 owns the dashboard API, read-only event collection/normalization, event storage, role-filtered real-time delivery, aggregation, and wiring of the dashboard portal. Phases 0–4 are committed locally. Portal wiring (Phase 5), optional deployment wiring (Phase 6), a JWT example-secret guard, and this handoff are currently local changes and have not been committed yet.

The dashboard is designed to be optional and fail-safe. It must remain opt-in in Compose and startup scripts. It does not change chaincode, Fabric network configuration, or other teams’ application code. Existing event producers are not connected; the API can collect committed block metadata when an operator supplies the dashboard-owned observer identity. No real Fabric peer was running in the user’s most recent terminal output.

The user’s full-stack Compose attempt failed while rebuilding existing pharmacy containers: npm rejected `@rolldown/binding-linux-x64-gnu` because those containers use Alpine/musl. The dashboard portal Compose image was changed to `node:20-slim`; pharmacy files were not changed. The dashboard can be started independently using its Compose profile and `--no-deps`, but real login needs peer0-api and live block events need Fabric plus observer credentials.

The design targets are FHIR R4, ABDM/ABHA, India DPDP Act 2023, HIPAA-style controls, and GDPR as a reference. These are academic/demo design targets, not legal certifications. The implementation focus is zero-PHI events and integrity of the operational event trail. Supported UI targets are desktop Chrome and mobile Chrome/Safari, English only. Digilocker is inventoried as proposed/unverified work and remains out of implementation scope.

No secrets, tokens, keys, wallets, or patient data are included here. The dashboard’s ignored local `.env` exists because the operator copied it from `.env.example`; a safe metadata check found its JWT key is still an example placeholder. The example is now ignored by JWT configuration, so it cannot silently become a signing key. The operator must set the real peer0 signing key in the dashboard’s own environment to enable login.

## 2. Repository and Git state

At the time of this handoff:

- `HEAD` is `eaf5947` (`feat(dashboard): add Phase 4 aggregation API`).
- `origin/main` resolves to `1fd3dc3`, the branch base.
- `origin/himanshu/group1-realtime-events` is at `1eaa826`; local Phase 2–4 commits are ahead of that remote tracking ref.
- No push has been made for Phase 2–6.
- The dashboard `.env` is ignored and is not staged or committed.
- Pharmacy edits, unrelated root documentation, and the lab chaincode README are pre-existing local work and remain outside this dashboard handoff commit.

### Committed work

| Commit | Phase / purpose | Main content |
|---|---|---|
| `4b87367` | Required portal configuration | Adds `dashboard-portal/src/config/agentConfig.js`. |
| `d8b03fa` | Phase 0 discovery | Adds `docs/audit/DASHBOARD_DISCOVERY.md`. |
| `1eaa826` | Phase 1 API foundation | Adds dashboard API service skeleton, JWT HS256 verification, default-deny policy, topology/event contracts, registry, and API tests/docs. |
| `f0ebaa8` | Phase 2 store | Adds `EventStore` and pure-JavaScript append-only NDJSON storage, indexes, rotation/pruning, recovery, and store tests. |
| `cfc584d` | Phase 3 collection and real-time | Adds Fabric committed-block collector/normalizer, health polling, `/internal/events`, stream tickets, WS/SSE, demo/mock tools, and producer/chaincode draft patches. |
| `eaf5947` | Phase 4 aggregation | Adds authenticated role-filtered REST aggregation, metrics, trace stitching, alerts, API tests, and requirements. |

### Local changes expected for the next commits

1. **Portal wiring:** dashboard portal `App.jsx`, `services/api.js`, layout/socket hook, data views, pages, role-view config, and Vite config.
2. **Optional deployment:** Compose profile, Nginx `/dashboard/` and `/api/dashboard/` proxy rules, startup script opt-in, API container config path, and portal glibc image.
3. **Auth hardening:** reject documented sample JWT keys as unconfigured.
4. **Documentation:** this handoff and the Phase 5/6 update to `TEAM_NOTES.md`.

Stage only the dashboard files, the approved deployment files, and the dashboard hunks in `start-sequential.sh`. Do not stage the pharmacy changes or unrelated untracked files listed by `git status`. Do not stage or commit `.env`, `credentials/`, `.demo/`, `data/`, logs, `node_modules`, or build output.

## 3. Scope and safety rules

### In scope

- `ehr-backend-v3/dashboard-api/`: event contract/registry, store, collector, normalizer, auth, realtime, ingest, aggregation, metrics, alerts, and demo producer.
- Existing `ehr-frontend-v2/dashboard-portal/`: dashboard login, role-aware navigation, REST/WebSocket wiring, traces, and safe unavailable/mock states.
- Approved integration files: root `docker-compose.yaml`, `nginx/nginx.conf`, and dashboard-specific hunks in `start-sequential.sh`.
- Dashboard docs under `docs/dashboard/` and the Phase 0 report under `docs/audit/`.

### Frozen or excluded

- Chaincode source, Fabric network configuration and scripts, observer enrollment, hospital/patient/pharmacy/lab API routes, the pharmacy portals, other app UIs, Security/FHIR/AI services, and other teams’ producer implementations.
- `POST /internal/events` must not be exposed through Nginx.
- Optional peer0/peer1/peer2/extorg emitter changes and the chaincode `emitEvent` helper remain draft patches for their owners; no patches have been applied to those services.
- The project’s `start.sh` invokes Fabric setup and may deploy chaincode if it does not find version 1.0 already committed. Do not run it casually against an existing network/identity setup.

## 4. Implemented architecture (Phases 1–4)

### API and security foundation

- API listens on 4010 (`h-dashboard-api` in Compose). Portal is 5176 (`h-dashboard-portal`). Public portal base path is `/dashboard/`.
- API response conventions are `{ success: true, data }` and `{ success: false, error }`.
- JWT verification pins HS256 and requires `userId`, `role`, `mspId`, `peer`, and `exp`. `DASHBOARD_JWT_SECRETS` is tried in order; the dashboard’s own `JWT_SECRET` is fallback. The operator configures keys locally; no other service `.env` is read by dashboard code.
- Lab/provider tokens are treated as a separate key by default; enable them only by adding the extorg key as a later entry in the dashboard-owned secret list. Unknown or missing roles deny.
- The new local hardening change ignores the known example values from the dashboard/root environment templates. Empty/example keys now produce “authentication not configured” rather than being used to verify tokens. This change has syntax validation but still needs an automated test.
- The configured role map is in `dashboard-api/config/authorization.json`, default deny. Admin has all aggregate pages. Doctor gets `peer1.hospital`, clinical/history/governance agents, and scoped traces. Nurse gets `peer2.hospital`; pharmacist gets `peer2.hospital` plus `pharmacy-agent`; approved lab roles get `peer0.diagnostic` plus `lab-agent`. Other listed or unknown roles are denied.
- Exact denied roles include `patient`, `receptionist`, `patientService`, `medrecordofficer`, `labreceptionist`, `insuranceofficer`, `claimsauditor`, `billingofficer`, `provideradmin`, missing/unknown roles. Pharmacy-app roles (`manager`, `inventory`, `billing`) belong to a separate auth system and are unsupported.
- `patientIdHash` is removed from non-admin event responses. Raw patient IDs, names, clinical values, and AI summary text are rejected by envelope validation. No patient content is intended for dashboard views.
- Dashboard login uses the peer0 login route and stores only dashboard keys (`ehr_dashboard_token`, `ehr_dashboard_user`). `ehr_hospital_token` may be read only in production, with an explicit build flag and `/dashboard` path; it is never changed by the dashboard. No token is sent in a URL. WS/SSE use a one-time stream ticket (not a bearer token) in the stream URL.
- Placeholder JWT keys are no longer accepted as valid configured secrets. The real key is still required in the operator’s local dashboard environment for login.

### Event contract and sources

- Strict versioned event envelope and full event registry cover Fabric/block metadata, health, consent/security, FHIR conversion, AI fallback/execution, governance/human review, VCAP, IPFS, emergency access, and related agreed vocabulary.
- Fabric source is committed blocks, not chaincode `setEvent` calls. No `stub.setEvent()` calls were found in the inspected chaincode. Normalization retains transaction metadata (tx ID, channel, chaincode/function, creator MSP, validation code, block number, timestamp) and excludes invocation arguments, read/write sets, response payloads, and clinical values.
- The 10 trace stages are represented in the registry and stitched by `correlationId` (same logical ID as AI `runId` and VCAP execution ID). Status vocabulary: `DONE`, `FAILED`, `SKIPPED`, `PENDING`, `WAITING_HUMAN` (unknown/offline is represented as unknown where applicable).
- Health polling uses bounded GET-only checks. Peer operations URLs are optional and remain unconfigured unless supplied. CPU, memory, disk, and IPFS storage usage are deferred; block-height data is currently unavailable unless a real allowed source supplies it.
- No gateway or AI/FHIR/Security/IPFS event producer is connected. Missing sources must stay `NOT_CONNECTED` with their dependency owner identified.

### Store and real-time layer

- `EventStore` interface backed by Node built-ins and append-only NDJSON, with in-memory indexes, event ID and `(txId, eventType)` dedupe, restart recovery, corruption/partial-line handling, rotation, and retention pruning.
- Store is a disposable observability cache, not the authoritative audit record or a tamper-evident ledger. One API process per data directory; no cross-process writer guarantee.
- `POST /internal/events` is service-key protected, PHI validated, bounded/rate limited, and not published through Nginx.
- `/api/dashboard/stream-ticket` issues short-lived, single-use tickets bound to the verified user/role. `/api/dashboard/ws` and `/api/dashboard/stream` apply the same authorization to live events and replay. API request logs exclude tokens/tickets; Nginx dashboard API access logs are disabled to avoid recording ticket query strings.
- Mock generator/demo is separate from live collection; events carry `mock: true`, acceptance is off unless explicitly enabled, and synthetic activity must never be labeled live.

### Aggregation API

Authenticated routes include:

- `/api/dashboard/overview`, `/network`, `/peers`, `/orderers`, `/channels`.
- `/transactions`, `/transactions/metrics`.
- `/agents`, `/agents/:agentId`, `/agents/:agentId/executions`, `/agents/:agentId/metrics`.
- `/executions/:runId` and `/executions/:runId/trace`.
- `/security`, `/security/events`, `/ipfs`, `/alerts`, `/logs/events`.
- `/api/dashboard/stream-ticket`, `/api/dashboard/ws`, `/api/dashboard/stream`.

Unavailable values use `null` with `NO_DATA`/`NOT_CONNECTED`, never fabricated zeroes. Metrics derive only from observed safe events or approved health data. Alert rules are configurable; alert hysteresis/recovery is persisted as events.

See [API requirements](api-requirements.md), [event architecture](event-architecture.md), and [realtime design](realtime-design.md) for field/route semantics.

## 5. Portal work (Phase 5, local)

- Added shared `DataView` and `roleViews` config; app has login, access-denied view, root/dev and `/dashboard/` production routing, and role-filtered nav.
- API wrapper sends dashboard bearer token, unwraps the canonical `data` response, dispatches a dashboard unauthorized event on 401, and renders the login page instead of redirecting to a nonexistent `/login` route.
- Login POSTs `{ username, password }` to `/api/hospital/peer0/auth/login`, stores `ehr_dashboard_token` and `ehr_dashboard_user`; logout removes only those dashboard keys.
- Optional same-origin hospital token read is gated by production mode, `VITE_ACCEPT_HOSPITAL_TOKEN=true`, and `/dashboard` URL. It is read-only and not used in local dev on port 5176.
- WS obtains `/api/dashboard/stream-ticket`, passes only the one-time ticket to `/api/dashboard/ws`, reconnects for a new ticket, and renders connection/event-count/block data without a fake starting block. The server is the authorization authority for live and replayed events.
- Overview, network, agents, transactions, security, IPFS, logs, and agent detail now consume API data. Synthetic chart rows, sample patient references, fake log/audit/transaction data, random network metrics, and hard-coded trace stages were removed. The admin transaction table alone can show an allowed patient reference hash; raw PHI is not rendered.
- Build base is `/` for dev unless overridden and `/dashboard/` for production unless overridden. Vite dev proxies dashboard API to 4010 and peer0 login to 4001 by default.
- Current limitation: the UI role-view table is a portal config mirror of server authorization, not dynamically fetched. Server-side authorization remains authoritative. A future policy/session endpoint or a process to keep the two maps synchronized is needed to meet the “change role mapping without code changes” goal fully.
- Current UI gaps: no dedicated Alerts page or global trace explorer route is wired; traces are displayed in agent detail. The API supports alerts and trace routes. Admin navigation currently omits Alerts, and there is no explicit stream ticket renewal indicator. These remain Phase 7/product completion items.

## 6. Deployment work (Phase 6, local)

### Compose

- Added `h-dashboard-api` using the API Dockerfile, port 4010 bound to loopback, dashboard-owned `.env`, persistent named NDJSON data, credentials mounted read-only, and connection to the default Compose network plus external `ehr_network`.
- Added container DNS endpoint/health URL overrides based on the existing Fabric network and service names. Fabric network names and addresses are deployment configuration, not source-code peer discovery.
- Added `h-dashboard-portal` on port 5176, using `node:20-slim` (glibc) to avoid the Alpine/musl issue for the dashboard’s Vite/Rolldown toolchain. It builds a production bundle with `/dashboard/` base and serves Vite preview.
- Both new services use the `dashboard` profile. Default `docker compose up` does not start the dashboard; it remains optional. Nginx’s existing `depends_on` list is unchanged.
- New named volumes are `h-dashboard-api-data` and `h-dashboard-portal-modules`. No `/internal/events` Nginx route was added.

### Nginx and host startup

- Nginx adds `/dashboard` → `/dashboard/`, proxies `/dashboard/` to the portal, and proxies `/api/dashboard/` to API 4010 with WS headers and response buffering disabled for streaming. Dashboard API access logging is off to prevent logging stream tickets.
- `start-sequential.sh` adds API/portal only when `ENABLE_DASHBOARD=true`; otherwise its original service list is unchanged. `npm ci` is used for dashboard API/portal installs so their lockfiles are not deleted. Dashboard ports 4010 and 5176 are added to stop cleanup only when the flag is enabled.
- `setup.sh` and root `.env.example` are unchanged. `start.sh` itself is unchanged. Existing `start.sh` can start Fabric and conditionally deploy chaincode, so operators must understand its behavior before using it.
- Dashboard API Dockerfile now creates the marker/config path expected by `findRepositoryRoot()` inside the isolated image. It does not copy any other service’s `.env` or wallet.

### Optional startup commands

The dashboard `.env` must exist before targeting the Compose API service because Compose declares it as an `env_file`. The operator already copied it from `.env.example`; the signing key is still a placeholder and must be configured locally.

Dashboard-only Compose attempt (once Docker is usable):

```sh
docker compose --profile dashboard build h-dashboard-api
docker compose --profile dashboard up -d --no-deps nginx h-dashboard-api h-dashboard-portal
docker compose ps
docker compose logs --tail=100 h-dashboard-api h-dashboard-portal nginx
```

Open `http://localhost/dashboard/`; check the API health endpoint at `http://localhost:4010/health`. This does not start peer0-api or Fabric because `--no-deps` is intentional. It can check the page and API health, but login/live data requires the corresponding services and configured credentials. The services are under the Compose `dashboard` profile, so ordinary `docker compose up` does not include them.

Dashboard-only host development (does not start Fabric): install with `npm ci` in the dashboard API and portal directories, start API `npm start` in one terminal, and start portal `npm run dev -- --host 0.0.0.0 --port 5176` in another. Vite proxies to API 4010 and peer0 4001. This still requires peer0-api for login.

Stop the Compose stack without deleting dashboard data:

```sh
docker compose stop h-dashboard-api h-dashboard-portal nginx
```

Do not use `docker compose down -v` unless the user intentionally wants to delete the disposable event history. Do not run `docker compose up --build -d` for the whole stack until the pharmacy image compatibility problem is fixed by its owner; the reported whole-stack build fails on those services.

## 7. Configuration and local environment

- `dashboard-api/.env.example` contains placeholders only and is committed. `dashboard-api/.env` is local, ignored, and must never be committed.
- `JWT_SECRET` fallback and `DASHBOARD_JWT_SECRETS` list are dashboard-owned runtime inputs. The first configured key is for peer0; a later key can opt in extorg tokens. The dashboard never reads peer0/extorg `.env` files.
- Replace the dashboard’s template JWT placeholder locally with the peer0 signing key if you want peer0 login tokens to validate. Do not send key values in chat. If no valid secret is configured, protected API requests fail closed (503/401); health remains available.
- `DASHBOARD_SERVICE_KEY` is needed for producers to use `/internal/events`; it is not needed for portal health/login display. Keep it blank until configuring approved emitters.
- Observer credentials are not provisioned. The operator identity instructions are in `DASHBOARD_OBSERVER_IDENTITY.md`. Place observer/TLS files only in ignored `dashboard-api/credentials/`, set repository-relative paths in the dashboard’s own `.env`, and never copy gateway wallets.
- The user’s terminal showed `ehr_network` exists but has no containers; `docker ps --filter name=peer0.hospital.example.com` returned no peer. The dashboard can run with collector `NOT_CONNECTED`, but live Fabric block tests cannot pass until the operator starts the intended Fabric network and configures the observer.

## 8. Verification record

| Check | Result | Scope/limitations |
|---|---|---|
| Phase 0 dashboard portal `npm install` + `npm run build` | Passed | Existing working tree, not clean clone; build warning on large chunk at that time. |
| Phase 1 clean-clone API `npm ci`, tests, syntax; portal production build | Passed; 43 API tests recorded | Phase 1 commit. |
| Phase 2 store tests | Tests cover restart, dedupe, malformed/partial lines, write handling, rotation/pruning, query load | Earlier phase report did not record an exact aggregate count here. No SQL dependency was added. |
| Phase 3 tests/demo | Synthetic block fixture, health fakes, route/stream/replay tests; demo remains separate and labelled | No live Fabric connection. |
| Phase 4 clean-clone API `npm ci`, tests, lint, demo | Passed; 72 tests recorded | Demo exercised 41 HTTP route/role calls. 10k query measured 9.59 ms; 100k query 50.27 ms on that host; not capacity claims. Sensitive-data propagation test passed. |
| Phase 5 portal `npm run build` | Passed; Vite 8.3.4 transformed 1,943 modules; final local build output ~286.86 kB JS and ~13.29 kB CSS | Current working tree, not clean clone. |
| Phase 5 portal `npm run lint` | Failed in tool environment with `Bus error (core dumped)` from oxlint | No code diagnostic produced. |
| Phase 6 syntax/config | `node --check` for JWT module passed; `bash -n start-sequential.sh` passed; Compose YAML parsed; scoped `git diff --check` passed | No container runtime validation. |
| User whole-stack `docker compose up --build -d` | Failed | Existing pharmacy containers failed with `EBADPLATFORM`: GNU glibc Rolldown binding was attempted on Alpine/musl. Compose ended with no services running. Pharmacy source/Dockerfiles were not changed. |
| Agent `docker compose build h-dashboard-api` | Not run successfully | Tool container still gets Docker socket permission denied even though the user’s terminal can run Docker. |
| Nginx `nginx -t` | Not run | Nginx binary unavailable in the agent environment. |
| Clean-clone Phase 5/6 and Docker integration | Not verified | Must be done after environment setup; no Docker containers were started by the agent. |

## 9. Remaining work (Phase 7 and integration)

### Required before calling the module complete

1. Update missing deliverables in `docs/dashboard/`: `information-architecture.md`, `metrics-specification.md`, `ui-design.md`, and `implementation-roadmap.md`. Existing docs include `event-architecture.md`, `realtime-design.md`, `api-requirements.md`, `DEPENDENCIES.md`, `TESTING.md`, `TEAM_NOTES.md`, and observer notes.
2. Update and reconcile `TEAM_NOTES.md`, `DEPENDENCIES.md`, and `TESTING.md` so no older phase text claims portal/Compose work is still absent.
3. Add tests for example JWT placeholder rejection and all recently added portal behavior where test infrastructure exists. Re-run the complete API suite, portal lint/build, and demo.
4. Complete dedicated Alerts page/alert acknowledge UX and an admin global trace explorer; verify trace drilldown behavior and empty/error states.
5. Remove or dynamically source the duplicated portal `roleViews.js` mapping so authorization changes in `authorization.json` remain reflected in nav without code changes. The API must continue enforcing authorization regardless of UI state.
6. Run clean-clone verification on the updated branch: install/build/test/lint/demo for the dashboard, verify service start/stop, and verify existing portals/default startup behavior without `ENABLE_DASHBOARD` or the Compose `dashboard` profile.
7. Operator must run Docker validation: build the two dashboard services only, start Nginx/API/portal with the dashboard profile and `--no-deps`, verify route + health, then test login after setting the peer0 key locally. Do not start Fabric from this agent. Operator owns Fabric startup and observer identity setup.
8. Test real Fabric block collection only after the operator confirms the network is up and provisions the observer identity. Verify channel, block heights/checkpoints, no PHI, reconnect/recovery, and no writes to ledger.
9. Coordinate the Alpine/Rolldown failure with pharmacy owners. Do not edit their packages or Dockerfiles from this dashboard track. Whole-stack Compose build remains blocked until they resolve or approve a compatible image strategy.
10. Confirm gateway emitter patches and optional chaincode helper with each owner. Keep patches unapplied until those owners approve; verify event producers use the agreed zero-PHI schema and `TODO(dependency: <team>)` statuses become connected only after observed events.
11. Check the Docker build/push workflow. It triggers on Dockerfile changes but has a fixed image matrix with no dashboard API/portal entries; dashboard images will not be published by that workflow until an approved workflow patch is added.
12. Before merge: review status so only Group 1/dashboard files are staged, ensure `.env` and runtime files are ignored, create small phase commits, fetch/rebase against latest `main` only after authorization, rerun clean-clone checks, and do not push or open a PR until the user asks.

### Known limitations / risks

- No actual peer was running in the last user-provided Docker output, and observer credentials are absent. Fabric integration is not verified.
- The dashboard API image can be built in isolation, but the user’s full Compose build currently fails on unrelated pharmacy services.
- If operator leaves the JWT placeholder, API correctly fails closed; login requires manually configuring the real peer0 signing key in the dashboard’s own `.env`.
- `DASHBOARD_SERVICE_KEY` remains empty until approved producers are configured. `/internal/events` remains unusable without it by design.
- Nginx and Compose have only static/YAML validation. Portal dashboard-only Compose command has not yet been executed by either agent or user.
- CI workflow has no dashboard image matrix entry. It may see Dockerfile changes as a trigger but will not build/publish the dashboard image.
- NDJSON event storage is local, bounded, pruneable, and not tamper-evident. It is not a compliance audit ledger.
- UI role map is presently duplicated; API-side deny-by-default is still authoritative.
- Existing portal lint command failed with a tool-level bus error and must be rerun in a clean environment.

## 10. Related documentation

- [Phase 0 discovery](../audit/DASHBOARD_DISCOVERY.md)
- [API requirements and response contract](api-requirements.md)
- [Event architecture](event-architecture.md)
- [Realtime design](realtime-design.md)
- [Dependencies](DEPENDENCIES.md)
- [Testing and demo instructions](TESTING.md)
- [Team notes](TEAM_NOTES.md)
- [Observer identity draft](DASHBOARD_OBSERVER_IDENTITY.md)
- [Gateway and chaincode patch README](patches/README.md)
