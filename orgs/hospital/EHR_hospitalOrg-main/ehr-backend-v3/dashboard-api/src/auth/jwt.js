'use strict';

const jwt = require('jsonwebtoken');
const { getRolePolicy } = require('../authorization');

const EXAMPLE_SECRETS = new Set([
  'replace-with-peer0-api-jwt-secret',
  'replace_with_32_plus_random_chars',
]);

function isConfiguredSecret(secret) {
  return Boolean(secret) && !EXAMPLE_SECRETS.has(secret.toLowerCase());
}

function configuredSecrets(environment = process.env) {
  const configuredList = (environment.DASHBOARD_JWT_SECRETS || '')
    .split(',')
    .map((secret) => secret.trim())
    .filter(isConfiguredSecret);
  const secrets = configuredList.length
    ? configuredList
    : (isConfiguredSecret(environment.JWT_SECRET) ? [environment.JWT_SECRET] : []);
  return { secrets: [...new Set(secrets)], hasExplicitList: configuredList.length > 0 };
}

function validClaims(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  for (const claim of ['userId', 'role', 'mspId', 'peer']) {
    if (typeof payload[claim] !== 'string' || payload[claim].trim() === '') return false;
  }
  return Number.isFinite(payload.exp) && payload.exp > 0;
}

function verifyDashboardToken(token, options = {}) {
  const environment = options.environment || process.env;
  const authorization = options.authorization;
  const { secrets } = configuredSecrets(environment);
  if (secrets.length === 0) return { ok: false, status: 503, error: 'Dashboard authentication is not configured.' };

  let verifiedPayload = null;
  let matchedSecretIndex = -1;
  for (let index = 0; index < secrets.length; index += 1) {
    try {
      verifiedPayload = jwt.verify(token, secrets[index], { algorithms: ['HS256'] });
      matchedSecretIndex = index;
      break;
    } catch {
      // Try the next configured secret. Token values and errors are never logged.
    }
  }

  if (!verifiedPayload) {
    const unverified = jwt.decode(token);
    if (authorization.externalTokenRoles?.includes(unverified?.role) &&
        secrets.length <= authorization.externalSecretIndex) {
      return {
        ok: false,
        status: 401,
        error: 'Lab/provider login is not enabled on this deployment. Ask the operator to configure the extorg-api key in DASHBOARD_JWT_SECRETS.',
      };
    }
    return { ok: false, status: 401, error: 'Invalid or expired bearer token.' };
  }

  if (!validClaims(verifiedPayload)) return { ok: false, status: 401, error: 'Token is missing required claims.' };

  if (authorization.externalTokenRoles?.includes(verifiedPayload.role) &&
      matchedSecretIndex < authorization.externalSecretIndex) {
    return {
      ok: false,
      status: 401,
      error: 'Lab/provider login is not enabled on this deployment. Ask the operator to configure the extorg-api key in DASHBOARD_JWT_SECRETS.',
    };
  }

  const policy = getRolePolicy(authorization, verifiedPayload.role);
  if (!policy) return { ok: false, status: 403, error: 'Role is not permitted on the dashboard.' };

  if (policy.orgs?.length && !policy.orgs.includes('*') && !policy.orgs.includes(verifiedPayload.mspId)) {
    return { ok: false, status: 403, error: 'Role is not permitted for this organization.' };
  }

  return { ok: true, user: verifiedPayload, matchedSecretIndex };
}

module.exports = { configuredSecrets, isConfiguredSecret, validClaims, verifyDashboardToken };
