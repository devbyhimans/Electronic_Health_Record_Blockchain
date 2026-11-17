'use strict';

const { Contract } = require('fabric-contract-api');

// SHA-256 hash regex: 64 hexadecimal characters
const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;

// Strict IPFS CID syntactic validation:
// - CIDv0: Base58btc encoded SHA-256 multihash starting with 'Qm', exactly 46 characters.
// - CIDv1 (Base32): Multibase prefix 'b', RFC 4648 base32 lowercase ([a-z2-7]), length 50-100 (typically 59 chars for sha2-256).
// - CIDv1 (Base58btc): Multibase prefix 'z', Base58btc characters ([1-9A-HJ-NP-Za-km-z]), length 45-100.
const CID_REGEX = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{49,100}|z[1-9A-HJ-NP-Za-km-z]{44,100})$/;

// Active ehrchannel contains LabMSP only. Hypothetical or inactive MSPs are excluded.
const AUTHORIZED_MSPS = ['LabMSP'];

class DigilockerContract extends Contract {
  constructor() {
    super('DigilockerContract');
  }

  /**
   * Helper method to construct the state key for a document
   */
  _getKey(documentId) {
    return `DOC:${documentId}`;
  }

  /**
   * Validates that the caller belongs to an authorized MSP on ehrchannel.
   */
  _validateCallerMsp(ctx) {
    if (!ctx || !ctx.clientIdentity) {
      throw new Error('Access denied: client identity is unavailable in transaction context');
    }

    const rawMspId = ctx.clientIdentity.getMSPID();
    const callerMspId = typeof rawMspId === 'string' ? rawMspId.trim() : '';
    if (!callerMspId || !AUTHORIZED_MSPS.includes(callerMspId)) {
      throw new Error(`Unauthorized MSP: '${callerMspId || 'unknown'}' is not authorized to interact with DigiLocker on this channel`);
    }

    return callerMspId;
  }

  /**
   * Extracts a deterministic timestamp from the transaction proposal header (ctx.stub.getTxTimestamp).
   * Ensures identical timestamp values across all endorsing peers.
   */
  _getDeterministicTimestamp(ctx) {
    const txTimestamp = ctx.stub.getTxTimestamp();
    if (!txTimestamp || (txTimestamp.seconds === undefined && txTimestamp.nanos === undefined)) {
      throw new Error('Transaction timestamp is unavailable from Fabric stub');
    }

    let seconds;
    if (typeof txTimestamp.seconds === 'object' && txTimestamp.seconds !== null) {
      if (typeof txTimestamp.seconds.toNumber === 'function') {
        seconds = txTimestamp.seconds.toNumber();
      } else if ('low' in txTimestamp.seconds) {
        seconds = txTimestamp.seconds.low;
      } else {
        seconds = Number(txTimestamp.seconds);
      }
    } else {
      seconds = Number(txTimestamp.seconds);
    }

    const nanos = Number(txTimestamp.nanos || 0);

    if (isNaN(seconds) || isNaN(nanos)) {
      throw new Error('Invalid timestamp values returned by Fabric stub');
    }

    const millis = (seconds * 1000) + Math.floor(nanos / 1000000);
    return new Date(millis).toISOString();
  }

  /**
   * 1. CreateDocument
   * Registers a new medical document metadata record on-chain and creates
   * a composite-key index for efficient patient-based retrieval on both LevelDB and CouchDB.
   */
  async CreateDocument(
    ctx,
    documentId,
    patientId,
    issuerId,
    issuerOrg,
    documentType,
    title,
    fileHash,
    ipfsCID
  ) {
    // 1. Validate required string arguments
    const requiredFields = {
      documentId,
      patientId,
      issuerId,
      issuerOrg,
      documentType,
      title,
      fileHash,
      ipfsCID,
    };

    for (const [fieldName, val] of Object.entries(requiredFields)) {
      if (val === undefined || val === null || typeof val !== 'string' || val.trim().length === 0) {
        throw new Error(`Field '${fieldName}' is required and must be a non-empty string`);
      }
    }

    const cleanDocId = documentId.trim();
    const cleanPatientId = patientId.trim();
    const cleanIssuerId = issuerId.trim();
    const cleanIssuerOrg = issuerOrg.trim();
    const cleanDocType = documentType.trim();
    const cleanTitle = title.trim();
    const cleanHash = fileHash.trim();
    const cleanCID = ipfsCID.trim();

    // 2. Validate cryptographic file hash (64-character hex SHA-256)
    if (!SHA256_REGEX.test(cleanHash)) {
      throw new Error('Invalid fileHash: must be a 64-character hexadecimal SHA-256 digest');
    }

    // 3. Strict syntactic validation of IPFS CID (CIDv0 or CIDv1)
    if (!CID_REGEX.test(cleanCID)) {
      throw new Error('Invalid ipfsCID: does not match valid IPFS CID format');
    }

    // 4. Verify caller MSP authorization
    const callerMspId = this._validateCallerMsp(ctx);

    // 5. Bind submitted issuerOrg strictly to caller's actual MSP
    if (cleanIssuerOrg !== callerMspId) {
      throw new Error(`Issuer organization mismatch: supplied '${cleanIssuerOrg}', but caller MSP is '${callerMspId}'`);
    }

    // 6. Check for duplicate document ID
    const key = this._getKey(cleanDocId);
    const existing = await ctx.stub.getState(key);
    if (existing && existing.length > 0) {
      throw new Error(`Document ${cleanDocId} already exists`);
    }

    // 7. Deterministic timestamp from proposal header
    const createdAt = this._getDeterministicTimestamp(ctx);

    const documentRecord = {
      docType: 'digilockerDocument',
      documentId: cleanDocId,
      patientId: cleanPatientId,
      issuerId: cleanIssuerId,
      issuerOrg: cleanIssuerOrg,
      documentType: cleanDocType,
      title: cleanTitle,
      fileHash: cleanHash,
      ipfsCID: cleanCID,
      createdAt,
    };

    // 8. Atomic ledger write: document record + composite key index
    await ctx.stub.putState(
      key,
      Buffer.from(JSON.stringify(documentRecord))
    );

    const patientDocIndexKey = ctx.stub.createCompositeKey('PATIENT_DOC', [cleanPatientId, cleanDocId]);
    await ctx.stub.putState(
      patientDocIndexKey,
      Buffer.from('\u0000')
    );

    return JSON.stringify(documentRecord);
  }

  /**
   * 2. GetDocument
   * Retrieves a document metadata record by documentId.
   */
  async GetDocument(ctx, documentId) {
    if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
      throw new Error('documentId is required and must be a non-empty string');
    }

    this._validateCallerMsp(ctx);

    const cleanDocId = documentId.trim();
    const key = this._getKey(cleanDocId);
    const data = await ctx.stub.getState(key);

    if (!data || data.length === 0) {
      throw new Error(`Document ${cleanDocId} does not exist`);
    }

    return data.toString('utf8');
  }

  /**
   * 3. GetPatientDocuments
   * Uses composite key range query (getStateByPartialCompositeKey) to retrieve all
   * DigiLocker documents belonging to a patient. Works seamlessly on both LevelDB and CouchDB.
   */
  async GetPatientDocuments(ctx, patientId) {
    if (!patientId || typeof patientId !== 'string' || patientId.trim().length === 0) {
      throw new Error('patientId is required and must be a non-empty string');
    }

    this._validateCallerMsp(ctx);

    const cleanPatientId = patientId.trim();
    const iterator = await ctx.stub.getStateByPartialCompositeKey('PATIENT_DOC', [cleanPatientId]);
    const results = [];

    try {
      while (true) {
        const item = await iterator.next();
        if (item.value && item.value.key) {
          const splitKey = ctx.stub.splitCompositeKey(item.value.key);
          const documentId = splitKey.attributes && splitKey.attributes[1];
          if (documentId) {
            const docKey = this._getKey(documentId);
            const docBytes = await ctx.stub.getState(docKey);
            if (docBytes && docBytes.length > 0) {
              try {
                results.push(JSON.parse(docBytes.toString('utf8')));
              } catch (_err) {
                results.push(docBytes.toString('utf8'));
              }
            }
          }
        }
        if (item.done) {
          break;
        }
      }
    } finally {
      if (iterator) {
        await iterator.close();
      }
    }

    return JSON.stringify(results);
  }

  /**
   * 4. VerifyDocument
   * Compares the stored fileHash against a calculatedHash supplied by the caller.
   */
  async VerifyDocument(ctx, documentId, calculatedHash) {
    if (!documentId || typeof documentId !== 'string' || documentId.trim().length === 0) {
      throw new Error('documentId is required and must be a non-empty string');
    }
    if (!calculatedHash || typeof calculatedHash !== 'string' || calculatedHash.trim().length === 0) {
      throw new Error('calculatedHash is required and must be a non-empty string');
    }

    const cleanHash = calculatedHash.trim();
    if (!SHA256_REGEX.test(cleanHash)) {
      throw new Error('Invalid calculatedHash: must be a 64-character hexadecimal SHA-256 digest');
    }

    const docJson = await this.GetDocument(ctx, documentId.trim());
    const document = JSON.parse(docJson);

    const storedHash = document.fileHash;
    const isValid = storedHash.toLowerCase() === cleanHash.toLowerCase();

    return JSON.stringify({
      documentId: document.documentId,
      valid: isValid,
      storedHash: storedHash,
      calculatedHash: cleanHash,
    });
  }
}

module.exports = { DigilockerContract };
