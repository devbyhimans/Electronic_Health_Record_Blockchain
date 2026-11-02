'use strict';

const ERROR_RESPONSE = Object.freeze({
  success: false,
  error: 'string',
});

const SUCCESS_RESPONSES = Object.freeze({
  health: { success: true, service: 'dashboard-api', status: 'UP', dependencies: { fabric: 'NOT_CONNECTED', store: 'NOT_CONNECTED' } },
  streamTicket: { success: true, data: { ticket: 'string', expiresInSeconds: 'number' } },
  overview: { success: true, data: { network: 'aggregate', transactions: 'aggregate', agents: 'aggregate', security: 'aggregate', ipfs: 'aggregate', alerts: 'aggregate' } },
  network: { success: true, data: { channel: 'string', organizations: 'array', peers: 'array', orderers: 'array', channels: 'array', chaincodes: 'array' } },
  transactions: { success: true, data: { items: 'array', page: 'pagination' } },
  transactionMetrics: { success: true, data: { metrics: 'aggregate' } },
  agents: { success: true, data: { items: 'array' } },
  agent: { success: true, data: { agent: 'aggregate', metrics: 'aggregate' } },
  agentExecutions: { success: true, data: { items: 'array', page: 'pagination' } },
  agentMetrics: { success: true, data: { metrics: 'aggregate' } },
  execution: { success: true, data: { execution: 'aggregate' } },
  executionTrace: { success: true, data: { runId: 'string', stages: 'array' } },
  security: { success: true, data: { summary: 'aggregate', events: 'array' } },
  securityEvents: { success: true, data: { items: 'array', page: 'pagination' } },
  ipfs: { success: true, data: { status: 'aggregate', metrics: 'aggregate' } },
  alerts: { success: true, data: { items: 'array', page: 'pagination' } },
  events: { success: true, data: { items: 'array', page: 'pagination' } },
});

module.exports = { ERROR_RESPONSE, SUCCESS_RESPONSES };
