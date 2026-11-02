'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { EventStore } = require('./EventStore');
const { validateEventEnvelope } = require('../contracts/envelope');

const CURRENT_LOG = 'events.ndjson';
const ARCHIVE_PATTERN = /^events\.(\d{8})\.ndjson$/;

function eventTransactionKey(event) {
  return event.txId ? `${event.txId}\u0000${event.eventType}` : null;
}

function safeLimit(value, fallback = 100) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return Math.min(number, 1000000);
}

function freezeEvent(event) {
  return Object.freeze({ ...event, payload: Object.freeze({ ...event.payload }) });
}

class NdjsonEventStore extends EventStore {
  constructor(options) {
    super();
    if (!options || typeof options.directory !== 'string' || !options.directory) {
      throw new Error('A store directory is required');
    }
    this.directory = path.resolve(options.directory);
    this.maxFileBytes = options.maxFileBytes || 10 * 1024 * 1024;
    this.maxFiles = options.maxFiles || 5;
    this.organizations = options.organizations;
    if (!Number.isSafeInteger(this.maxFileBytes) || this.maxFileBytes < 1024) {
      throw new Error('maxFileBytes must be an integer of at least 1024');
    }
    if (!Number.isSafeInteger(this.maxFiles) || this.maxFiles < 1) {
      throw new Error('maxFiles must be a positive integer');
    }

    this.records = new Map();
    this.byTransaction = new Map();
    this.byTxId = new Map();
    this.byEventType = new Map();
    this.byOrganization = new Map();
    this.byAgent = new Map();
    this.byPeer = new Map();
    this.byCorrelationId = new Map();
    this.bySource = new Map();
    this.eventToFile = new Map();
    this.fileToEvents = new Map();
    this.fileBytes = 0;
    this.nextArchiveNumber = 1;
    this.corruptLines = 0;
    this.duplicateEvents = 0;
    this.closed = false;
    this.writeFailed = false;
    this.pending = Promise.resolve();
  }

  static async open(options) {
    const store = new NdjsonEventStore(options);
    await store._recover();
    return store;
  }

  _enqueue(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }

  async append(event) {
    const [result] = await this.appendMany([event]);
    return result;
  }

  async appendMany(events) {
    if (!Array.isArray(events)) throw new TypeError('appendMany expects an array');
    return this._enqueue(async () => {
      this._assertOpen();
      const results = [];
      for (const event of events) results.push(await this._appendOne(event));
      return results;
    });
  }

  _assertOpen() {
    if (this.closed) throw new Error('Event store is closed');
    if (this.writeFailed) throw new Error('Event store stopped after a write failure; reopen it to recover');
  }

  async _appendOne(event) {
    const validation = validateEventEnvelope(event, { organizations: this.organizations });
    if (!validation.valid) {
      const error = new TypeError(`Invalid event envelope: ${validation.error}`);
      error.code = 'INVALID_EVENT';
      throw error;
    }

    const txKey = eventTransactionKey(event);
    if (this.records.has(event.eventId) || (txKey && this.byTransaction.has(txKey))) {
      this.duplicateEvents += 1;
      return { accepted: false, duplicate: true, eventId: event.eventId };
    }

    const line = Buffer.from(`${JSON.stringify(event)}\n`, 'utf8');
    if (this.fileBytes > 0 && this.fileBytes + line.length > this.maxFileBytes) {
      await this._rotateCurrent();
    }
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const filePath = path.join(this.directory, CURRENT_LOG);
    const handle = await fs.open(filePath, 'a', 0o600);
    try {
      let offset = 0;
      while (offset < line.length) {
        const { bytesWritten } = await handle.write(line, offset, line.length - offset, null);
        if (bytesWritten <= 0) throw new Error('Event log write made no progress');
        offset += bytesWritten;
      }
      await handle.sync();
    } catch (error) {
      this.writeFailed = true;
      throw error;
    } finally {
      await handle.close();
    }

    this.fileBytes += line.length;
    this._index(event, CURRENT_LOG);
    return { accepted: true, duplicate: false, eventId: event.eventId };
  }

  async _rotateCurrent() {
    const current = path.join(this.directory, CURRENT_LOG);
    try {
      await fs.stat(current);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.fileBytes = 0;
        return;
      }
      throw error;
    }

    const archiveName = `events.${String(this.nextArchiveNumber).padStart(8, '0')}.ndjson`;
    this.nextArchiveNumber += 1;
    await fs.rename(current, path.join(this.directory, archiveName));
    const moved = this.fileToEvents.get(CURRENT_LOG) || new Set();
    this.fileToEvents.delete(CURRENT_LOG);
    this.fileToEvents.set(archiveName, moved);
    for (const eventId of moved) this.eventToFile.set(eventId, archiveName);
    this.fileBytes = 0;
    await this._pruneArchives();
  }

  async _pruneArchives() {
    const archives = await this._listArchives();
    while (archives.length > this.maxFiles) {
      const oldest = archives.shift();
      await fs.unlink(path.join(this.directory, oldest));
      for (const eventId of this.fileToEvents.get(oldest) || []) this._removeFromIndexes(eventId);
      this.fileToEvents.delete(oldest);
    }
  }

  async _listArchives() {
    let names;
    try {
      names = await fs.readdir(this.directory);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return names
      .map((name) => ({ name, match: ARCHIVE_PATTERN.exec(name) }))
      .filter((item) => item.match)
      .sort((left, right) => Number(left.match[1]) - Number(right.match[1]))
      .map((item) => item.name);
  }

  async _recover() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const archives = await this._listArchives();
    const currentPath = path.join(this.directory, CURRENT_LOG);
    const names = [...archives];
    let currentExists = false;
    try {
      await fs.stat(currentPath);
      currentExists = true;
      names.push(CURRENT_LOG);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.nextArchiveNumber = archives.reduce((maximum, name) => {
      const sequence = Number(ARCHIVE_PATTERN.exec(name)[1]);
      return Math.max(maximum, sequence + 1);
    }, 1);

    for (const name of names) {
      const filePath = path.join(this.directory, name);
      const contents = await fs.readFile(filePath);
      let validLength = contents.length;
      if (contents.length && contents[contents.length - 1] !== 0x0a) {
        const lastNewline = contents.lastIndexOf(0x0a);
        validLength = lastNewline < 0 ? 0 : lastNewline + 1;
        this.corruptLines += 1;
        if (name === CURRENT_LOG) {
          await fs.truncate(filePath, validLength);
        }
      }
      const text = contents.subarray(0, validLength).toString('utf8');
      const lines = text ? text.slice(0, -1).split('\n') : [];
      this.fileToEvents.set(name, new Set());
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          const validation = validateEventEnvelope(event, { organizations: this.organizations });
          if (!validation.valid) throw new Error('Invalid event envelope');
          const txKey = eventTransactionKey(event);
          if (this.records.has(event.eventId) || (txKey && this.byTransaction.has(txKey))) {
            this.duplicateEvents += 1;
            continue;
          }
          this._index(event, name);
        } catch {
          this.corruptLines += 1;
        }
      }
    }

    this.fileBytes = currentExists
      ? (await fs.stat(currentPath)).size
      : 0;
    await this._pruneArchives();
  }

  _index(event, fileName) {
    event = freezeEvent(event);
    this.records.set(event.eventId, event);
    this.eventToFile.set(event.eventId, fileName);
    if (!this.fileToEvents.has(fileName)) this.fileToEvents.set(fileName, new Set());
    this.fileToEvents.get(fileName).add(event.eventId);
    const txKey = eventTransactionKey(event);
    if (txKey) this._addToSetIndex(this.byTransaction, txKey, event.eventId);
    if (event.txId) this._addToSetIndex(this.byTxId, event.txId, event.eventId);
    this._addToSetIndex(this.byEventType, event.eventType, event.eventId);
    this._addToSetIndex(this.byOrganization, event.org, event.eventId);
    if (event.payload?.agentId) this._addToSetIndex(this.byAgent, event.payload.agentId, event.eventId);
    if (event.peerId) this._addToSetIndex(this.byPeer, event.peerId, event.eventId);
    if (event.correlationId) this._addToSetIndex(this.byCorrelationId, event.correlationId, event.eventId);
    if (event.source) this._addToSetIndex(this.bySource, event.source, event.eventId);
  }

  _addToSetIndex(index, key, eventId) {
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(eventId);
  }

  _removeFromIndexes(eventId) {
    const event = this.records.get(eventId);
    if (!event) return;
    this.records.delete(eventId);
    this.eventToFile.delete(eventId);
    const indexes = [
      [this.byEventType, event.eventType],
      [this.byOrganization, event.org],
      [this.byAgent, event.payload?.agentId],
      [this.byPeer, event.peerId],
      [this.byCorrelationId, event.correlationId],
      [this.bySource, event.source],
      [this.byTransaction, eventTransactionKey(event)],
      [this.byTxId, event.txId],
    ];
    for (const [index, key] of indexes) {
      if (!key || !index.has(key)) continue;
      const ids = index.get(key);
      ids.delete(eventId);
      if (ids.size === 0) index.delete(key);
    }
  }

  getById(eventId) {
    return this.records.get(eventId) || null;
  }

  query(filters = {}) {
    const limit = safeLimit(filters.limit);
    const union = (index, values) => {
      if (!values?.length) return null;
      const ids = new Set();
      for (const value of values) for (const eventId of index.get(value) || []) ids.add(eventId);
      return ids;
    };
    const eventTypes = filters.eventTypes || (filters.eventType ? [filters.eventType] : null);
    const orgs = filters.orgs || (filters.org ? [filters.org] : null);
    const agentIds = filters.agentIds || (filters.agentId ? [filters.agentId] : null);
    const peerIds = filters.peerIds || (filters.peerId ? [filters.peerId] : null);
    const ownerIds = filters.ownerAgentIds || filters.ownerPeerIds
      ? new Set([
        ...(union(this.byAgent, filters.ownerAgentIds) || []),
        ...(union(this.byPeer, filters.ownerPeerIds) || []),
      ])
      : null;
    const groups = [
      union(this.byEventType, eventTypes),
      union(this.byOrganization, orgs),
      union(this.byAgent, agentIds),
      union(this.byPeer, peerIds),
      ownerIds,
      filters.txId ? this.byTxId.get(filters.txId) : null,
      filters.correlationId ? this.byCorrelationId.get(filters.correlationId) : null,
      filters.source ? this.bySource.get(filters.source) : null,
    ].filter(Boolean);
    let candidates;
    if (groups.length) {
      const smallest = groups.reduce((current, next) => next.size < current.size ? next : current);
      candidates = [...smallest].map((eventId) => this.records.get(eventId)).filter(Boolean);
    } else {
      candidates = [...this.records.values()];
    }

    const since = filters.since ? Date.parse(filters.since) : Number.NEGATIVE_INFINITY;
    const until = filters.until ? Date.parse(filters.until) : Number.POSITIVE_INFINITY;
    if (Number.isNaN(since) || Number.isNaN(until)) return [];
    const sort = filters.sort === 'asc' ? 1 : -1;
    const cursor = filters.cursor;
    return candidates
      .filter((event) => {
        const timestamp = Date.parse(event.timestamp);
        const afterCursor = !cursor || (sort < 0
          ? timestamp < Date.parse(cursor.timestamp) || (timestamp === Date.parse(cursor.timestamp) && event.eventId.localeCompare(cursor.eventId) < 0)
          : timestamp > Date.parse(cursor.timestamp) || (timestamp === Date.parse(cursor.timestamp) && event.eventId.localeCompare(cursor.eventId) > 0));
        return (!eventTypes || eventTypes.includes(event.eventType)) &&
          (!orgs || orgs.includes(event.org)) &&
          (!agentIds || agentIds.includes(event.payload?.agentId)) &&
          (!peerIds || peerIds.includes(event.peerId)) &&
          (!ownerIds || ownerIds.has(event.eventId)) &&
          (!filters.txId || event.txId === filters.txId) &&
          (!filters.correlationId || event.correlationId === filters.correlationId) &&
          (!filters.source || event.source === filters.source) &&
          (!filters.severity || event.severity === filters.severity) &&
          (!filters.status || event.payload?.status === filters.status) &&
          (!filters.chaincode || event.payload?.chaincode === filters.chaincode) &&
          (!filters.functionName || event.payload?.functionName === filters.functionName) &&
          timestamp >= since && timestamp <= until && afterCursor;
      })
      .sort((left, right) => sort * (Date.parse(left.timestamp) - Date.parse(right.timestamp) ||
        String(left.eventId).localeCompare(String(right.eventId))))
      .slice(0, limit);
  }

  getEventsAfter(eventId, requestedLimit = 100) {
    const limit = safeLimit(requestedLimit);
    if (!eventId) {
      const recent = [];
      for (const event of this.records.values()) {
        recent.push(event);
        if (recent.length > limit) recent.shift();
      }
      return recent;
    }
    let found = false;
    const result = [];
    for (const [currentId, event] of this.records) {
      if (!found) {
        if (currentId === eventId) found = true;
        continue;
      }
      result.push(event);
      if (result.length >= limit) break;
    }
    return found ? result : null;
  }

  getStats() {
    return Object.freeze({
      eventCount: this.records.size,
      archiveCount: [...this.fileToEvents.keys()].filter((name) => name !== CURRENT_LOG).length,
      currentFileBytes: this.fileBytes,
      corruptLinesSkipped: this.corruptLines,
      duplicatesSkipped: this.duplicateEvents,
    });
  }

  async close() {
    if (this.closed) return;
    await this._enqueue(async () => { this.closed = true; });
  }
}

module.exports = { NdjsonEventStore, CURRENT_LOG, eventTransactionKey };
