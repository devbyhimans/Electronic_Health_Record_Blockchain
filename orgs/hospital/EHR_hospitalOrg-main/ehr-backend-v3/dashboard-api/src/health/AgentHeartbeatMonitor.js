'use strict';

const crypto = require('node:crypto');

class AgentHeartbeatMonitor {
  constructor(options) {
    this.intervalMs = options.intervalMs || 15000;
    this.missedIntervals = options.missedIntervals || 3;
    this.store = options.store;
    this.eventHub = options.eventHub;
    this.agents = new Map();
    this.pendingExecutions = new Map();
    this.timer = null;
    this.closed = false;
  }

  start() {
    if (this.timer || this.closed) return;
    this.timer = setInterval(() => this.check().catch(() => {}), this.intervalMs);
    this.timer.unref?.();
  }

  accept(event, now = Date.now()) {
    const agentId = event.payload?.agentId;
    if (!agentId) return;
    if (event.eventType === 'AGENT_HEARTBEAT') {
      this.agents.set(agentId, {
        lastSeenAt: now,
        org: event.org,
        mock: event.mock === true,
        offline: false,
      });
      return;
    }
    if (event.eventType === 'AGENT_EXECUTION_STARTED' && event.correlationId) {
      this.pendingExecutions.set(event.correlationId, {
        agentId,
        org: event.org,
        mock: event.mock === true,
      });
      return;
    }
    if (['AGENT_EXECUTION_COMPLETED', 'AGENT_EXECUTION_FAILED'].includes(event.eventType) && event.correlationId) {
      this.pendingExecutions.delete(event.correlationId);
    }
  }

  async check(now = Date.now()) {
    if (this.closed) return;
    const threshold = this.intervalMs * this.missedIntervals;
    for (const [agentId, state] of this.agents) {
      if (!state.offline && now - state.lastSeenAt >= threshold) {
        await this._publish({
          schemaVersion: 1,
          eventId: `agent-offline-${crypto.randomUUID()}`,
          eventType: 'AGENT_OFFLINE',
          timestamp: new Date(now).toISOString(),
          source: 'agent-heartbeat-monitor',
          org: state.org,
          severity: 'WARNING',
          ...(state.mock ? { mock: true } : {}),
          payload: { agentId, status: 'OFFLINE', errorCode: 'HEARTBEAT_TIMEOUT' },
        });
        state.offline = true;
      }
      if (!state.offline) continue;
      for (const [correlationId, execution] of this.pendingExecutions) {
        if (execution.agentId !== agentId) continue;
        await this._publish({
          schemaVersion: 1,
          eventId: `execution-unknown-${crypto.randomUUID()}`,
          eventType: 'AGENT_EXECUTION_FAILED',
          timestamp: new Date(now).toISOString(),
          source: 'agent-heartbeat-monitor',
          org: execution.org,
          severity: 'WARNING',
          correlationId,
          ...(execution.mock ? { mock: true } : {}),
          payload: { agentId, status: 'UNKNOWN', errorCode: 'AGENT_OFFLINE_UNKNOWN' },
        });
        this.pendingExecutions.delete(correlationId);
      }
    }
  }

  async _publish(event) {
    const result = await this.store.append(event);
    if (result.accepted) this.eventHub.publish(event);
    return result.accepted || result.duplicate;
  }

  getStatus() {
    const agents = [...this.agents.values()];
    return {
      observedAgents: agents.length,
      offlineAgents: agents.filter((agent) => agent.offline).length,
      pendingExecutions: this.pendingExecutions.size,
    };
  }

  close() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { AgentHeartbeatMonitor };
