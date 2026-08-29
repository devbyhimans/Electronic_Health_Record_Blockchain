'use strict';

const { getContract, reconnect } = require('../fabric/gatewayManager');
const logger = require('../config/logger');

async function peerContext(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const { role } = req.user;
  try {
    req.contract = getContract(role);
    next();
  } catch (err) {
    logger.warn('Gateway unavailable, reconnecting...', { role });
    try {
      await reconnect(role);
      req.contract = getContract(role);
      next();
    } catch (e) {
      logger.error('Reconnect failed', { role, error: e.message });
      return res.status(503).json({ success: false, error: 'Fabric network unavailable' });
    }
  }
}

module.exports = { peerContext };
