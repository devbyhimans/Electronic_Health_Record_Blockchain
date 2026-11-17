'use strict';

const jwt = require('jsonwebtoken');
const {
  DEFAULT_ISSUER,
  DEFAULT_AUDIENCE,
  DEFAULT_ALGORITHM,
  LAB_MSP_ID,
  getLabJwtSecret,
  areScopesValidForRole,
} = require('./jwtService');
const { SUPPORTED_ROLES } = require('./userRegistry');

/**
 * Express middleware that extracts and cryptographically verifies
 * a laboratory Bearer JWT, constructs a trusted normalized req.auth principal,
 * or rejects with 401 Unauthorized.
 */
function authenticateLabToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({
      error: 'Missing or malformed Authorization header',
    });
  }

  // Header must strictly match: Bearer <token>
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({
      error: 'Invalid Authorization header format. Expected Bearer <token>',
    });
  }

  const token = parts[1].trim();
  if (!token) {
    return res.status(401).json({
      error: 'Bearer token must not be empty',
    });
  }

  let secret;
  try {
    secret = getLabJwtSecret();
  } catch (err) {
    // Secret misconfiguration is a 500 error internally, avoid leaking detail
    return res.status(500).json({
      error: 'Authentication configuration error',
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, secret, {
      algorithms: [DEFAULT_ALGORITHM],
      issuer: DEFAULT_ISSUER,
      audience: DEFAULT_AUDIENCE,
    });
  } catch (err) {
    const errorMsg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid or malformed token';
    return res.status(401).json({
      error: errorMsg,
    });
  }

  // Validate structural identity claims
  if (!decoded.sub || typeof decoded.sub !== 'string' || decoded.sub.trim().length === 0) {
    return res.status(401).json({
      error: 'Token missing required subject claim',
    });
  }

  if (!decoded.userId || typeof decoded.userId !== 'string' || decoded.userId.trim().length === 0) {
    return res.status(401).json({
      error: 'Token missing required userId claim',
    });
  }

  if (!decoded.role || typeof decoded.role !== 'string' || !SUPPORTED_ROLES.includes(decoded.role.trim())) {
    return res.status(401).json({
      error: `Unsupported role in token: '${decoded.role}'`,
    });
  }

  if (decoded.mspId !== LAB_MSP_ID) {
    return res.status(401).json({
      error: `Invalid MSP organization in token: expected '${LAB_MSP_ID}'`,
    });
  }

  if (decoded.type !== 'human') {
    return res.status(401).json({
      error: `Invalid principal type: expected 'human', got '${decoded.type}'`,
    });
  }

  if (!areScopesValidForRole(decoded.role, decoded.scopes)) {
    return res.status(401).json({
      error: 'Token scopes are missing or invalid for user role',
    });
  }

  // Construct trusted normalized req.auth principal
  req.auth = {
    sub: String(decoded.sub).trim(),
    userId: String(decoded.userId).trim(),
    username: (decoded.username && typeof decoded.username === 'string' && decoded.username.trim().length > 0)
      ? String(decoded.username).trim()
      : String(decoded.userId).trim(),
    role: String(decoded.role).trim(),
    mspId: String(decoded.mspId).trim(),
    type: String(decoded.type).trim(),
    scopes: Array.isArray(decoded.scopes) ? [...decoded.scopes] : [],
    iss: String(decoded.iss).trim(),
    aud: String(decoded.aud).trim(),
    iat: decoded.iat,
    exp: decoded.exp,
  };

  return next();
}

module.exports = {
  authenticateLabToken,
};
