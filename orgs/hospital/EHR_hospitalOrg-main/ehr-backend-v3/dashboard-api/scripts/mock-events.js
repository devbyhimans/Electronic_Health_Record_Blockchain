'use strict';

const crypto = require('node:crypto');

function createMockEvents(options = {}) {
  const now = options.now || Date.now();
  const runId = options.correlationId || process.env.DASHBOARD_MOCK_CORRELATION_ID || `mock-run-${crypto.randomUUID()}`;
  const org = options.org || 'HospitalMSP';
  const agentId = options.agentId || 'clinical-agent';
  const stages = [
    'REPORT_RECEIVED', 'OCR_PARSING', 'FHIR_CONVERSION', 'ENCRYPTED_IPFS_STORED',
    'RECORD_ANCHORED', 'AGENT_PROCESSING', 'GOVERNANCE', 'HUMAN_REVIEW',
    'VCAP_ANCHORED', 'VCAP_VERIFIED',
  ];
  const events = stages.map((stage, index) => ({
    schemaVersion: 1,
    eventId: `mock-${runId}-${index}`,
    eventType: 'AGENT_STAGE_UPDATED',
    timestamp: new Date(now + index).toISOString(),
    source: 'mock-event-generator',
    org,
    severity: index === 7 ? 'WARNING' : 'INFO',
    correlationId: runId,
    mock: true,
    payload: {
      agentId,
      status: ['PENDING', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'FAILED', 'WAITING_HUMAN', 'SKIPPED', 'DONE'][index],
      stage,
      stageStatus: ['PENDING', 'DONE', 'DONE', 'DONE', 'DONE', 'DONE', 'FAILED', 'WAITING_HUMAN', 'SKIPPED', 'DONE'][index],
    },
  }));
  events.push({
    schemaVersion: 1, eventId: `mock-${runId}-heartbeat`, eventType: 'AGENT_HEARTBEAT',
    timestamp: new Date(now + stages.length).toISOString(), source: 'mock-event-generator',
    org, severity: 'INFO', mock: true, payload: { agentId, status: 'ONLINE' },
  });
  events.push({
    schemaVersion: 1, eventId: `mock-${runId}-failure`, eventType: 'AGENT_EXECUTION_FAILED',
    timestamp: new Date(now + stages.length + 1).toISOString(), source: 'mock-event-generator',
    org, severity: 'WARNING', correlationId: `${runId}-failure`, mock: true,
    payload: { agentId, status: 'FAILED', errorCode: 'MOCK_RETRYABLE_FAILURE' },
  });
  events.push({
    schemaVersion: 1, eventId: `mock-${runId}-outage`, eventType: 'API_STATUS_CHANGED',
    timestamp: new Date(now + stages.length + 2).toISOString(), source: 'mock-event-generator',
    org: 'DiagnosticsMSP', severity: 'ERROR', mock: true,
    payload: { component: 'mock-lab-gateway', status: 'DOWN', reasonCode: 'MOCK_OUTAGE', latencyMs: 0 },
  });
  const add = (eventType, eventOrg, payload, extras = {}) => events.push({
    schemaVersion: 1,
    eventId: `mock-${runId}-${eventType.toLowerCase()}-${events.length}`,
    eventType,
    timestamp: new Date(now + events.length + 10).toISOString(),
    source: 'mock-event-generator',
    org: eventOrg,
    severity: extras.severity || 'INFO',
    mock: true,
    ...extras,
    payload,
  });
  add('AGENT_HEARTBEAT', 'HospitalMSP', { agentId: 'nurse-agent', status: 'ONLINE' });
  add('AGENT_HEARTBEAT', 'HospitalMSP', { agentId: 'pharmacy-agent', status: 'ONLINE' });
  add('AGENT_HEARTBEAT', 'DiagnosticsMSP', { agentId: 'lab-agent', status: 'ONLINE' });
  for (const [peerId, peerOrg] of [
    ['peer0.hospital', 'HospitalMSP'], ['peer1.hospital', 'HospitalMSP'], ['peer2.hospital', 'HospitalMSP'],
    ['peer0.diagnostic', 'DiagnosticsMSP'], ['peer0.provider', 'ProviderMSP'],
  ]) add('PEER_STATUS_CHANGED', peerOrg, { component: peerId, status: 'UP', reasonCode: 'MOCK_HEALTHY' }, { peerId });
  add('ORDERER_STATUS_CHANGED', 'HospitalMSP', { component: 'orderer.example.com', status: 'UP', reasonCode: 'MOCK_HEALTHY' });
  add('IPFS_STATUS_CHANGED', 'HospitalMSP', { component: 'ipfs-service', status: 'UP', reasonCode: 'MOCK_HEALTHY' });
  add('TRANSACTION_COMMITTED', 'HospitalMSP', { chaincode: 'ehr', functionName: 'GetDashboardSummary', creatorMsp: 'HospitalMSP', validationCode: 0 }, { txId: `mock-tx-${runId}-ok`, channel: 'ehrchannel', blockNumber: 100 });
  add('TRANSACTION_FAILED', 'HospitalMSP', { chaincode: 'ehr', functionName: 'GetDashboardSummary', creatorMsp: 'HospitalMSP', validationCode: 11, reasonCode: 'MVCC_CONFLICT' }, { txId: `mock-tx-${runId}-failed`, channel: 'ehrchannel', blockNumber: 101, severity: 'WARNING' });
  add('MVCC_CONFLICT', 'HospitalMSP', { chaincode: 'ehr', functionName: 'GetDashboardSummary', creatorMsp: 'HospitalMSP', validationCode: 11, reasonCode: 'MVCC_CONFLICT' }, { txId: `mock-tx-${runId}-mvcc`, channel: 'ehrchannel', blockNumber: 102, severity: 'WARNING' });
  add('ENDORSEMENT_FAILED', 'HospitalMSP', { chaincode: 'ehr', functionName: 'GetDashboardSummary', creatorMsp: 'HospitalMSP', validationCode: 10, reasonCode: 'ENDORSEMENT_FAILURE' }, { txId: `mock-tx-${runId}-endorse`, channel: 'ehrchannel', blockNumber: 103, severity: 'ERROR' });
  add('ACCESS_DENIED', 'HospitalMSP', { agentId: 'clinical-agent', reasonCode: 'CONSENT_ABSENT', status: 'DENIED', patientIdHash: `hmac-sha256:${'b'.repeat(64)}` }, { severity: 'WARNING' });
  add('VCAP_VERIFICATION_FAILED', 'HospitalMSP', { agentId: 'clinical-agent', status: 'FAILED', errorCode: 'MOCK_VCAP_FAILURE' }, { correlationId: runId, severity: 'ERROR' });
  add('IPFS_UPLOAD_COMPLETED', 'HospitalMSP', { component: 'ipfs-service', status: 'COMPLETED', cid: `bafy${'a'.repeat(32)}`, byteLength: 2048, agentId: 'clinical-agent' });
  add('IPFS_UPLOAD_FAILED', 'HospitalMSP', { component: 'ipfs-service', status: 'FAILED', reasonCode: 'MOCK_UNAVAILABLE', errorCode: 'MOCK_IPFS_FAILURE' }, { severity: 'ERROR' });
  add('IPFS_RESOLUTION_FAILED', 'HospitalMSP', { component: 'ipfs-service', status: 'FAILED', reasonCode: 'MOCK_CID_NOT_FOUND', cid: `bafy${'c'.repeat(32)}` }, { severity: 'WARNING' });
  add('ALERT_RAISED', 'HospitalMSP', { ruleId: 'demo_peer_down', subjectId: 'peer0.hospital', status: 'OPEN', reasonCode: 'MOCK_DEMO_ALERT', alertSeverity: 'CRITICAL' }, { severity: 'CRITICAL' });
  return events;
}

async function main() {
  const baseUrl = process.env.DASHBOARD_DEMO_URL || 'http://127.0.0.1:4010';
  const serviceKey = process.env.DASHBOARD_SERVICE_KEY;
  if (!serviceKey) throw new Error('Set DASHBOARD_SERVICE_KEY to the demo service key.');
  const response = await fetch(`${baseUrl}/internal/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dashboard-service-key': serviceKey },
    body: JSON.stringify({ events: createMockEvents() }),
  });
  if (!response.ok) throw new Error(`Mock event delivery failed with HTTP ${response.status}.`);
  const body = await response.json();
  process.stdout.write(`Submitted ${body.results.filter((item) => item.accepted).length} labelled mock events.\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { createMockEvents };
