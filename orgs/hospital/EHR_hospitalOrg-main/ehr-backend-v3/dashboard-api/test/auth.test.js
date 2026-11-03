'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const authorization = require('../config/authorization.json');
const { verifyDashboardToken } = require('../src/auth/jwt');

const hospitalSecret = 'test-only-hospital-secret-not-a-real-key';
const extorgSecret = 'test-only-extorg-secret-not-a-real-key';
const claimBase = {
  userId: 'test-user',
  role: 'doctor',
  mspId: 'HospitalMSP',
  peer: 'peer1',
  exp: Math.floor(Date.now() / 1000) + 300,
};

function sign(claims, secret = hospitalSecret, algorithm = 'HS256') {
  return jwt.sign(claims, secret, { algorithm });
}

test('verifies a configured peer0 JWT and pins HS256', () => {
  const result = verifyDashboardToken(sign(claimBase), {
    authorization,
    environment: { JWT_SECRET: hospitalSecret },
  });
  assert.equal(result.ok, true);
  assert.equal(result.user.role, 'doctor');
});

test('rejects a token signed with an unconfigured secret', () => {
  const result = verifyDashboardToken(sign(claimBase, 'not-configured-test-secret'), {
    authorization,
    environment: { JWT_SECRET: hospitalSecret },
  });
  assert.equal(result.status, 401);
});

test('rejects unsigned alg none tokens', () => {
  const token = jwt.sign(claimBase, null, { algorithm: 'none' });
  const result = verifyDashboardToken(token, { authorization, environment: { JWT_SECRET: hospitalSecret } });
  assert.equal(result.status, 401);
});

for (const missingClaim of ['userId', 'role', 'mspId', 'peer']) {
  test(`rejects a signed token missing ${missingClaim}`, () => {
    const claims = { ...claimBase };
    delete claims[missingClaim];
    const result = verifyDashboardToken(sign(claims), {
      authorization,
      environment: { JWT_SECRET: hospitalSecret },
    });
    assert.equal(result.status, 401);
  });
}

test('rejects a signed token without expiry', () => {
  const claims = { ...claimBase };
  delete claims.exp;
  const result = verifyDashboardToken(sign(claims), {
    authorization,
    environment: { JWT_SECRET: hospitalSecret },
  });
  assert.equal(result.status, 401);
});

test('unknown and default-deny roles return 403 after valid signature verification', () => {
  for (const role of ['UnknownRole', 'patient', 'patientService']) {
    const result = verifyDashboardToken(sign({ ...claimBase, role }), {
      authorization,
      environment: { JWT_SECRET: hospitalSecret },
    });
    assert.equal(result.status, 403, role);
  }
});

test('extorg lab tokens require a separately configured key at index 1 or later', () => {
  const claims = { ...claimBase, role: 'labtechnician', mspId: 'DiagnosticsMSP', peer: 'peer0.diagnostic' };
  const disabled = verifyDashboardToken(sign(claims, extorgSecret), {
    authorization,
    environment: { JWT_SECRET: hospitalSecret },
  });
  assert.equal(disabled.status, 401);
  assert.match(disabled.error, /Lab\/provider login is not enabled/);

  const enabled = verifyDashboardToken(sign(claims, extorgSecret), {
    authorization,
    environment: { DASHBOARD_JWT_SECRETS: `${hospitalSecret},${extorgSecret}` },
  });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.matchedSecretIndex, 1);
});

test('rejects a token whose signed role belongs to a different MSP', () => {
  const claims = { ...claimBase, role: 'doctor', mspId: 'DiagnosticsMSP' };
  const result = verifyDashboardToken(sign(claims), {
    authorization,
    environment: { JWT_SECRET: hospitalSecret },
  });
  assert.equal(result.status, 403);
});

test('fails closed when no JWT secret is configured', () => {
  const result = verifyDashboardToken(sign(claimBase), { authorization, environment: {} });
  assert.equal(result.status, 503);
});
