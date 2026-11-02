'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const { common, peer } = require('@hyperledger/fabric-protos');
const { SerializedIdentity } = require('@hyperledger/fabric-protos').msp;
const { Timestamp } = require('google-protobuf/google/protobuf/timestamp_pb');
const { CheckpointStore } = require('../src/collector/CheckpointStore');
const { FabricBlockCollector, computeStartBlock, retryDelayMs } = require('../src/collector/FabricBlockCollector');
const { HealthPoller } = require('../src/health/HealthPoller');
const { AgentHeartbeatMonitor } = require('../src/health/AgentHeartbeatMonitor');
const { normalizeFabricBlock, validationOutcome } = require('../src/normalizer');
const { EventHub } = require('../src/realtime/EventHub');
const { StreamTicketStore } = require('../src/realtime/StreamTicketStore');
const { RealtimeServer } = require('../src/realtime/RealtimeServer');
const { createIngestHandler } = require('../src/routes/ingest');
const { createApp } = require('../src/app');
const { NdjsonEventStore } = require('../src/store/NdjsonEventStore');
const { createMockEvents } = require('../scripts/mock-events');
const authorization = require('../config/authorization.json');

const organizations = ['HospitalMSP', 'DiagnosticsMSP', 'ProviderMSP'];
function tempDir() { return fs.mkdtemp(path.join(os.tmpdir(), 'ehr-dashboard-phase3-')); }
function validEvent(overrides = {}) {
  return {
    schemaVersion: 1, eventId: `test-${Math.random().toString(36).slice(2)}`,
    eventType: 'AGENT_HEARTBEAT', timestamp: new Date().toISOString(),
    source: 'phase3-test', org: 'HospitalMSP', severity: 'INFO',
    payload: { agentId: 'clinical-agent', status: 'ONLINE' }, ...overrides,
  };
}
function fixtureBlock(number) {
  const header = new common.BlockHeader();
  header.setNumber(number);
  const data = new common.BlockData();
  const metadata = new common.BlockMetadata();
  metadata.setMetadataList([]);
  const block = new common.Block();
  block.setHeader(header);
  block.setData(data);
  block.setMetadata(metadata);
  return block;
}
function fixtureTransactionEnvelope() {
  const timestamp = new Timestamp();
  timestamp.setSeconds(1735689600);
  timestamp.setNanos(0);
  const channelHeader = new common.ChannelHeader();
  channelHeader.setType(common.HeaderType.ENDORSER_TRANSACTION);
  channelHeader.setChannelId('ehrchannel');
  channelHeader.setTxId('fixture-tx-1');
  channelHeader.setTimestamp(timestamp);
  const identity = new SerializedIdentity();
  identity.setMspid('HospitalMSP');
  identity.setIdBytes(new Uint8Array([1]));
  const signatureHeader = new common.SignatureHeader();
  signatureHeader.setCreator(identity.serializeBinary());
  const header = new common.Header();
  header.setChannelHeader(channelHeader.serializeBinary());
  header.setSignatureHeader(signatureHeader.serializeBinary());

  const chaincodeId = new peer.ChaincodeID();
  chaincodeId.setName('ehr');
  const input = new peer.ChaincodeInput();
  input.addArgs(Buffer.from('GetVisit'));
  input.addArgs(Buffer.from('RAW_PATIENT_IDENTIFIER_MUST_NOT_ESCAPE'));
  const chaincodeSpec = new peer.ChaincodeSpec();
  chaincodeSpec.setChaincodeId(chaincodeId);
  chaincodeSpec.setInput(input);
  const invocation = new peer.ChaincodeInvocationSpec();
  invocation.setChaincodeSpec(chaincodeSpec);
  const proposal = new peer.ChaincodeProposalPayload();
  proposal.setInput(invocation.serializeBinary());

  const actionChaincodeId = new peer.ChaincodeID();
  actionChaincodeId.setName('ehr');
  const chaincodeAction = new peer.ChaincodeAction();
  chaincodeAction.setChaincodeId(actionChaincodeId);
  const response = new peer.ProposalResponsePayload();
  response.setExtension$(chaincodeAction.serializeBinary());
  const endorsed = new peer.ChaincodeEndorsedAction();
  endorsed.setProposalResponsePayload(response.serializeBinary());
  const actionPayload = new peer.ChaincodeActionPayload();
  actionPayload.setChaincodeProposalPayload(proposal.serializeBinary());
  actionPayload.setAction(endorsed);
  const transactionAction = new peer.TransactionAction();
  transactionAction.setHeader(signatureHeader.serializeBinary());
  transactionAction.setPayload(actionPayload.serializeBinary());
  const transaction = new peer.Transaction();
  transaction.addActions(transactionAction);
  const payload = new common.Payload();
  payload.setHeader(header);
  payload.setData(transaction.serializeBinary());
  const envelope = new common.Envelope();
  envelope.setPayload(payload.serializeBinary());
  return envelope.serializeBinary();
}
function fixtureBlockWithTransaction(number, validationCode = peer.TxValidationCode.VALID) {
  const header = new common.BlockHeader(); header.setNumber(number);
  const data = new common.BlockData(); data.setDataList([fixtureTransactionEnvelope()]);
  const metadata = new common.BlockMetadata();
  metadata.setMetadataList([new Uint8Array(), new Uint8Array(), new Uint8Array([validationCode])]);
  const block = new common.Block(); block.setHeader(header); block.setData(data); block.setMetadata(metadata);
  return block;
}
async function listeningServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

test('Fabric validation mapping and block fixture omit all payload values', () => {
  assert.equal(validationOutcome(peer.TxValidationCode.VALID).eventType, 'TRANSACTION_COMMITTED');
  assert.equal(validationOutcome(peer.TxValidationCode.MVCC_READ_CONFLICT).eventType, 'MVCC_CONFLICT');
  assert.equal(validationOutcome(peer.TxValidationCode.ENDORSEMENT_POLICY_FAILURE).eventType, 'ENDORSEMENT_FAILED');
  const block = fixtureBlockWithTransaction(7);
  const [event] = normalizeFabricBlock(block, { channel: 'ehrchannel', organizations });
  assert.equal(event.eventType, 'TRANSACTION_COMMITTED');
  assert.equal(event.txId, 'fixture-tx-1');
  assert.equal(event.blockNumber, 7);
  assert.equal(event.timestamp, '2025-01-01T00:00:00.000Z');
  assert.deepEqual(event.payload, {
    chaincode: 'ehr', functionName: 'GetVisit', creatorMsp: 'HospitalMSP',
    validationCode: peer.TxValidationCode.VALID, reasonCode: 'VALID',
  });
  assert.ok(!JSON.stringify(event).includes('RAW_PATIENT_IDENTIFIER'));
  assert.equal(computeStartBlock(null, 1000, 200), 800n);
  assert.equal(computeStartBlock('42', 1000, 200), 43n);
});

test('checkpoint atomic write round-trips and corrupt checkpoint falls back', async (t) => {
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const checkpoints = new CheckpointStore(directory);
  assert.equal(await checkpoints.load(), null);
  await checkpoints.save(9876543210123n);
  assert.deepEqual(await checkpoints.load(), { lastProcessedBlock: '9876543210123' });
  assert.deepEqual((await fs.readdir(directory)).sort(), ['collector-checkpoint.json']);
  await fs.writeFile(path.join(directory, 'collector-checkpoint.json'), '{broken');
  assert.equal(await checkpoints.load(), null);
  assert.equal(computeStartBlock(await checkpoints.load(), 42, 10), 32n);
});

test('collector fixture stream checkpoints and retries unavailable Fabric without throwing', async (t) => {
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, organizations });
  const hub = new EventHub();
  const checkpointStore = new CheckpointStore(directory);
  let requestedStart;
  let closed = 0;
  const collector = new FabricBlockCollector({
    config: { enabled: true, backfillBlocks: 3, fabric: { channel: 'ehrchannel', organizations } },
    store, eventHub: hub, checkpointStore,
    connect: async () => ({
      getCurrentHeight: async () => 8n,
      getBlockEvents: async (start) => {
        requestedStart = start;
        return { async *[Symbol.asyncIterator]() { yield fixtureBlock(5); }, close() {} };
      },
      close() { closed += 1; },
    }),
  });
  collector.start();
  for (let i = 0; i < 30 && !await checkpointStore.load(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(requestedStart, 5n);
  assert.deepEqual(await checkpointStore.load(), { lastProcessedBlock: '5' });
  assert.equal(collector.getStatus().status, 'NOT_CONNECTED');
  await collector.close();
  assert.ok(closed >= 1);
  await store.close();
  assert.equal(retryDelayMs(2, () => 0), 2000);
});

test('health poller emits only after failure threshold and once on recovery', async (t) => {
  const events = [];
  const store = { async append(event) { events.push(event); return { accepted: true }; } };
  const hub = new EventHub();
  const answers = [500, 500, 500, 500, 200];
  const poller = new HealthPoller({
    targets: [{ id: 'lab', url: 'http://fixture/health', component: 'lab', org: 'DiagnosticsMSP', eventType: 'LAB_STATUS_CHANGED', downEventType: 'LAB_DOWN' }],
    failureThreshold: 3, concurrency: 1, store, eventHub: hub, organizations,
    fetch: async () => {
      const status = answers.shift();
      return { status, ok: status === 200, body: { cancel: async () => {} } };
    },
  });
  t.after(() => poller.close());
  await poller.pollOnce(); await poller.pollOnce();
  assert.equal(events.length, 0);
  await poller.pollOnce(); await poller.pollOnce();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'LAB_DOWN');
  assert.equal(events[0].payload.status, 'DOWN');
  await poller.pollOnce();
  assert.equal(events.length, 2);
  assert.equal(events[1].eventType, 'LAB_STATUS_CHANGED');
  assert.equal(events[1].payload.status, 'UP');
});

test('heartbeat monitor marks offline once and pending executions UNKNOWN', async (t) => {
  const events = [];
  const monitor = new AgentHeartbeatMonitor({
    intervalMs: 100, missedIntervals: 2,
    store: { async append(event) { events.push(event); return { accepted: true }; } },
    eventHub: new EventHub(),
  });
  t.after(() => monitor.close());
  const now = Date.now();
  monitor.accept(validEvent({ payload: { agentId: 'clinical-agent', status: 'ONLINE' } }), now);
  monitor.accept(validEvent({ eventType: 'AGENT_EXECUTION_STARTED', correlationId: 'run-1', payload: { agentId: 'clinical-agent', status: 'RUNNING' } }), now);
  await monitor.check(now + 201);
  await monitor.check(now + 202);
  assert.deepEqual(events.map((event) => event.payload.status), ['OFFLINE', 'UNKNOWN']);
  assert.equal(monitor.getStatus().pendingExecutions, 0);
});

test('stream tickets bind role, expire, and are single use', () => {
  let now = 1000;
  const tickets = new StreamTicketStore({ now: () => now, ttlMs: 30000 });
  const user = { userId: 'u1', role: 'doctor', mspId: 'HospitalMSP', peer: 'peer1', exp: 20 };
  const issued = tickets.issue(user);
  assert.equal(issued.expiresInMs, 19000);
  assert.equal(tickets.consume(issued.ticket).role, 'doctor');
  assert.equal(tickets.consume(issued.ticket), null);
  const expired = tickets.issue(user);
  now += 30001;
  assert.equal(tickets.consume(expired.ticket), null);
});

test('ingest fails closed, rejects PHI, flags unknown event types, and gates mock', async (t) => {
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, organizations });
  const hub = new EventHub();
  const app = require('express')();
  app.use(require('express').json());
  app.post('/internal/events', ...createIngestHandler({
    store, eventHub: hub, serviceKey: '', organizations, maxBatchSize: 10, rateLimit: 5,
  }));
  const server = await listeningServer(app);
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${base}/internal/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([validEvent()]) });
  assert.equal(response.status, 503);

  const configured = require('express')(); configured.use(require('express').json());
  configured.post('/internal/events', ...createIngestHandler({
    store, eventHub: hub, serviceKey: 'service-secret', organizations, maxBatchSize: 10, rateLimit: 20, allowMock: false,
  }));
  const configuredServer = await listeningServer(configured);
  t.after(() => new Promise((resolve) => configuredServer.close(resolve)));
  const url = `http://127.0.0.1:${configuredServer.address().port}/internal/events`;
  const send = (events) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dashboard-service-key': 'service-secret' }, body: JSON.stringify({ events }) });
  response = await send([validEvent({ payload: { agentId: 'clinical-agent', status: 'ONLINE', patientName: 'Ada' } })]);
  assert.equal((await response.json()).results[0].accepted, false);
  response = await send([validEvent({ mock: true })]);
  assert.equal((await response.json()).results[0].accepted, false);
  response = await send([validEvent({ eventType: 'FUTURE_EVENT' })]);
  const [unknown] = (await response.json()).results;
  assert.equal(unknown.accepted, true);
  assert.equal(unknown.unregistered, true);
});

test('mock generator covers all trace stages and labels every event', () => {
  const events = createMockEvents({ correlationId: 'mock-fixture' });
  assert.equal(events.filter((event) => event.eventType === 'AGENT_STAGE_UPDATED').length, 10);
  assert.ok(events.every((event) => event.mock === true));
});

test('ingest to WebSocket integration filters role data and replays authorized cursor events', async (t) => {
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, organizations });
  const hub = new EventHub();
  const doctorEvent = validEvent({ eventId: 'doctor-event', timestamp: '2025-01-01T00:00:00.000Z', correlationId: 'run-doctor', payload: { agentId: 'clinical-agent', status: 'DONE', patientIdHash: `hmac-sha256:${'a'.repeat(64)}` } });
  const pharmacyEvent = validEvent({ eventId: 'pharmacy-event', timestamp: '2025-01-01T00:00:00.500Z', payload: { agentId: 'pharmacy-agent', status: 'DONE' } });
  const doctorEvent2 = validEvent({ eventId: 'doctor-event-2', timestamp: '2025-01-02T00:00:00.000Z', payload: { agentId: 'clinical-agent', status: 'DONE' } });
  await store.appendMany([doctorEvent, pharmacyEvent, doctorEvent2]);
  const tickets = new StreamTicketStore();
  const server = await listeningServer((req, res) => res.end());
  const realtime = new RealtimeServer({ httpServer: server, store, eventHub: hub, tickets, authorization,
    maxClients: 4, maxBufferBytes: 1024, heartbeatMs: 1000, replayLimit: 20 });
  t.after(async () => { realtime.close(); await new Promise((resolve) => server.close(resolve)); await store.close(); });
  const user = { userId: 'doctor', role: 'doctor', mspId: 'HospitalMSP', peer: 'peer1', exp: Math.floor(Date.now() / 1000) + 60 };
  const ticket = tickets.issue(user).ticket;
  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/dashboard/ws?ticket=${ticket}&since=2000-01-01T00%3A00%3A00.000Z`);
  t.after(() => ws.terminate());
  const messages = [];
  await new Promise((resolve, reject) => {
    ws.on('message', (raw) => {
      messages.push(JSON.parse(raw.toString()));
      if (messages.length >= 2) resolve();
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error(`Timed out waiting for replay; socket=${ws.readyState}; messages=${messages.length}`)), 3000);
  });
  assert.deepEqual(messages.map((event) => event.eventId), ['doctor-event', 'doctor-event-2']);
  assert.equal(messages[0].payload.patientIdHash, undefined);
  assert.ok(!messages.some((event) => event.eventId === 'pharmacy-event'));
  ws.terminate();

  const reconnectTicket = tickets.issue(user).ticket;
  const reconnect = new WebSocket(`ws://127.0.0.1:${server.address().port}/api/dashboard/ws?ticket=${reconnectTicket}&lastEventId=doctor-event`);
  t.after(() => reconnect.terminate());
  const replayed = await new Promise((resolve, reject) => {
    reconnect.once('message', (raw) => resolve(JSON.parse(raw.toString())));
    reconnect.once('error', reject);
    setTimeout(() => reject(new Error('Timed out waiting for cursor replay')), 3000);
  });
  assert.equal(replayed.eventId, 'doctor-event-2');
});

test('slow WebSocket clients are closed with a resumable backpressure code', () => {
  const hub = new EventHub();
  const fakeServer = new EventEmitter();
  fakeServer.clients = new Set();
  fakeServer.close = () => {};
  const realtime = new RealtimeServer({
    httpServer: fakeServer, store: {}, eventHub: hub, tickets: new StreamTicketStore(), authorization,
    maxClients: 1, maxBufferBytes: 1024, heartbeatMs: 1000, replayLimit: 10,
  });
  const closeCalls = [];
  const client = {
    readyState: 1,
    bufferedAmount: 0,
    send() { this.bufferedAmount = 2048; },
    close: (...args) => closeCalls.push(args),
  };
  const user = { userId: 'doctor', role: 'doctor', mspId: 'HospitalMSP', peer: 'peer1', exp: Math.floor(Date.now() / 1000) + 60 };
  const connection = realtime._registerClient(client, user);
  connection.setReplaying(false);
  hub.publish(validEvent({ payload: { agentId: 'clinical-agent', status: 'DONE' } }));
  assert.ok(closeCalls.some(([code, reason]) => code === 1013 && /lastEventId/.test(reason)));
  assert.equal(realtime.getStatus().activeClients, 0);
  realtime.close();
});

test('ingest, authenticated ticket, and SSE replay deliver labelled data through the API', async (t) => {
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, organizations });
  const hub = new EventHub();
  const tickets = new StreamTicketStore();
  const previousSecret = process.env.DASHBOARD_JWT_SECRETS;
  process.env.DASHBOARD_JWT_SECRETS = 'phase3-sse-test-secret';
  const app = createApp({
    authorization, store, eventHub: hub, tickets, serviceKey: 'phase3-ingest-secret',
    allowMock: true, ingestRateLimit: 20, ingestMaxBatchSize: 10,
    fabric: { organizations },
  });
  const server = http.createServer(app);
  const realtime = new RealtimeServer({ httpServer: server, store, eventHub: hub, tickets, authorization,
    maxClients: 4, maxBufferBytes: 1024, heartbeatMs: 1000, replayLimit: 20 });
  app.locals.realtime = realtime;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    realtime.close();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    if (previousSecret === undefined) delete process.env.DASHBOARD_JWT_SECRETS;
    else process.env.DASHBOARD_JWT_SECRETS = previousSecret;
  });

  const event = validEvent({
    eventId: 'sse-replay-event', mock: true,
    payload: { agentId: 'clinical-agent', status: 'DONE' },
  });
  const ingest = await fetch(`${base}/internal/events`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-dashboard-service-key': 'phase3-ingest-secret' },
    body: JSON.stringify({ events: [event] }),
  });
  assert.equal((await ingest.json()).results[0].accepted, true);

  const token = jwt.sign({ userId: 'doctor', role: 'doctor', mspId: 'HospitalMSP', peer: 'peer1.hospital' },
    'phase3-sse-test-secret', { algorithm: 'HS256', expiresIn: '1m' });
  const ticketResponse = await fetch(`${base}/api/dashboard/stream-ticket`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(ticketResponse.status, 201);
  const { ticket } = await ticketResponse.json();
  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${base}/api/dashboard/stream?ticket=${encodeURIComponent(ticket)}`, { signal: controller.signal });
  assert.equal(stream.status, 200);
  const reader = stream.body.getReader();
  const first = await reader.read();
  const frame = Buffer.from(first.value).toString('utf8');
  assert.match(frame, /event: dashboard/);
  assert.match(frame, /sse-replay-event/);
  controller.abort();
});
