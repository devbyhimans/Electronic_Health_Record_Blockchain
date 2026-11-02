'use strict';

const crypto = require('node:crypto');

function alertSeverity(ruleSeverity) {
  return ruleSeverity === 'CRITICAL' ? 'CRITICAL' : ruleSeverity === 'HIGH' ? 'ERROR' : 'WARNING';
}

class AlertEngine {
  constructor(options) {
    this.store = options.store;
    this.eventHub = options.eventHub;
    this.healthPoller = options.healthPoller;
    this.heartbeatMonitor = options.heartbeatMonitor;
    this.metrics = options.metrics;
    this.thresholds = options.thresholds;
    this.organizations = options.organizations || [];
    this.now = options.now || Date.now;
    this.pending = new Map();
    this.active = new Map();
    this.timer = null;
    this.closed = false;
    this.evaluating = null;
  }

  _rule(ruleId) {
    const rule = this.thresholds.rules?.[ruleId];
    return rule?.enabled === false ? null : rule;
  }

  _activeKey(ruleId, subjectId) { return `${ruleId}\u0000${subjectId}`; }

  async _recover() {
    const events = this.store.query({
      eventTypes: ['ALERT_RAISED', 'ALERT_RESOLVED', 'ALERT_ACKNOWLEDGED'],
      limit: 1000000,
      sort: 'asc',
    });
    for (const event of events) {
      const key = this._activeKey(event.payload.ruleId, event.payload.subjectId);
      if (event.eventType === 'ALERT_RAISED') this.active.set(key, event);
      else if (event.eventType === 'ALERT_RESOLVED') this.active.delete(key);
      else if (event.eventType === 'ALERT_ACKNOWLEDGED' && this.active.has(key)) {
        this.active.set(key, { ...this.active.get(key), acknowledgedAt: event.timestamp });
      }
    }
  }

  start() {
    if (this.closed || this.timer) return;
    this._recover().then(() => this.evaluate()).catch(() => {});
    this.timer = setInterval(() => this.evaluate().catch(() => {}), this.thresholds.evaluationIntervalMs || 5000);
    this.timer.unref?.();
  }

  async _conditions(now) {
    const conditions = [];
    const targets = this.healthPoller?.targets || [];
    for (const [id, state] of this.healthPoller?.states || []) {
      if (state.status !== 'DOWN') continue;
      const target = targets.find((item) => item.id === id);
      if (!target) continue;
      const ruleId = target.kind === 'orderer' ? 'orderer_down'
        : target.kind === 'ipfs' ? 'ipfs_down'
          : target.kind === 'peer' ? 'peer_down' : null;
      if (ruleId && this._rule(ruleId)) conditions.push({ ruleId, subjectId: target.component || id, org: target.org, reasonCode: 'HEALTH_CHECK_DOWN' });
    }
    const agents = this.heartbeatMonitor?.getAgentStates(now) || {};
    for (const [agentId, agent] of Object.entries(agents)) {
      if (agent.status === 'OFFLINE' && this._rule('agent_offline')) {
        conditions.push({ ruleId: 'agent_offline', subjectId: agentId, org: agent.org, reasonCode: 'HEARTBEAT_TIMEOUT' });
      }
    }

    const windowMs = this.thresholds.metricsWindowMs || 300000;
    const since = new Date(now - windowMs).toISOString();
    const windowName = ({ 60000: '1m', 300000: '5m', 3600000: '1h', 86400000: '24h' })[windowMs] || '5m';
    const metrics = this.metrics.transactionMetrics(windowName);
    const tests = [
      ['latency_high', metrics.metrics.averageLatencyMs.value, this.thresholds.rules?.latency_high?.latencyMs],
      ['failure_rate_high', metrics.metrics.failureRate.value, this.thresholds.rules?.failure_rate_high?.failureRate],
      ['mvcc_rate_high', metrics.metrics.mvccRate.value, this.thresholds.rules?.mvcc_rate_high?.mvccRate],
    ];
    for (const [ruleId, value, threshold] of tests) {
      if (this._rule(ruleId) && Number.isFinite(value) && Number.isFinite(threshold) && value >= threshold) {
        conditions.push({ ruleId, subjectId: 'global', reasonCode: `THRESHOLD_${ruleId.toUpperCase()}` });
      }
    }

    const events = this.store.query({ since, limit: 1000000 });
    const vcapFailures = events.filter((event) => ['VCAP_MISMATCH', 'VCAP_VERIFICATION_FAILED'].includes(event.eventType));
    for (const event of vcapFailures) {
      const subjectId = event.payload?.agentId || 'global';
      if (this._rule('vcap_failure')) conditions.push({ ruleId: 'vcap_failure', subjectId, org: event.org, reasonCode: event.eventType });
    }
    const accessDeniedCount = events.filter((event) => ['ACCESS_DENIED', 'AUTHZ_DENIED', 'AUTHZ_ORG_DENIED', 'AUTHZ_ROLE_DENIED'].includes(event.eventType)).length;
    const accessThreshold = this.thresholds.rules?.access_denied_spike?.count;
    if (this._rule('access_denied_spike') && Number.isFinite(accessThreshold) && accessDeniedCount >= accessThreshold) {
      conditions.push({ ruleId: 'access_denied_spike', subjectId: 'global', reasonCode: 'ACCESS_DENIED_THRESHOLD' });
    }
    return conditions;
  }

  async evaluate(now = this.now()) {
    if (this.closed) return;
    if (this.evaluating) return this.evaluating;
    this.evaluating = this._evaluate(now);
    try { return await this.evaluating; } finally { this.evaluating = null; }
  }

  async _evaluate(now) {
    const conditions = await this._conditions(now);
    const current = new Map(conditions.map((condition) => [this._activeKey(condition.ruleId, condition.subjectId), condition]));
    const minimumDurationMs = this.thresholds.minimumDurationMs || 0;
    const resolveDurationMs = this.thresholds.resolveDurationMs || 0;

    for (const [key, condition] of current) {
      const pending = this.pending.get(key) || { since: now, resolveSince: null };
      pending.resolveSince = null;
      this.pending.set(key, pending);
      if (!this.active.has(key) && now - pending.since >= minimumDurationMs) {
        await this._writeAlert('ALERT_RAISED', condition, now);
      }
    }

    for (const [key, alert] of this.active) {
      if (current.has(key)) continue;
      const pending = this.pending.get(key) || { since: now, resolveSince: now };
      pending.resolveSince ??= now;
      this.pending.set(key, pending);
      if (now - pending.resolveSince >= resolveDurationMs) {
        await this._writeAlert('ALERT_RESOLVED', {
          ruleId: alert.payload.ruleId,
          subjectId: alert.payload.subjectId,
          reasonCode: 'CONDITION_CLEARED',
        }, now);
        this.pending.delete(key);
      }
    }
    for (const key of this.pending.keys()) if (!current.has(key) && !this.active.has(key)) this.pending.delete(key);
  }

  async _writeAlert(eventType, condition, now) {
    const rule = this._rule(condition.ruleId);
    if (!rule) return;
    const event = {
      schemaVersion: 1,
      eventId: `alert-${crypto.randomUUID()}`,
      eventType,
      timestamp: new Date(now).toISOString(),
      source: 'dashboard-alert-engine',
      org: condition.org || this.organizations[0],
      severity: alertSeverity(rule.severity),
      payload: {
        ruleId: condition.ruleId,
        subjectId: condition.subjectId,
        status: eventType === 'ALERT_RAISED' ? 'OPEN' : 'RESOLVED',
        reasonCode: condition.reasonCode,
        alertSeverity: rule.severity,
      },
    };
    const result = await this.store.append(event);
    if (!result.accepted && !result.duplicate) return;
    if (result.accepted) this.eventHub.publish(event);
    const key = this._activeKey(condition.ruleId, condition.subjectId);
    if (eventType === 'ALERT_RAISED') this.active.set(key, event);
    else this.active.delete(key);
  }

  async acknowledge(alertId, userId) {
    if (![...this.active.values()].some((event) => event.eventId === alertId || this._activeKey(event.payload.ruleId, event.payload.subjectId) === alertId)) {
      await this._recover();
    }
    const alert = [...this.active.values()].find((event) => event.eventId === alertId || this._activeKey(event.payload.ruleId, event.payload.subjectId) === alertId);
    if (!alert) return null;
    const event = {
      schemaVersion: 1,
      eventId: `alert-ack-${crypto.randomUUID()}`,
      eventType: 'ALERT_ACKNOWLEDGED',
      timestamp: new Date(this.now()).toISOString(),
      source: 'dashboard-alert-engine',
      org: alert.org,
      severity: alert.severity,
      payload: {
        ruleId: alert.payload.ruleId,
        subjectId: alert.payload.subjectId,
        status: 'ACKNOWLEDGED',
        reasonCode: `ACK_BY_${String(userId).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 64) || 'ADMIN'}`,
        alertSeverity: alert.payload.alertSeverity || 'WARNING',
      },
    };
    const result = await this.store.append(event);
    if (result.accepted) this.eventHub.publish(event);
    const key = this._activeKey(alert.payload.ruleId, alert.payload.subjectId);
    this.active.set(key, { ...alert, acknowledgedAt: event.timestamp });
    return this.active.get(key);
  }

  list() {
    return [...this.active.values()].map((event) => ({
      id: event.eventId,
      ruleId: event.payload.ruleId,
      subjectId: event.payload.subjectId,
      severity: event.payload.alertSeverity || event.severity,
      status: event.payload.status,
      reasonCode: event.payload.reasonCode,
      timestamp: event.timestamp,
      acknowledgedAt: event.acknowledgedAt || null,
    })).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }

  close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { AlertEngine, alertSeverity };
