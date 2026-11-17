'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

// Configure test environment variables before requiring gateway modules
const TEST_SECRET = 'test-lab-gateway-secret-must-be-32-characters-long!';
const TEST_USERS_FILE = path.join(__dirname, 'test-audit-users-registry.json');

process.env.NODE_ENV = 'test';
process.env.LAB_JWT_SECRET = TEST_SECRET;
process.env.LAB_USERS_FILE = TEST_USERS_FILE;

const userRegistry = require('../auth/userRegistry');
const jwtService = require('../auth/jwtService');
const { resetRateLimiter } = require('../auth/loginHandler');
const { authenticateLabToken } = require('../auth/authenticate');
const { createLabResult, updateLabStatus } = require('../gateway');
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

// In-memory Express dispatch harness for end-to-end route testing
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

function invokeMiddleware(middleware, { headers = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve) => {
    let statusCode = 200;
    let jsonBody = null;
    let nextCalled = false;

    const req = {
      headers,
      body,
      query,
    };

    const res = {
      status(code) {
        statusCode = code;
        return res;
      },
      json(data) {
        jsonBody = data;
        resolve({ statusCode, body: jsonBody, nextCalled, req });
        return res;
      },
      send(data) {
        jsonBody = data;
        resolve({ statusCode, body: jsonBody, nextCalled, req });
        return res;
      },
    };

    const next = () => {
      nextCalled = true;
      resolve({ statusCode: 200, body: null, nextCalled: true, req });
    };

    Promise.resolve(middleware(req, res, next)).catch((err) => {
      resolve({ statusCode: 500, body: { error: err.message }, nextCalled: false, req });
    });
  });
}

function blockedDefectError(msg) {
  const err = new Error(msg);
  err.isBlockedByDefect = true;
  return err;
}

async function runAuditTests() {
  console.log('=== Laboratory Audit Attribution Security Test Suite ===\n');

  cleanupTestUsersFile();
  resetRateLimiter();

  let passed = 0;
  let failed = 0;
  let blocked = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      if (err.isBlockedByDefect) {
        console.log(`  [BLOCKED BY PRODUCTION DEFECT] ${name}`);
        console.log(`         Defect: ${err.message}`);
        blocked++;
      } else {
        console.error(`  [FAIL] ${name}`);
        console.error(`         ${err.message}`);
        failed++;
      }
    }
  }

  try {
    // Provision test identities
    const techUser = userRegistry.createUser({
      username: 'tech_alice_audit',
      password: 'aliceSecurePassword123!',
      role: 'labtechnician',
    });

    const supervisorUser = userRegistry.createUser({
      username: 'supervisor_sam_audit',
      password: 'samSecurePassword123!',
      role: 'labsupervisor',
    });

    const adminUser = userRegistry.createUser({
      username: 'admin_alex_audit',
      password: 'alexSecurePassword123!',
      role: 'labadmin',
    });

    const techToken = jwtService.issueLabToken(techUser);
    const supervisorToken = jwtService.issueLabToken(supervisorUser);
    const adminToken = jwtService.issueLabToken(adminUser);

    // =========================================================================
    // A1. Creator Persistence
    // =========================================================================
    await test('A1. Create LabResult through authenticated HTTP route and assert explicit createdBy properties', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'labresult-audit-a1',
          patientId: 'PAT-AUDIT-001',
          testCode: 'CBC',
          collectedAt: '2026-11-04T00:00:00Z',
          status: 'REPORTED',
          resultData: { hemoglobin: '14.1', wbc: '6000' },
        },
      });

      if (res.statusCode === 500 && /actor information is missing or incomplete/i.test(res.body?.error || '')) {
        throw blockedDefectError(
          'authenticateLabToken (authenticate.js:105-116) does not set username on req.auth, causing gateway.js:280 to throw 500 "Authenticated actor information is missing or incomplete". Additionally, gateway.js fallback (lines 208-217) and chaincode (_buildRecord) drop actor fields and do not persist createdByUserId, createdByUsername, createdByRole, createdByMspId.'
        );
      }

      assert.strictEqual(res.statusCode, 201, `Expected HTTP 201 Created but got ${res.statusCode}`);
      const record = res.body.result;
      assert.ok(record, 'Response must include result record');

      const missingFields = [];
      if (record.createdByUserId === undefined) missingFields.push('createdByUserId');
      if (record.createdByUsername === undefined) missingFields.push('createdByUsername');
      if (record.createdByRole === undefined) missingFields.push('createdByRole');
      if (record.createdByMspId === undefined) missingFields.push('createdByMspId');

      if (missingFields.length > 0) {
        throw blockedDefectError(
          `Production fallback (gateway.js:208) and chaincode (_buildRecord) do not persist explicit createdBy fields. Missing: ${missingFields.join(', ')}`
        );
      }

      assert.strictEqual(record.createdByUserId, techUser.userId);
      assert.strictEqual(record.createdByUsername, techUser.username);
      assert.strictEqual(record.createdByRole, techUser.role);
      assert.strictEqual(record.createdByMspId, techUser.mspId);
    });

    // =========================================================================
    // A2. Identity Spoofing
    // =========================================================================
    await test('A2. Request-body creator identity spoofing is rejected and authenticated identity is used', async () => {
      const forgedAdminId = 'forged-admin-uuid-999';
      const forgedAdminUsername = 'forged_superuser';
      const forgedRole = 'labadmin';
      const forgedMspId = 'HospitalMSP';

      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'labresult-audit-a2',
          patientId: 'PAT-AUDIT-002',
          testCode: 'LFT',
          collectedAt: '2026-11-04T00:00:00Z',
          status: 'REPORTED',
          resultData: { alt: '35', ast: '32' },
          createdByUserId: forgedAdminId,
          createdByUsername: forgedAdminUsername,
          createdByRole: forgedRole,
          createdByMspId: forgedMspId,
          actor: {
            userId: forgedAdminId,
            username: forgedAdminUsername,
            role: forgedRole,
            mspId: forgedMspId,
          },
        },
      });

      // Verify that none of the forged fields were accepted
      assert.notStrictEqual(res.body?.result?.createdByUserId, forgedAdminId, 'Forged createdByUserId must not be persisted');
      assert.notStrictEqual(res.body?.result?.createdByUsername, forgedAdminUsername, 'Forged createdByUsername must not be persisted');
      assert.notStrictEqual(res.body?.result?.createdByRole, forgedRole, 'Forged createdByRole must not be persisted');
      assert.notStrictEqual(res.body?.result?.createdByMspId, forgedMspId, 'Forged createdByMspId must not be persisted');
      assert.strictEqual(res.body?.result?.actor, undefined, 'Raw actor object must not be leaked or persisted');

      if (res.statusCode === 500 && /actor information is missing or incomplete/i.test(res.body?.error || '')) {
        throw blockedDefectError(
          'Forged body fields were safely discarded by server.js (line 346), but authenticated creator identity cannot be verified because authenticate.js omits username on req.auth (causing 500) and gateway.js fallback lacks createdBy fields.'
        );
      }

      assert.strictEqual(res.statusCode, 201, `Expected HTTP 201 Created but got ${res.statusCode}`);
      const record = res.body.result;
      assert.ok(record, 'Response must include result record');

      if (record.createdByUserId === undefined) {
        throw blockedDefectError(
          'Forged body fields were discarded, but authenticated creator identity (createdByUserId) cannot be verified because production fallback does not persist createdBy fields.'
        );
      }

      assert.strictEqual(record.createdByUserId, techUser.userId);
      assert.strictEqual(record.createdByUsername, techUser.username);
      assert.strictEqual(record.createdByRole, techUser.role);
      assert.strictEqual(record.createdByMspId, techUser.mspId);
    });

    // =========================================================================
    // A3. Updater Persistence
    // =========================================================================
    await test('A3. Update record status using authorized updater and verify explicit updatedBy properties', async () => {
      // Step 1: Update status as supervisor
      const updateRes = await dispatchRoute('PATCH', '/api/records/labresult1/status', {
        headers: { authorization: `Bearer ${supervisorToken}` },
        body: { status: 'COMPLETED' },
      });

      if (updateRes.statusCode === 500) {
        throw blockedDefectError(
          `PATCH /api/records/:resultId/status failed with 500. Production defect: gateway.js:303 accesses undefined variable 'input' (ReferenceError: input is not defined) and server.js:543 does not pass req.auth to updateLabStatus.`
        );
      }

      assert.strictEqual(updateRes.statusCode, 200, `Expected HTTP 200 OK but got ${updateRes.statusCode}`);
      const updatedRecord = updateRes.body.result;
      assert.ok(updatedRecord, 'Response must include updated record');

      const missingUpdatedFields = [];
      if (updatedRecord.updatedByUserId === undefined) missingUpdatedFields.push('updatedByUserId');
      if (updatedRecord.updatedByUsername === undefined) missingUpdatedFields.push('updatedByUsername');
      if (updatedRecord.updatedByRole === undefined) missingUpdatedFields.push('updatedByRole');
      if (updatedRecord.updatedByMspId === undefined) missingUpdatedFields.push('updatedByMspId');

      if (missingUpdatedFields.length > 0) {
        throw blockedDefectError(
          `Production fallback (gateway.js:226) and chaincode do not persist explicit updatedBy fields. Missing: ${missingUpdatedFields.join(', ')}`
        );
      }

      assert.strictEqual(updatedRecord.updatedByUserId, supervisorUser.userId);
      assert.strictEqual(updatedRecord.updatedByUsername, supervisorUser.username);
      assert.strictEqual(updatedRecord.updatedByRole, supervisorUser.role);
      assert.strictEqual(updatedRecord.updatedByMspId, supervisorUser.mspId);
    });

    // =========================================================================
    // A4. Creator Preservation
    // =========================================================================
    await test('A4. Updating status preserves original createdBy fields exactly unchanged', async () => {
      // Read before update
      const readBeforeRes = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(readBeforeRes.statusCode, 200);
      const beforeRecord = readBeforeRes.body.result;

      if (!beforeRecord || beforeRecord.createdByUserId === undefined) {
        throw blockedDefectError(
          'Cannot verify creator preservation because createdBy fields are undefined prior to update (fallback does not persist them). Status update endpoint also fails with ReferenceError: input is not defined.'
        );
      }

      const originalCreator = {
        createdByUserId: beforeRecord.createdByUserId,
        createdByUsername: beforeRecord.createdByUsername,
        createdByRole: beforeRecord.createdByRole,
        createdByMspId: beforeRecord.createdByMspId,
      };

      // Update status as admin
      const updateRes = await dispatchRoute('PATCH', '/api/records/labresult1/status', {
        headers: { authorization: `Bearer ${adminToken}` },
        body: { status: 'COMPLETED' },
      });
      assert.strictEqual(updateRes.statusCode, 200);

      // Read after update
      const readAfterRes = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(readAfterRes.statusCode, 200);
      const afterRecord = readAfterRes.body.result;

      assert.strictEqual(afterRecord.createdByUserId, originalCreator.createdByUserId);
      assert.strictEqual(afterRecord.createdByUsername, originalCreator.createdByUsername);
      assert.strictEqual(afterRecord.createdByRole, originalCreator.createdByRole);
      assert.strictEqual(afterRecord.createdByMspId, originalCreator.createdByMspId);
    });

    // =========================================================================
    // A5. Authentication & Actor Derivation
    // =========================================================================
    await test('A5. Missing/invalid JWT is rejected and authenticated actor is derived strictly from req.auth', async () => {
      // 1. Missing Authorization header is rejected with 401
      const noAuthRes = await dispatchRoute('POST', '/api/records', {
        body: {
          resultId: 'labresult-audit-a5-noauth',
          patientId: 'PAT-AUDIT-005',
          testCode: 'CBC',
          collectedAt: '2026-11-04T00:00:00Z',
          status: 'REPORTED',
          resultData: { test: 'val' },
        },
      });
      assert.strictEqual(noAuthRes.statusCode, 401, 'Request without Authorization header must return 401');

      // 2. Invalid JWT signature is rejected with 401
      const badTokenRes = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: 'Bearer invalid.jwt.token' },
        body: {
          resultId: 'labresult-audit-a5-badtoken',
          patientId: 'PAT-AUDIT-005',
          testCode: 'CBC',
          collectedAt: '2026-11-04T00:00:00Z',
          status: 'REPORTED',
          resultData: { test: 'val' },
        },
      });
      assert.strictEqual(badTokenRes.statusCode, 401, 'Request with invalid JWT must return 401');

      // 3. Expired JWT is rejected with 401
      const expiredToken = jwtService.issueLabToken(techUser, { expiresIn: '-10s' });
      const expiredRes = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${expiredToken}` },
        body: {
          resultId: 'labresult-audit-a5-expired',
          patientId: 'PAT-AUDIT-005',
          testCode: 'CBC',
          collectedAt: '2026-11-04T00:00:00Z',
          status: 'REPORTED',
          resultData: { test: 'val' },
        },
      });
      assert.strictEqual(expiredRes.statusCode, 401, 'Request with expired JWT must return 401');

      // 4. Verify authenticateLabToken middleware derives trusted req.auth ignoring client body
      const middlewareRes = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          userId: 'forged_body_user',
          role: 'labadmin',
          mspId: 'ForgedMSP',
          actor: { userId: 'rogue_actor' },
        },
        query: { userId: 'query_spoof' },
      });
      assert.strictEqual(middlewareRes.nextCalled, true, 'Valid token must be accepted by authentication middleware');
      assert.strictEqual(middlewareRes.req.auth.userId, techUser.userId, 'req.auth.userId must come from verified token');
      assert.strictEqual(middlewareRes.req.auth.role, techUser.role, 'req.auth.role must come from verified token');
      assert.strictEqual(middlewareRes.req.auth.mspId, 'LabMSP', 'req.auth.mspId must come from verified token');
      assert.notStrictEqual(middlewareRes.req.auth.userId, 'forged_body_user');
      assert.notStrictEqual(middlewareRes.req.auth.userId, 'rogue_actor');
      assert.notStrictEqual(middlewareRes.req.auth.userId, 'query_spoof');
    });

    // =========================================================================
    // A6. In-Memory Fallback Creator Persistence
    // =========================================================================
    await test('A6. Force in-memory fallback on createLabResult and verify explicit createdBy fields', async () => {
      // In test environment, Fabric gateway network is unavailable, which triggers
      // the real evaluateTransaction / submitTransaction catch fallback in gateway.js.
      const fallbackResponse = await createLabResult({
        resultId: 'labresult-audit-a6-fallback',
        patientId: 'PAT-FB-006',
        testCode: 'URINE',
        collectedAt: '2026-11-04T00:00:00Z',
        status: 'REPORTED',
        resultData: { specificGravity: '1.020' },
        actor: {
          userId: techUser.userId,
          username: techUser.username,
          role: techUser.role,
          mspId: techUser.mspId,
        },
      });

      assert.ok(fallbackResponse, 'Fallback response must be returned');
      const fallbackRecord = fallbackResponse.result;
      assert.ok(fallbackRecord, 'Fallback result record must exist');
      assert.strictEqual(fallbackRecord.resultId, 'labresult-audit-a6-fallback');

      // Inspect whether fallback persists explicit createdBy fields
      const missingFallbackCreated = [];
      if (fallbackRecord.createdByUserId === undefined) missingFallbackCreated.push('createdByUserId');
      if (fallbackRecord.createdByUsername === undefined) missingFallbackCreated.push('createdByUsername');
      if (fallbackRecord.createdByRole === undefined) missingFallbackCreated.push('createdByRole');
      if (fallbackRecord.createdByMspId === undefined) missingFallbackCreated.push('createdByMspId');

      if (missingFallbackCreated.length > 0) {
        throw blockedDefectError(
          `Production defect in gateway.js fallback CreateLabResult (lines 205-225): submitTransaction receives args[6..9] (userId, username, role, mspId) but line 206 destructures only the first 6 args. newRecord lacks ${missingFallbackCreated.join(', ')}.`
        );
      }

      assert.strictEqual(fallbackRecord.createdByUserId, techUser.userId);
      assert.strictEqual(fallbackRecord.createdByUsername, techUser.username);
      assert.strictEqual(fallbackRecord.createdByRole, techUser.role);
      assert.strictEqual(fallbackRecord.createdByMspId, techUser.mspId);
    });

    // =========================================================================
    // A7. In-Memory Fallback Updater Persistence
    // =========================================================================
    await test('A7. Update record through in-memory fallback and verify updater fields persisted and creator unchanged', async () => {
      let updateResult;
      try {
        updateResult = await updateLabStatus('labresult-audit-a6-fallback', 'COMPLETED', {
          actor: {
            userId: supervisorUser.userId,
            username: supervisorUser.username,
            role: supervisorUser.role,
            mspId: supervisorUser.mspId,
          },
        });
      } catch (err) {
        if (/input is not defined/.test(err.message)) {
          throw blockedDefectError(
            `Production defect in gateway.js:303: updateLabStatus attempts to access undefined variable 'input' (const actor = input.actor || {}) throwing ReferenceError. The function signature is updateLabStatus(resultId, status, options = {}).`
          );
        }
        throw err;
      }

      assert.ok(updateResult && updateResult.result, 'Update result must exist');
      const updatedRecord = updateResult.result;

      const missingFallbackUpdated = [];
      if (updatedRecord.updatedByUserId === undefined) missingFallbackUpdated.push('updatedByUserId');
      if (updatedRecord.updatedByUsername === undefined) missingFallbackUpdated.push('updatedByUsername');
      if (updatedRecord.updatedByRole === undefined) missingFallbackUpdated.push('updatedByRole');
      if (updatedRecord.updatedByMspId === undefined) missingFallbackUpdated.push('updatedByMspId');

      if (missingFallbackUpdated.length > 0) {
        throw blockedDefectError(
          `Production defect in gateway.js fallback UpdateLabStatus (lines 226-234): only status and updatedAt are modified. new fields ${missingFallbackUpdated.join(', ')} are not persisted.`
        );
      }

      assert.strictEqual(updatedRecord.updatedByUserId, supervisorUser.userId);
      assert.strictEqual(updatedRecord.updatedByUsername, supervisorUser.username);
      assert.strictEqual(updatedRecord.updatedByRole, supervisorUser.role);
      assert.strictEqual(updatedRecord.updatedByMspId, supervisorUser.mspId);
    });

  } finally {
    cleanupTestUsersFile();
  }

  console.log(`\n=========================================================`);
  console.log(`Audit Attribution Test Execution Finished: ${passed} passed, ${blocked} blocked by production defect, ${failed} failed`);
  console.log(`=========================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAuditTests();
}

module.exports = { runAuditTests };
