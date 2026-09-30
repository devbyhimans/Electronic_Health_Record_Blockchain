'use strict';

const crypto = require('crypto');
const { Contract } = require('fabric-contract-api');

function canonicalStringify(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (Buffer.isBuffer(val)) return val.toString('utf8');
  if (typeof val !== 'object') return String(val);
  if (Array.isArray(val)) {
    return '[' + val.map((item) => canonicalStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(val).sort();
  const pairs = keys.map((key) => `"${key}":${canonicalStringify(val[key])}`);
  return '{' + pairs.join(',') + '}';
}

function sha256(input) {
  const text = typeof input === 'string' || Buffer.isBuffer(input)
    ? input
    : canonicalStringify(input);
  return crypto.createHash('sha256').update(text).digest('hex');
}

class LabResultsContract extends Contract {
  async ResultExists(ctx, resultId) {
    const data = await ctx.stub.getState(resultId);
    return data && data.length > 0;
  }

  async InitLedger(ctx) {
    const existing = await this.ResultExists(ctx, 'labresult1');
    if (existing) {
      return JSON.stringify({
        message: 'Ledger already initialized',
        initialized: false,
      });
    }

    const seedRecords = [
      {
        resultId: 'labresult1',
        patientId: 'patient-1001',
        testCode: 'CBC',
        collectedAt: '2026-04-19T08:00:00Z',
        status: 'REPORTED',
        resultData: {
          hemoglobin: '13.8',
          wbc: '6200',
          platelets: '250000',
        },
        vcap: {
          version: '1.0.0',
          standard: 'VCAP-HL7-FABRIC',
          patientRecordHash: sha256({ hemoglobin: '13.8', wbc: '6200', platelets: '250000' }),
          promptHash: sha256('DEFAULT_CLINICAL_PROMPT_V1'),
          modelFingerprint: 'gemini-2.5-flash',
          summaryHash: sha256({ summary: 'Normal blood count values.', recommendation: 'Routine follow-up.' }),
          timestamp: '2026-04-19T08:05:00Z',
          gatewaySigner: 'LabMSP:labtech',
          algorithm: 'SHA-256',
        },
      },
      {
        resultId: 'labresult2',
        patientId: 'patient-1002',
        testCode: 'LFT',
        collectedAt: '2026-04-19T09:30:00Z',
        status: 'IN_REVIEW',
        resultData: {
          alt: '42',
          ast: '37',
          bilirubin: '0.8',
        },
        vcap: {
          version: '1.0.0',
          standard: 'VCAP-HL7-FABRIC',
          patientRecordHash: sha256({ alt: '42', ast: '37', bilirubin: '0.8' }),
          promptHash: sha256('DEFAULT_CLINICAL_PROMPT_V1'),
          modelFingerprint: 'gemini-2.5-flash',
          summaryHash: sha256({ summary: 'Liver enzymes within acceptable range.', recommendation: 'No acute intervention.' }),
          timestamp: '2026-04-19T09:35:00Z',
          gatewaySigner: 'LabMSP:labtech',
          algorithm: 'SHA-256',
        },
      },
    ];

    for (const record of seedRecords) {
      const payload = this._buildRecord(record);
      await ctx.stub.putState(record.resultId, Buffer.from(JSON.stringify(payload)));
    }

    return JSON.stringify({
      message: 'Ledger initialized',
      initialized: true,
      count: seedRecords.length,
    });
  }

  async CreateLabResult(ctx, resultId, patientId, testCode, collectedAt, status, resultDataJson, vcapJson) {
    const exists = await this.ResultExists(ctx, resultId);
    if (exists) {
      throw new Error(`Lab result ${resultId} already exists`);
    }

    const parsedResultData = this._parseJson(resultDataJson);
    const parsedVcap = vcapJson ? this._parseJson(vcapJson) : (parsedResultData && parsedResultData.vcap) || null;

    const record = this._buildRecord({
      resultId,
      patientId,
      testCode,
      collectedAt,
      status,
      resultData: parsedResultData,
      vcap: parsedVcap,
    });

    await ctx.stub.putState(resultId, Buffer.from(JSON.stringify(record)));

    if (parsedVcap) {
      await ctx.stub.setEvent(
        'VCAP_ANCHORED',
        Buffer.from(JSON.stringify({
          resultId,
          patientId,
          patientRecordHash: parsedVcap.patientRecordHash,
          summaryHash: parsedVcap.summaryHash,
          modelFingerprint: parsedVcap.modelFingerprint,
          timestamp: parsedVcap.timestamp,
        }))
      );
    }

    return JSON.stringify(record);
  }

  async ReadLabResult(ctx, resultId) {
    const data = await ctx.stub.getState(resultId);
    if (!data || data.length === 0) {
      throw new Error(`Lab result ${resultId} does not exist`);
    }
    return data.toString();
  }

  async UpdateLabResult(ctx, resultId, patientId, testCode, collectedAt, status, resultDataJson, vcapJson) {
    const exists = await this.ResultExists(ctx, resultId);
    if (!exists) {
      throw new Error(`Lab result ${resultId} does not exist`);
    }

    const parsedResultData = this._parseJson(resultDataJson);
    const parsedVcap = vcapJson ? this._parseJson(vcapJson) : (parsedResultData && parsedResultData.vcap) || null;

    const record = this._buildRecord({
      resultId,
      patientId,
      testCode,
      collectedAt,
      status,
      resultData: parsedResultData,
      vcap: parsedVcap,
    });

    await ctx.stub.putState(resultId, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
  }

  async UpdateLabStatus(ctx, resultId, status) {
    const current = JSON.parse(await this.ReadLabResult(ctx, resultId));
    current.status = status;
    current.updatedByTx = ctx.stub.getTxID();
    await ctx.stub.putState(resultId, Buffer.from(JSON.stringify(current)));
    return JSON.stringify(current);
  }

  async DeleteLabResult(ctx, resultId) {
    const exists = await this.ResultExists(ctx, resultId);
    if (!exists) {
      throw new Error(`Lab result ${resultId} does not exist`);
    }

    await ctx.stub.deleteState(resultId);
    return JSON.stringify({
      deleted: true,
      resultId,
    });
  }

  async GetLabResultsByPatient(ctx, patientId) {
    const query = {
      selector: {
        docType: 'labResult',
        patientId,
      },
    };

    const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
    const results = await this._collectIterator(iterator);
    return JSON.stringify(results);
  }

  async GetAllLabResults(ctx) {
    const iterator = await ctx.stub.getStateByRange('', '');
    const results = await this._collectIterator(iterator);
    const filtered = results.filter((record) => record.docType === 'labResult');
    return JSON.stringify(filtered);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // VCAP SPECIFICATION: Verifiable Clinical AI Provenance Smart Contract Functions
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves the on-chain VCAP cryptographic provenance anchor for a given result.
   */
  async GetVCAP(ctx, resultId) {
    const data = await this.ReadLabResult(ctx, resultId);
    const record = JSON.parse(data);
    const vcap = record.vcap || (record.resultData && record.resultData.vcap) || null;

    if (!vcap) {
      throw new Error(`Record ${resultId} does not have an on-chain VCAP anchor.`);
    }

    return JSON.stringify(vcap);
  }

  /**
   * Mathematically recomputes SHA-256 hashes of clinical input and AI summary directly
   * on-chain and validates them against the immutable ledger record.
   *
   * @param {Object} ctx Hyperledger Fabric transaction context
   * @param {string} resultId Lab Result Identifier
   * @param {string} clinicalRecordJson Raw clinical data JSON to verify
   * @param {string} promptText Exact prompt used for AI execution
   * @param {string} aiSummaryText AI output / summary text to verify
   * @param {string} [modelFingerprint] Expected AI model identifier
   */
  async VerifyVCAP(ctx, resultId, clinicalRecordJson, promptText, aiSummaryText, modelFingerprint) {
    const data = await this.ReadLabResult(ctx, resultId);
    const record = JSON.parse(data);
    const vcap = record.vcap || (record.resultData && record.resultData.vcap) || null;

    if (!vcap) {
      return JSON.stringify({
        verified: false,
        tamperDetected: true,
        error: `No VCAP provenance block anchored for record ${resultId}`,
      });
    }

    const parsedClinicalRecord = this._tryParse(clinicalRecordJson);
    const parsedAiSummary = this._tryParse(aiSummaryText);

    const recomputedRecordHash = sha256(parsedClinicalRecord);
    const recomputedSummaryHash = sha256(parsedAiSummary);

    const recordMatches = recomputedRecordHash.toLowerCase() === String(vcap.patientRecordHash || '').toLowerCase();
    const summaryMatches = recomputedSummaryHash.toLowerCase() === String(vcap.summaryHash || '').toLowerCase();

    let promptMatches = true;
    let recomputedPromptHash = null;
    if (promptText) {
      recomputedPromptHash = sha256(promptText);
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
        description: 'Tamper Detected: Clinical input differs from the version analyzed by the AI model.',
      });
    }
    if (!summaryMatches) {
      mismatches.push({
        field: 'summaryHash',
        expected: vcap.summaryHash,
        actual: recomputedSummaryHash,
        description: 'Tamper Detected: AI diagnostic summary has been modified since provenance creation.',
      });
    }
    if (!promptMatches) {
      mismatches.push({
        field: 'promptHash',
        expected: vcap.promptHash,
        actual: recomputedPromptHash,
        description: 'Prompt Mismatch: AI instruction template differs from anchored provenance.',
      });
    }
    if (!modelMatches) {
      mismatches.push({
        field: 'modelFingerprint',
        expected: vcap.modelFingerprint,
        actual: modelFingerprint,
        description: 'Model Mismatch: Model fingerprint does not match the anchored provenance.',
      });
    }

    const verificationResult = {
      resultId,
      verified,
      tamperDetected,
      status: verified ? 'VERIFIED' : 'TAMPER_DETECTED',
      anchoredVcap: vcap,
      recomputed: {
        patientRecordHash: recomputedRecordHash,
        summaryHash: recomputedSummaryHash,
        promptHash: recomputedPromptHash || vcap.promptHash,
        modelFingerprint: modelFingerprint || vcap.modelFingerprint,
      },
      mismatches,
      verifiedByTx: ctx.stub.getTxID(),
      timestamp: new Date().toISOString(),
    };

    // Emit on-chain verification event
    await ctx.stub.setEvent(
      'VCAP_VERIFICATION',
      Buffer.from(JSON.stringify({
        resultId,
        verified,
        tamperDetected,
        txId: ctx.stub.getTxID(),
      }))
    );

    return JSON.stringify(verificationResult);
  }

  _tryParse(text) {
    if (!text || typeof text !== 'string') return text;
    try {
      return JSON.parse(text);
    } catch (_e) {
      return text;
    }
  }

  _buildRecord({ resultId, patientId, testCode, collectedAt, status, resultData, vcap }) {
    const finalVcap = vcap || (resultData && resultData.vcap) || null;
    return {
      docType: 'labResult',
      resultId,
      patientId,
      testCode,
      collectedAt,
      status,
      resultData,
      vcap: finalVcap,
      ownerOrg: 'LabMSP',
      updatedByTx: null,
    };
  }

  _parseJson(jsonText) {
    if (typeof jsonText === 'object' && jsonText !== null) {
      return jsonText;
    }
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Invalid JSON payload: ${error.message}`);
    }
  }

  async _collectIterator(iterator) {
    const results = [];

    while (true) {
      const item = await iterator.next();
      if (item.value && item.value.value) {
        const rawValue = item.value.value.toString('utf8');
        try {
          results.push(JSON.parse(rawValue));
        } catch (_error) {
          results.push(rawValue);
        }
      }

      if (item.done) {
        await iterator.close();
        return results;
      }
    }
  }
}

module.exports = LabResultsContract;
module.exports.contracts = [LabResultsContract];
