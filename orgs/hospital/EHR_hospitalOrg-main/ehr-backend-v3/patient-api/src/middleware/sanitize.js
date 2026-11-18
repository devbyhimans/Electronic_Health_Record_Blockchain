'use strict';

/**
 * Universal Input Check Middleware for patient-api
 * Recursively scans req.body, req.query, and req.params (JSON keys and string values).
 * Rejects matching attacks with HTTP 400 { error: "INPUT_REJECTED", field, reason }.
 */

// 1. XSS Patterns
const XSS_PATTERNS = [
  { regex: /<\s*script\b[^>]*>/i, reason: 'XSS: script tag detected' },
  { regex: /<\s*\/\s*script\s*>/i, reason: 'XSS: closing script tag detected' },
  { regex: /\bon[a-z]+\s*=/i, reason: 'XSS: event handler attribute detected' },
  { regex: /javascript\s*:/i, reason: 'XSS: javascript: URI detected' },
];

// 2. SQL Injection Patterns
const SQL_PATTERNS = [
  { regex: /'\s*OR\s+['"\d\w]+\s*=\s*['"\d\w]+/i, reason: 'SQL Injection: Tautology condition detected' },
  { regex: /\bUNION\s+(ALL\s+)?SELECT\b/i, reason: 'SQL Injection: UNION SELECT detected' },
  { regex: /--/, reason: 'SQL Injection: comment syntax detected' },
  { regex: /\bDROP\s+TABLE\b/i, reason: 'SQL Injection: DROP TABLE detected' },
];

// 3. NoSQL Operator Patterns (keys and stringified patterns)
const NOSQL_KEY_PATTERNS = [
  { regex: /^\$(where|ne|gt|gte|lt|lte|regex|in|nin|exists|or|and|not|nor)$/i, reason: 'NoSQL Injection: operator key detected' },
  { regex: /^\$/, reason: 'NoSQL Injection: dollar-prefixed operator key detected' },
];

const NOSQL_STRING_PATTERNS = [
  { regex: /["']?\$(where|ne|gt|regex)["']?\s*:/i, reason: 'NoSQL Injection: operator pattern detected' },
];

// 4. Path Traversal Patterns
const PATH_TRAVERSAL_PATTERNS = [
  { regex: /\.\.[\/\\]/, reason: 'Path Traversal: directory traversal sequence (../ or ..\\) detected' },
];

function inspect(value, pathPrefix) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    for (const rule of XSS_PATTERNS) {
      if (rule.regex.test(value)) return { field: pathPrefix, reason: rule.reason };
    }
    for (const rule of SQL_PATTERNS) {
      if (rule.regex.test(value)) return { field: pathPrefix, reason: rule.reason };
    }
    for (const rule of PATH_TRAVERSAL_PATTERNS) {
      if (rule.regex.test(value)) return { field: pathPrefix, reason: rule.reason };
    }
    for (const rule of NOSQL_STRING_PATTERNS) {
      if (rule.regex.test(value)) return { field: pathPrefix, reason: rule.reason };
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const currentPath = pathPrefix ? `${pathPrefix}[${i}]` : `[${i}]`;
      const violation = inspect(value[i], currentPath);
      if (violation) return violation;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      for (const rule of NOSQL_KEY_PATTERNS) {
        if (rule.regex.test(key)) return { field: currentPath, reason: rule.reason };
      }
      for (const rule of [...XSS_PATTERNS, ...SQL_PATTERNS, ...PATH_TRAVERSAL_PATTERNS]) {
        if (rule.regex.test(key)) return { field: currentPath, reason: rule.reason };
      }
      const violation = inspect(value[key], currentPath);
      if (violation) return violation;
    }
    return null;
  }

  return null;
}

function sanitize(req, res, next) {
  let violation = null;

  if (req.params && typeof req.params === 'object') {
    violation = inspect(req.params, 'params');
  }
  if (!violation && req.query && typeof req.query === 'object') {
    violation = inspect(req.query, 'query');
  }
  if (!violation && req.body && typeof req.body === 'object') {
    violation = inspect(req.body, 'body');
  }

  if (violation) {
    const timestamp = new Date().toISOString();
    const endpoint = `${req.method} ${req.originalUrl || req.url}`;
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="${violation.reason}"`);
    return res.status(400).json({
      error: 'INPUT_REJECTED',
      field: violation.field,
      reason: violation.reason,
    });
  }

  next();
}

module.exports = {
  sanitize,
  inspect,
};
