'use strict';

const { EVENT_REGISTRY, TRACE_STATUSES } = require('./eventRegistry');

const REQUIRED_FIELDS = Object.freeze([
  'schemaVersion', 'eventId', 'eventType', 'timestamp', 'source', 'org', 'severity', 'payload',
]);
const OPTIONAL_FIELDS = Object.freeze([
  'peerId', 'txId', 'blockNumber', 'correlationId', 'channel', 'mock', 'unregistered',
]);
const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
const ORGS = new Set(['HospitalMSP', 'DiagnosticsMSP', 'ProviderMSP']);
const SEVERITIES = new Set(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SOURCE = /^[a-z][a-z0-9-]{0,63}$/;
const CID = /^(?:bafy[a-z2-7]{20,}|Qm[1-9A-HJ-NP-Za-km-z]{44})$/;
const HASH = /^(?:hmac-sha256:)?[a-f0-9]{64}$/i;
const PATIENT_HASH = /^hmac-sha256:[a-f0-9]{64}$/i;
const HASH_FIELDS = new Set([
  'patientIdHash', 'recordHash', 'promptHash', 'summaryHash', 'modelFingerprint',
  'gatewaySignerHash', 'granteeIdHash',
]);
const NUMBER_FIELDS = new Set(['durationMs', 'latencyMs', 'blockHeight', 'byteLength', 'artifactCount', 'validationCode']);
const BOOLEAN_FIELDS = new Set(['fallbackUsed']);
const STRING_FIELDS = new Set([
  'agentId', 'component', 'status', 'reasonCode', 'errorCode', 'chaincode', 'functionName',
  'creatorMsp', 'humanReviewStatus', 'stage', 'stageStatus', 'cid', 'expiresAt',
  'model', 'modelVersion', 'vcapStatus', 'ruleId', 'subjectId', 'alertSeverity',
]);
const SENSITIVE_KEYS = new Set([
  'patientid', 'patientname', 'firstname', 'lastname', 'fullname', 'dob', 'dateofbirth',
  'diagnosis', 'medication', 'prescription', 'vitals', 'labvalue', 'resultvalue',
  'clinicalvalue', 'summary', 'summarytext', 'prompt', 'prompttext', 'narrative',
  'address', 'phone', 'email', 'ssn', 'rawrecord', 'recordbody',
]);

function error(message) {
  return { valid: false, error: message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function normalizeKey(key) {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSafeIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function validateScalar(field, value) {
  if (HASH_FIELDS.has(field)) return typeof value === 'string' && HASH.test(value);
  if (field === 'cid') return typeof value === 'string' && CID.test(value);
  if (NUMBER_FIELDS.has(field)) return Number.isFinite(value) && value >= 0;
  if (BOOLEAN_FIELDS.has(field)) return typeof value === 'boolean';
  if (STRING_FIELDS.has(field)) return isSafeIdentifier(value);
  return false;
}

function validateEventEnvelope(input, options = {}) {
  if (!isPlainObject(input)) return error('Event must be a plain JSON object');

  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) return error(`Unsupported envelope field: ${key}`);
    if (SENSITIVE_KEYS.has(normalizeKey(key))) return error(`Forbidden sensitive field: ${key}`);
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) return error(`Missing required field: ${field}`);
  }

  if (input.schemaVersion !== 1) return error('Unsupported schemaVersion');
  if (!isSafeIdentifier(input.eventId)) return error('Invalid eventId');
  if (typeof input.eventType !== 'string' || !/^[A-Z][A-Z0-9_]{0,95}$/.test(input.eventType)) return error('Invalid eventType');
  const registered = Object.prototype.hasOwnProperty.call(EVENT_REGISTRY, input.eventType);
  if (!registered && options.allowUnknownEventType !== true && input.unregistered !== true) return error('Unsupported eventType');
  if (registered && input.unregistered === true) return error('Registered eventType cannot be marked unregistered');
  if (input.mock !== undefined && typeof input.mock !== 'boolean') return error('mock must be a boolean');
  if (input.unregistered !== undefined && typeof input.unregistered !== 'boolean') return error('unregistered must be a boolean');
  if (typeof input.timestamp !== 'string' || !input.timestamp.endsWith('Z') || !Number.isFinite(Date.parse(input.timestamp))) {
    return error('timestamp must be a UTC ISO date-time');
  }
  if (typeof input.source !== 'string' || !SOURCE.test(input.source)) return error('Invalid source');
  const allowedOrganizations = options.organizations ? new Set(options.organizations) : ORGS;
  if (!allowedOrganizations.has(input.org)) return error('Unsupported org');
  if (!SEVERITIES.has(input.severity)) return error('Unsupported severity');

  for (const field of ['peerId', 'txId', 'correlationId', 'channel']) {
    if (input[field] !== undefined && !isSafeIdentifier(input[field])) return error(`Invalid ${field}`);
  }
  if (input.blockNumber !== undefined && (!Number.isSafeInteger(input.blockNumber) || input.blockNumber < 0)) {
    return error('Invalid blockNumber');
  }
  if (!isPlainObject(input.payload)) return error('payload must be a plain JSON object');

  const genericSafeFields = ['component', 'status', 'reasonCode', 'errorCode', 'latencyMs', 'agentId'];
  const permitted = registered ? EVENT_REGISTRY[input.eventType].payloadFields : genericSafeFields;
  for (const [key, value] of Object.entries(input.payload)) {
    if (SENSITIVE_KEYS.has(normalizeKey(key))) return error(`Forbidden sensitive payload field: ${key}`);
    if (!permitted.includes(key)) return error(`Unsupported payload field for ${input.eventType}: ${key}`);
    if (!validateScalar(key, value)) return error(`Invalid payload field: ${key}`);
  }

  if (input.payload.patientIdHash !== undefined && !PATIENT_HASH.test(input.payload.patientIdHash)) {
    return error('patientIdHash must be a keyed hash');
  }
  if (input.eventType === 'AGENT_STAGE_UPDATED') {
    if (!isSafeIdentifier(input.payload.stage)) return error('Invalid trace stage');
    if (!TRACE_STATUSES.includes(input.payload.stageStatus)) return error('Unsupported trace status');
  }
  return { valid: true };
}

module.exports = {
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  validateEventEnvelope,
};
