'use strict';

const TRACE_STAGES = Object.freeze([
  'REPORT_RECEIVED',
  'OCR_PARSING',
  'FHIR_CONVERSION',
  'ENCRYPTED_IPFS_STORED',
  'RECORD_ANCHORED',
  'AGENT_PROCESSING',
  'GOVERNANCE',
  'HUMAN_REVIEW',
  'VCAP_ANCHORED',
  'VCAP_VERIFIED',
]);

const TRACE_STATUSES = Object.freeze([
  'DONE',
  'FAILED',
  'SKIPPED',
  'PENDING',
  'WAITING_HUMAN',
]);

const event = (category, payloadFields, producer = 'TODO(dependency: producer team)') =>
  Object.freeze({ category, payloadFields: Object.freeze(payloadFields), producer });

const HEALTH = ['component', 'status', 'reasonCode', 'latencyMs', 'blockHeight', 'agentId'];
const TX = ['chaincode', 'functionName', 'creatorMsp', 'validationCode', 'agentId', 'durationMs', 'reasonCode', 'patientIdHash'];
const AGENT = ['agentId', 'status', 'durationMs', 'errorCode', 'modelFingerprint', 'fallbackUsed', 'humanReviewStatus', 'stage', 'stageStatus', 'patientIdHash', 'recordHash', 'cid'];
const ACCESS = ['agentId', 'reasonCode', 'status', 'patientIdHash', 'granteeIdHash', 'expiresAt'];
const IPFS = ['component', 'status', 'reasonCode', 'latencyMs', 'cid', 'byteLength', 'durationMs', 'errorCode', 'artifactCount', 'agentId'];
const VCAP = ['agentId', 'status', 'recordHash', 'promptHash', 'summaryHash', 'modelFingerprint', 'gatewaySignerHash', 'patientIdHash', 'errorCode', 'durationMs'];
const FHIR = ['agentId', 'status', 'durationMs', 'errorCode', 'recordHash', 'cid', 'patientIdHash'];

// Event names sourced from the Group 1, Security, Agentic AI, and FHIR proposals,
// plus the explicit Group 1 additions approved by the user. Producers remain
// disconnected until their owning teams publish these contracts.
const EVENT_REGISTRY = Object.freeze({
  PEER_STATUS_CHANGED: event('health', HEALTH, 'Fabric operations endpoint'),
  PEER_DOWN: event('health', HEALTH, 'Fabric operations endpoint'),
  ORDERER_STATUS_CHANGED: event('health', HEALTH, 'Fabric operations endpoint'),
  ORDERER_DOWN: event('health', HEALTH, 'Fabric operations endpoint'),
  API_STATUS_CHANGED: event('health', HEALTH, 'API health endpoint'),
  API_DOWN: event('health', HEALTH, 'API health endpoint'),
  API_ACTION_EVALUATED: event('security', ['component', 'status', 'reasonCode', 'agentId'], 'TODO(dependency: API gateway owners)'),
  CA_STATUS_CHANGED: event('health', HEALTH, 'Fabric CA operations endpoint'),
  LAB_STATUS_CHANGED: event('health', HEALTH, 'Lab gateway'),
  LAB_DOWN: event('health', HEALTH, 'Lab gateway'),
  PHARMACY_STATUS_CHANGED: event('health', HEALTH, 'Pharmacy gateway'),
  PHARMACY_DOWN: event('health', HEALTH, 'Pharmacy gateway'),
  AGENT_HEARTBEAT: event('health', AGENT, 'TODO(dependency: AI / service owners)'),
  AGENT_OFFLINE: event('health', AGENT, 'TODO(dependency: AI / service owners)'),
  BLOCK_HEIGHT_CHANGED: event('block', ['blockHeight', 'component'], 'Fabric block listener'),
  TRANSACTION_SUBMITTED: event('transaction', TX, 'Fabric block listener'),
  TRANSACTION_COMMITTED: event('transaction', TX, 'Fabric block listener'),
  TRANSACTION_FAILED: event('transaction', TX, 'Fabric block listener'),
  MVCC_CONFLICT: event('transaction', TX, 'Fabric block listener'),
  ENDORSEMENT_FAILED: event('transaction', TX, 'Fabric block listener'),
  AGENT_STARTED: event('agent', AGENT, 'TODO(dependency: AI team)'),
  AGENT_EXECUTION_STARTED: event('agent', AGENT, 'TODO(dependency: AI team)'),
  AGENT_EXECUTION_COMPLETED: event('agent', AGENT, 'TODO(dependency: AI team)'),
  AGENT_EXECUTION_FAILED: event('agent', AGENT, 'TODO(dependency: AI team)'),
  AGENT_STAGE_UPDATED: event('trace', AGENT, 'TODO(dependency: AI / Security / FHIR teams)'),
  CONSENT_GRANTED: event('consent', ACCESS, 'TODO(dependency: Security team)'),
  CONSENT_REVOKED: event('consent', ACCESS, 'TODO(dependency: Security team)'),
  ACCESS_DENIED: event('security', ACCESS, 'TODO(dependency: API gateway owners)'),
  AUTHZ_DENIED: event('security', ACCESS, 'TODO(dependency: Security team)'),
  AUTHZ_ORG_DENIED: event('security', ACCESS, 'TODO(dependency: Security team)'),
  AUTHZ_ROLE_DENIED: event('security', ACCESS, 'TODO(dependency: Security team)'),
  CONSENT_ABSENT: event('security', ACCESS, 'TODO(dependency: Security team)'),
  CONSENT_EXPIRED: event('security', ACCESS, 'TODO(dependency: Security team)'),
  CONSENT_INACTIVE: event('security', ACCESS, 'TODO(dependency: Security team)'),
  EMERGENCY_ACCESS_INVOKED: event('security', ACCESS, 'TODO(dependency: Security team)'),
  FHIR_CONVERSION_STARTED: event('fhir', FHIR, 'TODO(dependency: FHIR team)'),
  FHIR_CONVERSION_COMPLETED: event('fhir', FHIR, 'TODO(dependency: FHIR team)'),
  FHIR_CONVERSION_FAILED: event('fhir', FHIR, 'TODO(dependency: FHIR team)'),
  GOVERNANCE_DECISION: event('governance', AGENT, 'TODO(dependency: AI / Security teams)'),
  HUMAN_REVIEW_REQUIRED: event('governance', AGENT, 'TODO(dependency: AI team)'),
  AI_FALLBACK_USED: event('ai', AGENT, 'TODO(dependency: AI team)'),
  AI_BLOCKED: event('ai', AGENT, 'TODO(dependency: AI / Security teams)'),
  AI_HALLUCINATION_SUSPECTED: event('ai', AGENT, 'TODO(dependency: AI team)'),
  VCAP_ANCHORED: event('vcap', VCAP, 'TODO(dependency: Security team)'),
  VCAP_VERIFIED: event('vcap', VCAP, 'TODO(dependency: Security team)'),
  VCAP_MISMATCH: event('vcap', VCAP, 'TODO(dependency: Security team)'),
  VCAP_VERIFICATION_FAILED: event('vcap', VCAP, 'TODO(dependency: Security team)'),
  IPFS_UPLOAD_COMPLETED: event('ipfs', IPFS, 'IPFS service'),
  IPFS_UPLOAD_FAILED: event('ipfs', IPFS, 'IPFS service'),
  IPFS_NODE_DOWN: event('ipfs', IPFS, 'IPFS health endpoint'),
  IPFS_STATUS_CHANGED: event('ipfs', IPFS, 'IPFS health endpoint'),
});

module.exports = { EVENT_REGISTRY, TRACE_STAGES, TRACE_STATUSES };
