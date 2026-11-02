'use strict';

const express = require('express');
const { createAuthenticate } = require('../middleware/authenticate');
const { canAccessAgent, canAccessPage, canAccessPeer, filterEventsForUser, isAdmin } = require('../authorization');
const { EVENT_REGISTRY } = require('../contracts/eventRegistry');
const { groupExecutions, stitchTrace } = require('../aggregation/traces');
const {
  badRequest, dataStatus, paginatedEvents, parseCursor, parseEnum, parsePageSize,
  parseTimeRange, queryAuthorizedEvents, success,
} = require('../aggregation/query');

const SECURITY_TYPES = [
  'CONSENT_GRANTED', 'CONSENT_REVOKED', 'ACCESS_DENIED', 'AUTHZ_DENIED',
  'AUTHZ_ORG_DENIED', 'AUTHZ_ROLE_DENIED', 'CONSENT_ABSENT', 'CONSENT_EXPIRED',
  'CONSENT_INACTIVE', 'EMERGENCY_ACCESS_INVOKED', 'VCAP_ANCHORED', 'VCAP_VERIFIED',
  'VCAP_MISMATCH', 'VCAP_VERIFICATION_FAILED', 'AI_BLOCKED', 'AI_HALLUCINATION_SUSPECTED',
];
const TRANSACTION_TYPES = ['TRANSACTION_SUBMITTED', 'TRANSACTION_COMMITTED', 'TRANSACTION_FAILED', 'MVCC_CONFLICT', 'ENDORSEMENT_FAILED'];
const ALLOWED_SEVERITIES = ['INFO', 'WARNING', 'ERROR', 'CRITICAL'];
const ALLOWED_SORTS = ['asc', 'desc'];
const WINDOW_NAMES = ['1m', '5m', '1h', '24h'];

function forbidden(res) { return res.status(403).json({ success: false, error: 'Role is not permitted to access this dashboard resource.' }); }
function requirePage(page, authorization) {
  return (req, res, next) => canAccessPage(req.dashboardUser, page, authorization) ? next() : forbidden(res);
}

function statusInfo(state, reason = null, since = null, mock = false) { return { state, reason, since, ...(mock ? { mock: true } : {}) }; }
function stateForHealth(targetStatus, lastCheckedAt) {
  if (targetStatus === 'UP') return statusInfo('OK', null, lastCheckedAt);
  if (targetStatus === 'DOWN') return statusInfo('NOT_CONNECTED', 'Health target reported DOWN.', lastCheckedAt);
  return statusInfo('NOT_CONNECTED', targetStatus === 'NOT_CONFIGURED' ? 'Health URL is not configured.' : 'No successful health result has been observed.', lastCheckedAt);
}

function parseListFilters(req, options = {}) {
  const time = parseTimeRange(req.query);
  const filters = {
    ...time,
    sort: parseEnum(req.query, 'sort', ALLOWED_SORTS) || 'desc',
    eventType: options.allowEventType === false ? undefined : req.query.type,
    severity: req.query.severity,
    source: req.query.source,
    status: req.query.status,
    org: req.query.org,
    chaincode: req.query.chaincode,
    functionName: req.query.function,
  };
  for (const [name, value] of Object.entries({ type: filters.eventType, severity: filters.severity, source: filters.source, status: filters.status, org: filters.org, chaincode: filters.chaincode, function: filters.functionName })) {
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)) throw badRequest(`${name} is invalid.`);
  }
  if (filters.eventType && !/^[A-Z][A-Z0-9_]{0,95}$/.test(filters.eventType)) throw badRequest('type is invalid.');
  if (filters.severity && !ALLOWED_SEVERITIES.includes(filters.severity)) throw badRequest('severity is unsupported.');
  if (filters.org && !req.dashboardConfig.topology.organizations.some((org) => org.id === filters.org)) throw badRequest('org is unsupported.');
  if (filters.eventType) filters.eventTypes = [filters.eventType];
  delete filters.eventType;
  delete filters.functionName;
  if (req.query.function) filters.functionName = req.query.function;
  return filters;
}

function parsePage(req) {
  return {
    limit: parsePageSize(req.query.limit),
    cursor: parseCursor(req.query.cursor),
  };
}

function paginateArray(items, limit, cursor, keyName = 'id', sort = 'desc') {
  let selected = [...items].sort((left, right) => (sort === 'asc' ? 1 : -1) *
    (Date.parse(left.updatedAt || left.timestamp) - Date.parse(right.updatedAt || right.timestamp) || String(left[keyName]).localeCompare(String(right[keyName]))));
  if (cursor) {
    selected = selected.filter((item) => {
      const comparison = Date.parse(item.updatedAt || item.timestamp) - Date.parse(cursor.timestamp) || String(item[keyName]).localeCompare(cursor.eventId);
      return sort === 'asc' ? comparison > 0 : comparison < 0;
    });
  }
  const hasMore = selected.length > limit;
  const pageItems = hasMore ? selected.slice(0, limit) : selected;
  const last = pageItems.at(-1);
  const nextCursor = hasMore && last
    ? Buffer.from(JSON.stringify({ timestamp: last.updatedAt || last.timestamp, eventId: last[keyName] })).toString('base64url')
    : null;
  return { items: pageItems, page: { limit, hasMore, nextCursor } };
}

function ensureAgent(req, res, next) {
  if (!canAccessPage(req.dashboardUser, 'agent', req.dashboardConfig.authorization)) return forbidden(res);
  const agent = req.dashboardConfig.topology.agents.find((item) => item.id === req.params.agentId);
  if (agent) {
    if (!canAccessAgent(req.dashboardUser, agent.id, agent.org, req.dashboardConfig.authorization)) return forbidden(res);
    req.dashboardAgent = agent;
    return next();
  }
  const peer = req.dashboardConfig.topology.peers.find((item) => item.id === req.params.agentId);
  if (!peer) return res.status(404).json({ success: false, error: 'Agent or peer was not found in the configured registry.' });
  if (!canAccessPeer(req.dashboardUser, peer.id, peer.mspId, req.dashboardConfig.authorization)) return forbidden(res);
  req.dashboardPeer = peer;
  return next();
}

function targetEvents(req, config, time = {}) {
  if (req.dashboardPeer) {
    return queryAuthorizedEvents(config.store, req.dashboardUser, config.authorization, { peerId: req.dashboardPeer.id, ...time, limit: 1000000 });
  }
  return queryAuthorizedEvents(config.store, req.dashboardUser, config.authorization, { agentIds: [req.dashboardAgent.id], ...time, limit: 1000000 });
}

function queryBase(req, extra = {}) {
  const page = parsePage(req);
  const filters = parseListFilters(req);
  return { ...page, filters: { ...filters, ...extra } };
}

function eventsStatus(events, config, sourceConnected = null) {
  const connected = sourceConnected ?? (config.collector?.getStatus().status === 'CONNECTED' || events.length > 0);
  const status = dataStatus({ hasData: events.length > 0, connected });
  return events.some((event) => event.mock === true) ? { ...status, mock: true } : status;
}

function createAggregationRouter(config) {
  const router = express.Router();
  const authenticate = createAuthenticate(config.authorization);
  const page = (name) => requirePage(name, config.authorization);
  router.use((req, _res, next) => { req.dashboardConfig = config; next(); });
  router.use(authenticate);

  router.get('/overview', page('overview'), (_req, res) => {
    const tx = config.metrics.transactionMetrics('5m');
    const agents = config.topology.agents.map((agent) => buildAgentSummary(config, { role: 'admin' }, agent));
    const alerts = listPersistedAlerts(config.store);
    const ipfs = buildIpfsSummary(config);
    const result = {
      network: buildNetworkSummary(config),
      transactions: tx,
      agents: {
        items: agents,
        status: agents.some((agent) => agent.status.state === 'OK') ? statusInfo('OK') : statusInfo('NOT_CONNECTED', 'No agent heartbeat or health producer is connected.'),
      },
      security: buildSecuritySummary(config),
      ipfs,
      alerts: { items: alerts, count: alerts.length || null, status: alerts.length ? statusInfo('OK') : statusInfo('NO_DATA', 'No active alerts.') },
    };
    res.json(success(result));
  });

  router.get('/network', page('network'), (_req, res) => res.json(success(buildNetwork(config))));
  router.get('/peers', page('network'), (_req, res) => res.json(success({ items: buildNetwork(config).peers, status: dataStatus({ hasData: config.topology.peers.length > 0, connected: true }) })));
  router.get('/orderers', page('network'), (_req, res) => res.json(success({ items: buildNetwork(config).orderers, status: dataStatus({ hasData: config.topology.orderers.length > 0, connected: true }) })));
  router.get('/channels', page('network'), (_req, res) => res.json(success({ items: buildNetwork(config).channels, status: dataStatus({ hasData: buildNetwork(config).channels.length > 0, connected: config.collector?.getStatus().status === 'CONNECTED' }) })));

  router.get('/transactions/metrics', page('transactions'), (req, res) => {
    const window = parseEnum(req.query, 'window', WINDOW_NAMES) || '5m';
    res.json(success(config.metrics.transactionMetrics(window)));
  });
  router.get('/transactions', page('transactions'), (req, res) => {
    const { limit, cursor, filters } = queryBase(req, { eventTypes: TRANSACTION_TYPES });
    const result = paginatedEvents(config.store, req.dashboardUser, config.authorization, filters, limit, cursor);
    result.status = eventsStatus(result.items, config);
    res.json(success(result));
  });

  router.get('/agents', (req, res) => {
    if (!canAccessPage(req.dashboardUser, 'agent', config.authorization)) return forbidden(res);
    const agents = config.topology.agents.filter((agent) => canAccessAgent(req.dashboardUser, agent.id, agent.org, config.authorization))
      .map((agent) => buildAgentSummary(config, req.dashboardUser, agent));
    const peers = config.topology.peers.filter((peer) => canAccessPeer(req.dashboardUser, peer.id, peer.mspId, config.authorization))
      .map((peer) => buildPeerSummary(config, peer));
    const items = [...agents, ...peers];
    res.json(success({ items, status: items.some((item) => item.status.state === 'OK') ? statusInfo('OK') : statusInfo('NOT_CONNECTED', 'No matching agent or peer health producer has connected.') }));
  });
  router.get('/agents/:agentId/executions', ensureAgent, (req, res) => {
    const time = parseTimeRange(req.query);
    const limit = parsePageSize(req.query.limit);
    const cursor = parseCursor(req.query.cursor);
    const events = targetEvents(req, config, time);
    const traces = groupExecutions(events, { offlineAgents: offlineAgentSet(config) });
    const sort = parseEnum(req.query, 'sort', ALLOWED_SORTS) || 'desc';
    const result = paginateArray(traces, limit, cursor, 'runId', sort);
    const targetStatus = req.dashboardPeer ? buildPeerSummary(config, req.dashboardPeer).status : agentState(config, req.dashboardAgent);
    result.status = dataStatus({ hasData: result.items.length > 0, connected: targetStatus.state === 'OK', reasonConnected: 'Target has not emitted execution events.' });
    res.json(success(result));
  });
  router.get('/agents/:agentId/metrics', ensureAgent, (req, res) => {
    const window = parseEnum(req.query, 'window', WINDOW_NAMES) || '24h';
    const events = targetEvents(req, config);
    const metrics = req.dashboardPeer ? emptyPeerMetrics(window, events.length > 0) : config.metrics.agentMetrics(req.dashboardAgent.id, events, window);
    res.json(success({ metrics }));
  });
  router.get('/agents/:agentId', ensureAgent, (req, res) => {
    const agent = req.dashboardPeer ? buildPeerSummary(config, req.dashboardPeer) : buildAgentSummary(config, req.dashboardUser, req.dashboardAgent);
    const events = targetEvents(req, config);
    const metrics = req.dashboardPeer ? emptyPeerMetrics('24h', events.length > 0) : config.metrics.agentMetrics(req.dashboardAgent.id, events);
    const executions = groupExecutions(events, { offlineAgents: offlineAgentSet(config) }).slice(0, 10);
    const visibleEvents = filterEventsForUser(req.dashboardUser, events, config.authorization).slice(-20).reverse();
    res.json(success({
      agent,
      metrics,
      executions: { items: executions, status: eventsStatus(executions, config, agent.status.state === 'OK') },
      events: { items: visibleEvents.map((event) => ({ eventId: event.eventId, type: event.severity, severity: event.severity, eventType: event.eventType, message: safeEventMessage(event), timestamp: event.timestamp, ...(event.mock ? { mock: true } : {}) })), status: eventsStatus(visibleEvents, config, agent.status.state === 'OK') },
    }));
  });

  router.get('/executions/:runId/trace', (req, res) => {
    if (!canAccessPage(req.dashboardUser, 'traces', config.authorization)) return forbidden(res);
    const runId = req.params.runId;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(runId)) throw badRequest('runId is invalid.');
    const events = queryAuthorizedEvents(config.store, req.dashboardUser, config.authorization, { correlationId: runId, limit: 1000000 });
    if (!isAdmin(req.dashboardUser.role, config.authorization) && !events.length) return forbidden(res);
    res.json(success(stitchTrace(runId, events, { offlineAgents: offlineAgentSet(config) })));
  });
  router.get('/executions/:runId', (req, res) => {
    if (!canAccessPage(req.dashboardUser, 'traces', config.authorization)) return forbidden(res);
    const runId = req.params.runId;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(runId)) throw badRequest('runId is invalid.');
    const events = queryAuthorizedEvents(config.store, req.dashboardUser, config.authorization, { correlationId: runId, limit: 1000000 });
    if (!isAdmin(req.dashboardUser.role, config.authorization) && !events.length) return forbidden(res);
    const trace = stitchTrace(runId, events, { offlineAgents: offlineAgentSet(config) });
    res.json(success({ execution: trace, status: trace.statusInfo }));
  });

  router.get('/security/events', page('security'), (req, res) => {
    const { limit, cursor, filters } = queryBase(req, { eventTypes: SECURITY_TYPES });
    const result = paginatedEvents(config.store, req.dashboardUser, config.authorization, filters, limit, cursor);
    result.status = eventsStatus(result.items, config, result.items.length > 0);
    res.json(success(result));
  });
  router.get('/security', page('security'), (_req, res) => res.json(success(buildSecuritySummary(config))));
  router.get('/ipfs', page('ipfs'), (_req, res) => res.json(success(buildIpfsSummary(config))));

  router.get('/alerts', page('alerts'), (req, res) => {
    const limit = parsePageSize(req.query.limit);
    const cursor = parseCursor(req.query.cursor);
    const sort = parseEnum(req.query, 'sort', ALLOWED_SORTS) || 'desc';
    const result = paginateArray(listPersistedAlerts(config.store), limit, cursor, 'id', sort);
    result.status = result.items.length ? statusInfo('OK') : statusInfo('NO_DATA', 'No active alerts.');
    res.json(success(result));
  });
  router.post('/alerts/:alertId/acknowledge', page('alerts'), async (req, res) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(req.params.alertId)) throw badRequest('alertId is invalid.');
    const acknowledged = await config.alertEngine?.acknowledge(req.params.alertId, req.dashboardUser.userId);
    if (!acknowledged) return res.status(404).json({ success: false, error: 'Active alert was not found.' });
    return res.json(success({ alert: acknowledged }));
  });

  router.get('/logs/events', page('logs'), (req, res) => {
    const { limit, cursor, filters } = queryBase(req);
    const result = paginatedEvents(config.store, req.dashboardUser, config.authorization, filters, limit, cursor);
    result.status = eventsStatus(result.items, config);
    res.json(success(result));
  });
  return router;
}

function listPersistedAlerts(store) {
  const events = store.query({ eventTypes: ['ALERT_RAISED', 'ALERT_RESOLVED', 'ALERT_ACKNOWLEDGED'], sort: 'asc', limit: 1000000 });
  const byKey = new Map();
  for (const event of events) {
    const key = `${event.payload.ruleId}\u0000${event.payload.subjectId}`;
    if (event.eventType === 'ALERT_RESOLVED') byKey.delete(key);
    else if (event.eventType === 'ALERT_RAISED') byKey.set(key, {
      id: event.eventId, ruleId: event.payload.ruleId, subjectId: event.payload.subjectId,
      severity: event.payload.alertSeverity || event.severity, status: event.payload.status,
      reasonCode: event.payload.reasonCode, timestamp: event.timestamp, acknowledgedAt: null,
      ...(event.mock ? { mock: true } : {}),
    });
    else if (event.eventType === 'ALERT_ACKNOWLEDGED' && byKey.has(key)) {
      byKey.set(key, { ...byKey.get(key), acknowledgedAt: event.timestamp });
    }
  }
  return [...byKey.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function agentState(config, agent) {
  const heartbeat = config.heartbeatMonitor?.getAgentStates()[agent.id];
  if (heartbeat) return statusInfo(heartbeat.status === 'ONLINE' ? 'OK' : 'NOT_CONNECTED', heartbeat.status === 'OFFLINE' ? 'Agent missed configured heartbeat intervals.' : null, heartbeat.lastHeartbeat, heartbeat.mock);
  const target = config.topology.healthTargets.find((item) => item.agentId === agent.id || (item.peerId && item.peerId === agent.peerId));
  if (target) {
    const state = config.healthPoller?.states?.get(target.id);
    return stateForHealth(state?.status || 'NOT_CONFIGURED', state?.lastCheckedAt || null);
  }
  return statusInfo('NOT_CONNECTED', `TODO(dependency: ${agent.dependency || 'producer team'})`, null);
}

function buildAgentSummary(config, _user, agent) {
  const events = queryAuthorizedEvents(config.store, { role: 'admin' }, config.authorization, { agentIds: [agent.id], limit: 1000000 });
  const metrics = config.metrics?.agentMetrics(agent.id, events) || {};
  return {
    id: agent.id,
    kind: agent.kind,
    org: agent.org,
    status: agentState(config, agent),
    model: metrics.model || null,
    modelVersion: metrics.modelVersion || null,
    vcapStatus: metrics.vcapStatus || null,
  };
}

function buildPeerSummary(config, peer) {
  const target = config.topology.healthTargets.find((item) => item.peerId === peer.id && item.kind === 'peer');
  const health = target ? config.healthPoller?.states?.get(target.id) : null;
  return { id: peer.id, kind: 'peer', org: peer.mspId, status: stateForHealth(health?.status || 'NOT_CONFIGURED', health?.lastCheckedAt || null), blockHeight: null, blockHeightStatus: statusInfo('NOT_CONNECTED', 'Peer block height is not available from the configured read-only health source.') };
}

function emptyPeerMetrics(window, hasData) {
  const state = hasData ? 'NO_DATA' : 'NOT_CONNECTED';
  const reason = hasData ? 'Peer events do not include a peer execution metric producer.' : 'No peer-scoped metric producer is connected.';
  const unavailable = () => ({ value: null, status: statusInfo(state, reason) });
  return { window, metrics: { requests: unavailable(), executions: unavailable(), successCount: unavailable(), failureCount: unavailable(), successRate: unavailable(), failureRate: unavailable(), averageLatencyMs: unavailable(), fallbackUsedRate: unavailable(), humanReviewRate: unavailable() }, lastHeartbeat: null, model: null, modelVersion: null, vcapStatus: null };
}

function offlineAgentSet(config) {
  return new Set(Object.entries(config.heartbeatMonitor?.getAgentStates() || {})
    .filter(([, value]) => value.status === 'OFFLINE').map(([id]) => id));
}

function healthTargetStatus(config, id) {
  const state = config.healthPoller?.states?.get(id);
  return stateForHealth(state?.status || 'NOT_CONFIGURED', state?.lastCheckedAt || null);
}

function mockHealthStatus(events, component, allowedTypes) {
  const observed = events.filter((event) => event.mock === true && allowedTypes.includes(event.eventType) &&
    (event.peerId === component || event.payload?.component === component))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))[0];
  if (!observed) return null;
  const up = observed.payload?.status === 'UP';
  return statusInfo(up ? 'OK' : 'NOT_CONNECTED', up ? 'Mock health event; not a live check.' : 'Mock health event reports DOWN.', observed.timestamp, true);
}

function buildNetwork(config) {
  const collectorStatus = config.collector?.getStatus() || { status: 'NOT_CONNECTED', lastProcessedBlock: null };
  const events = config.store.query({ limit: 1000000 });
  const observedChannels = [...new Set(events.map((event) => event.channel).filter(Boolean))];
  const observedChaincodes = [...new Set(events.map((event) => event.payload?.chaincode).filter(Boolean))];
  const channels = [...new Set([config.topology.channel, ...observedChannels])].filter(Boolean).map((id) => ({
    id,
    configured: id === config.topology.channel,
    observed: observedChannels.includes(id),
    ...(observedChannels.includes(id) && events.some((event) => event.channel === id && event.mock) ? { mock: true } : {}),
    blockHeight: id === config.topology.channel && collectorStatus.lastProcessedBlock !== null ? Number(collectorStatus.lastProcessedBlock) : null,
    status: id === config.topology.channel && collectorStatus.status === 'CONNECTED' ? statusInfo('OK', null, null) : statusInfo('NOT_CONNECTED', 'No committed block height has been observed by the collector.', null),
  }));
  const chaincodes = [...new Set([config.topology.chaincode, ...observedChaincodes])].filter(Boolean).map((id) => ({ id, configured: id === config.topology.chaincode, observed: observedChaincodes.includes(id), ...(events.some((event) => event.payload?.chaincode === id && event.mock) ? { mock: true } : {}) }));
  const peers = config.topology.peers.map((peer) => {
    const target = config.topology.healthTargets.find((item) => item.peerId === peer.id && item.kind === 'peer');
    const health = target ? config.healthPoller?.states?.get(target.id) : null;
    const observedMockStatus = (!health || health.status === 'NOT_CONFIGURED')
      ? mockHealthStatus(events, peer.id, ['PEER_STATUS_CHANGED', 'PEER_DOWN']) : null;
    return {
      id: peer.id,
      org: peer.mspId,
      status: observedMockStatus || stateForHealth(health?.status || 'NOT_CONFIGURED', health?.lastCheckedAt || null),
      blockHeight: null,
      heightStatus: statusInfo('NOT_CONNECTED', 'No peer block-height endpoint is configured; the dashboard does not query peer admin APIs.', null),
    };
  });
  const orderers = config.topology.orderers.map((orderer) => {
    const target = config.topology.healthTargets.find((item) => item.kind === 'orderer' && item.org === config.topology.organizations[0]?.id);
    const health = target ? config.healthPoller?.states?.get(target.id) : null;
    const observedMockStatus = (!health || health.status === 'NOT_CONFIGURED')
      ? mockHealthStatus(events, orderer.id, ['ORDERER_STATUS_CHANGED', 'ORDERER_DOWN']) : null;
    return { id: orderer.id, status: observedMockStatus || stateForHealth(health?.status || 'NOT_CONFIGURED', health?.lastCheckedAt || null) };
  });
  const organizations = config.topology.organizations.map((organization) => ({
    id: organization.id,
    role: organization.role,
    peers: peers.filter((peer) => peer.org === organization.id).map((peer) => peer.id),
    status: peers.some((peer) => peer.org === organization.id && peer.status.state === 'OK')
      ? statusInfo('OK', null, null, peers.some((peer) => peer.org === organization.id && peer.status.mock))
      : statusInfo('NOT_CONNECTED', 'No peer operations health source is connected.'),
  }));
  return {
    channel: config.topology.channel || null,
    organizations,
    peers,
    orderers,
    channels,
    chaincodes,
    ledgerLag: { value: null, availability: 'NOT_AVAILABLE', status: statusInfo('NOT_CONNECTED', 'Peer heights are not available to compare with collector height.', null) },
    collector: { status: collectorStatus.status, lastProcessedBlock: collectorStatus.lastProcessedBlock },
  };
}

function buildNetworkSummary(config) {
  const network = buildNetwork(config);
  return {
    configuredPeers: { value: network.peers.length, status: statusInfo('OK', 'Count is from topology configuration, not live peer health.') },
    connectedPeers: { value: network.peers.some((peer) => peer.status.state === 'OK') ? network.peers.filter((peer) => peer.status.state === 'OK').length : null, status: network.peers.some((peer) => peer.status.state === 'OK') ? statusInfo('OK', null, null, network.peers.some((peer) => peer.status.mock)) : statusInfo('NOT_CONNECTED', 'No peer operations endpoint is connected.') },
    ledgerLag: network.ledgerLag,
  };
}

function buildSecuritySummary(config) {
  const events = config.store.query({ eventTypes: SECURITY_TYPES, limit: 1000000 });
  const access = events.filter((event) => ['ACCESS_DENIED', 'AUTHZ_DENIED', 'AUTHZ_ORG_DENIED', 'AUTHZ_ROLE_DENIED'].includes(event.eventType));
  const consent = events.filter((event) => ['CONSENT_GRANTED', 'CONSENT_REVOKED', 'CONSENT_ABSENT', 'CONSENT_EXPIRED', 'CONSENT_INACTIVE'].includes(event.eventType));
  const vcap = events.filter((event) => event.eventType.startsWith('VCAP_'));
  const hasData = events.length > 0;
  const state = hasData ? statusInfo('OK') : statusInfo('NO_DATA', 'No security events have been observed.');
  return {
      summary: {
      eventCount: hasData ? events.length : null,
      accessDeniedCount: hasData ? access.length : null,
      consentEventCount: hasData ? consent.length : null,
      vcapEventCount: hasData ? vcap.length : null,
      status: hasData && events.some((event) => event.mock) ? { ...state, mock: true } : state,
    },
    events: filterEventsForUser({ role: 'admin' }, events.slice(0, 100), config.authorization),
    status: hasData && events.some((event) => event.mock) ? { ...state, mock: true } : state,
    ...(hasData && events.some((event) => event.mock) ? { mockEventsCount: events.filter((event) => event.mock).length } : {}),
  };
}

function buildIpfsSummary(config) {
  const events = config.store.query({ eventTypes: ['IPFS_UPLOAD_COMPLETED', 'IPFS_UPLOAD_FAILED', 'IPFS_RESOLUTION_FAILED', 'IPFS_NODE_DOWN', 'IPFS_STATUS_CHANGED'], limit: 1000000 });
  const pollerState = config.healthPoller?.states?.get('ipfs-service');
  const target = (!pollerState || pollerState.status === 'NOT_CONFIGURED')
    ? mockHealthStatus(events, 'ipfs-service', ['IPFS_STATUS_CHANGED', 'IPFS_NODE_DOWN']) || healthTargetStatus(config, 'ipfs-service')
    : healthTargetStatus(config, 'ipfs-service');
  const hasData = events.length > 0;
  return {
    status: target,
    metrics: {
      uploads: hasData ? events.filter((event) => event.eventType === 'IPFS_UPLOAD_COMPLETED').length : null,
      failures: hasData ? events.filter((event) => event.eventType === 'IPFS_UPLOAD_FAILED').length : null,
      cidResolutionFailures: hasData ? events.filter((event) => event.eventType === 'IPFS_RESOLUTION_FAILED').length : null,
      status: hasData ? statusInfo('OK', null, null, events.some((event) => event.mock)) : statusInfo('NO_DATA', 'No IPFS event producers have supplied counts.'),
      ...(hasData && events.some((event) => event.mock) ? { mockEventsCount: events.filter((event) => event.mock).length } : {}),
      storageUsage: { value: null, availability: 'DEFERRED', status: statusInfo('NOT_CONNECTED', 'The existing IPFS health endpoint does not expose storage usage.') },
    },
    events: filterEventsForUser({ role: 'admin' }, events.slice(0, 100), config.authorization),
  };
}

function safeEventMessage(event) {
  const agent = event.payload?.agentId ? ` for ${event.payload.agentId}` : '';
  const component = event.payload?.component ? `: ${event.payload.component}` : '';
  const reason = event.payload?.reasonCode ? ` (${event.payload.reasonCode})` : '';
  return `${event.eventType}${agent}${component}${reason}`;
}

module.exports = {
  createAggregationRouter,
  buildAgentSummary,
  buildIpfsSummary,
  buildNetwork,
  buildNetworkSummary,
  buildPeerSummary,
  buildSecuritySummary,
  eventsStatus,
  listPersistedAlerts,
  parseListFilters,
  requirePage,
};
