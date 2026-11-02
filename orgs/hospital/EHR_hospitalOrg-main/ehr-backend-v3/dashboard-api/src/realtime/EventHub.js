'use strict';

const { EventEmitter } = require('node:events');

class EventHub {
  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(0);
  }

  publish(event) {
    this.emitter.emit('event', event);
  }

  subscribe(listener) {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  close() {
    this.emitter.removeAllListeners();
  }
}

module.exports = { EventHub };
