'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { common, peer } = require('@hyperledger/fabric-protos');
const { Timestamp } = require('google-protobuf/google/protobuf/timestamp_pb');
const authorization = require('../config/authorization.json');
const { SUCCESS_RESPONSES } = require('../src/contracts/responseShapes');
const { MetricsService } = require('../src/aggregation/metrics');
const { stitchTrace } = require('../src/aggregation/traces');
const { AlertEngine } = require('../src/aggregation/AlertEngine');
const { paginatedEvents, parsePageSize, parseTimeRange } = require('../src/aggregation/query');
const { normalizeFabricBlock } = require('../src/normalizer');
const { createApp } = require('../src/app');
const { NdjsonEventStore } = require('../src/store/NdjsonEventStore');
const { StreamTicketStore } = require('../src/realtime/StreamTicketStore');
const { createRateLimiter } = require('../src/routes/ingest');

const organizations = ['HospitalMSP', 'DiagnosticsMSP', 'ProviderMSP'];
const primarySecret = 'phase4-dashboard-primary-test-secret';
const labSecret = 'phase4-lab-secondary-test-secret';

function assertResponseContract(actual, expected, label = 'response') {
  if (expected === 'array') return assert.ok(Array.isArray(actual), `${label} must be an array`);
  if (expected === 'aggregate') return assert.equal(actual && typeof actual === 'object' && !Array.isArray(actual), true, `${label} must be an object`);
  if (expected === 'pagination') return assert.equal(actual && typeof actual === 'object' && Number.isInteger(actual.limit), true, `${label} must be pagination metadata`);
  if (expected === 'string') return assert.equal(typeof actual, 'string', `${label} must be a string`);
  if (expected === 'number') return assert.equal(typeof actual, 'number', `${label} must be a number`);
  if (expected && typeof expected === 'object') {
    for (const [key, shape] of Object.entries(expected)) {
      assert.ok(Object.hasOwn(actual, key), `${label}.${key} is required`);
      assertResponseContract(actual[key], shape, `${label}.${key}`);
    }
    return;
  }
  assert.equal(actual, expected, `${label} contract value`);
}
function tempDir() { return fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-phase4-')); }
function event(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: `p4-${crypto.randomUUID()}`,
    eventType: 'AGENT_EXECUTION_COMPLETED',
    timestamp: new Date().toISOString(),
    source: 'phase4-test',
    org: 'HospitalMSP',
    severity: 'INFO',
    payload: { agentId: 'clinical-agent', status: 'DONE' },
    ...overrides,
  };
}

function fabricBlockWithSecrets(secrets) {
  const marker = secrets.transactionArgument;
  const time = new Timestamp();
  time.setSeconds(1762164000);
  const channelHeader = new common.ChannelHeader();
  channelHeader.setType(common.HeaderType.ENDORSER_TRANSACTION);
  channelHeader.setChannelId('ehrchannel');
  channelHeader.setTxId('p4-sensitive-tx');
  channelHeader.setTimestamp(time);
  const identity = new (require('@hyperledger/fabric-protos').msp.SerializedIdentity)();
  identity.setMspid('HospitalMSP');
  identity.setIdBytes(Buffer.from([1]));
  const signatureHeader = new common.SignatureHeader();
  signatureHeader.setCreator(identity.serializeBinary());
  const header = new common.Header();
  header.setChannelHeader(channelHeader.serializeBinary());
  header.setSignatureHeader(signatureHeader.serializeBinary());
  const chaincodeId = new peer.ChaincodeID();
  chaincodeId.setName('ehr');
  const input = new peer.ChaincodeInput();
  input.addArgs(Buffer.from('ReadPatientRecord'));
  input.addArgs(Buffer.from(marker));
  const chaincodeSpec = new peer.ChaincodeSpec();
  chaincodeSpec.setChaincodeId(chaincodeId);
  chaincodeSpec.setInput(input);
  const invocation = new peer.ChaincodeInvocationSpec();
  invocation.setChaincodeSpec(chaincodeSpec);
  const proposal = new peer.ChaincodeProposalPayload();
  proposal.setInput(invocation.serializeBinary());
  const action = new peer.ChaincodeAction();
  action.setChaincodeId(chaincodeId);
  action.setResults(Buffer.from(secrets.readWriteSet));
  const response = new peer.Response();
  response.setStatus(200);
  response.setPayload(Buffer.from(secrets.responsePayload));
  action.setResponse(response);
  const responsePayload = new peer.ProposalResponsePayload();
  responsePayload.setExtension$(action.serializeBinary());
  const endorsed = new peer.ChaincodeEndorsedAction();
  endorsed.setProposalResponsePayload(responsePayload.serializeBinary());
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
  const blockHeader = new common.BlockHeader();
  blockHeader.setNumber(9);
  const blockData = new common.BlockData();
  blockData.setDataList([envelope.serializeBinary()]);
  const metadata = new common.BlockMetadata();
  metadata.setMetadataList([new Uint8Array(), new Uint8Array(), new Uint8Array([peer.TxValidationCode.VALID])]);
  const block = new common.Block();
  block.setHeader(blockHeader);
  block.setData(blockData);
  block.setMetadata(metadata);
  return block;
}

test('query validation bounds page sizes and rejects contradictory time inputs', () => {
  assert.equal(parsePageSize('100000'), 100);
  assert.throws(() => parsePageSize('0'), /positive integer/);
  assert.throws(() => parseTimeRange({ window: '5m', from: '2026-01-01T00:00:00Z' }), /either window or from\/to/);
  assert.throws(() => parseTimeRange({ from: 'bad' }), /valid date-time/);
});

test('API rate limiter returns the shared JSON error envelope', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60000 });
  const req = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };
  const responses = [];
  const res = { status(code) { this.code = code; return this; }, json(body) { responses.push({ code: this.code, body }); return this; } };
  let continued = 0;
  limiter(req, res, () => { continued += 1; });
  limiter(req, res, () => { continued += 1; });
  assert.equal(continued, 1);
  assert.deepEqual(responses, [{ code: 429, body: { success: false, error: 'Ingest rate limit exceeded.' } }]);
});

test('event pagination uses stable opaque cursors without duplicate rows', async (t) => {
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, organizations });
  t.after(() => store.close());
  for (let index = 1; index <= 5; index += 1) {
    await store.append(event({ eventId: `page-${index}`, timestamp: `2026-11-03T10:00:0${index}.000Z` }));
  }
  const first = paginatedEvents(store, { role: 'admin' }, authorization, {}, 2);
  const second = paginatedEvents(store, { role: 'admin' }, authorization, {}, 2, require('../src/aggregation/query').parseCursor(first.page.nextCursor));
  assert.equal(first.items.length, 2);
  assert.equal(first.page.hasMore, true);
  assert.deepEqual(first.items.map((item) => item.eventId), ['page-5', 'page-4']);
  assert.deepEqual(second.items.map((item) => item.eventId), ['page-3', 'page-2']);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.eventId)).size, 4);
});

test('transaction metrics report null for unavailable data and derive only event-backed counts', () => {
  let now = Date.parse('2026-11-03T10:00:00Z');
  const events = [
    event({ eventId: 'tx-success', eventType: 'TRANSACTION_COMMITTED', timestamp: new Date(now - 5000).toISOString(), payload: { chaincode: 'ehr', functionName: 'ReadPatientRecord', validationCode: 0 } }),
    event({ eventId: 'tx-failure', eventType: 'MVCC_CONFLICT', timestamp: new Date(now - 4000).toISOString(), payload: { chaincode: 'ehr', functionName: 'ReadPatientRecord', validationCode: 11 } }),
  ];
  const service = new MetricsService({ store: { query: ({ since, until }) => events.filter((item) => Date.parse(item.timestamp) >= Date.parse(since) && Date.parse(item.timestamp) <= Date.parse(until)) }, now: () => now });
  const result = service.transactionMetrics('1m');
  assert.equal(result.metrics.successCount.value, 1);
  assert.equal(result.metrics.failureCount.value, 1);
  assert.equal(result.metrics.mvccConflicts.value, 1);
  assert.equal(result.metrics.averageLatencyMs.value, null);
  now += 60000;
  service.cache.clear();
  assert.equal(service.transactionMetrics('1m').metrics.successCount.value, null);
});

test('trace stitching handles late, duplicate, missing, and unknown stages plus offline pending runs', () => {
  const runId = 'trace-p4';
  const base = event({ correlationId: runId });
  const traces = [
    { ...base, eventId: 'stage-last', eventType: 'AGENT_STAGE_UPDATED', timestamp: '2026-11-03T10:00:03.000Z', payload: { agentId: 'clinical-agent', stage: 'GOVERNANCE', stageStatus: 'DONE' } },
    { ...base, eventId: 'stage-first', eventType: 'AGENT_STAGE_UPDATED', timestamp: '2026-11-03T10:00:01.000Z', payload: { agentId: 'clinical-agent', stage: 'REPORT_RECEIVED', stageStatus: 'DONE' } },
    { ...base, eventId: 'stage-duplicate', eventType: 'AGENT_STAGE_UPDATED', timestamp: '2026-11-03T10:00:02.000Z', payload: { agentId: 'clinical-agent', stage: 'GOVERNANCE', stageStatus: 'FAILED' } },
    { ...base, eventId: 'stage-unknown', eventType: 'AGENT_STAGE_UPDATED', timestamp: '2026-11-03T10:00:04.000Z', payload: { agentId: 'clinical-agent', stage: 'FUTURE_STAGE', stageStatus: 'SKIPPED' } },
  ];
  const trace = stitchTrace(runId, traces);
  assert.equal(trace.stages.find((stage) => stage.name === 'GOVERNANCE').status, 'DONE');
  assert.ok(trace.stages.find((stage) => stage.name === 'FUTURE_STAGE').unknown);
  assert.equal(trace.stages.find((stage) => stage.name === 'OCR_PARSING').status, 'PENDING');
  assert.equal(stitchTrace(runId, traces, { offlineAgents: new Set(['clinical-agent']) }).stages.find((stage) => stage.name === 'OCR_PARSING').status, 'UNKNOWN');
});

test('alert engine applies minimum duration, de-duplicates, resolves after hysteresis, and recovers persisted state', async () => {
  let now = 1000;
  const persisted = [];
  const store = {
    query: ({ eventTypes = [] } = {}) => persisted.filter((item) => eventTypes.includes(item.eventType)),
    async append(item) { persisted.push(item); return { accepted: true, duplicate: false }; },
  };
  const engine = new AlertEngine({
    store, eventHub: { publish() {} }, organizations,
    healthPoller: { targets: [{ id: 'peer0', kind: 'peer', component: 'peer0.hospital', org: 'HospitalMSP' }], states: new Map([['peer0', { status: 'DOWN' }]]) },
    heartbeatMonitor: { getAgentStates: () => ({}) },
    metrics: { transactionMetrics: () => ({ metrics: { averageLatencyMs: { value: null }, failureRate: { value: null }, mvccRate: { value: null } } }) },
    thresholds: { minimumDurationMs: 100, resolveDurationMs: 100, rules: { peer_down: { enabled: true, severity: 'CRITICAL' } } },
    now: () => now,
  });
  await engine.evaluate(now);
  assert.equal(persisted.length, 0);
  now += 100;
  await engine.evaluate(now);
  assert.equal(persisted.filter((item) => item.eventType === 'ALERT_RAISED').length, 1);
  await engine.evaluate(now + 1);
  assert.equal(persisted.filter((item) => item.eventType === 'ALERT_RAISED').length, 1);
  const recovered = new AlertEngine({ ...engine, now: () => now });
  await recovered._recover();
  assert.equal(recovered.list().length, 1);
  engine.healthPoller.states.set('peer0', { status: 'UP' });
  now += 100;
  await engine.evaluate(now);
  now += 100;
  await engine.evaluate(now);
  assert.equal(persisted.filter((item) => item.eventType === 'ALERT_RESOLVED').length, 1);
  engine.close(); recovered.close();
});

function apiConfig(store) {
  const topology = require('../config/topology.json');
  const heartbeatMonitor = { getAgentStates: () => ({}) };
  const healthPoller = { states: new Map(), getStatus: () => ({ status: 'NOT_CONNECTED', targets: {} }) };
  return {
    authorization, store, tickets: new StreamTicketStore(), serviceKey: 'phase4-service-key', fabric: { organizations },
    topology, heartbeatMonitor, healthPoller, collector: { getStatus: () => ({ status: 'NOT_CONNECTED', lastProcessedBlock: null }) },
    metrics: new MetricsService({ store }), alertEngine: { list: () => [], acknowledge: async () => null },
    apiRateLimit: 10000, corsAllowedOrigins: ['https://dashboard.example'], ingestMaxBatchSize: 10, ingestRateLimit: 100,
  };
}

test('every aggregation route enforces the configured role matrix over real HTTP', async (t) => {
  const originalLog = console.log;
  console.log = () => {};
  t.after(() => { console.log = originalLog; });
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, organizations });
  await store.append(event({ eventId: 'doctor-run-event', correlationId: 'doctor-run', payload: { agentId: 'clinical-agent', status: 'DONE', patientIdHash: `hmac-sha256:${'a'.repeat(64)}` } }));
  await store.append(event({ eventId: 'pharmacy-run-event', org: 'HospitalMSP', payload: { agentId: 'pharmacy-agent', status: 'DONE' } }));
  await store.append(event({ eventId: 'lab-run-event', eventType: 'AGENT_HEARTBEAT', org: 'DiagnosticsMSP', payload: { agentId: 'lab-agent', status: 'ONLINE' } }));
  const previous = process.env.DASHBOARD_JWT_SECRETS;
  process.env.DASHBOARD_JWT_SECRETS = `${primarySecret},${labSecret}`;
  const app = createApp(apiConfig(store));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/dashboard`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    if (previous === undefined) delete process.env.DASHBOARD_JWT_SECRETS;
    else process.env.DASHBOARD_JWT_SECRETS = previous;
  });

  const globalRoutes = [
    '/overview', '/network', '/peers', '/orderers', '/channels', '/transactions/metrics', '/blocks/metrics', '/transactions',
    '/security', '/security/events', '/ipfs', '/alerts', '/logs/events',
  ];
  const contractByRoute = {
    '/overview': 'overview', '/network': 'network', '/transactions': 'transactions',
    '/transactions/metrics': 'transactionMetrics', '/agents': 'agents',
    '/blocks/metrics': 'blocksMetrics',
    '/executions/doctor-run': 'execution', '/executions/doctor-run/trace': 'executionTrace',
    '/security': 'security', '/security/events': 'securityEvents', '/ipfs': 'ipfs', '/alerts': 'alerts',
    '/logs/events': 'events', '/stream-ticket': 'streamTicket',
  };
  const targetsByRole = {
    doctor: ['peer1.hospital', 'clinical-agent', 'history-agent', 'governance-agent'],
    nurse: ['peer2.hospital'], pharmacist: ['peer2.hospital', 'pharmacy-agent'],
    labtechnician: ['peer0.diagnostic', 'lab-agent'], labsupervisor: ['peer0.diagnostic', 'lab-agent'],
    labadmin: ['peer0.diagnostic', 'lab-agent'], radiologist: ['peer0.diagnostic', 'lab-agent'],
  };
  const allTargets = [...new Set(Object.values(targetsByRole).flat())];
  const mappedRoles = ['admin', ...Object.keys(targetsByRole)];
  const deniedRoles = ['patient', 'receptionist', 'patientService', 'medrecordofficer', 'labreceptionist', 'insuranceofficer', 'claimsauditor', 'billingofficer', 'provideradmin', 'unlisted'];
  const tokenFor = (role) => {
    const externalRole = authorization.externalTokenRoles.includes(role);
    return jwt.sign({ userId: `test-${role}`, role, mspId: role.startsWith('lab') || role === 'radiologist' ? 'DiagnosticsMSP' : 'HospitalMSP', peer: role.startsWith('lab') || role === 'radiologist' ? 'peer0.diagnostic' : 'peer1.hospital' }, externalRole ? labSecret : primarySecret, { algorithm: 'HS256', expiresIn: '5m' });
  };
  const request = async (role, route, method = 'GET') => fetch(`${base}${route}`, { method, headers: { authorization: `Bearer ${tokenFor(role)}` } });

  const allowedOrigin = await fetch(`${base}/agents`, { headers: { authorization: `Bearer ${tokenFor('admin')}`, origin: 'https://dashboard.example' } });
  assert.equal(allowedOrigin.headers.get('access-control-allow-origin'), 'https://dashboard.example');
  assert.equal(allowedOrigin.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(allowedOrigin.headers.get('cache-control'), 'no-store');
  const blockedOrigin = await fetch(`${base}/agents`, { headers: { authorization: `Bearer ${tokenFor('admin')}`, origin: 'https://evil.example' } });
  assert.equal(blockedOrigin.headers.get('access-control-allow-origin'), null);
  assert.equal((await fetch(base, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(base, { method: 'OPTIONS', headers: { origin: 'https://dashboard.example' } })).status, 204);

  for (const role of mappedRoles) {
    for (const route of globalRoutes) {
      const response = await request(role, route);
      assert.equal(response.status, role === 'admin' ? 200 : 403, `${role} ${route}`);
      if (response.ok) {
        const body = await response.json();
        assert.equal(body.success, true, `${role} ${route} contract`);
        assert.ok(Object.hasOwn(body, 'data'), `${role} ${route} data`);
        if (role === 'admin' && contractByRoute[route]) {
          assertResponseContract(body, SUCCESS_RESPONSES[contractByRoute[route]], route);
        }
      }
    }
    const ticket = await request(role, '/stream-ticket', 'POST');
    assert.equal(ticket.status, 201, `${role} stream ticket`);
    const ticketBody = await ticket.json();
    if (role === 'admin') assertResponseContract(ticketBody, SUCCESS_RESPONSES.streamTicket, 'stream-ticket');
    const agentsResponse = await request(role, '/agents');
    assert.equal(agentsResponse.status, 200, `${role} agent list`);
    if (role === 'admin') assertResponseContract(await agentsResponse.json(), SUCCESS_RESPONSES.agents, 'agents');
    for (const ownTarget of (role === 'admin' ? allTargets : targetsByRole[role]) || []) {
      for (const route of [`/agents/${ownTarget}`, `/agents/${ownTarget}/executions`, `/agents/${ownTarget}/metrics`]) {
        const response = await request(role, route);
        assert.equal(response.status, 200, `${role} ${route}`);
        if (role === 'admin') {
          const body = await response.json();
          const contract = route.endsWith('/executions') ? 'agentExecutions' : route.endsWith('/metrics') ? 'agentMetrics' : 'agent';
          assertResponseContract(body, SUCCESS_RESPONSES[contract], route);
        }
      }
    }
    for (const foreign of role === 'admin' ? [] : allTargets.filter((id) => !(targetsByRole[role] || []).includes(id))) {
      assert.equal((await request(role, `/agents/${foreign}`)).status, 403, `${role} cannot read ${foreign}`);
    }
    const trace = await request(role, '/executions/doctor-run/trace');
    assert.equal(trace.status, role === 'doctor' || role === 'admin' ? 200 : 403, `${role} doctor trace`);
    assert.equal((await request(role, '/executions/doctor-run')).status, role === 'doctor' || role === 'admin' ? 200 : 403, `${role} doctor execution`);
  }
  for (const role of deniedRoles) {
    for (const route of [...globalRoutes, '/agents', '/stream-ticket']) {
      assert.equal((await request(role, route, route === '/stream-ticket' ? 'POST' : 'GET')).status, 403, `${role} ${route}`);
    }
  }
  assert.equal((await request('doctor', '/agents/pharmacy-agent')).status, 403, 'doctor cannot read pharmacy data');
  assert.equal((await request('nurse', '/agents/nurse-agent')).status, 403, 'nurse role is peer-page only');
  assert.equal((await request('doctor', '/security')).status, 403, 'doctor cannot read global security data');
  assert.equal((await request('nurse', '/transactions')).status, 403, 'nurse cannot read global transaction data');
  const doctorEvents = await request('doctor', '/agents/clinical-agent').then((response) => response.json());
  assert.equal(JSON.stringify(doctorEvents).includes('patientIdHash'), false, 'non-admin response omits patient reference field');
});

test('Fabric arguments, read/write data, and response payload never reach events, store, API responses, or logs', async (t) => {
  const secrets = {
    transactionArgument: 'RAW_TRANSACTION_ARGUMENT_SECRET_91',
    readWriteSet: 'RAW_READ_WRITE_SET_SECRET_72',
    responsePayload: 'RAW_CHAINCODE_RESPONSE_SECRET_38',
  };
  const markers = Object.values(secrets);
  const [normalized] = normalizeFabricBlock(fabricBlockWithSecrets(secrets), { channel: 'ehrchannel', organizations });
  const eventText = JSON.stringify(normalized);
  for (const marker of markers) assert.equal(eventText.includes(marker), false, `event excludes ${marker}`);
  assert.equal(normalized.txId, 'p4-sensitive-tx');
  assert.deepEqual(Object.keys(normalized.payload).sort(), ['chaincode', 'creatorMsp', 'functionName', 'reasonCode', 'validationCode'].sort());

  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, organizations });
  await store.append(normalized);
  const storedText = JSON.stringify(store.getById(normalized.eventId));
  const logText = await fs.readFile(path.join(directory, 'events.ndjson'), 'utf8');
  for (const marker of markers) {
    assert.equal(storedText.includes(marker), false, `store record excludes ${marker}`);
    assert.equal(logText.includes(marker), false, `NDJSON log excludes ${marker}`);
  }

  const oldSecrets = process.env.DASHBOARD_JWT_SECRETS;
  process.env.DASHBOARD_JWT_SECRETS = primarySecret;
  const server = http.createServer(createApp(apiConfig(store)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    if (oldSecrets === undefined) delete process.env.DASHBOARD_JWT_SECRETS;
    else process.env.DASHBOARD_JWT_SECRETS = oldSecrets;
  });
  const token = jwt.sign({ userId: 'p4-admin', role: 'admin', mspId: 'HospitalMSP', peer: 'peer0.hospital' }, primarySecret, { algorithm: 'HS256', expiresIn: '5m' });
  const originalLog = console.log;
  const logLines = [];
  console.log = (line) => logLines.push(String(line));
  let responseText;
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/dashboard/transactions`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    responseText = await response.text();
    await new Promise((resolve) => setTimeout(resolve, 5));
  } finally {
    console.log = originalLog;
  }
  for (const marker of markers) {
    assert.equal(responseText.includes(marker), false, `API response excludes ${marker}`);
    assert.equal(logLines.join('\n').includes(marker), false, `request logs exclude ${marker}`);
  }
});

test('10k and 100k recovered stored events report indexed query latency', async (t) => {
  const directory = await tempDir();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const lineFor = (index) => JSON.stringify({
    schemaVersion: 1, eventId: `load-${index}`, eventType: index % 10 ? 'AGENT_HEARTBEAT' : 'TRANSACTION_COMMITTED',
    timestamp: new Date(1762160000000 + index).toISOString(), source: 'phase4-load', org: 'HospitalMSP', severity: 'INFO',
    payload: index % 10 ? { agentId: 'clinical-agent', status: 'ONLINE' } : { chaincode: 'ehr', functionName: 'GetStatus', validationCode: 0 },
  });
  const allLines = Array.from({ length: 100000 }, (_, index) => lineFor(index)).join('\n') + '\n';
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'events.ndjson'), allLines, { mode: 0o600 });
  const store = await NdjsonEventStore.open({ directory, organizations, maxFileBytes: 128 * 1024 * 1024, maxFiles: 2 });
  t.after(() => store.close());
  assert.equal(store.getStats().eventCount, 100000);
  const start10k = process.hrtime.bigint();
  const tenThousand = store.query({ eventTypes: ['TRANSACTION_COMMITTED'], limit: 10000 });
  const latency10kMs = Number(process.hrtime.bigint() - start10k) / 1e6;
  const start100k = process.hrtime.bigint();
  const oneHundredThousand = store.query({ limit: 100000 });
  const latency100kMs = Number(process.hrtime.bigint() - start100k) / 1e6;
  assert.equal(tenThousand.length, 10000);
  assert.equal(oneHundredThousand.length, 100000);
  process.stdout.write(`Phase 4 EventStore query benchmark: 10k matched events ${latency10kMs.toFixed(2)}ms; 100k events ${latency100kMs.toFixed(2)}ms.\n`);
});
