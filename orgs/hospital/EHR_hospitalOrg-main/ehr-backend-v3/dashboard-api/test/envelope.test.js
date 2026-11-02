'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEventEnvelope } = require('../src/contracts/envelope');

function makeEvent(eventType, payload = {}) {
  return {
    schemaVersion: 1,
    eventId: 'evt-test-1',
    eventType,
    timestamp: '2026-11-03T10:00:00.000Z',
    source: 'fabric-block-listener',
    org: 'HospitalMSP',
    severity: 'INFO',
    payload,
  };
}

test('accepts a valid block-height event', () => {
  assert.deepEqual(validateEventEnvelope(makeEvent('BLOCK_HEIGHT_CHANGED', { blockHeight: 42 })), { valid: true });
});

test('accepts transaction metadata without transaction arguments or clinical values', () => {
  const event = makeEvent('TRANSACTION_COMMITTED', {
    chaincode: 'ehr',
    functionName: 'RecordVisit',
    creatorMsp: 'HospitalMSP',
    validationCode: 0,
    agentId: 'clinical-agent',
  });
  assert.deepEqual(validateEventEnvelope(event), { valid: true });
});

test('rejects raw patient identifiers and clinical narrative fields', () => {
  assert.match(validateEventEnvelope(makeEvent('CONSENT_GRANTED', { patientId: 'PAT-123' })).error, /Forbidden|Unsupported/);
  assert.match(validateEventEnvelope(makeEvent('AI_BLOCKED', { summaryText: 'clinical narrative' })).error, /Forbidden|Unsupported/);
  assert.match(validateEventEnvelope(makeEvent('FHIR_CONVERSION_COMPLETED', { diagnosis: 'value' })).error, /Forbidden|Unsupported/);
});

test('rejects arbitrary nested payloads and unsupported fields', () => {
  assert.match(validateEventEnvelope(makeEvent('AGENT_EXECUTION_COMPLETED', { metadata: { text: 'hidden data' } })).error, /Unsupported/);
});

test('accepts only keyed patient hashes', () => {
  const valid = makeEvent('ACCESS_DENIED', { patientIdHash: `hmac-sha256:${'a'.repeat(64)}`, reasonCode: 'CONSENT_ABSENT' });
  const invalid = makeEvent('ACCESS_DENIED', { patientIdHash: 'a'.repeat(64) });
  assert.deepEqual(validateEventEnvelope(valid), { valid: true });
  assert.match(validateEventEnvelope(invalid).error, /patientIdHash/);
});

test('validates the agreed trace stages and statuses', () => {
  const valid = makeEvent('AGENT_STAGE_UPDATED', { agentId: 'history-agent', stage: 'FHIR_CONVERSION', stageStatus: 'WAITING_HUMAN' });
  const invalid = makeEvent('AGENT_STAGE_UPDATED', { agentId: 'history-agent', stage: 'UNKNOWN', stageStatus: 'DONE' });
  assert.deepEqual(validateEventEnvelope(valid), { valid: true });
  assert.match(validateEventEnvelope(invalid).error, /trace stage/);
});

test('requires the documented envelope fields and rejects unknown event types', () => {
  const missing = makeEvent('PEER_STATUS_CHANGED');
  delete missing.org;
  assert.match(validateEventEnvelope(missing).error, /Missing required field: org/);
  assert.match(validateEventEnvelope(makeEvent('MADE_UP_EVENT')).error, /Unsupported eventType/);
});
