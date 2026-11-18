'use strict';

const path = require('path');
const crypto = require('crypto');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

/**
 * Validates file buffer against known magic byte signatures
 */
function verifyMagicBytes(buffer, ext) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  // Reject Windows DOS/PE executables (MZ) regardless of extension
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return false;
  }

  if (ext === '.pdf') {
    // PDF magic bytes: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
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
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
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
    // JPEG magic bytes: FF D8 FF
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  return false;
}

/**
 * Middleware: Enforces 10MB limit, allowlist, magic bytes, and random server-side filename
 */
function uploadSandbox(req, res, next) {
  const file = req.file;
  if (!file) {
    return next();
  }

  const timestamp = new Date().toISOString();
  const endpoint = `${req.method} ${req.originalUrl || req.url}`;

  // 1. File Size Verification (Max 10 MB)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="File size (${file.size} bytes) exceeds 10 MB limit"`);
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      reason: 'File size exceeds 10 MB limit',
    });
  }

  // 2. Extension Allowlist (.pdf, .png, .jpg, .jpeg)
  const originalExt = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(originalExt)) {
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="Disallowed file extension '${originalExt || 'none'}'"`);
    return res.status(415).json({
      error: 'UNSUPPORTED_MEDIA_TYPE',
      reason: `Disallowed file extension '${originalExt || 'none'}'. Allowed: .pdf, .png, .jpg, .jpeg`,
    });
  }

  // 3. Real Type Magic Byte Verification
  const isValidSignature = verifyMagicBytes(file.buffer, originalExt);
  if (!isValidSignature) {
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="Magic byte signature mismatch for extension '${originalExt}'"`);
    return res.status(415).json({
      error: 'UNSUPPORTED_MEDIA_TYPE',
      reason: 'Invalid file signature or magic bytes mismatch with declared format',
    });
  }

  // 4. Random Server-Side Filename (never use user-supplied filename)
  const safeExt = originalExt === '.jpeg' ? '.jpg' : originalExt;
  const randomFilename = `${crypto.randomUUID()}${safeExt}`;

  file.clientProvidedName = file.originalname;
  file.originalname = randomFilename;
  file.filename = randomFilename;
  file.sanitizedFilename = randomFilename;

  next();
}

/**
 * Handle Multer errors (e.g. LIMIT_FILE_SIZE from multer limits)
 */
function handleMulterError(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    const timestamp = new Date().toISOString();
    const endpoint = `${req.method} ${req.originalUrl || req.url}`;
    console.log(`[${timestamp}] REJECTED [${endpoint}] reason="File exceeds 10 MB limit (Multer limit)"`);
    return res.status(413).json({
      error: 'FILE_TOO_LARGE',
      reason: 'File exceeds 10 MB limit',
    });
  }
  next(err);
}

module.exports = {
  uploadSandbox,
  handleMulterError,
  verifyMagicBytes,
  MAX_FILE_SIZE_BYTES,
};
