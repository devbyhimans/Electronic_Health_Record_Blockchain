'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

// Configure test environment variables before requiring gateway modules
const TEST_SECRET = 'test-lab-gateway-secret-must-be-32-characters-long!';
const TEST_USERS_FILE = path.join(__dirname, 'test-cross-org-users-registry.json');

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

async function runCrossOrgTests() {
  console.log('=== Laboratory Cross-Organization Security Test Suite ===\n');

  cleanupTestUsersFile();
  resetRateLimiter();

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
    // Provision LabMSP users
    const techUser = userRegistry.createUser({
      username: 'tech_alice_cross',
      password: 'aliceSecurePassword123!',
      role: 'labtechnician',
    });

    const supervisorUser = userRegistry.createUser({
      username: 'supervisor_sam_cross',
      password: 'samSecurePassword123!',
      role: 'labsupervisor',
    });

    const adminUser = userRegistry.createUser({
      username: 'admin_amy_cross',
      password: 'amySecurePassword123!',
      role: 'labadmin',
    });

    const techToken = jwtService.issueLabToken(techUser);
    const supervisorToken = jwtService.issueLabToken(supervisorUser);
    const adminToken = jwtService.issueLabToken(adminUser);

    // =========================================================================
    // 1. HospitalMSP token accessing LabMSP-protected records
    // =========================================================================
    await test('XO-1. HospitalMSP doctor token attempting to read individual record is rejected with 401', async () => {
      const hospitalDoctorToken = jwt.sign({
        sub: 'doctor_dr_house',
        userId: 'doctor_dr_house',
        username: 'dr_house',
        role: 'doctor',
        mspId: 'HospitalMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${hospitalDoctorToken}` },
      });

      assert.strictEqual(res.statusCode, 401, 'Authentication must fail with 401 for foreign MSP');
      assert.ok(
        res.body.error.includes("Invalid MSP organization in token: expected 'LabMSP'") ||
        res.body.error.includes("Unsupported role in token"),
        `Unexpected error message: ${res.body.error}`
      );
    });

    await test('XO-2. HospitalMSP doctor token attempting to query patient records is rejected with 401', async () => {
      const hospitalDoctorToken = jwt.sign({
        sub: 'doctor_dr_house',
        userId: 'doctor_dr_house',
        username: 'dr_house',
        role: 'doctor',
        mspId: 'HospitalMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/patients/PAT-DEMO-001/records', {
        headers: { authorization: `Bearer ${hospitalDoctorToken}` },
      });

      assert.strictEqual(res.statusCode, 401, 'Patient records endpoint must reject HospitalMSP token with 401');
    });

    // =========================================================================
    // 2. Unsupported organizations accessing records
    // =========================================================================
    await test('XO-3. Unsupported organization (InsuranceMSP) token accessing individual record is rejected with 401', async () => {
      const insuranceToken = jwt.sign({
        sub: 'ins_adjuster_1',
        userId: 'ins_adjuster_1',
        username: 'adjuster_bob',
        role: 'labtechnician',
        mspId: 'InsuranceMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${insuranceToken}` },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error.includes("Invalid MSP organization in token: expected 'LabMSP'"));
    });

    await test('XO-4. Unsupported organization (PharmacyMSP) token attempting to list all records is rejected with 401', async () => {
      const pharmacyToken = jwt.sign({
        sub: 'pharm_tech_1',
        userId: 'pharm_tech_1',
        username: 'pharm_clerk',
        role: 'labsupervisor',
        mspId: 'PharmacyMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:admin-read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/records', {
        headers: { authorization: `Bearer ${pharmacyToken}` },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error.includes("Invalid MSP organization in token: expected 'LabMSP'"));
    });

    // =========================================================================
    // 3. Cross-organization patient query attempts
    // =========================================================================
    await test('XO-5. Cross-organization patient query with PatientMSP token is rejected with 401', async () => {
      const patientToken = jwt.sign({
        sub: 'pat_alice',
        userId: 'pat_alice',
        username: 'alice_patient',
        role: 'patient',
        mspId: 'PatientMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/patients/PAT-DEMO-001/records', {
        headers: { authorization: `Bearer ${patientToken}` },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.ok(
        res.body.error.includes("Invalid MSP organization in token") ||
        res.body.error.includes("Unsupported role in token: 'patient'")
      );
    });

    // =========================================================================
    // 4. Forged MSP identity in query parameters or request body
    // =========================================================================
    await test('XO-6. Forged MSP identity in URL query parameter cannot override token MSP validation', async () => {
      const rogueHospitalToken = jwt.sign({
        sub: 'doc_rogue',
        userId: 'doc_rogue',
        role: 'labtechnician',
        mspId: 'HospitalMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/records/labresult1?mspId=LabMSP&org=LabMSP', {
        headers: { authorization: `Bearer ${rogueHospitalToken}` },
      });

      assert.strictEqual(res.statusCode, 401, 'Query parameters must not bypass token MSP check');
    });

    await test('XO-7. Forged MSP identity in request body on write cannot alter record ownerOrg or createdByMspId', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: {
          resultId: 'labresult-xo-spoof',
          patientId: 'PAT-DEMO-001',
          testCode: 'CBC',
          collectedAt: '2026-11-04T00:00:00Z',
          status: 'REPORTED',
          resultData: { test: 'val' },
          ownerOrg: 'HospitalMSP',
          createdByMspId: 'HospitalMSP',
          mspId: 'HospitalMSP',
          actor: { mspId: 'HospitalMSP', userId: 'spoofed_user' },
        },
      });

      assert.strictEqual(res.statusCode, 201);
      const record = res.body.result;
      assert.strictEqual(record.createdByMspId, 'LabMSP', 'Record createdByMspId must come from verified token, not body');
      assert.strictEqual(record.ownerOrg, 'LabMSP', 'Record ownerOrg must be LabMSP');
      assert.notStrictEqual(record.createdByMspId, 'HospitalMSP');
    });

    // =========================================================================
    // 5. Authentication (401) vs Authorization (403) distinction on direct record retrieval
    // =========================================================================
    await test('XO-8. Direct record retrieval without token fails with 401 Unauthorized (Authentication Failure)', async () => {
      const res = await dispatchRoute('GET', '/api/records/labresult1');
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error.includes('Missing or malformed Authorization header'));
    });

    await test('XO-9. Direct record retrieval with valid LabMSP token but missing lab:read scope fails with 403 Forbidden (Authorization Failure)', async () => {
      const tokenWithoutRead = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        username: techUser.username,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:write'], // Missing 'lab:read'
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${tokenWithoutRead}` },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes("Forbidden: missing required permission scope 'lab:read'"));
    });

    await test('XO-10. Direct administrative records listing with technician role fails with 403 Forbidden (Role Authorization Failure)', async () => {
      const res = await dispatchRoute('GET', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
      });

      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes("Forbidden: role 'labtechnician' is not permitted"));
    });

    // =========================================================================
    // 6. Missing or invalid organization claims in tokens
    // =========================================================================
    await test('XO-11. Token missing mspId claim returns 401 Unauthorized', async () => {
      const tokenMissingMsp = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        username: techUser.username,
        role: 'labtechnician',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${tokenMissingMsp}` },
      });

      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error.includes("Invalid MSP organization in token: expected 'LabMSP'"));
    });

    await test('XO-12. Token with foreign issuer returns 401 Unauthorized', async () => {
      const tokenForeignIssuer = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        username: techUser.username,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'hospital-ehr-service',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${tokenForeignIssuer}` },
      });

      assert.strictEqual(res.statusCode, 401);
    });

    // =========================================================================
    // 7. Patient query authorization & IDOR remediation
    // =========================================================================
    await test('XO-13. Technician patient-history request is rejected with 403 Forbidden (Role Authorization)', async () => {
      const res = await dispatchRoute('GET', '/api/patients/PAT-DEMO-001/records', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes("Forbidden: role 'labtechnician' is not permitted"));
    });

    await test('XO-14. Supervisor with lab:patient-read queries patient history successfully (200 OK)', async () => {
      const res = await dispatchRoute('GET', '/api/patients/PAT-DEMO-001/records', {
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.result));
      assert.ok(res.body.result.length > 0);
      for (const rec of res.body.result) {
        assert.strictEqual(rec.patientId, 'PAT-DEMO-001');
        assert.strictEqual(rec.ownerOrg, 'LabMSP');
      }
    });

    await test('XO-15. Admin with lab:patient-read queries patient history successfully (200 OK)', async () => {
      const res = await dispatchRoute('GET', '/api/patients/patient-1002/records', {
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.result));
      assert.ok(res.body.result.length > 0);
      for (const rec of res.body.result) {
        assert.strictEqual(rec.patientId, 'patient-1002');
        assert.strictEqual(rec.ownerOrg, 'LabMSP');
      }
    });

    await test('XO-16. Technician forging lab:patient-read scope is rejected with 401 Unauthorized (Scope Invalidation)', async () => {
      const forgedTechToken = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        username: techUser.username,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:patient-read'], // Forged scope for technician
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/patients/PAT-DEMO-001/records', {
        headers: { authorization: `Bearer ${forgedTechToken}` },
      });
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error.includes('Token scopes are missing or invalid for user role'));
    });

    await test('XO-17. Supervisor token missing lab:patient-read scope is rejected with 403 Forbidden', async () => {
      const supervisorWithoutPatientRead = jwt.sign({
        sub: supervisorUser.userId,
        userId: supervisorUser.userId,
        username: supervisorUser.username,
        role: 'labsupervisor',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:admin-read'], // Missing lab:patient-read
      }, TEST_SECRET, {
        algorithm: 'HS256',
        issuer: 'lab-gateway',
        audience: 'lab-gateway',
      });

      const res = await dispatchRoute('GET', '/api/patients/PAT-DEMO-001/records', {
        headers: { authorization: `Bearer ${supervisorWithoutPatientRead}` },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes("Forbidden: missing required permission scope 'lab:patient-read'"));
    });

    await test('XO-18. Foreign-owned records (ownerOrg !== LabMSP) are excluded from patient-history response', async () => {
      // Temporarily inject a record with ownerOrg: HospitalMSP for PAT-DEMO-001
      const foreignRecord = {
        docType: 'labResult',
        resultId: 'labresult_foreign_test',
        patientId: 'PAT-DEMO-001',
        testCode: 'XRAY',
        status: 'FINAL',
        ownerOrg: 'HospitalMSP',
        createdByUserId: 'dr_foreign',
        createdByUsername: 'dr_foreign',
        createdByRole: 'doctor',
        createdByMspId: 'HospitalMSP',
      };
      gateway._localRecords.push(foreignRecord);

      try {
        const res = await dispatchRoute('GET', '/api/patients/PAT-DEMO-001/records', {
          headers: { authorization: `Bearer ${supervisorToken}` },
        });
        assert.strictEqual(res.statusCode, 200);
        assert.ok(Array.isArray(res.body.result));
        const foundForeign = res.body.result.find(r => r.resultId === 'labresult_foreign_test');
        assert.strictEqual(foundForeign, undefined, 'Foreign-owned record must NOT be returned in response');
        for (const rec of res.body.result) {
          assert.strictEqual(rec.ownerOrg, 'LabMSP', 'All returned records must belong to LabMSP');
        }
      } finally {
        const idx = gateway._localRecords.indexOf(foreignRecord);
        if (idx !== -1) gateway._localRecords.splice(idx, 1);
      }
    });

    await test('XO-19. Technician individual record retrieval remains permitted (operational access preserved)', async () => {
      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.result.resultId, 'labresult1');
    });

    await test('XO-20. Supervisor administrative record listing remains permitted (200 OK)', async () => {
      const res = await dispatchRoute('GET', '/api/records', {
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.result));
    });

  } finally {
    cleanupTestUsersFile();
  }

  console.log(`\n=========================================================`);
  console.log(`Cross-Org Test Execution Finished: ${passed} passed, ${failed} failed`);
  console.log(`=========================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runCrossOrgTests();
}

module.exports = { runCrossOrgTests };
