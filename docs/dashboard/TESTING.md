# Dashboard API testing

Run from `orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/` with Node.js 20 or later:

```sh
npm ci
npm test
npm run lint
npm start
```

The test suite uses temporary directories, synthetic events, a synthetic Fabric protobuf block fixture, and fake health responses. It does not connect to the real Fabric network. The current Phase 3 suite covers envelope/PHI checks, block metadata extraction and validation-code mapping, checkpoint recovery, collector retry state, health failure thresholds/recovery, heartbeat timeout, ticket single-use/expiry, service-key ingest, WebSocket role filtering/reconnect replay/slow-client handling, SSE delivery, and the mock event generator.

For a clean laptop demo:

```sh
npm run demo
```

The command launches an isolated API at port 4011 by default, disables Fabric and health-network polling, uses fresh in-process service/JWT keys and a unique data folder under the ignored `dashboard-api/.demo/` directory. Its WebSocket test client must receive an event whose `mock` field is true. The demo does not require Docker or Fabric.

To send a labelled mock batch to an API that is already running, enable mock acceptance and configure its dashboard service key, then run:

```sh
npm run mock:events
```

Never enable mock acceptance on a deployment where mock activity could be mistaken for live activity. The mock marker remains present on every generated event.

## Verification limits

- The Fabric collector unit/integration test uses a hand-built protobuf fixture and fake async block stream, not a live Fabric peer.
- Docker/Fabric real-network checks are `NOT VERIFIED` until an operator supplies observer credentials and an available network.
- Peer/orderer operations URLs are blank by default, so those targets remain `NOT_CONFIGURED` until an operator supplies read-only health URLs.
- The 1,000-event store benchmark reports host-dependent timings in the test output; do not treat one run as a production capacity estimate.
