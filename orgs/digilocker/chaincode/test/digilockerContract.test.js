'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DigilockerContract } = require('../lib/digilockerContract');

function createMockContext({
  mspId = 'LabMSP',
  seconds = 1730640000,
  nanos = 123000000,
  callerId = 'CN=User1@lab.example.com,OU=client',
  clientIdentity = undefined,
  txTimestamp = undefined,
  simulateGetStateErrorOn = null,
} = {}) {
  const state = new Map();
  const iteratorsCreated = [];

  const stub = {
    async getState(key) {
      if (simulateGetStateErrorOn && key === simulateGetStateErrorOn) {
        throw new Error(`Simulated getState failure for key ${key}`);
      }
      return state.get(key) || Buffer.from('');
    },
    async putState(key, value) {
      state.set(key, Buffer.isBuffer(value) ? value : Buffer.from(value));
    },
    getTxTimestamp() {
      if (txTimestamp !== undefined) {
        return txTimestamp;
      }
      return {
        seconds: { low: seconds, high: 0, unsigned: true, toNumber: () => seconds },
        nanos,
      };
    },
    createCompositeKey(objectType, attributes) {
      return `\u0000${objectType}\u0000${attributes.join('\u0000')}\u0000`;
    },
    splitCompositeKey(compositeKey) {
      const parts = compositeKey.split('\u0000').filter((p) => p.length > 0);
      return {
        objectType: parts[0],
        attributes: parts.slice(1),
      };
    },
    async getStateByPartialCompositeKey(objectType, attributes) {
      const prefix = `\u0000${objectType}\u0000${attributes.join('\u0000')}\u0000`;
      const matchingEntries = [];
      for (const [key, val] of state.entries()) {
        if (key.startsWith(prefix)) {
          matchingEntries.push({ key, value: val });
        }
      }

      let index = 0;
      let closed = false;

      const iterator = {
        async next() {
          if (closed) {
            throw new Error('Iterator is closed');
          }
          if (index < matchingEntries.length) {
            const item = matchingEntries[index++];
            return { value: item, done: false };
          }
          return { done: true };
        },
        async close() {
          closed = true;
        },
        isClosed() {
          return closed;
        },
      };

      iteratorsCreated.push(iterator);
      return iterator;
    },
  };

  const resolvedClientIdentity =
    clientIdentity !== undefined
      ? clientIdentity
      : {
          getMSPID() {
            return mspId;
          },
          getID() {
            return callerId;
          },
          getAttributeValue(_attr) {
            return null;
          },
        };

  return {
    ctx: { stub, clientIdentity: resolvedClientIdentity },
    state,
    iteratorsCreated,
  };
}

const VALID_DOC = {
  documentId: 'DOC1001',
  patientId: 'PAT001',
  issuerId: 'LAB_USER_001',
  issuerOrg: 'LabMSP',
  documentType: 'DiagnosticReport',
  title: 'Complete Blood Count',
  fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  ipfsCID: 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi',
};

test.describe('DigilockerContract Test Suite', () => {
  const contract = new DigilockerContract();

  test.describe('CreateDocument', () => {
    test('successfully registers a document and writes composite-key index', async () => {
      const { ctx, state } = createMockContext();

      const resultJson = await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      const result = JSON.parse(resultJson);
      assert.equal(result.documentId, 'DOC1001');
      assert.equal(result.patientId, 'PAT001');
      assert.equal(result.issuerOrg, 'LabMSP');
      assert.equal(result.fileHash, VALID_DOC.fileHash);
      assert.equal(result.ipfsCID, VALID_DOC.ipfsCID);

      // Verify primary state record
      const storedBytes = state.get('DOC:DOC1001');
      assert.ok(storedBytes);
      const stored = JSON.parse(storedBytes.toString('utf8'));
      assert.equal(stored.documentId, 'DOC1001');

      // Verify composite key index
      const compositeKey = ctx.stub.createCompositeKey('PATIENT_DOC', ['PAT001', 'DOC1001']);
      assert.ok(state.has(compositeKey));
    });

    test('enforces deterministic timestamp from ctx.stub.getTxTimestamp (Long object)', async () => {
      // 1730640000s + 500000000ns = 2024-11-03T13:20:00.500Z
      const { ctx } = createMockContext({ seconds: 1730640000, nanos: 500000000 });

      const resultJson = await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      const result = JSON.parse(resultJson);
      assert.equal(result.createdAt, '2024-11-03T13:20:00.500Z');
    });

    test('supports deterministic timestamp represented as numeric seconds', async () => {
      const { ctx } = createMockContext({
        txTimestamp: {
          seconds: 1730640000,
          nanos: 500000000,
        },
      });

      const resultJson = await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      const result = JSON.parse(resultJson);
      assert.equal(result.createdAt, '2024-11-03T13:20:00.500Z');
    });

    test('rejects missing or invalid timestamp from Fabric stub', async () => {
      // Null timestamp
      const { ctx: ctxNull } = createMockContext({ txTimestamp: null });
      await assert.rejects(
        contract.CreateDocument(
          ctxNull,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Transaction timestamp is unavailable from Fabric stub/
      );

      // Empty timestamp object
      const { ctx: ctxEmpty } = createMockContext({ txTimestamp: {} });
      await assert.rejects(
        contract.CreateDocument(
          ctxEmpty,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Transaction timestamp is unavailable from Fabric stub/
      );

      // NaN timestamp
      const { ctx: ctxNaN } = createMockContext({ txTimestamp: { seconds: 'invalid', nanos: 0 } });
      await assert.rejects(
        contract.CreateDocument(
          ctxNaN,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Invalid timestamp values returned by Fabric stub/
      );
    });

    test('rejects missing or empty required arguments', async () => {
      const { ctx } = createMockContext();

      await assert.rejects(
        contract.CreateDocument(
          ctx,
          '',
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Field 'documentId' is required and must be a non-empty string/
      );

      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          '   ',
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Field 'patientId' is required and must be a non-empty string/
      );
    });

    test('rejects invalid SHA-256 hash', async () => {
      const { ctx } = createMockContext();

      // Not 64 chars
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          'not-a-valid-sha256-hash',
          VALID_DOC.ipfsCID
        ),
        /Invalid fileHash: must be a 64-character hexadecimal SHA-256 digest/
      );

      // Non-hex characters
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          'g3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          VALID_DOC.ipfsCID
        ),
        /Invalid fileHash: must be a 64-character hexadecimal SHA-256 digest/
      );
    });

    test('accepts valid supported CID formats (CIDv0, CIDv1 Base32, CIDv1 Base58)', async () => {
      const { ctx } = createMockContext();

      // Valid CIDv0 (Base58btc, starts with Qm, length 46)
      await contract.CreateDocument(
        ctx,
        'DOC1002',
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        'QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco'
      );

      // Valid CIDv1 (Base32, starts with b, length 59)
      await contract.CreateDocument(
        ctx,
        'DOC1003',
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        'bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
      );

      // Valid CIDv1 (Base58btc, starts with z, length 46)
      await contract.CreateDocument(
        ctx,
        'DOC1004',
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        'zQmZmyBUMDbAnFeMRHGGRsgTyUYoRyyszcgYmtVaCxzrPR'
      );
    });

    test('rejects arbitrary alphanumeric strings and malformed CIDs that previously passed fallback', async () => {
      const { ctx } = createMockContext();

      // 1. Mock CID from old test_provider.sh (length 27, invalid chars and length)
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          'QmProviderClaimCID987654321'
        ),
        /Invalid ipfsCID: does not match valid IPFS CID format/
      );

      // 2. Arbitrary alphanumeric string that previously passed the [a-zA-Z0-9]{20,120} fallback
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          'ThisIsNotAnIPFSCIDAtAll1234567890'
        ),
        /Invalid ipfsCID: does not match valid IPFS CID format/
      );

      // 3. String of 20 zeroes that previously passed fallback
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          '00000000000000000000'
        ),
        /Invalid ipfsCID: does not match valid IPFS CID format/
      );

      // 4. Invalid special characters
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          'Qm$$$invalid!!!'
        ),
        /Invalid ipfsCID: does not match valid IPFS CID format/
      );

      // 5. Too short
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          'bTooShort'
        ),
        /Invalid ipfsCID: does not match valid IPFS CID format/
      );

      // 6. CIDv1 Base32 containing invalid base32 characters ('8' and '9')
      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          'bafybeicg2vq4xdss4pfxxr5q6hkkyg5b2g56qg4r5s2hkyb3a5b6c7d8e9'
        ),
        /Invalid ipfsCID: does not match valid IPFS CID format/
      );
    });

    test('rejects duplicate document ID', async () => {
      const { ctx } = createMockContext();

      await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          VALID_DOC.issuerOrg,
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Document DOC1001 already exists/
      );
    });

    test('rejects issuer organization mismatch', async () => {
      const { ctx } = createMockContext({ mspId: 'LabMSP' });

      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          'HospitalMSP',
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Issuer organization mismatch: supplied 'HospitalMSP', but caller MSP is 'LabMSP'/
      );
    });

    test('rejects unauthorized MSP', async () => {
      const { ctx } = createMockContext({ mspId: 'UnauthorizedMSP' });

      await assert.rejects(
        contract.CreateDocument(
          ctx,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          'UnauthorizedMSP',
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Unauthorized MSP: 'UnauthorizedMSP' is not authorized to interact with DigiLocker on this channel/
      );
    });

    test('rejects empty or whitespace-only MSP ID on CreateDocument', async () => {
      const { ctx: ctxEmpty } = createMockContext({ mspId: '' });
      await assert.rejects(
        contract.CreateDocument(
          ctxEmpty,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          'LabMSP',
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Unauthorized MSP: 'unknown' is not authorized/
      );

      const { ctx: ctxWhitespace } = createMockContext({ mspId: '   ' });
      await assert.rejects(
        contract.CreateDocument(
          ctxWhitespace,
          VALID_DOC.documentId,
          VALID_DOC.patientId,
          VALID_DOC.issuerId,
          'LabMSP',
          VALID_DOC.documentType,
          VALID_DOC.title,
          VALID_DOC.fileHash,
          VALID_DOC.ipfsCID
        ),
        /Unauthorized MSP: 'unknown' is not authorized/
      );
    });
  });

  test.describe('GetDocument and VerifyDocument', () => {
    test('successfully retrieves existing document', async () => {
      const { ctx } = createMockContext();
      await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      const docJson = await contract.GetDocument(ctx, 'DOC1001');
      const doc = JSON.parse(docJson);
      assert.equal(doc.documentId, 'DOC1001');
      assert.equal(doc.patientId, 'PAT001');
    });

    test('throws error for nonexistent document', async () => {
      const { ctx } = createMockContext();

      await assert.rejects(
        contract.GetDocument(ctx, 'DOC_NONEXISTENT'),
        /Document DOC_NONEXISTENT does not exist/
      );
    });

    test('rejects unauthorized MSP on GetDocument', async () => {
      const { ctx } = createMockContext({ mspId: 'RogueMSP' });

      await assert.rejects(
        contract.GetDocument(ctx, 'DOC1001'),
        /Unauthorized MSP: 'RogueMSP'/
      );
    });

    test('rejects empty or whitespace MSP ID on GetDocument', async () => {
      const { ctx } = createMockContext({ mspId: '   ' });

      await assert.rejects(
        contract.GetDocument(ctx, 'DOC1001'),
        /Unauthorized MSP: 'unknown' is not authorized/
      );
    });

    test('rejects call when client identity is missing', async () => {
      const { ctx } = createMockContext({ clientIdentity: null });

      await assert.rejects(
        contract.GetDocument(ctx, 'DOC1001'),
        /Access denied: client identity is unavailable in transaction context/
      );
    });

    test('VerifyDocument returns valid: true for matching lowercase hash', async () => {
      const { ctx } = createMockContext();
      await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      const verificationJson = await contract.VerifyDocument(ctx, 'DOC1001', VALID_DOC.fileHash);
      const verification = JSON.parse(verificationJson);

      assert.equal(verification.documentId, 'DOC1001');
      assert.equal(verification.valid, true);
      assert.equal(verification.storedHash, VALID_DOC.fileHash);
      assert.equal(verification.calculatedHash, VALID_DOC.fileHash);
    });

    test('VerifyDocument returns valid: true when calculated hash is uppercase (case-insensitive)', async () => {
      const { ctx } = createMockContext();
      await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      const upperHash = VALID_DOC.fileHash.toUpperCase();
      const verificationJson = await contract.VerifyDocument(ctx, 'DOC1001', upperHash);
      const verification = JSON.parse(verificationJson);

      assert.equal(verification.documentId, 'DOC1001');
      assert.equal(verification.valid, true);
      assert.equal(verification.storedHash, VALID_DOC.fileHash);
      assert.equal(verification.calculatedHash, upperHash);
    });

    test('VerifyDocument returns valid: false for mismatched hash', async () => {
      const { ctx } = createMockContext();
      await contract.CreateDocument(
        ctx,
        VALID_DOC.documentId,
        VALID_DOC.patientId,
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        VALID_DOC.documentType,
        VALID_DOC.title,
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      const alteredHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const verificationJson = await contract.VerifyDocument(ctx, 'DOC1001', alteredHash);
      const verification = JSON.parse(verificationJson);

      assert.equal(verification.documentId, 'DOC1001');
      assert.equal(verification.valid, false);
      assert.equal(verification.storedHash, VALID_DOC.fileHash);
      assert.equal(verification.calculatedHash, alteredHash);
    });
  });

  test.describe('GetPatientDocuments', () => {
    test('retrieves patient documents using composite-key index and closes iterator', async () => {
      const { ctx, iteratorsCreated } = createMockContext();

      // Register two documents for PAT001
      await contract.CreateDocument(
        ctx,
        'DOC1001',
        'PAT001',
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        'BloodTest',
        'CBC',
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      await contract.CreateDocument(
        ctx,
        'DOC1002',
        'PAT001',
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        'UrineTest',
        'Urinalysis',
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      // Register one document for PAT002
      await contract.CreateDocument(
        ctx,
        'DOC1003',
        'PAT002',
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        'XRay',
        'Chest X-Ray',
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      // Query PAT001
      const pat1DocsJson = await contract.GetPatientDocuments(ctx, 'PAT001');
      const pat1Docs = JSON.parse(pat1DocsJson);

      assert.equal(pat1Docs.length, 2);
      assert.equal(pat1Docs[0].documentId, 'DOC1001');
      assert.equal(pat1Docs[1].documentId, 'DOC1002');

      // Verify iterator was closed
      assert.ok(iteratorsCreated.length > 0);
      for (const it of iteratorsCreated) {
        assert.equal(it.isClosed(), true);
      }
    });

    test('returns empty array when patient has no documents', async () => {
      const { ctx } = createMockContext();

      const resultJson = await contract.GetPatientDocuments(ctx, 'PAT_EMPTY');
      const result = JSON.parse(resultJson);

      assert.deepEqual(result, []);
    });

    test('handles stale composite index pointing to a missing document safely', async () => {
      const { ctx, state } = createMockContext();

      // Register DOC1001
      await contract.CreateDocument(
        ctx,
        'DOC1001',
        'PAT001',
        VALID_DOC.issuerId,
        VALID_DOC.issuerOrg,
        'BloodTest',
        'CBC',
        VALID_DOC.fileHash,
        VALID_DOC.ipfsCID
      );

      // Manually inject a stale index entry for non-existent DOC_STALE
      const staleKey = ctx.stub.createCompositeKey('PATIENT_DOC', ['PAT001', 'DOC_STALE']);
      state.set(staleKey, Buffer.from('\u0000'));

      const patDocsJson = await contract.GetPatientDocuments(ctx, 'PAT001');
      const patDocs = JSON.parse(patDocsJson);

      // Should return DOC1001 and safely ignore the stale index entry
      assert.equal(patDocs.length, 1);
      assert.equal(patDocs[0].documentId, 'DOC1001');
    });

    test('guarantees iterator closure when iteration or document retrieval throws an error', async () => {
      const { ctx, iteratorsCreated } = createMockContext({
        simulateGetStateErrorOn: 'DOC:DOC1001',
      });

      // Write a composite key directly into state
      const key = ctx.stub.createCompositeKey('PATIENT_DOC', ['PAT001', 'DOC1001']);
      await ctx.stub.putState(key, Buffer.from('\u0000'));

      // Call GetPatientDocuments, expecting the simulated error
      await assert.rejects(
        contract.GetPatientDocuments(ctx, 'PAT001'),
        /Simulated getState failure for key DOC:DOC1001/
      );

      // Verify the iterator was nonetheless properly closed in the finally block
      assert.equal(iteratorsCreated.length, 1);
      assert.equal(iteratorsCreated[0].isClosed(), true);
    });

    test('rejects unauthorized MSP query on GetPatientDocuments', async () => {
      const { ctx } = createMockContext({ mspId: 'OtherMSP' });

      await assert.rejects(
        contract.GetPatientDocuments(ctx, 'PAT001'),
        /Unauthorized MSP: 'OtherMSP'/
      );
    });

    test('rejects empty or whitespace MSP ID on GetPatientDocuments', async () => {
      const { ctx } = createMockContext({ mspId: '   ' });

      await assert.rejects(
        contract.GetPatientDocuments(ctx, 'PAT001'),
        /Unauthorized MSP: 'unknown' is not authorized/
      );
    });
  });
});
