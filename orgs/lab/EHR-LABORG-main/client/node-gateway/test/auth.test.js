'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const jwt = require('jsonwebtoken');

// Configure test environment variables before requiring gateway modules
const TEST_SECRET = 'test-lab-gateway-secret-must-be-32-characters-long!';
const TEST_USERS_FILE = path.join(__dirname, 'test-users-registry.json');

process.env.NODE_ENV = 'test';
process.env.LAB_JWT_SECRET = TEST_SECRET;
process.env.LAB_USERS_FILE = TEST_USERS_FILE;

const userRegistry = require('../auth/userRegistry');
const jwtService = require('../auth/jwtService');
const { loginHandler, resetRateLimiter } = require('../auth/loginHandler');
const { authenticateLabToken } = require('../auth/authenticate');
const { requireRole, requireScope, blockEndpoint } = require('../auth/authorize');
const { isValidCid, readJsonFromIpfs } = require('../ipfs');
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

// In-memory middleware invocation harness
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

async function runTests() {
  console.log('=== Laboratory Authorization & Route Protection Test Suite ===\n');

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
    // =========================================================================
    // SECTION 1: USER REGISTRY & FOUNDATION TESTS
    // =========================================================================
    console.log('--- Section 1: User Registry & Password Policy ---');

    await test('F1. Provision lab user with min 12-char password and verify bcrypt hash storage', async () => {
      const user = userRegistry.createUser({
        username: 'tech_alice',
        password: 'aliceSecurePassword123!',
        role: 'labtechnician',
      });

      assert.strictEqual(user.username, 'tech_alice');
      assert.strictEqual(user.role, 'labtechnician');
      assert.strictEqual(user.mspId, 'LabMSP');

      const raw = JSON.parse(fs.readFileSync(TEST_USERS_FILE, 'utf8'));
      const stored = raw['tech_alice'];
      assert.ok(stored.passwordHash.startsWith('$2'));
      assert.notStrictEqual(stored.passwordHash, 'aliceSecurePassword123!');
    });

    await test('F2. Password shorter than 12 characters is strictly rejected', async () => {
      assert.throws(() => {
        userRegistry.createUser({
          username: 'tech_short',
          password: 'shortPass1!',
          role: 'labtechnician',
        });
      }, /Password must be at least 12 characters/);
    });

    await test('F3. Provision labsupervisor and labadmin users', async () => {
      const supervisor = userRegistry.createUser({
        username: 'supervisor_sam',
        password: 'samSecurePassword123!',
        role: 'labsupervisor',
      });
      assert.strictEqual(supervisor.role, 'labsupervisor');

      const admin = userRegistry.createUser({
        username: 'admin_alex',
        password: 'alexSecurePassword123!',
        role: 'labadmin',
      });
      assert.strictEqual(admin.role, 'labadmin');
    });

    const techUser = userRegistry.getUser('tech_alice');
    const supervisorUser = userRegistry.getUser('supervisor_sam');
    const adminUser = userRegistry.getUser('admin_alex');

    const techToken = jwtService.issueLabToken(techUser);
    const supervisorToken = jwtService.issueLabToken(supervisorUser);
    const adminToken = jwtService.issueLabToken(adminUser);

    // =========================================================================
    // SECTION 2: CORE MIDDLEWARE UNIT TESTS (22 CASES)
    // =========================================================================
    console.log('\n--- Section 2: Core Middleware Unit Tests (22 Cases) ---');

    await test('M1. Valid laboratory technician token is accepted with req.auth constructed', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.req.auth.userId, techUser.userId);
      assert.strictEqual(res.req.auth.role, 'labtechnician');
      assert.strictEqual(res.req.auth.mspId, 'LabMSP');
    });

    await test('M2. Valid laboratory supervisor token is accepted with supervisor scopes', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.req.auth.role, 'labsupervisor');
      assert.ok(res.req.auth.scopes.includes('lab:admin-read'));
    });

    await test('M3. Valid laboratory admin token is accepted with admin scopes', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.req.auth.role, 'labadmin');
      assert.ok(res.req.auth.scopes.includes('lab:admin'));
    });

    await test('M4. Missing Authorization header returns 401 Unauthorized', async () => {
      const res = await invokeMiddleware(authenticateLabToken, { headers: {} });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M5. Malformed Bearer header returns 401 Unauthorized', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: 'Basic somebase64' },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M6. Empty token returns 401 Unauthorized', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: 'Bearer   ' },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M7. Tampered token signature returns 401 Unauthorized', async () => {
      const tampered = techToken.slice(0, -6) + 'xxxxxx';
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${tampered}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M8. Expired token returns 401 Unauthorized with Token expired error', async () => {
      const expiredToken = jwtService.issueLabToken(techUser, { expiresIn: '-10s' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.error, 'Token expired');
    });

    await test('M9. Token signed with wrong secret returns 401 Unauthorized', async () => {
      const rogueToken = jwtService.issueLabToken(techUser, {
        secret: 'rogue-unauthorized-secret-32-chars-long!',
      });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${rogueToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M10. Token with algorithm "none" is rejected with 401', async () => {
      const unsignedToken = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, '', { algorithm: 'none', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${unsignedToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M11. Wrong issuer returns 401 Unauthorized', async () => {
      const foreignIssuerToken = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:write'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'hospital-api', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${foreignIssuerToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M12. Wrong audience returns 401 Unauthorized', async () => {
      const foreignAudienceToken = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:write'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'hospital-portal' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${foreignAudienceToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M13. Token with non-LabMSP ID returns 401 Unauthorized', async () => {
      const wrongMspToken = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        role: 'labtechnician',
        mspId: 'DiagnosticsMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:write'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${wrongMspToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M14. Token with missing subject claim returns 401 Unauthorized', async () => {
      const tokenWithoutSub = jwt.sign({
        userId: techUser.userId,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:write'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${tokenWithoutSub}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M15. Token with missing userId claim returns 401 Unauthorized', async () => {
      const tokenWithoutUserId = jwt.sign({
        sub: 'usr-sub-1',
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:write'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${tokenWithoutUserId}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M16. Token asserting unsupported clinical role (e.g. doctor) returns 401', async () => {
      const doctorToken = jwt.sign({
        sub: 'doc-101',
        userId: 'doc-101',
        role: 'doctor',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${doctorToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M17. Token asserting non-human principal type returns 401', async () => {
      const serviceToken = jwt.sign({
        sub: 'svc-1',
        userId: 'svc-1',
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'service',
        scopes: ['lab:read', 'lab:write'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${serviceToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M18. Token with missing or empty scopes returns 401', async () => {
      const emptyScopesToken = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: [],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${emptyScopesToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M19. Token with unauthorized escalated scopes returns 401', async () => {
      const escalatedToken = jwt.sign({
        sub: techUser.userId,
        userId: techUser.userId,
        role: 'labtechnician',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:write', 'lab:admin', 'root:superuser'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${escalatedToken}` },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    await test('M20. Client-supplied body/query identity attributes cannot override req.auth', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${techToken}` },
        body: { userId: 'attacker_fake_id', role: 'labadmin', mspId: 'HospitalMSP' },
        query: { userId: 'query_spoofed_id' },
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.req.auth.userId, techUser.userId);
      assert.strictEqual(res.req.auth.role, 'labtechnician');
    });

    await test('M21. Valid request receives full normalized req.auth principal object', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.req.auth.iss, 'lab-gateway');
      assert.strictEqual(res.req.auth.aud, 'lab-gateway');
      assert.strictEqual(res.req.auth.type, 'human');
    });

    await test('M22. Invalid request never calls next()', async () => {
      const res = await invokeMiddleware(authenticateLabToken, {
        headers: { authorization: 'Bearer completely.invalid.jwt' },
      });
      assert.strictEqual(res.nextCalled, false);
      assert.strictEqual(res.statusCode, 401);
    });

    // =========================================================================
    // SECTION 3: END-TO-END ROUTE PROTECTION TESTS (23 CASES)
    // =========================================================================
    console.log('\n--- Section 3: End-to-End Route Protection Tests (23 Cases) ---');

    // Case 1: Unauthenticated request to a protected route returns 401
    await test('R1. Unauthenticated request to protected route returns 401 Unauthorized', async () => {
      const res = await dispatchRoute('GET', '/api/records');
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error.includes('Missing or malformed Authorization header'));
    });

    // Case 2: Valid labtechnician can access an explicitly permitted route
    await test('R2. Valid labtechnician can access permitted record-read route', async () => {
      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.result);
      assert.strictEqual(res.body.result.resultId, 'labresult1');
    });

    // Case 3: Labtechnician cannot access supervisor-only listing
    await test('R3. Labtechnician cannot access supervisor-only all-records listing (returns 403)', async () => {
      const res = await dispatchRoute('GET', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes("Forbidden: role 'labtechnician' is not permitted"));
    });

    // Case 4: Supervisor can access permitted administrative reads
    await test('R4. Supervisor can access permitted administrative all-records listing (returns 200)', async () => {
      const res = await dispatchRoute('GET', '/api/records', {
        headers: { authorization: `Bearer ${supervisorToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.result));
    });

    // Case 5: Unsupported roles are denied
    await test('R5. Unsupported roles (e.g. doctor/patient) on lab tokens are denied with 401', async () => {
      const rogueDoctorToken = jwt.sign({
        sub: 'doc-1',
        userId: 'doc-1',
        role: 'doctor',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });

      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${rogueDoctorToken}` },
      });
      assert.strictEqual(res.statusCode, 401);
      assert.ok(res.body.error.includes("Unsupported role in token: 'doctor'"));
    });

    // Case 6: Missing scope returns 403
    await test('R6. User missing required scope returns 403 Forbidden', async () => {
      const res = await dispatchRoute('POST', '/api/records', {
        headers: { authorization: `Bearer ${supervisorToken}` },
        body: { resultId: 'test_res_1', patientId: 'p1', testCode: 'CBC', collectedAt: '2026-11-04', status: 'REPORTED' },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    // Case 7: Invalid scope returns 403
    await test('R7. Invalid or unauthorized scope rejected with 403', async () => {
      const middleware = requireScope('unauthorized:custom:scope');
      const reqWithAuth = { auth: { scopes: ['lab:read'] } };
      let code = 200;
      let errBody = null;
      const fakeRes = { status(c) { code = c; return this; }, json(d) { errBody = d; } };
      middleware(reqWithAuth, fakeRes, () => {});
      assert.strictEqual(code, 403);
      assert.ok(errBody.error.includes("Forbidden: missing required permission scope 'unauthorized:custom:scope'"));
    });

    // Case 8: Patient cannot access another patient's record
    await test('R8. Patient without valid LabMSP token cannot access records (returns 401)', async () => {
      const res = await dispatchRoute('GET', '/api/patients/patient-1002/records', {
        headers: { authorization: 'Bearer invalid.patient.token' },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    // Case 9: Request-body identity spoofing is rejected
    await test('R9. Request-body identity spoofing cannot override verified req.auth', async () => {
      const res = await dispatchRoute('GET', '/api/records', {
        headers: { authorization: `Bearer ${techToken}` },
        body: { role: 'labadmin', userId: 'admin_spoofed' },
      });
      assert.strictEqual(res.statusCode, 403);
    });

    // Case 10: URL patientId spoofing is rejected
    await test('R10. Unauthenticated or foreign callers cannot query patient records', async () => {
      const res = await dispatchRoute('GET', '/api/patients/victim-patient-999/records');
      assert.strictEqual(res.statusCode, 401);
    });

    // Case 11: Public health route remains accessible
    await test('R11. Public health route remains accessible without authentication (returns 200)', async () => {
      const res = await dispatchRoute('GET', '/api/health');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.ok, true);
    });

    // Case 12: Public metadata route remains accessible
    await test('R12. Public metadata route remains accessible without authentication (returns 200)', async () => {
      const res = await dispatchRoute('GET', '/api/meta');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.peers);
      assert.strictEqual(res.body.channel, 'ehrchannel');
    });

    // Case 13: Login route remains accessible without a JWT
    await test('R13. Login endpoint remains accessible without prior token', async () => {
      const res = await dispatchRoute('POST', '/api/auth/login', {
        body: {
          username: 'tech_alice',
          password: 'aliceSecurePassword123!',
        },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.token);
    });

    // Case 14: Internal IPFS write route cannot be accessed with a human token
    await test('R14. Internal IPFS write route returns 403 Forbidden even with human token', async () => {
      const res = await dispatchRoute('POST', '/api/ipfs/add-json', {
        headers: { authorization: `Bearer ${adminToken}` },
        body: { data: { secret: 'payload' } },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes('Forbidden: internal service endpoint'));
    });

    // Case 15: Unauthenticated agent execution is rejected
    await test('R15. Unauthenticated agent execution is rejected with 401', async () => {
      const res = await dispatchRoute('POST', '/api/agents/run', {
        body: { testCode: 'CBC' },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    // Case 16: Unauthenticated agent approval is rejected
    await test('R16. Unauthenticated agent approval is rejected with 401', async () => {
      const res = await dispatchRoute('POST', '/api/agents/run/run-101/approve', {
        body: { decision: 'APPROVED' },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    // Case 17: Unsupported HospitalMSP tokens are rejected
    await test('R17. Unsupported HospitalMSP token rejected with 401', async () => {
      const hospitalToken = jwt.sign({
        sub: 'doc-404',
        userId: 'doc-404',
        role: 'doctor',
        mspId: 'HospitalMSP',
        type: 'human',
        scopes: ['lab:read'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'hospital-api', audience: 'lab-gateway' });

      const res = await dispatchRoute('GET', '/api/records/labresult1', {
        headers: { authorization: `Bearer ${hospitalToken}` },
      });
      assert.strictEqual(res.statusCode, 401);
    });

    // Case 18: Existing successful handler responses remain compatible
    await test('R18. Existing successful handler responses remain structurally compatible', async () => {
      const res = await dispatchRoute('GET', '/api/records/labresult1/resolve-data', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.result);
      assert.strictEqual(typeof res.body.resolved, 'boolean');
    });

    // Case 19: SPA fallback continues to work
    await test('R19. SPA static fallback continues to serve index.html for non-API routes', async () => {
      const res = await dispatchRoute('GET', '/dashboard');
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.body.includes('index.html'));
    });

    // Case 20: Status update route permits authorized lab supervisor
    await test('R20. Status update route permits authorized lab supervisor with lab:status-update', async () => {
      const res = await dispatchRoute('PATCH', '/api/records/labresult1/status', {
        headers: { authorization: `Bearer ${supervisorToken}` },
        body: { status: 'COMPLETED' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.result.status, 'COMPLETED');
    });

    // Case 21: Status update route rejects valid labtechnician with 403 Forbidden
    await test('R21. Status update route rejects valid labtechnician with 403 Forbidden', async () => {
      const res = await dispatchRoute('PATCH', '/api/records/labresult1/status', {
        headers: { authorization: `Bearer ${techToken}` },
        body: { status: 'COMPLETED' },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes("Forbidden: role 'labtechnician' is not permitted for this operation"));
    });

    // Case 22: Status update route permits authorized lab admin with lab:status-update
    await test('R22. Status update route permits authorized lab admin with lab:status-update', async () => {
      const res = await dispatchRoute('PATCH', '/api/records/labresult1/status', {
        headers: { authorization: `Bearer ${adminToken}` },
        body: { status: 'IN_REVIEW' },
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.result.status, 'IN_REVIEW');
    });

    // Case 23: Status update route rejects user without required lab:status-update scope with 403
    await test('R23. Status update route rejects supervisor missing lab:status-update scope with 403', async () => {
      const supervisorWithoutStatusScope = jwt.sign({
        sub: supervisorUser.userId,
        userId: supervisorUser.userId,
        role: 'labsupervisor',
        mspId: 'LabMSP',
        type: 'human',
        scopes: ['lab:read', 'lab:write', 'lab:admin-read'],
      }, TEST_SECRET, { algorithm: 'HS256', issuer: 'lab-gateway', audience: 'lab-gateway' });

      const res = await dispatchRoute('PATCH', '/api/records/labresult1/status', {
        headers: { authorization: `Bearer ${supervisorWithoutStatusScope}` },
        body: { status: 'COMPLETED' },
      });
      assert.strictEqual(res.statusCode, 403);
      assert.ok(res.body.error.includes("Forbidden: missing required permission scope 'lab:status-update'"));
    });

    // Case 24: Direct arbitrary CID retrieval is blocked with 403 Forbidden even with valid token (technician or admin)
    await test('R24. Direct arbitrary CID retrieval returns 403 Forbidden with human token', async () => {
      const resTech = await dispatchRoute('GET', '/api/ipfs/json/bafkreiey2fj2tj6q6n57a73ygmyvsmzpuzwh7fxbsydrlpm2jzqme5cx34', {
        headers: { authorization: `Bearer ${techToken}` },
      });
      assert.strictEqual(resTech.statusCode, 403);
      assert.ok(resTech.body.error.includes('Forbidden: direct arbitrary CID retrieval is disabled for security'));

      const resAdmin = await dispatchRoute('GET', '/api/ipfs/json/bafkreiey2fj2tj6q6n57a73ygmyvsmzpuzwh7fxbsydrlpm2jzqme5cx34', {
        headers: { authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(resAdmin.statusCode, 403);
      assert.ok(resAdmin.body.error.includes('Forbidden: direct arbitrary CID retrieval is disabled for security'));
    });

    // Case 25: Direct arbitrary CID retrieval without token returns 401 Unauthorized
    await test('R25. Direct arbitrary CID retrieval without token returns 401 Unauthorized', async () => {
      const res = await dispatchRoute('GET', '/api/ipfs/json/bafkreiey2fj2tj6q6n57a73ygmyvsmzpuzwh7fxbsydrlpm2jzqme5cx34');
      assert.strictEqual(res.statusCode, 401);
    });

    // Case 26: Strict CID format validation enforces valid CIDv0 and CIDv1 and rejects traversal
    await test('R26. Strict CID validator accepts valid CIDs and rejects path traversal and shell injection', async () => {
      assert.strictEqual(isValidCid('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'), true);
      assert.strictEqual(isValidCid('bafkreiey2fj2tj6q6n57a73ygmyvsmzpuzwh7fxbsydrlpm2jzqme5cx34'), true);
      assert.strictEqual(isValidCid('zdj7Wn9v5vPZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'), true);

      assert.strictEqual(isValidCid('../../etc/passwd'), false);
      assert.strictEqual(isValidCid('bafkrei/evil/path'), false);
      assert.strictEqual(isValidCid('$(whoami)'), false);
      assert.strictEqual(isValidCid('; rm -rf /;'), false);
      assert.strictEqual(isValidCid(''), false);
      assert.strictEqual(isValidCid(null), false);
      assert.strictEqual(isValidCid(12345), false);
    });

    // Case 27: readJsonFromIpfs synchronously rejects invalid CID format without network activity
    await test('R27. readJsonFromIpfs rejects invalid CID format with validation error', async () => {
      await assert.rejects(
        async () => {
          await readJsonFromIpfs('../../malicious/path');
        },
        /Invalid IPFS CID format/
      );
    });

  } finally {
    cleanupTestUsersFile();
  }

  console.log(`\n=========================================================`);
  console.log(`Test Execution Finished: ${passed} passed, ${failed} failed`);
  console.log(`=========================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
