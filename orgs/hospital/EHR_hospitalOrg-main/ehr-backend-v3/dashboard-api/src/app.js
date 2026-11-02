'use strict';

const express = require('express');
const { createAuthenticate } = require('./middleware/authenticate');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./logger');

function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb', strict: true }));
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

  app.get('/health', (_req, res) => res.json({
    success: true,
    service: 'dashboard-api',
    status: 'UP',
    dependencies: { fabric: 'NOT_CONNECTED', store: config.store ? 'CONNECTED' : 'NOT_CONNECTED' },
  }));

  app.locals.dashboardAuthenticate = createAuthenticate(config.authorization);
  app.locals.dashboardConfig = config;
  app.locals.dashboardStore = config.store || null;
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
