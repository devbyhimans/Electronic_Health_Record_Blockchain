'use strict';

const path = require('path');
const crypto = require('crypto');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

function verifyMagicBytes(buffer, ext) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  // Reject Windows DOS/PE executables (MZ) regardless of extension
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return false;
  }

  if (ext === '.pdf') {
    return (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    );
  }

  if (ext === '.png') {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (ext === '.jpg' || ext === '.jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  return false;
}

function uploadSandbox(req, res, next) {
  const file = req.file;
  if (!file) {
    return next();
  }

  const timestamp = new Date().toISOString();
  const endpoint = `${req.method} ${req.originalUrl || req.url}`;

  if (file.size > MAX_FILE_SIZE_BYTES) {
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="File size (${file.size} bytes) exceeds 10 MB limit"`);
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      reason: 'File size exceeds 10 MB limit',
    });
  }

  const originalExt = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(originalExt)) {
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="Disallowed file extension '${originalExt || 'none'}'"`);
    return res.status(415).json({
      error: 'UNSUPPORTED_MEDIA_TYPE',
      reason: `Disallowed file extension '${originalExt || 'none'}'. Allowed: .pdf, .png, .jpg, .jpeg`,
    });
  }

  const isValidSignature = verifyMagicBytes(file.buffer, originalExt);
  if (!isValidSignature) {
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="Magic byte signature mismatch for extension '${originalExt}'"`);
    return res.status(415).json({
      error: 'UNSUPPORTED_MEDIA_TYPE',
      reason: 'Invalid file signature or magic bytes mismatch with declared format',
    });
  }

  const safeExt = originalExt === '.jpeg' ? '.jpg' : originalExt;
  const randomFilename = `${crypto.randomUUID()}${safeExt}`;

  file.clientProvidedName = file.originalname;
  file.originalname = randomFilename;
  file.filename = randomFilename;
  file.sanitizedFilename = randomFilename;

  next();
}

module.exports = {
  uploadSandbox,
  verifyMagicBytes,
  MAX_FILE_SIZE_BYTES,
};
