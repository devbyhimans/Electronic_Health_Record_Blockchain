# Dashboard API testing

Run from `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/` with Node.js 20 or later:

```sh
npm ci
npm test
npm run lint
npm start
```

The test suite uses temporary directories, synthetic events, a synthetic Fabric protobuf block fixture, and fake health responses. It does not connect to the real Fabric network. Phase 4 adds local HTTP role-matrix calls, query validation, metric null semantics, trace stitching, alert hysteresis/recovery, indexed 10k/100k store queries, and a sensitive-data test that follows transaction arguments/read-write set/response payload markers through normalization, the NDJSON store, a REST response, and captured request logs.

For a clean laptop demo:

```sh
npm run demo
```

The command launches an isolated API at port 4011 by default, disables Fabric and health-network polling, uses fresh service/JWT keys and a unique data folder under the ignored `dashboard-api/.demo/` directory. It sends labelled events, verifies WebSocket delivery, then makes real HTTP calls to REST routes for each allowed and denied role. Synthetic data is always marked `mock: true`; it does not represent live source status. The demo does not require Docker or Fabric.

To send a labelled mock batch to an API that is already running, enable mock acceptance and configure its dashboard service key, then run:

```sh
npm run mock:events
```

Never enable mock acceptance on a deployment where mock activity could be mistaken for live activity. The mock marker remains present on every generated event.

## Verification limits

- The Fabric collector unit/integration test uses a hand-built protobuf fixture and fake async block stream, not a live Fabric peer.
- Docker/Fabric real-network checks are `NOT VERIFIED` until an operator supplies observer credentials and an available network.
- Peer/orderer operations URLs are blank by default, so those targets remain `NOT_CONFIGURED` until an operator supplies read-only health URLs.
- The Phase 4 query benchmark reports host-dependent 10k and 100k recovered-store timings in test output; these are local academic/demo measurements, not a production capacity claim.

## Phase 5–6 local verification update (2026-11-03)

- Dashboard portal `npm run build` passed in the current worktree with Vite 8.3.4 (1,943 modules; approximately 286.86 kB JS and 13.29 kB CSS). This is not clean-clone verification.
- Portal `npm run lint` could not complete: oxlint exited with `Bus error (core dumped)` in the agent environment.
- `node --check` passed for the JWT module after adding rejection of the documented example secrets. Automated tests for this guard remain to be added.
- `bash -n start-sequential.sh`, Compose YAML parsing, and scoped `git diff --check` passed. `nginx -t`, Docker builds, and container startup were not run by the agent.
- The user ran root `docker compose up --build -d`; the full stack build failed in pharmacy Vite containers with `EBADPLATFORM` because `@rolldown/binding-linux-x64-gnu` requires glibc while those app images use Alpine/musl. No service remained running according to the user’s subsequent `docker compose ps`. The dashboard portal image is now `node:20-slim`; pharmacy files were not changed.
- The user’s Docker output showed `ehr_network` exists but contained no containers, and no `peer0.hospital.example.com` container was running. Real Fabric collection and login integration are not verified. The agent’s own Docker command still receives socket permission denied.
- The dashboard `.env` was copied from its example. A metadata-only check found the JWT setting still uses a template placeholder; the API now treats that known placeholder as unconfigured. Replace it locally with the peer0 signing key before testing login. Never add the value to this file or chat.
- The Compose dashboard services now use the `dashboard` profile. Verify them separately with `docker compose --profile dashboard build h-dashboard-api` and `docker compose --profile dashboard up -d --no-deps nginx h-dashboard-api h-dashboard-portal` after the local dashboard `.env` exists. Do not use the full `docker compose up --build -d` until pharmacy owners resolve their build issue.
