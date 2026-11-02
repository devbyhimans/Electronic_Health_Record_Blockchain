'use strict';

// Optional copy-in helper for gateway owners. It never sends request bodies,
// URLs, query strings, headers, patient identifiers, or bearer tokens.
const { randomUUID } = require('node:crypto');

function emitDashboardEvent({ status, reasonCode }) {
  const baseUrl = process.env.DASHBOARD_EVENT_API_URL;
  const serviceKey = process.env.DASHBOARD_SERVICE_KEY;
  const org = process.env.DASHBOARD_EVENT_ORG;
  if (!baseUrl || !serviceKey || !['HospitalMSP', 'DiagnosticsMSP', 'ProviderMSP'].includes(org)) return;
  const event = {
    schemaVersion: 1,
    eventId: `gateway-${randomUUID()}`,
    eventType: 'API_ACTION_EVALUATED',
    timestamp: new Date().toISOString(),
    source: 'gateway-event-emitter',
    org,
    severity: status === 'DENIED' || status === 'FAILED' ? 'WARNING' : 'INFO',
    payload: {
      component: process.env.SERVICE_NAME || 'gateway',
      status,
      reasonCode,
      ...(process.env.DASHBOARD_EVENT_AGENT_ID ? { agentId: process.env.DASHBOARD_EVENT_AGENT_ID } : {}),
    },
  };
  void fetch(`${baseUrl.replace(/\/$/, '')}/internal/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dashboard-service-key': serviceKey },
    body: JSON.stringify({ events: [event] }),
    signal: AbortSignal.timeout(1000),
  }).catch(() => {});
}

module.exports = { emitDashboardEvent };
