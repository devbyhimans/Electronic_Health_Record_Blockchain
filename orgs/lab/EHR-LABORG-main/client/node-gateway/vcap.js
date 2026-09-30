'use strict';

const crypto = require('crypto');

/**
 * Deterministically serialize a JavaScript value to ensure consistent SHA-256 hashes.
 */
function canonicalStringify(val) {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'string') {
    return val.trim();
  }
  if (Buffer.isBuffer(val)) {
    return val.toString('utf8');
  }
  if (typeof val !== 'object') {
    return String(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map((item) => canonicalStringify(item)).join(',') + ']';
  }

  const keys = Object.keys(val).sort();
  const pairs = keys.map((key) => `"${key}":${canonicalStringify(val[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes SHA-256 hex digest for any string, buffer, or object.
 */
function sha256(input) {
  const text = typeof input === 'string' || Buffer.isBuffer(input)
    ? input
    : canonicalStringify(input);
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Generates a Verifiable Clinical AI Provenance (VCAP) record conforming to proposal.tex Section 7.
 */
function generateVcapRecord({
  clinicalRecord,
  prompt = '',
  modelFingerprint = 'gemini-2.5-flash',
  aiSummary,
  gatewaySigner = 'LabMSP:labtech',
  timestamp,
}) {
  const patientRecordHash = sha256(clinicalRecord);
  const promptHash = sha256(prompt || 'DEFAULT_CLINICAL_PROMPT_V1');
  const summaryHash = sha256(aiSummary);
  const executionTimestamp = timestamp || new Date().toISOString();

  return {
    version: '1.0.0',
    standard: 'VCAP-HL7-FABRIC',
    patientRecordHash,
    promptHash,
    modelFingerprint: String(modelFingerprint || 'gemini-2.5-flash'),
    summaryHash,
    timestamp: executionTimestamp,
    gatewaySigner: String(gatewaySigner || 'LabMSP:labtech'),
    algorithm: 'SHA-256',
  };
}

/**
 * Mathematically verifies clinical data and AI summary against an on-chain VCAP record.
 */
function verifyVcapRecord({
  vcap,
  clinicalRecord,
  prompt,
  aiSummary,
  modelFingerprint,
}) {
  if (!vcap || typeof vcap !== 'object') {
    return {
      verified: false,
      tamperDetected: true,
      error: 'Missing or invalid on-chain VCAP anchor.',
    };
  }

  const recomputedRecordHash = sha256(clinicalRecord);
  const recomputedSummaryHash = sha256(aiSummary);

  const recordMatches = recomputedRecordHash.toLowerCase() === String(vcap.patientRecordHash || '').toLowerCase();
  const summaryMatches = recomputedSummaryHash.toLowerCase() === String(vcap.summaryHash || '').toLowerCase();

  let promptMatches = true;
  let recomputedPromptHash = null;
  if (prompt && typeof prompt === 'string' && prompt.trim().length > 0) {
    recomputedPromptHash = sha256(prompt);
    promptMatches = recomputedPromptHash.toLowerCase() === String(vcap.promptHash || '').toLowerCase();
  }

  let modelMatches = true;
  if (modelFingerprint) {
    modelMatches = String(modelFingerprint).toLowerCase() === String(vcap.modelFingerprint || '').toLowerCase();
  }

  const verified = recordMatches && summaryMatches && promptMatches && modelMatches;
  const tamperDetected = !verified;

  const mismatches = [];
  if (!recordMatches) {
    mismatches.push({
      field: 'patientRecordHash',
      expected: vcap.patientRecordHash,
      actual: recomputedRecordHash,
      description: 'Clinical input has been tampered with or modified after AI execution!',
    });
  }
  if (!summaryMatches) {
    mismatches.push({
      field: 'summaryHash',
      expected: vcap.summaryHash,
      actual: recomputedSummaryHash,
      description: 'AI diagnostic summary has been tampered with or modified after generation!',
    });
  }
  if (!promptMatches) {
    mismatches.push({
      field: 'promptHash',
      expected: vcap.promptHash,
      actual: recomputedPromptHash,
      description: 'AI prompt template mismatch!',
    });
  }
  if (!modelMatches) {
    mismatches.push({
      field: 'modelFingerprint',
      expected: vcap.modelFingerprint,
      actual: modelFingerprint,
      description: 'AI model version mismatch!',
    });
  }

  return {
    verified,
    tamperDetected,
    status: verified ? 'VERIFIED' : 'TAMPER_DETECTED',
    message: verified
      ? 'Verification Succeeded: Clinical input, AI model, and summary match the immutable on-chain VCAP anchor.'
      : `Tamper Detected: ${mismatches.map((m) => m.description).join(' ')}`,
    mismatches,
    anchoredVcap: vcap,
    recomputed: {
      patientRecordHash: recomputedRecordHash,
      summaryHash: recomputedSummaryHash,
      promptHash: recomputedPromptHash || vcap.promptHash,
      modelFingerprint: modelFingerprint || vcap.modelFingerprint,
    },
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = {
  canonicalStringify,
  sha256,
  generateVcapRecord,
  verifyVcapRecord,
};
