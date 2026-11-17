'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

// Configure test environment variables before requiring gateway modules
const TEST_SECRET = 'test-lab-gateway-secret-must-be-32-characters-long!';
const TEST_USERS_FILE = path.join(__dirname, 'test-transaction-users-registry.json');

process.env.NODE_ENV = 'test';
process.env.LAB_JWT_SECRET = TEST_SECRET;
process.env.LAB_USERS_FILE = TEST_USERS_FILE;

const userRegistry = require('../auth/userRegistry');
const jwtService = require('../auth/jwtService');
const { resetRateLimiter } = require('../auth/loginHandler');
const gateway = require('../gateway');
const app = require('../server');

function cleanupTestUsersFile() {
  if (fs.existsSync(TEST_USERS_FILE)) {
    try {
      fs.unlinkSync(TEST_USERS_FILE);
    } catch (_err) {
      // ignore
    }
  }
}

// In-memory Express dispatch harness
function dispatchRoute(method, url, { headers = {}, body = null, query = {} } = {}) {
  return new Promise((resolve) => {
    let statusCode = 200;
    let responseData = null;

    const lowerHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }
    if (!lowerHeaders.host) {
      lowerHeaders.host = 'localhost';
    }

    const req = {
      method: method.toUpperCase(),
      url,
      path: url.split('?')[0],
      headers: lowerHeaders,
      body: body || {},
      query,
      params: {},
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      get(header) {
        return this.headers[header.toLowerCase()];
      },
      header(header) {
        return this.get(header);
      },
    };

    const res = {
      statusCode: 200,
      headers: {},
      status(code) {
        this.statusCode = code;
        statusCode = code;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      getHeader(k) {
        return this.headers[k];
      },
      json(data) {
        responseData = data;
        resolve({ statusCode: this.statusCode, body: data });
      },
      send(data) {
        responseData = data;
        resolve({ statusCode: this.statusCode, body: data });
      },
      sendFile(filePath) {
        resolve({ statusCode: this.statusCode, body: `FILE:${filePath}` });
      },
      end(data) {
        if (!responseData && data) responseData = data;
        resolve({ statusCode: this.statusCode, body: responseData });
      },
    };

    app.handle(req, res);
  });
}

async function runTransactionTests() {
  console.log('=== Laboratory Transaction Validation & Failure Handling Test Suite ===\n');

  cleanupTestUsersFile();
  resetRateLimiter();
  gateway.setSimulatedFabricFailure(null);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
      failed++;
    }
  }

  try {
    // Provision users
    const techUser = userRegistry.createUser({
      username: 'tech_tx_tester',
      password: 'txTesterPassword123!',
      role: 'labtechnician',
    });

    const supervisorUser = userRegistry.createUser({
      username: 'supervisor_tx_tester',
      password: 'txSupervisorPassword123!',
      role: 'labsupervisor',
    });

    const techToken = jwtService.issueLabToken(techUser);
    const supervisorToken = jwtService.issueLabToken(supervisorUser);

    // =========================================================================
    // Section 1: Required Field Validation (Before Fabric Submission)
    // =========================================================================
    console.log('--- Section 1: Required Field Validation ---');

    await test('TX-1. Record creation missing resultId is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('resultId is required'));
    });

    await test('TX-2. Record creation missing patientId is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-missing-patient',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('patientId is required'));
    });

    await test('TX-3. Record creation missing testCode is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-missing-testcode',
          patientId: 'patient-tx-1',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('testCode is required'));
    });

    await test('TX-4. Record creation missing collectedAt is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-missing-collected',
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('collectedAt is required'));
    });

    await test('TX-5. Record creation missing status is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-missing-status',
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('status is required'));
    });

    // =========================================================================
    // Section 2: Malformed Field Validation
    // =========================================================================
    console.log('\n--- Section 2: Malformed Field Validation ---');

    await test('TX-6. Malformed resultId with path traversal is rejected with 400', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: '../../etc/passwd',
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid or malformed resultId'));
    });

    await test('TX-7. Malformed resultId with special characters/spaces is rejected with 400', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'bad id with spaces!',
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid or malformed resultId'));
    });

    await test('TX-8. Malformed patientId with path traversal is rejected with 400', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-valid-1',
          patientId: '../traversal-patient',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid or malformed patientId'));
    });

    await test('TX-9. Malformed status value is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-valid-2',
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'UNKNOWN_FABRICATED_STATUS',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid status'));
    });

    await test('TX-10. Malformed collectedAt timestamp is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-valid-3',
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          collectedAt: 'not-a-valid-timestamp-date',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid or malformed collectedAt timestamp'));
    });

    await test('TX-11. Malformed JSON string in resultData is rejected with 400 Bad Request', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-valid-4',
          patientId: 'patient-tx-1',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
          resultData: '{not: valid: json}',
        },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('resultData contains invalid JSON'));
    });

    await test('TX-12. Status update with invalid status value is rejected with 400', async () => {
      const res = await dispatchRoute('PATCH', '/api/records/labresult1/status', {
        headers: { authorization: `Bearer ${supervisorToken}` },
        body: { status: 'ILLEGAL_STATUS_VALUE' },
      });
      assert.strictEqual(res.statusCode, 400);
      assert.ok(res.body.error.includes('Invalid status'));
    });

    // =========================================================================
    // Section 3: Duplicate Record Creation Handling
    // =========================================================================
    console.log('\n--- Section 3: Duplicate Record Handling ---');

    await test('TX-13. Duplicate record creation returns 409 Conflict', async () => {
      // labresult1 already exists in the store
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'labresult1',
          patientId: 'patient-1001',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 409);
      assert.ok(res.body.error.includes('already exists'));
    });

    await test('TX-14. Duplicate record creation attempt preserves original record unmodified', async () => {
      const beforeRes = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(beforeRes.statusCode, 200);
      const originalPatient = beforeRes.body.result.patientId;

      // Attempt duplicate creation with altered patientId
      await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'labresult1',
          patientId: 'patient-tampered',
          testCode: 'CBC',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });

      const afterRes = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(afterRes.statusCode, 200);
      assert.strictEqual(afterRes.body.result.patientId, originalPatient, 'Original record must remain unmodified');
    });

    // =========================================================================
    // Section 4: Missing Records on Read and Update
    // =========================================================================
    console.log('\n--- Section 4: Missing Record Handling ---');

    await test('TX-15. Reading non-existent record returns 404 Not Found', async () => {
      const res = await dispatchRoute('GET', '/api/records/non_existent_rec_9999', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(res.statusCode, 404);
      assert.ok(res.body.error.includes('does not exist'));
    });

    await test('TX-16. Updating status on non-existent record returns 404 Not Found', async () => {
      const res = await dispatchRoute('PATCH', '/api/records/non_existent_rec_9999/status', {
        headers: { authorization: `Bearer ${supervisorToken}` },
        body: { status: 'COMPLETED' },
      });
      assert.strictEqual(res.statusCode, 404);
      assert.ok(res.body.error.includes('does not exist'));
    });

    // =========================================================================
    // Section 5: Fabric Gateway Failure Scenarios & Fallback Guardrails
    // =========================================================================
    console.log('\n--- Section 5: Fabric Gateway Failure Scenarios ---');

    await test('TX-17. Fabric endorsement failure is not swallowed by fallback and returns 422', async () => {
      gateway.setSimulatedFabricFailure('endorsement');
      try {
        const res = await dispatchRoute('POST', '/api/records', {
          headers: { authorization: `Bearer ${techToken}` },
          body: {
            resultId: 'tx-res-endorse-fail',
            patientId: 'patient-tx-fail',
            testCode: 'CBC',
            collectedAt: '2026-11-04T10:00:00Z',
            status: 'REPORTED',
          },
        });
        assert.strictEqual(res.statusCode, 422, 'Endorsement failure must return 422 Unprocessable Entity');
        assert.ok(res.body.error.includes('Fabric endorsement failure'));
      } finally {
        gateway.setSimulatedFabricFailure(null);
      }
    });

    await test('TX-18. Fabric commit failure is not swallowed by fallback and returns 500', async () => {
      gateway.setSimulatedFabricFailure('commit');
      try {
        const res = await dispatchRoute('POST', '/api/records', {
          headers: { authorization: `Bearer ${techToken}` },
          body: {
            resultId: 'tx-res-commit-fail',
            patientId: 'patient-tx-fail',
            testCode: 'CBC',
            collectedAt: '2026-11-04T10:00:00Z',
            status: 'REPORTED',
          },
        });
        assert.strictEqual(res.statusCode, 500, 'Commit failure must return 500 Internal Server Error');
        assert.ok(res.body.error.includes('Fabric commit failure'));
      } finally {
        gateway.setSimulatedFabricFailure(null);
      }
    });

    await test('TX-19. Fabric transaction timeout returns 504 Gateway Timeout', async () => {
      gateway.setSimulatedFabricFailure('timeout');
      try {
        const res = await dispatchRoute('POST', '/api/records', {
          headers: { authorization: `Bearer ${techToken}` },
          body: {
            resultId: 'tx-res-timeout-fail',
            patientId: 'patient-tx-fail',
            testCode: 'CBC',
            collectedAt: '2026-11-04T10:00:00Z',
            status: 'REPORTED',
          },
        });
        assert.strictEqual(res.statusCode, 504, 'Transaction timeout must return 504 Gateway Timeout');
        assert.ok(res.body.error.includes('Fabric transaction timeout'));
      } finally {
        gateway.setSimulatedFabricFailure(null);
      }
    });

    await test('TX-20. Valid record creation succeeds and preserves audit attribution in fallback', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'tx-res-success-audit-1',
          patientId: 'patient-tx-audit',
          testCode: 'BMP',
          collectedAt: '2026-11-04T10:00:00Z',
          status: 'REPORTED',
        },
      });
      assert.strictEqual(res.statusCode, 201);
      const rec = res.body.result;
      assert.strictEqual(rec.resultId, 'tx-res-success-audit-1');
      assert.strictEqual(rec.createdByUserId, techUser.userId);
      assert.strictEqual(rec.createdByUsername, techUser.username);
      assert.strictEqual(rec.createdByRole, 'labtechnician');
      assert.strictEqual(rec.createdByMspId, 'LabMSP');
      assert.strictEqual(rec.ownerOrg, 'LabMSP');
    });

  } finally {
    cleanupTestUsersFile();
    gateway.setSimulatedFabricFailure(null);
  }

  console.log(`\n=========================================================`);
  console.log(`Transaction Test Execution Finished: ${passed} passed, ${failed} failed`);
  console.log(`=========================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTransactionTests();
}

module.exports = { runTransactionTests };
