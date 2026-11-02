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
  const topology = resolveTopologyEndpoints(readJson(topologyPath, 'topology'));
  const authorization = readJson(authorizationPath, 'authorization');
  if (authorization.default !== 'deny' || !authorization.roles || typeof authorization.roles !== 'object') {
    throw new Error('Authorization configuration must define a role map with default deny');
  }
  const port = Number(process.env.PORT || 4010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');

  return Object.freeze({
    repoRoot,
    port,
    host: process.env.DASHBOARD_HOST || '0.0.0.0',
    topology,
    authorization,
    topologyPath: path.relative(repoRoot, topologyPath),
    authorizationPath: path.relative(repoRoot, authorizationPath),
  });
}

module.exports = {
  findRepositoryRoot,
  loadConfig,
  loadDashboardEnv,
  resolveRepositoryFile,
  resolveTopologyEndpoints,
};
