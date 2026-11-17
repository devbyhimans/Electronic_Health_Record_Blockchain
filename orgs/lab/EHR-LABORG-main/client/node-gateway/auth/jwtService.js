'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_ISSUER = 'lab-gateway';
const DEFAULT_AUDIENCE = 'lab-gateway';
const DEFAULT_ALGORITHM = 'HS256';
const DEFAULT_EXPIRES_IN = '60m';
const LAB_MSP_ID = 'LabMSP';
const MIN_SECRET_LENGTH = 32;

const ROLE_SCOPES = {
  labtechnician: ['lab:write', 'lab:read'],
  labsupervisor: ['lab:write', 'lab:read', 'lab:status-update', 'lab:admin-read', 'lab:patient-read'],
  labadmin: ['lab:write', 'lab:read', 'lab:status-update', 'lab:admin-read', 'lab:admin', 'lab:patient-read'],
};

function validateSecretStrength(secret) {
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('LAB_JWT_SECRET is not configured. A strong secret of at least 32 characters is required.');
  }
  const trimmed = secret.trim();
  if (trimmed.length < MIN_SECRET_LENGTH) {
    throw new Error(`LAB_JWT_SECRET is too weak (${trimmed.length} characters). A minimum of ${MIN_SECRET_LENGTH} characters is required.`);
  }
  return trimmed;
}

function getLabJwtSecret() {
  return validateSecretStrength(process.env.LAB_JWT_SECRET);
}

function areScopesValidForRole(role, scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return false;
  }
  const allowed = ROLE_SCOPES[role];
  if (!allowed) {
    return false;
  }
  return scopes.every((scope) => typeof scope === 'string' && allowed.includes(scope));
}

function resolveScopesForRole(role) {
  return ROLE_SCOPES[role] || ['lab:read'];
}

function issueLabToken(user, options = {}) {
  if (!user || typeof user !== 'object') {
    throw new Error('User object is required to issue token');
  }

  if (!user.userId || !user.role) {
    throw new Error('User must have userId and role');
  }

  const secret = options.secret || getLabJwtSecret();
  const expiresIn = options.expiresIn || process.env.LAB_JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN;
  const scopes = options.scopes || resolveScopesForRole(user.role);

  const payload = {
    sub: user.userId,
    userId: user.userId,
    username: user.username || user.userId,
    role: user.role,
    mspId: LAB_MSP_ID,
    type: 'human',
    scopes,
  };

  return jwt.sign(payload, secret, {
    algorithm: DEFAULT_ALGORITHM,
    expiresIn,
    issuer: DEFAULT_ISSUER,
    audience: DEFAULT_AUDIENCE,
  });
}

function verifyLabToken(token, options = {}) {
  if (!token || typeof token !== 'string') {
    throw new Error('Missing or empty token');
  }

  const secret = options.secret || getLabJwtSecret();
  const expectedIssuer = options.issuer || DEFAULT_ISSUER;
  const expectedAudience = options.audience || DEFAULT_AUDIENCE;

  let decoded;
  try {
    decoded = jwt.verify(token, secret, {
      algorithms: [DEFAULT_ALGORITHM],
      issuer: expectedIssuer,
      audience: expectedAudience,
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error(`Invalid token: ${error.message}`);
    }
    throw error;
  }

  // Validate structural claims and MSP identity
  if (!decoded.sub || !decoded.userId || !decoded.role) {
    throw new Error('Token is missing required identity claims');
  }

  if (decoded.mspId !== LAB_MSP_ID) {
    throw new Error(`Invalid MSP identity in token: expected '${LAB_MSP_ID}', got '${decoded.mspId}'`);
  }

  if (decoded.type !== 'human') {
    throw new Error(`Invalid principal type in token: expected 'human', got '${decoded.type}'`);
  }

  return decoded;
}

module.exports = {
  DEFAULT_ISSUER,
  DEFAULT_AUDIENCE,
  DEFAULT_ALGORITHM,
  DEFAULT_EXPIRES_IN,
  LAB_MSP_ID,
  MIN_SECRET_LENGTH,
  ROLE_SCOPES,
  issueLabToken,
  verifyLabToken,
  getLabJwtSecret,
  resolveScopesForRole,
  validateSecretStrength,
  areScopesValidForRole,
};
