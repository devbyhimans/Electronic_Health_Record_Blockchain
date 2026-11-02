'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { NdjsonEventStore, CURRENT_LOG } = require('../src/store/NdjsonEventStore');

async function makeStore(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ehr-dashboard-store-'));
  t.after(async () => fs.rm(directory, { recursive: true, force: true }));
  const store = await NdjsonEventStore.open({ directory, ...options });
  t.after(() => store.close());
  return { store, directory };
}

function makeEvent(number, fields = {}) {
  const event = {
    schemaVersion: 1,
    eventId: `evt-store-${number}`,
    eventType: 'AGENT_EXECUTION_COMPLETED',
    timestamp: new Date(Date.UTC(2026, 10, 3, 10, 0, number % 60)).toISOString(),
    source: 'dashboard-store-test',
    org: 'HospitalMSP',
    severity: 'INFO',
    payload: { agentId: 'clinical-agent', durationMs: number },
    ...fields,
  };
  return event;
}

test('deduplicates eventId and transaction plus event type, with transaction lookup', async (t) => {
  const { store } = await makeStore(t);
  const first = makeEvent(1, { txId: 'tx-store-1' });
  const sameEventId = { ...first, eventId: 'evt-store-other' };
  const sameTxAndType = { ...first, eventId: 'evt-store-third' };
  const differentTypeSameTx = { ...first, eventId: 'evt-store-fourth', eventType: 'TRANSACTION_COMMITTED' };

  assert.equal((await store.append(first)).accepted, true);
  assert.equal((await store.append({ ...first })).duplicate, true);
  assert.equal((await store.append(sameEventId)).duplicate, true);
  assert.equal((await store.append(sameTxAndType)).duplicate, true);
  assert.equal((await store.append(differentTypeSameTx)).accepted, true);
  assert.equal(store.query({ txId: 'tx-store-1' }).length, 2);
  assert.equal(Object.isFrozen(store.getById(first.eventId)), true);
  assert.equal(Object.isFrozen(store.getById(first.eventId).payload), true);
});

test('recovers committed lines and skips corrupted or partial tail lines after a crash', async (t) => {
  const { store, directory } = await makeStore(t);
  await store.append(makeEvent(1));
  await store.close();
  const crash = spawnSync(process.execPath, ['-e',
    "require('node:fs').appendFileSync(process.argv[1], 'not-json\\n{\\\"schemaVersion\\\":'); process.exit(23);",
    path.join(directory, CURRENT_LOG),
  ], { encoding: 'utf8' });
  assert.equal(crash.status, 23);

  const recovered = await NdjsonEventStore.open({ directory });
  t.after(() => recovered.close());
  assert.equal(recovered.getById('evt-store-1').eventId, 'evt-store-1');
  assert.equal(recovered.getStats().corruptLinesSkipped, 2);
  assert.equal((await recovered.append(makeEvent(2))).accepted, true);
  await recovered.close();

  const restarted = await NdjsonEventStore.open({ directory });
  t.after(() => restarted.close());
  assert.equal(restarted.getStats().eventCount, 2);
  assert.equal(restarted.getById('evt-store-2').eventId, 'evt-store-2');
  assert.equal((await restarted.append(makeEvent(1))).duplicate, true);
});

test('rejects invalid or zero-PHI events before writing them', async (t) => {
  const { store } = await makeStore(t);
  const unsafe = makeEvent(1, { payload: { patientId: 'PAT-123' } });
  await assert.rejects(store.append(unsafe), { code: 'INVALID_EVENT' });
  assert.equal(store.getStats().eventCount, 0);
  assert.equal(store.getStats().currentFileBytes, 0);
});

test('serializes concurrent appends and keeps indexes consistent', async (t) => {
  const { store } = await makeStore(t);
  const events = Array.from({ length: 80 }, (_, index) => makeEvent(index));
  const results = await Promise.all(events.map((event) => store.append(event)));
  assert.equal(results.filter((result) => result.accepted).length, 80);
  assert.equal(store.getStats().eventCount, 80);
  assert.equal(store.query({ org: 'HospitalMSP', agentId: 'clinical-agent', limit: 1000 }).length, 80);
});

test('rotates logs, prunes old archives, and recovers only retained events', async (t) => {
  const { store, directory } = await makeStore(t, { maxFileBytes: 1024, maxFiles: 2 });
  for (let index = 0; index < 30; index += 1) {
    await store.append(makeEvent(index, { txId: `tx-${index}` }));
  }
  const names = await fs.readdir(directory);
  const archives = names.filter((name) => /^events\.\d{8}\.ndjson$/.test(name));
  assert.ok(archives.length <= 2);
  assert.ok(names.includes(CURRENT_LOG));
  assert.ok(store.getStats().eventCount < 30);
  await store.close();

  const recovered = await NdjsonEventStore.open({ directory, maxFileBytes: 1024, maxFiles: 2 });
  t.after(() => recovered.close());
  assert.equal(recovered.getStats().eventCount, store.getStats().eventCount);
});

test('handles a larger event batch and reports write and indexed-query timings', async (t) => {
  const { store } = await makeStore(t, { maxFileBytes: 16 * 1024 * 1024, maxFiles: 2 });
  const events = Array.from({ length: 1000 }, (_, index) => makeEvent(index));
  const writeStarted = performance.now();
  const results = await store.appendMany(events);
  const writeMs = performance.now() - writeStarted;
  const queryStarted = performance.now();
  const selected = store.query({ eventType: 'AGENT_EXECUTION_COMPLETED', agentId: 'clinical-agent', limit: 1000 });
  const queryMs = performance.now() - queryStarted;

  assert.equal(results.length, 1000);
  assert.equal(results.filter((result) => result.accepted).length, 1000);
  assert.equal(selected.length, 1000);
  console.log(`Store volume: 1000 events written in ${writeMs.toFixed(1)} ms; indexed query in ${queryMs.toFixed(1)} ms.`);
});
