'use strict';

const { performance } = require('node:perf_hooks');
const { normalizeHealthTransition } = require('../normalizer');

async function mapConcurrent(items, concurrency, worker) {
  let next = 0;
  const count = Math.min(items.length, concurrency);
  await Promise.all(Array.from({ length: count }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }));
}

class HealthPoller {
  constructor(options) {
    this.targets = options.targets || [];
    this.intervalMs = options.intervalMs || 15000;
    this.timeoutMs = options.timeoutMs || 3000;
    this.failureThreshold = options.failureThreshold || 3;
    this.concurrency = options.concurrency || 4;
    this.fetch = options.fetch || globalThis.fetch;
    this.store = options.store;
    this.eventHub = options.eventHub;
    this.organizations = options.organizations;
    this.states = new Map(this.targets.map((target) => [target.id, {
      status: target.url ? 'UNKNOWN' : 'NOT_CONFIGURED',
      consecutiveFailures: 0,
      lastCheckedAt: null,
    }]));
    this.timer = null;
    this.running = false;
    this.closed = false;
    this.inFlight = null;
  }

  start() {
    if (this.closed || this.timer) return;
    this.pollOnce().catch(() => {});
    this.timer = setInterval(() => this.pollOnce().catch(() => {}), this.intervalMs);
    this.timer.unref?.();
  }

  async pollOnce() {
    if (this.closed || this.running) return this.inFlight;
    this.running = true;
    this.inFlight = mapConcurrent(this.targets.filter((target) => target.url), this.concurrency,
      (target) => this._checkTarget(target));
    try {
      await this.inFlight;
    } finally {
      this.running = false;
      this.inFlight = null;
    }
  }

  async _checkTarget(target) {
    const startedAt = performance.now();
    let nextStatus = 'DOWN';
    let reasonCode = 'NETWORK_ERROR';
    let latencyMs;
    try {
      const response = await this.fetch(target.url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'application/json' },
      });
      latencyMs = performance.now() - startedAt;
      nextStatus = response.ok ? 'UP' : 'DOWN';
      reasonCode = `HTTP_${response.status}`;
      await response.body?.cancel().catch(() => {});
    } catch {
      latencyMs = performance.now() - startedAt;
    }
    const state = this.states.get(target.id);
    state.lastCheckedAt = new Date().toISOString();
    if (nextStatus === 'UP') {
      state.consecutiveFailures = 0;
      if (state.status !== 'UP') await this._emitTransition(target, 'UP', reasonCode, latencyMs);
      state.status = 'UP';
      return;
    }
    state.consecutiveFailures += 1;
    if (state.status !== 'DOWN' && state.consecutiveFailures >= this.failureThreshold) {
      await this._emitTransition(target, 'DOWN', reasonCode, latencyMs);
      state.status = 'DOWN';
    }
  }

  async _emitTransition(target, status, reasonCode, latencyMs) {
    const event = normalizeHealthTransition(target, status, {
      reasonCode,
      latencyMs,
      organizations: this.organizations,
    });
    const result = await this.store.append(event);
    if (result.accepted) this.eventHub.publish(event);
  }

  getStatus() {
    const configured = [...this.states.values()].filter((state) => state.status !== 'NOT_CONFIGURED');
    let status = 'NOT_CONFIGURED';
    if (configured.length) {
      if (configured.some((state) => state.status === 'DOWN')) status = 'DEGRADED';
      else if (configured.every((state) => state.status === 'UP')) status = 'CONNECTED';
      else status = 'CHECKING';
    }
    return {
      status,
      targets: Object.fromEntries([...this.states.entries()].map(([id, state]) => [id, state.status])),
    };
  }

  async close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inFlight;
  }
}

module.exports = { HealthPoller, mapConcurrent };
