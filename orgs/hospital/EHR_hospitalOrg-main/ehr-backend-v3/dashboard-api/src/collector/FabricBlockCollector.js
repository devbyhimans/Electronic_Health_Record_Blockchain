'use strict';

const { normalizeFabricBlock } = require('../normalizer');

function computeStartBlock(checkpoint, height, backfillBlocks) {
  if (checkpoint !== null && checkpoint !== undefined) return BigInt(checkpoint) + 1n;
  const total = BigInt(height);
  const backfill = BigInt(backfillBlocks);
  return total > backfill ? total - backfill : 0n;
}

function retryDelayMs(attempt, random = Math.random, baseMs = 1000, maxMs = 30000) {
  const exponent = Math.min(30, Math.max(0, attempt));
  const capped = Math.min(maxMs, baseMs * (2 ** exponent));
  const jitter = 0.5 + Math.max(0, Math.min(1, random()));
  return Math.round(Math.min(maxMs, capped * jitter));
}

class FabricBlockCollector {
  constructor(options) {
    this.config = options.config;
    this.store = options.store;
    this.eventHub = options.eventHub;
    this.checkpoints = options.checkpointStore;
    this.connect = options.connect;
    this.wait = options.wait || ((milliseconds) => new Promise((resolve) => {
      this.waitTimer = setTimeout(resolve, milliseconds);
      this.waitTimer.unref?.();
      this.wakeWait = resolve;
    }));
    this.random = options.random || Math.random;
    this.status = this.config.enabled ? 'NOT_CONNECTED' : 'DISABLED';
    this.lastProcessedBlock = null;
    this.activeClient = null;
    this.activeStream = null;
    this.closed = false;
    this.loopPromise = null;
  }

  start() {
    if (!this.config.enabled || this.loopPromise) return;
    this.closed = false;
    this.loopPromise = this._runLoop();
  }

  async _runLoop() {
    let attempt = 0;
    while (!this.closed) {
      try {
        this.status = 'CONNECTING';
        const client = await this.connect(this.config.fabric);
        this.activeClient = client;
        const checkpoint = await this.checkpoints.load();
        const startBlock = checkpoint
          ? BigInt(checkpoint.lastProcessedBlock) + 1n
          : computeStartBlock(null, await client.getCurrentHeight(), this.config.backfillBlocks);
        const stream = await client.getBlockEvents(startBlock);
        this.activeStream = stream;
        this.status = 'CONNECTED';
        attempt = 0;
        for await (const block of stream) {
          if (this.closed) break;
          await this.processBlock(block);
        }
        if (!this.closed) throw new Error('Fabric block stream ended');
      } catch {
        if (!this.closed) this.status = 'NOT_CONNECTED';
      } finally {
        this.activeStream?.close?.();
        this.activeStream = null;
        this.activeClient?.close?.();
        this.activeClient = null;
      }
      if (!this.closed) {
        await this.wait(retryDelayMs(attempt, this.random));
        attempt += 1;
      }
    }
  }

  async processBlock(block) {
    const blockNumber = BigInt(block.getHeader().getNumber().toString());
    const events = normalizeFabricBlock(block, {
      channel: this.config.fabric.channel,
      organizations: this.config.fabric.organizations,
    });
    for (const event of events) {
      const result = await this.store.append(event);
      if (result.accepted) this.eventHub.publish(event);
    }
    await this.checkpoints.save(blockNumber);
    this.lastProcessedBlock = blockNumber.toString();
  }

  getStatus() {
    return { status: this.status, lastProcessedBlock: this.lastProcessedBlock };
  }

  async close() {
    if (this.closed) return this.loopPromise;
    this.closed = true;
    this.activeStream?.close?.();
    this.activeClient?.close?.();
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.wakeWait?.();
    await this.loopPromise;
  }
}

module.exports = { FabricBlockCollector, computeStartBlock, retryDelayMs };
