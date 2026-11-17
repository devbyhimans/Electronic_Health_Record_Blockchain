'use strict';

const { verifyCredentials } = require('./userRegistry');
const { issueLabToken } = require('./jwtService');

// In-memory sliding window rate limiter for login attempts
const failedAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

function getClientIdentifier(req) {
  try {
    const forwarded = req.headers && req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : (req.ip || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '127.0.0.1');
    const userKey = String(req.body && req.body.username ? req.body.username : '').toLowerCase().trim();
    return `${ip}::${userKey}`;
  } catch (_e) {
    const fallbackIp = (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '127.0.0.1';
    const userKey = String(req.body && req.body.username ? req.body.username : '').toLowerCase().trim();
    return `${fallbackIp}::${userKey}`;
  }
}

function isRateLimited(key) {
  const record = failedAttempts.get(key);
  if (!record) return false;

  const now = Date.now();
  if (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    failedAttempts.delete(key);
    return false;
  }

  return record.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(key) {
  const now = Date.now();
  const record = failedAttempts.get(key);

  if (!record || (now - record.firstAttemptAt > RATE_LIMIT_WINDOW_MS)) {
    failedAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

function clearRateLimit(key) {
  failedAttempts.delete(key);
}

function resetRateLimiter() {
  failedAttempts.clear();
}

async function loginHandler(req, res) {
  const { username, password } = req.body || {};

  if (!username || typeof username !== 'string' || username.trim().length === 0 ||
      !password || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({
      error: 'Username and password are required',
    });
  }

  const clientKey = getClientIdentifier(req);

  if (isRateLimited(clientKey)) {
    return res.status(429).json({
      error: 'Too many failed login attempts. Please try again later.',
    });
  }

  const cleanUsername = username.trim();
  const user = verifyCredentials(cleanUsername, password);

  if (!user) {
    recordFailedAttempt(clientKey);
    // Identical error message for non-existent users and wrong passwords
    return res.status(401).json({
      error: 'Invalid username or password',
    });
  }

  clearRateLimit(clientKey);

  try {
    const token = issueLabToken(user);

    return res.json({
      success: true,
      token,
      tokenType: 'Bearer',
      expiresIn: process.env.LAB_JWT_EXPIRES_IN || '60m',
      user: {
        userId: user.userId,
        username: user.username,
        role: user.role,
        mspId: user.mspId,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: `Authentication failed: ${error.message}`,
    });
  }
}

module.exports = {
  loginHandler,
  isRateLimited,
  recordFailedAttempt,
  clearRateLimit,
  resetRateLimiter,
  MAX_FAILED_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
};
