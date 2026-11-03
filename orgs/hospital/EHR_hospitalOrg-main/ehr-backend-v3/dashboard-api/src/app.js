'use strict';

const express = require('express');
const { createAuthenticate } = require('./middleware/authenticate');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./logger');
const { createIngestHandler, createRateLimiter } = require('./routes/ingest');
const { makeDashboardRouter } = require('./realtime/RealtimeServer');
const { StreamTicketStore } = require('./realtime/StreamTicketStore');
const { createAggregationRouter } = require('./routes/aggregation');

function createApp(config) {
  const app = express();
  const tickets = config.tickets || new StreamTicketStore();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (origin && config.corsAllowedOrigins?.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Last-Event-ID');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(origin && config.corsAllowedOrigins?.includes(origin) ? 204 : 403);
    return next();
  });
  app.use(express.json({ limit: config.ingestMaxBodyBytes || '1mb', strict: true }));
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      logger.info('request_complete', {
        method: req.method,
        status: res.statusCode,
        durationMs: Math.round(elapsedMs),
      });
    });
    next();
  });

  app.get(['/', '/dashboard', '/dashboard/'], (req, res) => {
    if (req.accepts('html')) {
      return res.redirect('http://localhost/dashboard/');
    }
    return res.json({
      success: true,
      service: 'dashboard-api',
      message: 'CareOps EHR Observability API is running.',
      portal: 'http://localhost/dashboard/',
      health: '/health',
    });
  });

  app.get('/health', (_req, res) => res.json({
    success: true,
    service: 'dashboard-api',
    status: 'UP',
    dependencies: {
      fabric: config.collector?.getStatus().status || 'NOT_CONNECTED',
      store: config.store ? 'CONNECTED' : 'NOT_CONNECTED',
      healthPoller: config.healthPoller?.getStatus().status || 'NOT_CONNECTED',
    },
    collector: config.collector?.getStatus() || { status: 'NOT_CONNECTED', lastProcessedBlock: null },
    healthPoller: config.healthPoller?.getStatus() || { status: 'NOT_CONNECTED', targets: {} },
    agents: config.heartbeatMonitor?.getStatus() || { observedAgents: 0, offlineAgents: 0, pendingExecutions: 0 },
  }));

  app.locals.dashboardAuthenticate = createAuthenticate(config.authorization);
  app.locals.dashboardConfig = config;
  app.locals.dashboardStore = config.store || null;
  app.locals.dashboardTickets = tickets;
  app.use('/api/dashboard', createRateLimiter({ limit: config.apiRateLimit || 600, message: 'Dashboard API rate limit exceeded.' }));
  app.locals.realtime = config.realtime || {
    openSse: (_req, res) => res.status(503).json({ success: false, error: 'Dashboard stream is not available.' }),
  };
  app.use('/api/dashboard', makeDashboardRouter({
    authorization: config.authorization,
    tickets,
    store: config.store,
    getRealtime: () => app.locals.realtime,
  }));
  app.use('/api/dashboard', createAggregationRouter(config));
  app.post('/internal/events', ...createIngestHandler({
    store: config.store,
    eventHub: config.eventHub,
    heartbeatMonitor: config.heartbeatMonitor,
    organizations: config.fabric?.organizations,
    serviceKey: config.serviceKey,
    rateLimit: config.ingestRateLimit,
    maxBatchSize: config.ingestMaxBatchSize,
    allowMock: config.allowMock === true,
  }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
