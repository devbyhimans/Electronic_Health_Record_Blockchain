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
const demoRunId = require('node:crypto').randomUUID();
const baseUrl = `http://127.0.0.1:${port}`;
const repositoryRoot = findRepositoryRoot(apiDirectory);
const demoDataDirectory = path.relative(repositoryRoot, path.join(apiDirectory, '.demo', demoRunId, 'data'));
const topology = JSON.parse(fs.readFileSync(path.join(apiDirectory, 'config/topology.json'), 'utf8'));
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
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      DASHBOARD_HOST: '127.0.0.1',
      DASHBOARD_SERVICE_KEY: serviceKey,
      DASHBOARD_ALLOW_MOCK: 'true',
      DASHBOARD_COLLECTOR_ENABLED: 'false',
      DASHBOARD_DATA_DIR: demoDataDirectory,
      JWT_SECRET: jwtSecret,
      DASHBOARD_JWT_SECRETS: jwtSecret,
      ...disabledHealthTargets,
    },
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
    env: { ...process.env, DASHBOARD_SERVICE_KEY: serviceKey, DASHBOARD_DEMO_URL: baseUrl },
  });
  const [firstEvent] = await Promise.all([received, new Promise((resolve, reject) => {
    mock.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Mock generator exited with ${code}.`)));
  })]);
  process.stdout.write(`Demo verified: live labelled event ${firstEvent.eventId} reached the WebSocket client.\n`);
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
