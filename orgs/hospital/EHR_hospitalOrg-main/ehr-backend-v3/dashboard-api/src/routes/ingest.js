'use strict';

const crypto = require('node:crypto');
const { EVENT_REGISTRY } = require('../contracts/eventRegistry');
const { validateEventEnvelope } = require('../contracts/envelope');

function constantTimeKeyMatch(candidate, expected) {
  if (typeof expected !== 'string' || !expected || typeof candidate !== 'string') return false;
  const suppliedDigest = crypto.createHash('sha256').update(candidate).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}

function createRateLimiter(options) {
  const entries = new Map();
  const windowMs = options.windowMs || 60000;
  const limit = options.limit || 300;
  const message = options.message || 'Ingest rate limit exceeded.';
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = entries.get(key);
    if (!entry || now - entry.startedAt >= windowMs) {
      entry = { startedAt: now, count: 0 };
      entries.set(key, entry);
    }
    entry.count += 1;
    if (entries.size > 10000) {
      for (const [address, current] of entries) {
        if (now - current.startedAt >= windowMs) entries.delete(address);
      }
    }
    if (entry.count > limit) return res.status(429).json({ success: false, error: message });
    return next();
  };
}

function extractBatch(body, maxBatchSize) {
  const items = Array.isArray(body) ? body : body && Array.isArray(body.events) ? body.events : null;
  if (!items) return { error: 'Body must be an event array or an object containing events.' };
  if (items.length === 0 || items.length > maxBatchSize) return { error: `Batch must contain between 1 and ${maxBatchSize} events.` };
  return { items };
}

function createIngestHandler(options) {
  const rateLimit = createRateLimiter({ limit: options.rateLimit });
  return [rateLimit, async (req, res) => {
    if (!options.serviceKey) {
      return res.status(503).json({ success: false, error: 'Event ingest is disabled on this deployment.' });
    }
    if (!constantTimeKeyMatch(req.get('x-dashboard-service-key'), options.serviceKey)) {
      return res.status(401).json({ success: false, error: 'Invalid dashboard service key.' });
    }

    const batch = extractBatch(req.body, options.maxBatchSize || 100);
    if (batch.error) return res.status(400).json({ success: false, error: batch.error });
    const results = [];
    for (let index = 0; index < batch.items.length; index += 1) {
      const input = batch.items[index];
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        results.push({ index, accepted: false, error: 'Event must be a JSON object.' });
        continue;
      }
      if (input.mock === true && !options.allowMock) {
        results.push({ index, accepted: false, error: 'Mock events are disabled on this deployment.' });
        continue;
      }
      const registered = typeof input.eventType === 'string' && Object.hasOwn(EVENT_REGISTRY, input.eventType);
      const event = { ...input, ...(!registered ? { unregistered: true } : {}) };
      const validation = validateEventEnvelope(event, {
        allowUnknownEventType: true,
        organizations: options.organizations,
      });
      if (!validation.valid) {
        results.push({ index, accepted: false, error: validation.error });
        continue;
      }
      try {
        const stored = await options.store.append(event);
        if (stored.accepted) {
          options.heartbeatMonitor?.accept(event);
          options.eventHub.publish(event);
        }
        results.push({
          index,
          accepted: stored.accepted,
          duplicate: stored.duplicate,
          eventId: event.eventId,
          ...(event.unregistered ? { unregistered: true } : {}),
        });
      } catch (error) {
        results.push({ index, accepted: false, error: error.code === 'INVALID_EVENT' ? error.message : 'Event could not be stored.' });
      }
    }
    return res.status(200).json({ success: true, results });
  }];
}

module.exports = { constantTimeKeyMatch, createIngestHandler, createRateLimiter, extractBatch };
