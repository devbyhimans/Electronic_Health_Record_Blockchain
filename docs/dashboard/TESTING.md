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
