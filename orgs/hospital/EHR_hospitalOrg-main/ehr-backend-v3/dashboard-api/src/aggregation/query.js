'use strict';

const { isAdmin, filterEventsForUser, getRolePolicy } = require('../authorization');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  error.publicMessage = message;
  return error;
}

function parsePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) throw badRequest('limit must be a positive integer.');
  const number = Number(value);
  if (number < 1) throw badRequest('limit must be a positive integer.');
  return Math.min(number, MAX_PAGE_SIZE);
}

function parseTimeRange(query, now = Date.now()) {
  const presets = { '1m': 60000, '5m': 300000, '1h': 3600000, '24h': 86400000 };
  if (query.window && !Object.hasOwn(presets, query.window)) throw badRequest('window must be 1m, 5m, 1h, or 24h.');
  let from = query.from ? Date.parse(query.from) : undefined;
  let to = query.to ? Date.parse(query.to) : undefined;
  if (query.from && !Number.isFinite(from)) throw badRequest('from must be a valid date-time.');
  if (query.to && !Number.isFinite(to)) throw badRequest('to must be a valid date-time.');
  if (query.window) {
    if (query.from || query.to) throw badRequest('Use either window or from/to.');
    to = now;
    from = now - presets[query.window];
  }
  if (from !== undefined && to !== undefined && from > to) throw badRequest('from must be earlier than or equal to to.');
  return { since: from === undefined ? undefined : new Date(from).toISOString(), until: to === undefined ? undefined : new Date(to).toISOString() };
}

function parseEnum(query, name, allowed) {
  const value = query[name];
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) throw badRequest(`${name} has an unsupported value.`);
  return value;
}

function parseCursor(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 512) throw badRequest('cursor is invalid.');
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!decoded || !Number.isFinite(Date.parse(decoded.timestamp)) || typeof decoded.eventId !== 'string' || decoded.eventId.length > 128) {
      throw new Error('bad cursor');
    }
    return { timestamp: new Date(decoded.timestamp).toISOString(), eventId: decoded.eventId };
  } catch {
    throw badRequest('cursor is invalid.');
  }
}

function encodeCursor(event) {
  return Buffer.from(JSON.stringify({ timestamp: event.timestamp, eventId: event.eventId })).toString('base64url');
}

function userEventScope(user, authorization) {
  if (isAdmin(user.role, authorization)) return {};
  const policy = getRolePolicy(authorization, user.role);
  if (!policy) return { orgs: [], ownerAgentIds: [], ownerPeerIds: [] };
  return {
    orgs: (policy.orgs || []).filter((org) => org !== '*'),
    ownerAgentIds: (policy.agentIds || []).filter((agentId) => agentId !== '*'),
    ownerPeerIds: (policy.peerIds || []).filter((peerId) => peerId !== '*'),
  };
}

function queryAuthorizedEvents(store, user, authorization, filters = {}) {
  if (isAdmin(user.role, authorization)) return store.query(filters);
  const scope = userEventScope(user, authorization);
  if (!scope.orgs.length || (!scope.ownerAgentIds.length && !scope.ownerPeerIds.length)) return [];
  const candidates = store.query({ ...filters, ...scope });
  return filterEventsForUser(user, candidates, authorization);
}

function paginatedEvents(store, user, authorization, filters, limit, cursor) {
  const items = queryAuthorizedEvents(store, user, authorization, {
    ...filters,
    cursor,
    limit: limit + 1,
  });
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  return {
    items: pageItems,
    page: {
      limit,
      hasMore,
      nextCursor: hasMore && pageItems.length ? encodeCursor(pageItems[pageItems.length - 1]) : null,
    },
  };
}

function dataStatus({ hasData, connected = true, reasonConnected = 'Source is connected.', reasonEmpty = 'No matching events have been observed.', since = null }) {
  if (hasData) return { state: 'OK', reason: null, since };
  if (!connected) return { state: 'NOT_CONNECTED', reason: reasonConnected, since };
  return { state: 'NO_DATA', reason: reasonEmpty, since };
}

function success(data) { return { success: true, data }; }

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  badRequest,
  dataStatus,
  encodeCursor,
  paginatedEvents,
  parseCursor,
  parseEnum,
  parsePageSize,
  parseTimeRange,
  queryAuthorizedEvents,
  success,
  userEventScope,
};
