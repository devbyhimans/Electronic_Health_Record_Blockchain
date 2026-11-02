'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const authorization = require('../config/authorization.json');

test('health response reports dependencies as not connected without fabricated metrics', async () => {
  const app = createApp({ authorization });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      service: 'dashboard-api',
      status: 'UP',
      dependencies: { fabric: 'NOT_CONNECTED', store: 'NOT_CONNECTED', healthPoller: 'NOT_CONNECTED' },
      collector: { status: 'NOT_CONNECTED', lastProcessedBlock: null },
      healthPoller: { status: 'NOT_CONNECTED', targets: {} },
      agents: { observedAgents: 0, offlineAgents: 0, pendingExecutions: 0 },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('health reports the injected EventStore as connected', async () => {
  const app = createApp({ authorization, store: {} });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).dependencies.store, 'CONNECTED');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('unknown routes retain the existing API error shape', async () => {
  const app = createApp({ authorization });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/missing`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { success: false, error: 'Not found: GET /missing' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
