'use strict';

const { URL } = require('node:url');
const { WebSocketServer } = require('ws');
const { filterEventsForUser, getRolePolicy } = require('../authorization');

function replayEvents(store, query, limit) {
  if (query.lastEventId) {
    const events = store.getEventsAfter(query.lastEventId, limit);
    return events === null ? { gap: true, events: [] } : { gap: false, events };
  }
  if (query.since) {
    const selected = store.query({ since: query.since, limit });
    return { gap: false, events: selected.reverse() };
  }
  return { gap: false, events: store.getEventsAfter(null, limit) };
}

function makeDashboardRouter(options) {
  const router = require('express').Router();
  const { createAuthenticate } = require('../middleware/authenticate');
  const authenticate = createAuthenticate(options.authorization);

  router.post('/stream-ticket', authenticate, (req, res) => {
    try {
      const issued = options.tickets.issue(req.dashboardUser);
      return res.status(201).json({
        success: true,
        data: { ticket: issued.ticket, expiresInSeconds: Math.floor(issued.expiresInMs / 1000) },
        ticket: issued.ticket,
        expiresInMs: issued.expiresInMs,
      });
    } catch {
      return res.status(401).json({ success: false, error: 'Authentication token is expired.' });
    }
  });

  router.get('/stream', (req, res) => {
    const ticket = options.tickets.consume(req.query.ticket);
    if (!ticket || !getRolePolicy(options.authorization, ticket.role)) {
      return res.status(401).json({ success: false, error: 'Invalid or expired stream ticket.' });
    }
    const realtime = options.getRealtime?.();
    if (!realtime?.openSse) return res.status(503).json({ success: false, error: 'Dashboard stream is not available.' });
    realtime.openSse(req, res, ticket);
  });
  return router;
}

class RealtimeServer {
  constructor(options) {
    this.httpServer = options.httpServer;
    this.store = options.store;
    this.eventHub = options.eventHub;
    this.tickets = options.tickets;
    this.authorization = options.authorization;
    this.maxClients = options.maxClients || 500;
    this.maxBufferBytes = options.maxBufferBytes || 1024 * 1024;
    this.heartbeatMs = options.heartbeatMs || 20000;
    this.replayLimit = options.replayLimit || 200;
    this.activeClients = new Set();
    this.sseClients = new Set();
    this.wsServer = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
    this.wsServer.on('connection', (client, req, user, query) => this._sendReplay(client, user, query));
    this.upgradeHandler = (req, socket, head) => this._handleUpgrade(req, socket, head);
    this.httpServer.on('upgrade', this.upgradeHandler);
  }

  _handleUpgrade(req, socket, head) {
    let parsed;
    try {
      parsed = new URL(req.url, 'http://dashboard.invalid');
    } catch {
      return this._rejectUpgrade(socket, 400, 'Bad Request');
    }
    if (parsed.pathname !== '/api/dashboard/ws') return this._rejectUpgrade(socket, 404, 'Not Found');
    if (this.activeClients.size >= this.maxClients) return this._rejectUpgrade(socket, 503, 'Service Unavailable');
    const ticket = this.tickets.consume(parsed.searchParams.get('ticket'));
    if (!ticket || !getRolePolicy(this.authorization, ticket.role)) return this._rejectUpgrade(socket, 401, 'Unauthorized');
    this.wsServer.handleUpgrade(req, socket, head, (ws) => {
      this.wsServer.emit('connection', ws, req, ticket, {
        lastEventId: parsed.searchParams.get('lastEventId') || '',
        since: parsed.searchParams.get('since') || '',
      });
    });
  }

  _rejectUpgrade(socket, status, reason) {
    if (socket.destroyed) return;
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  }

  _registerClient(client, user) {
    this.activeClients.add(client);
    let closed = false;
    const closeForExpiry = (code = 1008, reason = 'Authentication expired') => {
      if (closed) return;
      closed = true;
      this.activeClients.delete(client);
      if (client.close && (client.readyState === undefined || client.readyState === 1)) client.close(code, reason);
      client.end?.();
      unsubscribe();
      clearTimeout(expiryTimer);
      clearInterval(heartbeat);
    };
    const expiryMs = Number(user.exp) * 1000 - Date.now();
    const expiryTimer = setTimeout(() => closeForExpiry(1008, 'Authentication expired'), Math.max(0, Math.min(expiryMs, 2147483647)));
    expiryTimer.unref?.();

    const seen = new Set();
    let replaying = true;
    const liveQueue = [];
    const sendEvent = (event) => {
      if (closed || seen.has(event.eventId)) return;
      if (Date.now() >= Number(user.exp) * 1000 || !getRolePolicy(this.authorization, user.role)) {
        closeForExpiry(1008, 'Authentication expired');
        return;
      }
      const [visible] = filterEventsForUser(user, [event], this.authorization);
      if (!visible) return;
      const message = JSON.stringify(visible);
      if (client.readyState !== undefined && client.readyState !== 1) return;
      if (client.bufferedAmount !== undefined && client.bufferedAmount > this.maxBufferBytes) {
        client.close(1013, 'Slow client; reconnect with lastEventId');
        return closeForExpiry(1013, 'Slow client; reconnect with lastEventId');
      }
      if (client.writableLength !== undefined && client.writableLength > this.maxBufferBytes) {
        client.write('event: stream-close\ndata: {"reason":"slow-client","resumeWith":"Last-Event-ID"}\n\n');
        return closeForExpiry();
      }
      seen.add(event.eventId);
      if (seen.size > this.replayLimit * 2) seen.delete(seen.values().next().value);
      if (client.send) {
        client.send(message);
        if (client.bufferedAmount > this.maxBufferBytes) {
          client.close(1013, 'Slow client; reconnect with lastEventId');
          return closeForExpiry(1013, 'Slow client; reconnect with lastEventId');
        }
      }
      else {
        const frame = `id: ${visible.eventId}\nevent: dashboard\ndata: ${message}\n\n`;
        client.write(frame);
        if (client.writableLength > this.maxBufferBytes) {
          client.write('event: stream-close\ndata: {"reason":"slow-client","resumeWith":"Last-Event-ID"}\n\n');
          closeForExpiry();
        }
      }
    };
    const onLiveEvent = (event) => {
      if (replaying) {
        if (liveQueue.length >= this.replayLimit) {
          if (client.send) client.close(1013, 'Slow client; reconnect with lastEventId');
          else client.write('event: stream-close\ndata: {"reason":"slow-client","resumeWith":"Last-Event-ID"}\n\n');
          return closeForExpiry();
        }
        liveQueue.push(event);
      } else sendEvent(event);
    };
    const unsubscribe = this.eventHub.subscribe(onLiveEvent);
    const heartbeat = setInterval(() => {
      if (closed || Date.now() >= Number(user.exp) * 1000) return closeForExpiry(1008, 'Authentication expired');
      if (client.ping) {
        if (client.isAlive === false) return client.terminate();
        client.isAlive = false;
        client.ping();
      } else if (client.writableLength <= this.maxBufferBytes) {
        client.write(': ping\n\n');
      }
    }, this.heartbeatMs);
    heartbeat.unref?.();
    return { sendEvent, replaying: () => replaying, setReplaying: (value) => { replaying = value; }, liveQueue, close: closeForExpiry };
  }

  async _sendReplay(client, user, query) {
    const connection = this._registerClient(client, user);
    if (client.on) {
      client.on('close', connection.close);
      client.on('error', connection.close);
      client.on('pong', () => { client.isAlive = true; });
    }
    const replay = replayEvents(this.store, query, this.replayLimit);
    if (replay.gap) {
      if (client.send) client.send(JSON.stringify({ type: 'replay-gap', reason: 'cursor-not-retained', resumeWith: 'since' }));
      else client.write('event: replay-gap\ndata: {"reason":"cursor-not-retained","resumeWith":"since"}\n\n');
    }
    for (const event of replay.events) connection.sendEvent(event);
    connection.setReplaying(false);
    for (const event of connection.liveQueue) connection.sendEvent(event);
  }

  openSse(req, res, user) {
    if (this.activeClients.size >= this.maxClients) {
      res.status(503).json({ success: false, error: 'Dashboard stream capacity reached.' });
      return;
    }
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const client = {
      write: (frame) => res.write(frame),
      end: () => { if (!res.writableEnded) res.end(); },
      get writableLength() { return res.writableLength; },
    };
    this.sseClients.add(client);
    const originalEnd = client.end;
    client.end = () => {
      this.sseClients.delete(client);
      originalEnd();
    };
    const connection = this._registerClient(client, user);
    const onClose = () => connection.close();
    res.on('close', onClose);
    const replay = replayEvents(this.store, {
      lastEventId: req.get('last-event-id') || req.query.lastEventId || '',
      since: req.query.since || '',
    }, this.replayLimit);
    if (replay.gap) client.write('event: replay-gap\ndata: {"reason":"cursor-not-retained","resumeWith":"since"}\n\n');
    for (const event of replay.events) connection.sendEvent(event);
    connection.setReplaying(false);
    for (const event of connection.liveQueue) connection.sendEvent(event);
  }

  getStatus() {
    return { activeClients: this.activeClients.size, maxClients: this.maxClients };
  }

  close() {
    this.httpServer.off('upgrade', this.upgradeHandler);
    for (const client of this.wsServer.clients) client.close(1001, 'Dashboard server shutting down');
    for (const client of this.sseClients) client.end();
    this.wsServer.close();
  }
}

module.exports = { RealtimeServer, makeDashboardRouter, replayEvents };
