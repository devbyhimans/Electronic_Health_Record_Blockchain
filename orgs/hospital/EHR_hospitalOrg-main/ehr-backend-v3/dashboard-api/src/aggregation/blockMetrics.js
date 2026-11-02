'use strict';

const WINDOWS = Object.freeze({ '24h': { durationMs: 24 * 60 * 60 * 1000, unitMs: 60 * 60 * 1000, label: 'hour' }, '7d': { durationMs: 7 * 24 * 60 * 60 * 1000, unitMs: 24 * 60 * 60 * 1000, label: 'day' }, '30d': { durationMs: 30 * 24 * 60 * 60 * 1000, unitMs: 24 * 60 * 60 * 1000, label: 'day' } });
const BLOCK_TRANSACTION_TYPES = new Set(['TRANSACTION_COMMITTED', 'TRANSACTION_FAILED', 'MVCC_CONFLICT', 'ENDORSEMENT_FAILED']);

function bucketStart(timestamp, unitMs) { return Math.floor(timestamp / unitMs) * unitMs; }

function buildBlockMetrics(events, { window = '24h', collectorStatus = null, now = Date.now() } = {}) {
  const spec = WINDOWS[window];
  if (!spec) throw new TypeError('window must be 24h, 7d, or 30d.');
  const lowerBound = now - spec.durationMs;
  const byBlock = new Map();
  const retained = events.filter((event) => BLOCK_TRANSACTION_TYPES.has(event.eventType)
    && Number.isSafeInteger(event.blockNumber) && event.blockNumber >= 0
    && typeof event.txId === 'string' && Number.isFinite(Date.parse(event.timestamp))
    && Date.parse(event.timestamp) >= lowerBound && Date.parse(event.timestamp) <= now);

  for (const event of retained) {
    const blockKey = String(event.blockNumber);
    if (!byBlock.has(blockKey)) byBlock.set(blockKey, { blockNumber: event.blockNumber, transactions: new Set(), firstTimestamp: Date.parse(event.timestamp) });
    const block = byBlock.get(blockKey);
    block.transactions.add(event.txId);
    block.firstTimestamp = Math.min(block.firstTimestamp, Date.parse(event.timestamp));
  }

  const blocks = [...byBlock.values()].sort((a, b) => a.blockNumber - b.blockNumber);
  const seriesMap = new Map();
  for (const block of blocks) {
    const start = bucketStart(block.firstTimestamp, spec.unitMs);
    if (!seriesMap.has(start)) seriesMap.set(start, { timestamp: new Date(start).toISOString(), blocks: new Set(), transactions: 0 });
    const bucket = seriesMap.get(start);
    bucket.blocks.add(block.blockNumber);
    bucket.transactions += block.transactions.size;
  }
  const series = [...seriesMap.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map((bucket) => ({
    timestamp: bucket.timestamp,
    blocks: bucket.blocks.size,
    transactions: bucket.transactions,
  }));

  const lastProcessedBlock = collectorStatus?.lastProcessedBlock;
  const hasHeight = collectorStatus?.status === 'CONNECTED' && /^(0|[1-9]\d*)$/.test(String(lastProcessedBlock));
  const latestBlock = blocks.at(-1) || null;
  return {
    window,
    bucket: spec.label,
    totalLedgerBlocks: hasHeight ? (BigInt(lastProcessedBlock) + 1n).toString() : null,
    latestProcessedBlock: hasHeight ? String(lastProcessedBlock) : null,
    transactionsInLatestObservedBlock: latestBlock ? latestBlock.transactions.size : null,
    observedBlocksInWindow: blocks.length || null,
    transactionsInWindow: blocks.reduce((total, block) => total + block.transactions.size, 0) || null,
    coverageStart: series[0]?.timestamp || null,
    history: series,
    status: blocks.length ? { state: 'OK', reason: 'Counts use retained committed-block transaction metadata; blocks with no observed transactions are not represented in the daily series.' }
      : { state: 'NO_DATA', reason: collectorStatus?.status === 'CONNECTED' ? 'No retained Fabric transaction events exist in this window.' : 'Fabric block collector is not connected; live block metrics are unavailable.' },
  };
}

module.exports = { buildBlockMetrics, WINDOWS };
