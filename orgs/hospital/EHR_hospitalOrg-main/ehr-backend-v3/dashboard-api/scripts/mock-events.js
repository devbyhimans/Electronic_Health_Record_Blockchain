'use strict';

const crypto = require('node:crypto');

function createMockEvents(options = {}) {
  const now = options.now || Date.now();
  const runId = options.correlationId || `mock-run-${crypto.randomUUID()}`;
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
