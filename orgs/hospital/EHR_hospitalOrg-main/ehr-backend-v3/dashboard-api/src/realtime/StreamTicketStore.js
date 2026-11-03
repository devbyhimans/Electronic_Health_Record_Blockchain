'use strict';

const crypto = require('node:crypto');

const STREAM_TICKET_TTL_MS = 30000;

function ticketDigest(ticket) {
  return crypto.createHash('sha256').update(ticket).digest('hex');
}

class StreamTicketStore {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.ttlMs = Math.min(STREAM_TICKET_TTL_MS, options.ttlMs || STREAM_TICKET_TTL_MS);
    this.tickets = new Map();
  }

  issue(user) {
    this._removeExpired();
    const ticket = crypto.randomBytes(32).toString('base64url');
    const expiresAt = Math.min(this.now() + this.ttlMs, Number(user.exp) * 1000);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) throw new Error('Authentication token is expired');
    const boundUser = Object.freeze({
      userId: user.userId,
      role: user.role,
      mspId: user.mspId,
      peer: user.peer,
      exp: user.exp,
    });
    this.tickets.set(ticketDigest(ticket), { user: boundUser, expiresAt, consumed: false });
    return { ticket, expiresInMs: expiresAt - this.now() };
  }

  consume(ticket) {
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(ticket)) return null;
    const digest = ticketDigest(ticket);
    const record = this.tickets.get(digest);
    if (!record) return null;
    this.tickets.delete(digest);
    if (record.consumed || this.now() >= record.expiresAt || this.now() >= Number(record.user.exp) * 1000) return null;
    record.consumed = true;
    return record.user;
  }

  _removeExpired() {
    const now = this.now();
    for (const [digest, record] of this.tickets) {
      if (now >= record.expiresAt) this.tickets.delete(digest);
    }
  }
}

module.exports = { StreamTicketStore, STREAM_TICKET_TTL_MS };
