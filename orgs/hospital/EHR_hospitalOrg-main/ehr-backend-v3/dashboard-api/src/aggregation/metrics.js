'use strict';

const { performance } = require('node:perf_hooks');

const WINDOW_MS = Object.freeze({ '1m': 60000, '5m': 300000, '1h': 3600000, '24h': 86400000 });
const SUCCESS_TYPES = new Set(['TRANSACTION_COMMITTED']);
const FAILURE_TYPES = new Set(['TRANSACTION_FAILED', 'MVCC_CONFLICT', 'ENDORSEMENT_FAILED']);

function metric(value, state, reason = null) { return { value, status: { state, reason, since: null } }; }
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

class MetricsService {
  constructor(options) {
    this.store = options.store;
    this.cacheTtlMs = options.cacheTtlMs || 3000;
    this.now = options.now || Date.now;
    this.cache = new Map();
  }

  transactionMetrics(window = '5m') {
    if (!Object.hasOwn(WINDOW_MS, window)) {
      const error = new Error('window must be 1m, 5m, 1h, or 24h.');
      error.status = 400;
      error.publicMessage = error.message;
      throw error;
    }
    const cached = this.cache.get(window);
    if (cached && this.now() - cached.at < this.cacheTtlMs) return cached.result;
    const startedAt = performance.now();
    const to = this.now();
    const from = to - WINDOW_MS[window];
    const events = this.store.query({ since: new Date(from).toISOString(), until: new Date(to).toISOString(), limit: 1000000 });
    const txEvents = events.filter((event) => SUCCESS_TYPES.has(event.eventType) || FAILURE_TYPES.has(event.eventType));
    const committed = txEvents.filter((event) => SUCCESS_TYPES.has(event.eventType));
    const failed = txEvents.filter((event) => FAILURE_TYPES.has(event.eventType));
    const mvcc = txEvents.filter((event) => event.eventType === 'MVCC_CONFLICT');
    const endorsement = txEvents.filter((event) => event.eventType === 'ENDORSEMENT_FAILED');
    const denominator = txEvents.length;
    const latency = txEvents.map((event) => event.payload?.durationMs).filter(Number.isFinite);
    const hasData = txEvents.length > 0;
    const rate = (count) => denominator ? count / denominator : null;
    const state = hasData ? 'OK' : 'NO_DATA';
    const reason = hasData ? null : 'No transaction or execution events exist in this window.';
    const result = {
      window,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      metrics: {
        txPerMinute: metric(hasData ? denominator / (WINDOW_MS[window] / 60000) : null, state, reason),
        successCount: metric(hasData ? committed.length : null, state, reason),
        failureCount: metric(hasData ? failed.length : null, state, reason),
        successRate: metric(rate(committed.length), hasData ? 'OK' : 'NO_DATA', reason),
        failureRate: metric(rate(failed.length), hasData ? 'OK' : 'NO_DATA', reason),
        mvccConflicts: metric(hasData ? mvcc.length : null, state, reason),
        mvccRate: metric(rate(mvcc.length), hasData ? 'OK' : 'NO_DATA', reason),
        endorsementFailures: metric(hasData ? endorsement.length : null, state, reason),
        averageLatencyMs: latency.length ? metric(latency.reduce((sum, value) => sum + value, 0) / latency.length, 'OK') : metric(null, 'NO_DATA', 'No producer supplies an honest durationMs value.'),
        p95LatencyMs: latency.length ? metric(percentile(latency, 0.95), 'OK') : metric(null, 'NO_DATA', 'No producer supplies an honest durationMs value.'),
      },
      computationMs: 0,
      mock: events.some((event) => event.mock === true),
    };
    result.computationMs = Number((performance.now() - startedAt).toFixed(3));
    this.cache.set(window, { at: this.now(), result });
    return result;
  }

  agentMetrics(agentId, events, window = '24h') {
    if (!Object.hasOwn(WINDOW_MS, window)) {
      const error = new Error('window must be 1m, 5m, 1h, or 24h.');
      error.status = 400;
      error.publicMessage = error.message;
      throw error;
    }
    const now = this.now();
    const cacheKey = `agent:${agentId}:${window}`;
    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.at < this.cacheTtlMs) return cached.result;
    const within = events.filter((event) => Date.parse(event.timestamp) >= now - WINDOW_MS[window]);
    const owned = within.filter((event) => event.payload?.agentId === agentId);
    const executions = owned.filter((event) => ['AGENT_EXECUTION_STARTED', 'AGENT_EXECUTION_COMPLETED', 'AGENT_EXECUTION_FAILED'].includes(event.eventType));
    const starts = new Map(executions.filter((event) => event.eventType === 'AGENT_EXECUTION_STARTED' && event.correlationId).map((event) => [event.correlationId, event]));
    const ended = executions.filter((event) => ['AGENT_EXECUTION_COMPLETED', 'AGENT_EXECUTION_FAILED'].includes(event.eventType));
    const measured = ended.map((event) => event.payload?.durationMs ?? (starts.has(event.correlationId)
      ? Date.parse(event.timestamp) - Date.parse(starts.get(event.correlationId).timestamp)
      : null)).filter((value) => Number.isFinite(value) && value >= 0);
    const successCount = ended.filter((event) => event.eventType === 'AGENT_EXECUTION_COMPLETED').length;
    const failureCount = ended.filter((event) => event.eventType === 'AGENT_EXECUTION_FAILED').length;
    const terminalCount = successCount + failureCount;
    const hasData = owned.length > 0;
    const state = hasData ? 'OK' : 'NO_DATA';
    const reason = hasData ? null : 'No events for this agent in the selected window.';
    const rateMetric = (count) => metric(terminalCount ? count / terminalCount : null, terminalCount ? 'OK' : 'NO_DATA', terminalCount ? null : 'No completed executions in this window.');
    const executionIds = new Set(executions.map((event) => event.correlationId || event.eventId));
    const terminalIds = new Set(ended.map((event) => event.correlationId || event.eventId));
    const reviewedIds = new Set(owned.filter((event) => event.eventType === 'HUMAN_REVIEW_REQUIRED')
      .map((event) => event.correlationId || event.eventId));
    const result = {
      window,
      metrics: {
        requests: metric(hasData ? owned.filter((event) => event.eventType === 'API_ACTION_EVALUATED').length : null, state, reason),
        executions: metric(hasData ? executionIds.size : null, state, reason),
        successCount: metric(hasData ? successCount : null, state, reason),
        failureCount: metric(hasData ? failureCount : null, state, reason),
        successRate: rateMetric(successCount),
        failureRate: rateMetric(failureCount),
        averageLatencyMs: measured.length ? metric(measured.reduce((sum, value) => sum + value, 0) / measured.length, 'OK') : metric(null, 'NO_DATA', 'No execution durations can be derived from start/end events.'),
        fallbackUsedRate: this._booleanRate(owned, 'fallbackUsed'),
        humanReviewRate: terminalCount
          ? metric([...reviewedIds].filter((id) => terminalIds.has(id)).length / terminalIds.size, 'OK')
          : metric(null, 'NO_DATA', 'No completed executions in this window.'),
      },
      lastHeartbeat: owned.filter((event) => event.eventType === 'AGENT_HEARTBEAT').sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0]?.timestamp || null,
      model: owned.find((event) => event.payload?.model)?.payload.model || null,
      modelVersion: owned.find((event) => event.payload?.modelVersion)?.payload.modelVersion || null,
      vcapStatus: owned.find((event) => event.payload?.vcapStatus)?.payload.vcapStatus || null,
      mock: owned.some((event) => event.mock === true),
    };
    this.cache.set(cacheKey, { at: now, result });
    return result;
  }

  _booleanRate(events, field) {
    const values = events.flatMap((event) => {
      const value = event.payload?.[field];
      if (typeof value === 'boolean') return [value];
      if (field === 'fallbackUsed' && event.eventType === 'AI_FALLBACK_USED') return [true];
      return [];
    });
    if (!values.length) return metric(null, 'NO_DATA', `No ${field} events have been observed.`);
    return metric(values.filter(Boolean).length / values.length, 'OK');
  }
}

module.exports = { MetricsService, WINDOW_MS, percentile };
