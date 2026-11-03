'use strict';

const crypto = require('node:crypto');
const { common } = require('@hyperledger/fabric-protos');
const { normalizeFabricBlock } = require('../normalizer');

function encodeInteger(num) {
  let hex = BigInt(num).toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const buf = Buffer.from(hex, 'hex');
  if (buf[0] & 0x80) {
    return Buffer.concat([Buffer.from([0x02, buf.length + 1, 0x00]), buf]);
  }
  return Buffer.concat([Buffer.from([0x02, buf.length]), buf]);
}

function encodeOctetString(buf) {
  return Buffer.concat([Buffer.from([0x04, buf.length]), buf]);
}

function calculateBlockHash(header) {
  if (!header || typeof header.getNumber !== 'function') return '';
  try {
    const numberBuf = encodeInteger(header.getNumber());
    const prevBytes = typeof header.getPreviousHash_asU8 === 'function' ? header.getPreviousHash_asU8() : (header.getPreviousHash?.() || []);
    const dataBytes = typeof header.getDataHash_asU8 === 'function' ? header.getDataHash_asU8() : (header.getDataHash?.() || []);
    const prevHashBuf = encodeOctetString(Buffer.from(prevBytes || []));
    const dataHashBuf = encodeOctetString(Buffer.from(dataBytes || []));
    const body = Buffer.concat([numberBuf, prevHashBuf, dataHashBuf]);
    const seq = Buffer.concat([Buffer.from([0x30, body.length]), body]);
    return crypto.createHash('sha256').update(seq).digest('hex');
  } catch {
    return '';
  }
}

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
    this.recentBlocks = new Map();
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

  extractBlockSummary(block) {
    const header = block?.getHeader?.() || null;
    if (!header) return null;
    try {
      const blockNumber = Number(header.getNumber());
      const blockHash = calculateBlockHash(header);
      const prevBytes = typeof header.getPreviousHash_asU8 === 'function' ? header.getPreviousHash_asU8() : (header.getPreviousHash?.() || []);
      const dataBytes = typeof header.getDataHash_asU8 === 'function' ? header.getDataHash_asU8() : (header.getDataHash?.() || []);
      const previousHash = Buffer.from(prevBytes || []).toString('hex');
      const dataHash = Buffer.from(dataBytes || []).toString('hex');

      let blockTime = null;
      const txIds = [];
      const envelopes = block.getData?.()?.getDataList_asU8?.() || [];
      for (const envBytes of envelopes) {
        try {
          const env = common.Envelope.deserializeBinary(envBytes);
          const pl = common.Payload.deserializeBinary(env.getPayload_asU8());
          const ch = common.ChannelHeader.deserializeBinary(pl.getHeader().getChannelHeader_asU8());
          if (ch.getTxId()) txIds.push(ch.getTxId());
          if (!blockTime && ch.getTimestamp()) {
            const s = BigInt(ch.getTimestamp().getSeconds().toString());
            const n = Number(ch.getTimestamp().getNanos() || 0);
            blockTime = new Date(Number(s * 1000n) + Math.floor(n / 1e6)).toISOString();
          }
        } catch {}
      }

      return {
        blockNumber,
        blockHash,
        previousHash,
        dataHash,
        txCount: envelopes.length,
        txIds,
        timestamp: blockTime || new Date().toISOString(),
        channel: this.config.fabric?.channel || 'ehrchannel',
        publicAddress: this.config.fabric?.hostAlias
          ? `${this.config.fabric.hostAlias} (${this.config.fabric.endpoint || '7051'})`
          : (this.config.fabric?.endpoint || 'peer0.hospital.example.com:7051'),
      };
    } catch {
      return null;
    }
  }

  async _runLoop() {
    let attempt = 0;
    while (!this.closed) {
      try {
        this.status = 'CONNECTING';
        const client = await this.connect(this.config.fabric);
        this.activeClient = client;

        // Populate recent blocks cache from genesis/backfill if empty
        if (this.recentBlocks.size === 0) {
          try {
            const currentHeight = await client.getCurrentHeight();
            const backfillStart = computeStartBlock(null, currentHeight, Math.min(Number(currentHeight), 100));
            const backfillStream = await client.getBlockEvents(backfillStart);
            for await (const b of backfillStream) {
              const summary = this.extractBlockSummary(b);
              if (summary) this.recentBlocks.set(summary.blockNumber, summary);
              if (b.getHeader().getNumber() >= currentHeight - 1n) break;
            }
          } catch {}
        }

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
    const summary = this.extractBlockSummary(block);
    if (summary) {
      this.recentBlocks.set(summary.blockNumber, summary);
      if (this.recentBlocks.size > 500) {
        const oldest = Math.min(...this.recentBlocks.keys());
        this.recentBlocks.delete(oldest);
      }
    }
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

  getRecentBlocks() {
    return Array.from(this.recentBlocks.values()).sort((a, b) => b.blockNumber - a.blockNumber);
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

module.exports = { FabricBlockCollector, computeStartBlock, retryDelayMs, calculateBlockHash };
