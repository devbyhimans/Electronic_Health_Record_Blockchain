'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

class CheckpointStore {
  constructor(directory) {
    this.directory = path.resolve(directory);
    this.filePath = path.join(this.directory, 'collector-checkpoint.json');
  }

  async load() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      if (typeof parsed.lastProcessedBlock !== 'string' || !/^\d+$/.test(parsed.lastProcessedBlock)) return null;
      return { lastProcessedBlock: parsed.lastProcessedBlock };
    } catch {
      return null;
    }
  }

  async save(lastProcessedBlock) {
    const block = BigInt(lastProcessedBlock);
    if (block < 0n) throw new RangeError('Checkpoint block must be non-negative');
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporaryPath = path.join(this.directory,
      `.collector-checkpoint.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    const data = `${JSON.stringify({ version: 1, lastProcessedBlock: block.toString() })}\n`;
    const handle = await fs.open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(data, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await fs.rename(temporaryPath, this.filePath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }
  }
}

module.exports = { CheckpointStore };
