'use strict';

const fs = require('node:fs');
const path = require('node:path');

function findRepositoryRoot(startDirectory) {
  let current = path.resolve(startDirectory);
  while (true) {
    if (fs.existsSync(path.join(current, 'README.md')) && fs.existsSync(path.join(current, 'orgs'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error('Could not locate repository root');
    current = parent;
  }
}

function loadDashboardEnv(filePath = path.resolve(__dirname, '../.env'), environment = process.env) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || environment[name] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    environment[name] = value;
  }
}

function resolveRepositoryFile(root, environmentName, fallback) {
  const configured = process.env[environmentName] || fallback;
  if (path.isAbsolute(configured)) throw new Error(`${environmentName} must be a repository-relative path`);
  const resolved = path.resolve(root, configured);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${environmentName} must stay within the repository`);
  }
  return resolved;
}

function resolveDataDirectory(root, environment = process.env) {
  const configured = environment.DASHBOARD_DATA_DIR ||
    'orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/data';
  if (path.isAbsolute(configured)) throw new Error('DASHBOARD_DATA_DIR must be repository-relative');
  const resolved = path.resolve(root, configured);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('DASHBOARD_DATA_DIR must stay within the repository');
  }
  const apiDirectory = path.resolve(__dirname, '..');
  const apiRelative = path.relative(apiDirectory, resolved);
  if (apiRelative.startsWith('..') || path.isAbsolute(apiRelative) || path.basename(resolved) !== 'data') {
    throw new Error('DASHBOARD_DATA_DIR must be a directory named data under dashboard-api');
  }
  return resolved;
}

function resolveCredentialPath(root, value, label) {
  if (!value) return null;
  if (path.isAbsolute(value)) throw new Error(`${label} must be repository-relative`);
  const resolved = path.resolve(root, value);
  const relative = path.relative(root, resolved);
  const credentialsDirectory = path.resolve(__dirname, '..', 'credentials');
  const credentialRelative = path.relative(credentialsDirectory, resolved);
  const repoCredentialRelative = path.relative(path.resolve(root, 'orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/credentials'), resolved);
  const isUnderCredentials = (!credentialRelative.startsWith('..') && !path.isAbsolute(credentialRelative)) ||
                             (!repoCredentialRelative.startsWith('..') && !path.isAbsolute(repoCredentialRelative));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !isUnderCredentials) {
    throw new Error(`${label} must be under dashboard-api/credentials`);
  }
  return resolved;
}

function positiveInteger(environment, name, fallback, minimum = 1, maximum = 1000000) {
  const value = Number(environment[name] || fallback);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (cause) {
    throw new Error(`Could not load ${label} configuration`, { cause });
  }
}

function resolveTopologyEndpoints(topology, environment = process.env) {
  const resolveItems = (items = []) => items.map((item) => {
    const endpoint = environment[item.endpointEnv] || null;
    if (endpoint && !/^[A-Za-z0-9.-]+:\d{1,5}$/.test(endpoint)) {
      throw new Error(`Invalid endpoint in ${item.endpointEnv}`);
    }
    return { ...item, endpoint, status: endpoint ? 'not_connected' : 'not_configured' };
  });
  return {
    ...topology,
    peers: resolveItems(topology.peers),
    orderers: resolveItems(topology.orderers),
    healthTargets: (topology.healthTargets || []).map((target) => {
      const url = target.urlEnv ? environment[target.urlEnv] || null : null;
      if (url) {
        let parsed;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error(`Invalid URL in ${target.urlEnv}`);
        }
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
          throw new Error(`Invalid URL in ${target.urlEnv}`);
        }
      }
      return { ...target, url, status: url ? 'NOT_CHECKED' : 'NOT_CONFIGURED' };
    }),
  };
}

function loadConfig() {
  loadDashboardEnv();
  if (String(process.env.DASHBOARD_AUTH_STUB || 'false').toLowerCase() === 'true') {
    throw new Error('DASHBOARD_AUTH_STUB is not supported in Phase 1; authentication always fails closed');
  }
  const repoRoot = findRepositoryRoot(__dirname);
  const defaultConfigBase = 'orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/config';
  const topologyPath = resolveRepositoryFile(
    repoRoot,
    'DASHBOARD_TOPOLOGY_CONFIG',
    `${defaultConfigBase}/topology.json`,
  );
  const authorizationPath = resolveRepositoryFile(
    repoRoot,
    'DASHBOARD_AUTHZ_CONFIG',
    `${defaultConfigBase}/authorization.json`,
  );
  const thresholdsPath = resolveRepositoryFile(
    repoRoot,
    'DASHBOARD_THRESHOLDS_CONFIG',
    `${defaultConfigBase}/thresholds.json`,
  );
  const topology = resolveTopologyEndpoints(readJson(topologyPath, 'topology'));
  const authorization = readJson(authorizationPath, 'authorization');
  const thresholds = readJson(thresholdsPath, 'alert thresholds');
  if (!thresholds || thresholds.version !== 1 || !thresholds.rules || typeof thresholds.rules !== 'object') {
    throw new Error('Alert thresholds must define version 1 and a rule map');
  }
  for (const [ruleId, rule] of Object.entries(thresholds.rules)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(ruleId) || !['CRITICAL', 'HIGH', 'WARNING'].includes(rule.severity) || typeof rule.enabled !== 'boolean') {
      throw new Error(`Invalid alert rule configuration: ${ruleId}`);
    }
    for (const [field, value] of Object.entries(rule)) {
      if (['latencyMs', 'failureRate', 'mvccRate', 'count', 'ledgerLagBlocks'].includes(field) &&
          (!Number.isFinite(value) || value < 0 || (['failureRate', 'mvccRate'].includes(field) && value > 1) || (field === 'count' && !Number.isInteger(value)))) {
        throw new Error(`Invalid ${field} threshold in alert rule ${ruleId}`);
      }
    }
  }
  if (authorization.default !== 'deny' || !authorization.roles || typeof authorization.roles !== 'object') {
    throw new Error('Authorization configuration must define a role map with default deny');
  }
  const port = Number(process.env.PORT || 4010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const storeMaxFileBytes = Number(process.env.DASHBOARD_STORE_MAX_FILE_BYTES || 10485760);
  if (!Number.isSafeInteger(storeMaxFileBytes) || storeMaxFileBytes < 1024) {
    throw new Error('DASHBOARD_STORE_MAX_FILE_BYTES must be an integer of at least 1024');
  }
  const storeMaxFiles = Number(process.env.DASHBOARD_STORE_MAX_FILES || 5);
  if (!Number.isSafeInteger(storeMaxFiles) || storeMaxFiles < 1 || storeMaxFiles > 1000) {
    throw new Error('DASHBOARD_STORE_MAX_FILES must be an integer from 1 to 1000');
  }
  const collectorEnabled = String(process.env.DASHBOARD_COLLECTOR_ENABLED || 'true').toLowerCase() !== 'false';
  const requestedFabricPeerId = process.env.DASHBOARD_FABRIC_PEER_ID;
  const requestedFabricPeer = requestedFabricPeerId
    ? topology.peers.find((peer) => peer.id === requestedFabricPeerId)
    : null;
  if (requestedFabricPeerId && !requestedFabricPeer) {
    throw new Error('DASHBOARD_FABRIC_PEER_ID must match a peer in the topology configuration');
  }
  const collectorPeer = requestedFabricPeer ||
    topology.peers.find((peer) => peer.mspId === topology.organizations.find((org) => org.role === 'hospital')?.id) ||
    topology.peers[0];
  const healthPollIntervalMs = positiveInteger(process.env, 'DASHBOARD_HEALTH_INTERVAL_MS', 15000, 1000, 3600000);
  const healthTimeoutMs = positiveInteger(process.env, 'DASHBOARD_HEALTH_TIMEOUT_MS', 3000, 100, 60000);
  const healthFailureThreshold = positiveInteger(process.env, 'DASHBOARD_HEALTH_FAILURE_THRESHOLD', 3, 1, 100);
  const healthConcurrency = positiveInteger(process.env, 'DASHBOARD_HEALTH_MAX_CONCURRENCY', 4, 1, 32);
  const heartbeatIntervalMs = positiveInteger(process.env, 'DASHBOARD_AGENT_HEARTBEAT_INTERVAL_MS', 15000, 1000, 3600000);
  const heartbeatMissedIntervals = positiveInteger(process.env, 'DASHBOARD_AGENT_MISSED_INTERVALS', 3, 1, 100);
  const collectorBackfillBlocks = positiveInteger(process.env, 'COLLECTOR_BACKFILL_BLOCKS', 200, 1, 100000);
  const collectorConnectTimeoutMs = positiveInteger(process.env, 'DASHBOARD_FABRIC_CONNECT_TIMEOUT_MS', 5000, 100, 60000);
  const maxStreamClients = positiveInteger(process.env, 'DASHBOARD_STREAM_MAX_CLIENTS', 500, 1, 10000);
  const maxStreamBufferBytes = positiveInteger(process.env, 'DASHBOARD_STREAM_MAX_BUFFER_BYTES', 1048576, 1024, 67108864);
  const streamHeartbeatMs = positiveInteger(process.env, 'DASHBOARD_STREAM_HEARTBEAT_MS', 20000, 1000, 3600000);
  const streamReplayLimit = positiveInteger(process.env, 'DASHBOARD_STREAM_REPLAY_LIMIT', 200, 1, 1000);
  const ingestMaxBodyBytes = positiveInteger(process.env, 'DASHBOARD_INGEST_MAX_BODY_BYTES', 1048576, 1024, 16777216);
  const ingestMaxBatchSize = positiveInteger(process.env, 'DASHBOARD_INGEST_MAX_BATCH_SIZE', 100, 1, 1000);
  const apiRateLimit = positiveInteger(process.env, 'DASHBOARD_API_RATE_LIMIT', 600, 1, 100000);
  const alertEvaluationIntervalMs = positiveInteger(process.env, 'DASHBOARD_ALERT_EVALUATION_INTERVAL_MS', thresholds.evaluationIntervalMs ?? 5000, 1000, 3600000);
  const alertMinimumDurationMs = positiveInteger(process.env, 'DASHBOARD_ALERT_MINIMUM_DURATION_MS', thresholds.minimumDurationMs ?? 10000, 0, 3600000);
  const alertResolveDurationMs = positiveInteger(process.env, 'DASHBOARD_ALERT_RESOLVE_DURATION_MS', thresholds.resolveDurationMs ?? 10000, 0, 3600000);
  const corsAllowedOrigins = (process.env.DASHBOARD_CORS_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of corsAllowedOrigins) {
    let parsed;
    try { parsed = new URL(origin); } catch { throw new Error('DASHBOARD_CORS_ALLOWED_ORIGINS contains an invalid origin'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error('DASHBOARD_CORS_ALLOWED_ORIGINS entries must be exact HTTP(S) origins');
    }
  }
  const fabricMsp = topology.organizations.find((org) => org.role === 'hospital')?.id || '';

  return Object.freeze({
    repoRoot,
    port,
    host: process.env.DASHBOARD_HOST || '0.0.0.0',
    dataDir: resolveDataDirectory(repoRoot),
    storeMaxFileBytes,
    storeMaxFiles,
    collectorEnabled,
    collectorBackfillBlocks,
    collectorConnectTimeoutMs,
    fabric: {
      endpoint: process.env.DASHBOARD_FABRIC_GATEWAY_ENDPOINT || collectorPeer?.endpoint || null,
      peerId: collectorPeer?.id || null,
      hostAlias: process.env.DASHBOARD_FABRIC_PEER_HOST_ALIAS || '',
      tlsRootCertPath: resolveCredentialPath(repoRoot, process.env.DASHBOARD_FABRIC_TLS_ROOT_CERT_PATH, 'DASHBOARD_FABRIC_TLS_ROOT_CERT_PATH'),
      tlsClientCertPath: resolveCredentialPath(repoRoot, process.env.DASHBOARD_FABRIC_TLS_CLIENT_CERT_PATH, 'DASHBOARD_FABRIC_TLS_CLIENT_CERT_PATH'),
      tlsClientKeyPath: resolveCredentialPath(repoRoot, process.env.DASHBOARD_FABRIC_TLS_CLIENT_KEY_PATH, 'DASHBOARD_FABRIC_TLS_CLIENT_KEY_PATH'),
      identityCertPath: resolveCredentialPath(repoRoot, process.env.DASHBOARD_FABRIC_IDENTITY_CERT_PATH, 'DASHBOARD_FABRIC_IDENTITY_CERT_PATH'),
      identityKeyPath: resolveCredentialPath(repoRoot, process.env.DASHBOARD_FABRIC_IDENTITY_KEY_PATH, 'DASHBOARD_FABRIC_IDENTITY_KEY_PATH'),
      mspId: process.env.DASHBOARD_FABRIC_MSP_ID || fabricMsp,
      channel: process.env.DASHBOARD_FABRIC_CHANNEL || topology.channel,
      chaincode: process.env.DASHBOARD_FABRIC_CHAINCODE || topology.chaincode,
      organizations: topology.organizations.map((organization) => organization.id),
    },
    health: {
      intervalMs: healthPollIntervalMs,
      timeoutMs: healthTimeoutMs,
      failureThreshold: healthFailureThreshold,
      concurrency: healthConcurrency,
      heartbeatIntervalMs,
      heartbeatMissedIntervals,
    },
    allowMock: String(process.env.DASHBOARD_ALLOW_MOCK || 'false').toLowerCase() === 'true',
    serviceKey: process.env.DASHBOARD_SERVICE_KEY || '',
    ingestRateLimit: positiveInteger(process.env, 'DASHBOARD_INGEST_RATE_LIMIT', 300, 1, 100000),
    apiRateLimit,
    ingestMaxBodyBytes,
    ingestMaxBatchSize,
    stream: {
      maxClients: maxStreamClients,
      maxBufferBytes: maxStreamBufferBytes,
      heartbeatMs: streamHeartbeatMs,
      replayLimit: streamReplayLimit,
    },
    alertThresholds: {
      ...thresholds,
      evaluationIntervalMs: alertEvaluationIntervalMs,
      minimumDurationMs: alertMinimumDurationMs,
      resolveDurationMs: alertResolveDurationMs,
    },
    corsAllowedOrigins,
    topology,
    authorization,
    topologyPath: path.relative(repoRoot, topologyPath),
    authorizationPath: path.relative(repoRoot, authorizationPath),
    thresholdsPath: path.relative(repoRoot, thresholdsPath),
  });
}

module.exports = {
  findRepositoryRoot,
  loadConfig,
  loadDashboardEnv,
  resolveRepositoryFile,
  resolveDataDirectory,
  resolveCredentialPath,
  positiveInteger,
  resolveTopologyEndpoints,
};
