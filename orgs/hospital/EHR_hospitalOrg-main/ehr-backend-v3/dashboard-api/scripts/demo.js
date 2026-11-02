'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const { findRepositoryRoot } = require('../src/config');

const apiDirectory = path.resolve(__dirname, '..');
const apiEntry = path.join(apiDirectory, 'src/server.js');
const mockEntry = path.join(apiDirectory, 'scripts/mock-events.js');
const port = Number(process.env.DASHBOARD_DEMO_PORT || 4011);
const serviceKey = `demo-${require('node:crypto').randomBytes(24).toString('hex')}`;
const jwtSecret = `demo-jwt-${require('node:crypto').randomBytes(24).toString('hex')}`;
const labJwtSecret = `demo-lab-jwt-${require('node:crypto').randomBytes(24).toString('hex')}`;
const demoRunId = require('node:crypto').randomUUID();
const traceRunId = `mock-run-${demoRunId}`;
const baseUrl = `http://127.0.0.1:${port}`;
const repositoryRoot = findRepositoryRoot(apiDirectory);
const demoDataDirectory = path.relative(repositoryRoot, path.join(apiDirectory, '.demo', demoRunId, 'data'));
const topology = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'config/topology.json'), 'utf8'));
const authorization = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'config/authorization.json'), 'utf8'));
const disabledHealthTargets = Object.fromEntries(
  topology.healthTargets.filter((target) => target.urlEnv).map((target) => [target.urlEnv, '']),
);
let api;
let socket;

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForHealth(child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Dashboard API exited before becoming healthy.');
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await wait(250);
  }
  throw new Error('Dashboard API did not become healthy within 20 seconds.');
}

async function main() {
  api = spawn(process.execPath, [apiEntry], {
    cwd: apiDirectory,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      DASHBOARD_HOST: '127.0.0.1',
      DASHBOARD_SERVICE_KEY: serviceKey,
      DASHBOARD_ALLOW_MOCK: 'true',
      DASHBOARD_API_RATE_LIMIT: '10000',
      DASHBOARD_COLLECTOR_ENABLED: 'false',
      DASHBOARD_DATA_DIR: demoDataDirectory,
      JWT_SECRET: jwtSecret,
      DASHBOARD_JWT_SECRETS: `${jwtSecret},${labJwtSecret}`,
      ...disabledHealthTargets,
    },
  });
  api.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (/service_started|service_stopped|service_configuration_failed|service_start_failed/.test(line)) process.stdout.write(`${line}\n`);
    }
  });
  await waitForHealth(api);
  process.stdout.write(`Demo API ready at ${baseUrl}; waiting for mock stream events.\n`);

  const token = jwt.sign({
    userId: 'demo-admin', role: 'admin', mspId: 'HospitalMSP', peer: 'peer0.hospital',
  }, jwtSecret, { algorithm: 'HS256', expiresIn: '10m' });
  const ticketResponse = await fetch(`${baseUrl}/api/dashboard/stream-ticket`, {
    method: 'POST', headers: { authorization: `Bearer ${token}` },
  });
  if (!ticketResponse.ok) throw new Error(`Could not obtain a demo stream ticket (${ticketResponse.status}).`);
  const { ticket } = await ticketResponse.json();
  socket = new WebSocket(`ws://127.0.0.1:${port}/api/dashboard/ws?ticket=${encodeURIComponent(ticket)}`);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No mock events arrived within 10 seconds.')), 10000);
    socket.on('message', (raw) => {
      const event = JSON.parse(raw.toString());
      if (!event.mock) return;
      process.stdout.write(`Received ${event.eventType} (${event.eventId}) [MOCK]\n`);
      clearTimeout(timer);
      resolve(event);
    });
  });
  const mock = spawn(process.execPath, [mockEntry], {
    cwd: apiDirectory,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, DASHBOARD_SERVICE_KEY: serviceKey, DASHBOARD_DEMO_URL: baseUrl, DASHBOARD_MOCK_CORRELATION_ID: traceRunId },
  });
  const [firstEvent] = await Promise.all([received, new Promise((resolve, reject) => {
    mock.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Mock generator exited with ${code}.`)));
  })]);
  process.stdout.write(`Demo verified: live labelled event ${firstEvent.eventId} reached the WebSocket client.\n`);
  await verifyRoleRoutes();
}

async function verifyRoleRoutes() {
  const agentTargets = {
    doctor: ['peer1.hospital', 'clinical-agent', 'history-agent', 'governance-agent'],
    nurse: ['peer2.hospital'],
    pharmacist: ['peer2.hospital', 'pharmacy-agent'],
    labtechnician: ['peer0.diagnostic', 'lab-agent'],
    labsupervisor: ['peer0.diagnostic', 'lab-agent'],
    labadmin: ['peer0.diagnostic', 'lab-agent'],
    radiologist: ['peer0.diagnostic', 'lab-agent'],
  };
  const denied = ['patient', 'receptionist', 'patientService', 'medrecordofficer', 'labreceptionist', 'insuranceofficer', 'claimsauditor', 'billingofficer', 'unlisted'];
  const globals = ['/overview', '/network', '/peers', '/orderers', '/channels', '/transactions/metrics', '/transactions', '/security', '/security/events', '/ipfs', '/alerts', '/logs/events'];
  const tokenFor = (role) => jwt.sign({
    userId: `demo-${role}`, role,
    mspId: ['labtechnician', 'labsupervisor', 'labadmin', 'radiologist'].includes(role) ? 'DiagnosticsMSP' : 'HospitalMSP',
    peer: ['labtechnician', 'labsupervisor', 'labadmin', 'radiologist'].includes(role) ? 'peer0.diagnostic' : 'peer0.hospital',
  }, authorization.externalTokenRoles.includes(role) ? labJwtSecret : jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
  const alertsResponse = await fetch(`${baseUrl}/api/dashboard/alerts`, { headers: { authorization: `Bearer ${tokenFor('admin')}` } });
  const alertsBody = await alertsResponse.json();
  const alertId = alertsBody.data?.items?.[0]?.id;
  const ackUrl = alertId ? `/alerts/${encodeURIComponent(alertId)}/acknowledge` : '/alerts/mock-alert/acknowledge';
  const routes = [
    ...globals.map((url) => ({ url })),
    { url: '/agents' },
    ...Object.keys(agentTargets).flatMap((role) => agentTargets[role].flatMap((id) => [
      { url: `/agents/${id}` }, { url: `/agents/${id}/executions` }, { url: `/agents/${id}/metrics` },
    ])),
    { url: `/executions/${traceRunId}` }, { url: `/executions/${traceRunId}/trace` },
    { url: '/stream-ticket', method: 'POST' },
    { url: ackUrl, method: 'POST' },
  ];
  const uniqueRoutes = [...new Map(routes.map((route) => [`${route.method || 'GET'} ${route.url}`, route])).values()];
  for (const role of ['admin', ...Object.keys(agentTargets), ...denied]) {
    for (const route of uniqueRoutes) {
      const response = await fetch(`${baseUrl}/api/dashboard${route.url}`, {
        method: route.method || 'GET', headers: { authorization: `Bearer ${tokenFor(role)}` },
      });
      const isAdmin = role === 'admin';
      const isDenied = denied.includes(role);
      const isExecution = route.url.startsWith('/executions/');
      const isGlobal = globals.includes(route.url);
      const targetMatch = route.url.match(/^\/agents\/([^/]+)/);
      const permittedTarget = targetMatch && (isAdmin || (agentTargets[role] || []).includes(targetMatch[1]));
      const expected = isDenied ? 403
        : route.url === ackUrl ? (isAdmin && alertId ? 200 : isAdmin ? 404 : 403)
          : route.url === '/stream-ticket' ? 201
          : isAdmin ? 200 : route.url === '/agents' || route.url === '/stream-ticket' ? 200
            : isGlobal ? 403 : isExecution ? (role === 'doctor' ? 200 : 403) : permittedTarget ? 200 : 403;
      if (response.status !== expected) throw new Error(`Demo role check failed: ${role} ${route.method || 'GET'} ${route.url} expected ${expected}, received ${response.status}.`);
      if (expected === 200 && route.url !== '/stream-ticket') {
        const body = await response.json();
        if (body.success !== true || !Object.hasOwn(body, 'data')) throw new Error(`Demo response contract failed for ${role} ${route.url}.`);
        if (isAdmin && route.url === '/network' && (!body.data.peers.every((peer) => peer.status.mock === true) || !body.data.orderers.every((orderer) => orderer.status.mock === true))) {
          throw new Error('Demo network health data was not clearly marked as mock.');
        }
        if (isAdmin && route.url === '/ipfs' && body.data.status.mock !== true) throw new Error('Demo IPFS health data was not clearly marked as mock.');
        if (isAdmin && route.url === '/alerts' && body.data.items.length && body.data.items.some((alert) => alert.mock !== true)) {
          throw new Error('Demo alert data was not clearly marked as mock.');
        }
      }
    }
  }
  process.stdout.write(`Demo verified ${uniqueRoutes.length} real HTTP routes across the approved role matrix, with labelled mock events.\n`);
}

function shutdown() {
  socket?.close();
  api?.kill('SIGTERM');
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}).finally(shutdown);
