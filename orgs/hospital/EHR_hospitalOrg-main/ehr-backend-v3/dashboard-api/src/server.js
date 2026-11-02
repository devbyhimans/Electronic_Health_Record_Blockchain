'use strict';

const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { NdjsonEventStore } = require('./store/NdjsonEventStore');
const logger = require('./logger');

async function start() {
  const config = loadConfig();
  const store = await NdjsonEventStore.open({
    directory: config.dataDir,
    maxFileBytes: config.storeMaxFileBytes,
    maxFiles: config.storeMaxFiles,
  });
  const app = createApp({ ...config, store });
  const server = app.listen(config.port, config.host, () => {
    logger.info('service_started', { port: config.port });
  });
  server.on('error', (error) => {
    logger.error('service_start_failed', { code: error.code || 'UNKNOWN' });
    process.exitCode = 1;
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(async () => {
      try {
        await store.close();
        logger.info('service_stopped');
      } catch {
        process.exitCode = 1;
      }
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    logger.error('service_configuration_failed', { message: error.message });
    process.exitCode = 1;
  });
}

module.exports = { start };
