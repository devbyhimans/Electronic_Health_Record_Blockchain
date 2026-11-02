'use strict';

function notFound(req, res) {
  return res.status(404).json({ success: false, error: `Not found: ${req.method} ${req.path}` });
}

function errorHandler(error, req, res, _next) {
  if (res.headersSent) return;
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
  const publicMessage = status >= 500 ? 'Internal server error.' : (error.publicMessage || 'Request failed.');
  return res.status(status).json({ success: false, error: publicMessage });
}

module.exports = { errorHandler, notFound };
