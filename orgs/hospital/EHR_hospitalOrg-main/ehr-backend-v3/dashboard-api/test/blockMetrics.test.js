'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBlockMetrics } = require('../src/aggregation/blockMetrics');

function tx(eventId, txId, blockNumber, timestamp, eventType = 'TRANSACTION_COMMITTED') {
  return { eventId, txId, blockNumber, timestamp: new Date(timestamp).toISOString(), eventType };
}

test('block metrics deduplicate transaction outcomes and produce timestamped hourly buckets', () => {
  const now = Date.UTC(2026, 10, 3, 12);
  const events = [
    tx('a', 'tx-1', 100, now - 90 * 60 * 1000),
    tx('b', 'tx-1', 100, now - 90 * 60 * 1000, 'TRANSACTION_FAILED'),
    tx('c', 'tx-2', 101, now - 20 * 60 * 1000, 'TRANSACTION_FAILED'),
    tx('old', 'tx-old', 1, now - 48 * 60 * 60 * 1000),
    { eventId: 'bad', txId: 'bad', blockNumber: '102', timestamp: new Date(now).toISOString(), eventType: 'TRANSACTION_COMMITTED' },
  ];
  const result = buildBlockMetrics(events, { window: '24h', now, collectorStatus: { status: 'CONNECTED', lastProcessedBlock: '105' } });
  assert.equal(result.totalLedgerBlocks, '106');
  assert.equal(result.latestProcessedBlock, '105');
  assert.equal(result.transactionsInLatestObservedBlock, 1);
  assert.equal(result.observedBlocksInWindow, 2);
  assert.equal(result.transactionsInWindow, 2);
  assert.deepEqual(result.history, [
    { timestamp: new Date(Date.UTC(2026, 10, 3, 10)).toISOString(), blocks: 1, transactions: 1 },
    { timestamp: new Date(Date.UTC(2026, 10, 3, 11)).toISOString(), blocks: 1, transactions: 1 },
  ]);
});

test('block metrics return unavailable rather than synthetic zeros without retained real events', () => {
  const result = buildBlockMetrics([], { window: '7d', collectorStatus: { status: 'NOT_CONNECTED', lastProcessedBlock: null } });
  assert.equal(result.totalLedgerBlocks, null);
  assert.equal(result.transactionsInWindow, null);
  assert.deepEqual(result.history, []);
  assert.equal(result.status.state, 'NO_DATA');
});

test('block metrics support all time window and retain blocks metadata', () => {
  const now = Date.UTC(2026, 10, 3, 12);
  const events = [
    tx('a', 'tx-1', 100, now - 90 * 60 * 1000),
    tx('old', 'tx-old', 1, now - 48 * 60 * 60 * 1000),
  ];
  const recentBlocks = [
    { blockNumber: 100, blockHash: 'hash100', timestamp: new Date(now - 90 * 60 * 1000).toISOString() },
    { blockNumber: 1, blockHash: 'hash1', timestamp: new Date(now - 48 * 60 * 60 * 1000).toISOString() },
  ];
  const result = buildBlockMetrics(events, { window: 'all', now, recentBlocks, collectorStatus: { status: 'CONNECTED', lastProcessedBlock: '100' } });
  assert.equal(result.observedBlocksInWindow, 2);
  assert.equal(result.transactionsInWindow, 2);
  assert.equal(result.blocks.length, 2);
  assert.equal(result.blocks[0].blockHash, 'hash100');
});

test('block metrics reject unsupported windows', () => {
  assert.throws(() => buildBlockMetrics([], { window: '1y' }), /window must be/);
});
