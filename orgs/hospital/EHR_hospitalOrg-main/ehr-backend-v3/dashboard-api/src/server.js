'use strict';

const { loadConfig } = require('./config');
const { createApp } = require('./app');
const { NdjsonEventStore } = require('./store/NdjsonEventStore');
const { CheckpointStore } = require('./collector/CheckpointStore');
const { FabricBlockCollector } = require('./collector/FabricBlockCollector');
const { connectFabricGateway } = require('./collector/FabricGatewayAdapter');
const { HealthPoller } = require('./health/HealthPoller');
const { AgentHeartbeatMonitor } = require('./health/AgentHeartbeatMonitor');
const { EventHub } = require('./realtime/EventHub');
const { RealtimeServer } = require('./realtime/RealtimeServer');
const { StreamTicketStore } = require('./realtime/StreamTicketStore');
const http = require('node:http');
const logger = require('./logger');

async function start(options = {}) {
  const config = options.config || loadConfig();
  const store = options.store || await NdjsonEventStore.open({
    directory: config.dataDir,
    maxFileBytes: config.storeMaxFileBytes,
    maxFiles: config.storeMaxFiles,
    organizations: config.fabric.organizations,
  });
  const eventHub = options.eventHub || new EventHub();
  const tickets = options.tickets || new StreamTicketStore();
  const heartbeatMonitor = options.heartbeatMonitor || new AgentHeartbeatMonitor({
    intervalMs: config.health.heartbeatIntervalMs,
    missedIntervals: config.health.heartbeatMissedIntervals,
    store,
    eventHub,
  });
  const healthPoller = options.healthPoller || new HealthPoller({
    targets: config.topology.healthTargets,
    intervalMs: config.health.intervalMs,
    timeoutMs: config.health.timeoutMs,
    failureThreshold: config.health.failureThreshold,
    concurrency: config.health.concurrency,
    organizations: config.fabric.organizations,
    store,
    eventHub,
  });
  const collector = options.collector || new FabricBlockCollector({
    config: {
      enabled: config.collectorEnabled,
      backfillBlocks: config.collectorBackfillBlocks,
      fabric: config.fabric,
    },
    store,
    eventHub,
    checkpointStore: options.checkpointStore || new CheckpointStore(config.dataDir),
    connect: options.fabricConnector || ((fabricConfig) => connectFabricGateway(fabricConfig, {
      timeoutMs: config.collectorConnectTimeoutMs,
    })),
    ...(options.collectorWait ? { wait: options.collectorWait } : {}),
  });
  const app = createApp({ ...config, store, eventHub, tickets, heartbeatMonitor, healthPoller, collector });
  const server = http.createServer(app);
  const realtime = options.realtime || new RealtimeServer({
    httpServer: server,
    store,
    eventHub,
    tickets,
    authorization: config.authorization,
    ...config.stream,
  });
  app.locals.realtime = realtime;

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await collector.close();
    await healthPoller.close();
    heartbeatMonitor.close();
    realtime.close();
    if (!server.listening) {
      await store.close();
      eventHub.close();
      return;
    }
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    eventHub.close();
    logger.info('service_stopped');
  };

  server.on('error', (error) => {
    logger.error('service_start_failed', { code: error.code || 'UNKNOWN' });
    process.exitCode = 1;
    shutdown().catch(() => { process.exitCode = 1; });
  });
  server.listen(config.port, config.host, () => {
    logger.info('service_started', { port: config.port });
    healthPoller.start();
    heartbeatMonitor.start();
    collector.start();
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.dashboard = { store, collector, healthPoller, heartbeatMonitor, realtime, eventHub, shutdown };
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    logger.error('service_configuration_failed', { message: error.message });
    process.exitCode = 1;
  });
}

module.exports = { start };
