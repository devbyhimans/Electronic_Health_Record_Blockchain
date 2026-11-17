'use strict';

/**
 * Reusable role-based and scope-based authorization middleware
 * for the LabMSP gateway. Reads exclusively from verified req.auth.
 */

function requireRole(...allowedRoles) {
  const flattened = allowedRoles.flat();

  return function roleMiddleware(req, res, next) {
    if (!req.auth || !req.auth.role) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    if (!flattened.includes(req.auth.role)) {
      return res.status(403).json({
        error: `Forbidden: role '${req.auth.role}' is not permitted for this operation`,
      });
    }

    return next();
  };
}

function requireScope(...requiredScopes) {
  const flattened = requiredScopes.flat();

  return function scopeMiddleware(req, res, next) {
    if (!req.auth || !req.auth.scopes) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const userScopes = Array.isArray(req.auth.scopes) ? req.auth.scopes : [];
    const missing = flattened.filter((scope) => !userScopes.includes(scope));

    if (missing.length > 0) {
      return res.status(403).json({
        error: `Forbidden: missing required permission scope '${missing[0]}'`,
      });
    }

    return next();
  };
}

/**
 * Middleware that strictly blocks endpoints that are internal-only
 * or deferred until cross-organization integration is implemented.
 */
function blockEndpoint(reason) {
  const message = reason || 'Forbidden: this endpoint is not accessible with current credentials';

  return function blockMiddleware(_req, res) {
    return res.status(403).json({
      error: message,
    });
  };
}

module.exports = {
  requireRole,
  requireScope,
  blockEndpoint,
};
