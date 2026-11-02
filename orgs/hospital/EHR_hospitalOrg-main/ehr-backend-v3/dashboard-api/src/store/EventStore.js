'use strict';

class EventStore {
  async append(_event) {
    throw new Error('EventStore.append must be implemented');
  }

  async appendMany(_events) {
    throw new Error('EventStore.appendMany must be implemented');
  }

  getById(_eventId) {
    throw new Error('EventStore.getById must be implemented');
  }

  query(_filters) {
    throw new Error('EventStore.query must be implemented');
  }

  getEventsAfter(_eventId, _limit) {
    throw new Error('EventStore.getEventsAfter must be implemented');
  }

  getStats() {
    throw new Error('EventStore.getStats must be implemented');
  }

  async close() {
    throw new Error('EventStore.close must be implemented');
  }
}

module.exports = { EventStore };
