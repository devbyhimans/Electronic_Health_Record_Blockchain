'use strict';

const { loadConfig } = require('./config');
const { createApp } = require('./app');
const logger = require('./logger');

function start() {
  const config = loadConfig();
  const app = createApp(config);
  const server = app.listen(config.port, config.host, () => {
    logger.info('service_started', { port: config.port });
  });
  server.on('error', (error) => {
    logger.error('service_start_failed', { code: error.code || 'UNKNOWN' });
    process.exitCode = 1;
  });
  return server;
}

if (require.main === module) {
  try {
    start();
  } catch (error) {
    logger.error('service_configuration_failed', { message: error.message });
    process.exitCode = 1;
  }
}

module.exports = { start };
