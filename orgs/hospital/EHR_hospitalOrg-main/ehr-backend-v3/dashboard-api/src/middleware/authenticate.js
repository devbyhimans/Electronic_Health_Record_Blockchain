'use strict';

const { verifyDashboardToken } = require('../auth/jwt');

function createAuthenticate(authorization, environment = process.env) {
  return function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing or malformed Authorization header.' });
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) return res.status(401).json({ success: false, error: 'Missing or malformed Authorization header.' });
    const result = verifyDashboardToken(token, { authorization, environment });
    if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });
    req.dashboardUser = result.user;
    return next();
  };
}

module.exports = { createAuthenticate };
