# Dashboard event architecture (Phase 3)

## Sources

1. The Fabric collector consumes committed block events through `@hyperledger/fabric-gateway@1.4.0`. It parses transaction IDs, channel, chaincode and function names, creator MSP, validation code, block number, and the transaction timestamp. It never copies invocation arguments, read/write sets, or payload values into the dashboard event.
2. The health poller sends bounded HTTP GET requests to targets configured in `dashboard-api/config/topology.json`. Only response status and measured latency are retained; response bodies are discarded. A target emits a transition after the configured consecutive-failure threshold, then emits a recovery status once when it returns.
3. Team-owned producers can POST event envelopes to `/internal/events` with `X-Dashboard-Service-Key`. That endpoint is disabled until a service key is configured. Unknown event types are accepted only through this path, marked `unregistered: true`, and limited to generic safe fields.
4. The mock generator is a separate CLI. Every generated event has `mock: true`; the API accepts it only when the operator explicitly sets `DASHBOARD_ALLOW_MOCK=true`.

## Envelope and zero-PHI boundary

The schema version 1 envelope requires `schemaVersion`, `eventId`, `eventType`, `timestamp`, `source`, `org`, `severity`, and `payload`. `peerId`, `txId`, `blockNumber`, `correlationId`, `channel`, `mock`, and `unregistered` are optional. Timestamps are UTC ISO dates; Fabric transaction timestamps come from the block, and health timestamps use the dashboard process clock.

The validator allow-lists fields by event type and rejects raw patient references, names, clinical values, and narrative text, including unsupported nested content. A keyed `patientIdHash` is accepted only for registered event types that declare it. Non-admin views remove that hash; admin access still receives aggregate event data only.

## Fabric checkpoint and retries

On first start, the collector queries channel height and asks for the last `COLLECTOR_BACKFILL_BLOCKS` blocks (default 200). It saves each fully processed block number with a temporary file, fsync, and atomic rename. On restart it requests `checkpoint + 1`. A missing or malformed checkpoint uses the backfill rule. Stable transaction event IDs and EventStore dedupe make replay safe.

Connection failures, missing observer certificates, and interrupted streams report `NOT_CONNECTED` and retry with exponential backoff and jitter. The API and HTTP poller continue running independently. The dashboard does not enroll identities or use another service's wallet or `.env`.

## Runtime flow

```text
Fabric committed blocks ──> block normalizer ──┐
HTTP health checks ────────> health normalizer ─┼─> EventStore ──> role filter ──> WS / SSE
Service-key ingest ────────> envelope validator ┘       │
                                                       └─> replay cursor
```

Producer gaps remain `TODO(dependency: <team>)` in `config/topology.json`, the registry, or the dependency list. No chaincode or gateway patch is required for block collection.
